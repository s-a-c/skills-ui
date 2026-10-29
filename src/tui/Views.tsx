/**
 * React view layer (S-96 B1) — the whole tree renders through one React
 * root (`createRoot(renderer)`); `model.ts` stays the store, bridged via
 * useSyncExternalStore. The S-88 shape discipline carries over verbatim:
 * border titles carry live state, header/footer text stays boxed, the
 * footer legend is constant.
 */
import { BoxRenderable, createTimeline, getTimelineEngine, type CliRenderer, ScrollBoxRenderable, SyntaxStyle, TextAttributes } from "@opentui/core";
import { createRoot, useRenderer } from "@opentui/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { CATPPUCCIN_LATTE, CATPPUCCIN_MOCHA, syntaxTokensFor, tokensFor } from "../core/theme.ts";
import { sourceBadge, splashImage } from "./art.ts";
import { visibleSkills, type Action, type TuiModel } from "./model.ts";
import type { SoundKind } from "./audio.ts";
import type { InstalledSkill, SearchSkill, UpdatesResult, UiPreferences } from "../core/services/types.ts";
import type { UiSeed } from "../core/seed.ts";

/** What the view layer needs from the app layer. */
export interface AppBridge {
  subscribe: (fn: () => void) => () => void;
  getState: () => TuiModel;
  dispatch: (action: Action) => void;
  loadDetail: () => Promise<void>;
  play: (kind: SoundKind, prefs: UiPreferences) => void;
  refs: RefsHolder;
}

const AppCtx = createContext<AppBridge>(null as never);
export const AppProvider = AppCtx.Provider;
export const useApp = (): AppBridge => useContext(AppCtx);

/** Renderable refs the imperative keymap still needs (detail-scroll mode). */
export interface RefsHolder {
  detailScroll?: ScrollBoxRenderable;
}

/** Mount the React tree on any renderer; returns an unmount fn. */
export function mountApp(renderer: CliRenderer, bridge: AppBridge): () => void {
  const root = createRoot(renderer);
  root.render(
    <AppProvider value={bridge}>
      <App />
    </AppProvider>,
  );
  return () => root.unmount();
}

const CHECK = "✔";
const ARROW = "❯";

/** Overlay pop-in (S-100 motion polish): slide down 3 rows to the target
 * over 180ms — only when reduce-motion is explicitly OFF ("auto" stays
 * static: terminals don't expose a system preference, so the explicit
 * toggle is authoritative). Text-layout motion (selection, list) is
 * deliberately NOT animated — per-frame text re-layout near a scrollbox
 * is the S-88 cell-diff corruption trigger; overlays are isolated
 * absolute layers and safe. */
const POP_IN_MS = 180;

function usePopInOverlay(prefs: UiPreferences, targetTop: number): {
  ref: ReturnType<typeof useRef<BoxRenderable | null>>;
  top: number;
} {
  const renderer = useRenderer();
  const ref = useRef<BoxRenderable>(null);
  const animate = prefs.reduceMotion === false;
  const top = targetTop + (animate ? 3 : 0);
  useEffect(() => {
    const box = ref.current;
    if (!animate || !box) return;
    const timeline = createTimeline({ duration: POP_IN_MS }, renderer);
    timeline.add(box, { top: targetTop, duration: POP_IN_MS, ease: "outQuad" });
    return () => {
      timeline.pause();
      try {
        getTimelineEngine(renderer).unregister(timeline);
      } catch {
        // renderer already destroyed
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per open
  }, [renderer]);
  return { ref, top };
}

export function App(): ReactNode {
  const { subscribe, getState } = useApp();
  const model = useSyncExternalStore(subscribe, getState, getState);
  if (model.splash) {
    return <Splash model={model} />;
  }
  return (
    <box width="100%" height="100%" flexDirection="column">
      <Header model={model} />
      {model.graph ? (
        <GraphView model={model} />
      ) : model.tab === "installed" ? (
        <InstalledBody model={model} />
      ) : model.tab === "search" ? (
        <SearchBody model={model} />
      ) : (
        <SettingsBody model={model} />
      )}
      <Footer model={model} />
      <ConfirmOverlay model={model} />
      <HelpOverlay model={model} />
      <AgentSelectOverlay model={model} />
    </box>
  );
}

/** Startup splash (S-100): procedural gradient banner while the first
 * skills load runs; the whole screen is ours until it settles. */
function Splash({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  return (
    <box width="100%" height="100%" flexDirection="column" alignItems="center" justifyContent="center" gap={1} backgroundColor={t.bg}>
      <image source={splashImage(model.prefs.theme)} fit="cover" protocol="auto" style={{ width: 44, height: 12 }} />
      <text fg={t.primary} attributes={TextAttributes.BOLD}>skills-ui</text>
      <text fg={t.textMuted}>{model.busy ?? "starting…"}</text>
    </box>
  );
}

/** 3D skills graph (S-100): @opentui/three is dynamically imported so the
 * app never pays for it (or breaks on runtimes without WebGPU) unless the
 * view opens. Rotation rides a core timeline — the engine owns the render
 * loop; reduce-motion skips it. */
function GraphView({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const renderer = useRenderer();
  const skillsRef = useRef(visibleSkills(model)); // snapshot at open
  const hostRef = useRef<BoxRenderable>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let disposed = false;
    let timeline: ReturnType<typeof createTimeline> | null = null;
    let handle: import("./three-scene.ts").GraphViewHandle | null = null;
    const theme = model.prefs.theme;
    void import("./three-scene.ts")
      .then((m) => {
        if (disposed) return;
        handle = m.getGraphView(renderer, skillsRef.current, theme);
        hostRef.current?.add(handle.view);
        if (model.prefs.reduceMotion !== true) {
          timeline = createTimeline({ duration: m.GRAPH_ROTATION_MS, loop: true }, renderer);
          timeline.add(handle.graph.animTarget, {
            angle: Math.PI * 2,
            duration: m.GRAPH_ROTATION_MS,
            loop: true,
            onUpdate: () => handle?.graph.applyRotation(),
          });
        }
        setPhase("ready");
      })
      .catch(() => {
        if (!disposed) setPhase("unavailable");
      });
    return () => {
      disposed = true;
      if (timeline) {
        timeline.pause();
        try {
          getTimelineEngine(renderer).unregister(timeline);
        } catch {
          // renderer already destroyed
        }
      }
      // detach, never destroy — the view is a per-renderer singleton (see
      // three-scene.ts: destroying a never-initialized view kills the
      // renderer); the box is about to unmount under us
      try {
        handle?.view.parent?.remove(handle.view);
      } catch {
        // best-effort detach
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one attach per open
  }, [renderer]);

  return (
    <box ref={hostRef} width="100%" flexGrow={1} flexShrink={1} minHeight={0} border={true} borderStyle="rounded" borderColor={t.border} title={` graph · ${skillsRef.current.length} skills · esc/G close `}>
      {phase === "unavailable" ? (
        <text fg={t.textMuted}>3D graph unavailable — requires the Bun runtime with WebGPU (@opentui/three)</text>
      ) : phase === "loading" ? (
        <text fg={t.textMuted}>initializing 3D…</text>
      ) : null}
    </box>
  );
}

function Header({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const right = [`[${model.scope === "project" ? "p" : "g"}] ${model.scope}`];
  if (model.busy) right.push(`· ${model.busy}…`);
  return (
    <box width="100%" flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" gap={2}>
        {(["installed", "search", "settings"] as const).map((tab) => {
          const active = model.tab === tab;
          return (
            <text key={tab} fg={active ? t.primary : t.textMuted} attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}>
              {`${active ? ARROW + " " : "  "}${tab[0]!.toUpperCase()}${tab.slice(1)}${tab === "search" && model.queue.size ? ` (${model.queue.size})` : ""}`}
            </text>
          );
        })}
      </box>
      <box flexDirection="row">
        <text fg={t.textMuted}>{right.join(" ")}</text>
      </box>
    </box>
  );
}

function InstalledBody({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const { dispatch, loadDetail, refs } = useApp();
  const renderer = useRenderer();
  const syntaxStyle = useMemo(
    () => SyntaxStyle.fromTheme(
      syntaxTokensFor(model.prefs.theme === "latte" ? CATPPUCCIN_LATTE : CATPPUCCIN_MOCHA),
      renderer.nativeScene,
    ),
    [model.prefs.theme, renderer],
  );
  const listScrollRef = useRef<ScrollBoxRenderable>(null);
  const selectedRowRef = useRef<BoxRenderable>(null);
  const detailScrollRef = useRef<ScrollBoxRenderable>(null);
  const visible = visibleSkills(model);
  const selected = visible[model.selected];

  // live filter state rides the border title (S-88 discipline). The title
  // prop alone carries it — pty-smoke's filter-typing check guards this
  // path (the S-92 spike anomaly never reproduced on the shipped tree).
  const listTitle =
    model.agentFilter.size > 0
      ? ` agents: ${[...model.agentFilter].sort().join(", ")} `
      : model.filter || model.filtering
        ? ` filter: ${model.filter}${model.filtering ? "▌" : ""} `
        : ` ${visible.length} skills · f filter `;
  useEffect(() => {
    refs.detailScroll = detailScrollRef.current ?? undefined;
  });

  // selection follow (S-88): keep the cursor row inside the viewport.
  useEffect(() => {
    const scroll = listScrollRef.current;
    if (!scroll) return;
    const vs = scroll.viewport?.height ?? 0;
    if (vs <= 0) return;
    const rowY = selectedRowRef.current?.y;
    const i = typeof rowY === "number" ? rowY : model.selected;
    if (i < scroll.scrollTop) scroll.scrollTop = i;
    else if (i >= scroll.scrollTop + vs) scroll.scrollTop = i - vs + 1;
  }, [model.selected, visible.length]);

  return (
    <box width="100%" flexGrow={1} flexShrink={1} minHeight={0} flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
      <box
        width="42%"
        flexDirection="column"
        border={true}
        borderStyle="rounded"
        borderColor={t.border}
        title={listTitle}
      >
        <scrollbox ref={listScrollRef} width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
          {visible.length === 0 ? (
            <text fg={t.textMuted}>{model.filter ? "no matches" : "no skills installed in this scope"}</text>
          ) : (
            visible.map((skill, i) => {
              const sel = i === model.selected;
              const checked = model.checked.has(skill.name);
              return (
                <box
                  key={skill.name}
                  width="100%"
                  flexDirection="row"
                  gap={1}
                  backgroundColor={sel ? t.selectionBg : undefined}
                  ref={sel ? selectedRowRef : undefined}
                  onMouseDown={() => {
                    if (!sel) {
                      dispatch({ type: "move", delta: i - model.selected });
                      void loadDetail();
                    }
                  }}
                >
                  <text fg={sel ? t.selectionText : checked ? t.success : t.textMuted}>
                    {`${checked ? CHECK : " "} ${sel ? ARROW : " "}`}
                  </text>
                  <text fg={sel ? t.selectionText : t.text} attributes={sel ? TextAttributes.BOLD : TextAttributes.NONE}>
                    {skill.name}
                  </text>
                  {skill.source ? <text fg={sel ? t.selectionText : t.textMuted}>{skill.source}</text> : null}
                  {model.updatesAvailable.has(skill.name) ? <text fg={t.success}>↑</text> : null}
                </box>
              );
            })
          )}
        </scrollbox>
      </box>
      <box
        flexGrow={1}
        flexShrink={1}
        flexDirection="column"
        border={true}
        borderStyle="rounded"
        borderColor={model.detailScroll ? t.primary : t.border}
        title={selected ? ` ${selected.name}${model.detailScroll ? " · scroll (tab)" : ""} ` : " detail "}
        onMouseDown={() => {
          if (!model.detailScroll) dispatch({ type: "detail-scroll", on: true });
        }}
      >
        <scrollbox ref={detailScrollRef} width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
          <markdown content={model.detailBody || "(no description)"} fg={t.text} syntaxStyle={syntaxStyle} />
        </scrollbox>
        {selected ? (
          <text fg={t.textMuted}>
            {`${selected.agents.length} agent(s) · ${selected.scope} · ${selected.path}${model.updatesAvailable.has(selected.name) ? " · ↑ update available" : ""}`}
          </text>
        ) : null}
      </box>
    </box>
  );
}

function SearchBody({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const { dispatch } = useApp();
  const resultsActive = model.searchPane === "results";
  const resultsShown = Math.min(50, model.results.length);
  const title = ` search: ${model.query}${model.query && model.searching ? "▌" : ""} · ${model.results.length} results${model.adjustedQuery && model.query ? ` · showing "${model.adjustedQuery}"` : ""} `;
  return (
    <box width="100%" flexGrow={1} flexShrink={1} minHeight={0} flexDirection="column" paddingLeft={1} paddingRight={1}>
      <box
        width="100%"
        flexGrow={1}
        flexShrink={1}
        minHeight={0}
        flexDirection="column"
        border={true}
        borderStyle="rounded"
        borderColor={t.border}
        title={title}
      >
        <scrollbox width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
          <text fg={resultsActive ? t.primary : t.textMuted} attributes={resultsActive ? TextAttributes.BOLD : TextAttributes.NONE}>
            {`${resultsActive ? ARROW : " "} Results`}
          </text>
          {model.results.length === 0 ? (
            <text fg={t.textMuted}>{model.query ? "no results" : "search the skills.sh registry"}</text>
          ) : (
            model.results.slice(0, 50).map((r, i) => {
              const sel = resultsActive && i === model.searchSelected;
              const queued = model.queue.has(`${r.source}#${r.name}`);
              return (
                <box
                  key={`${r.source}#${r.name}`}
                  width="100%"
                  flexDirection="row"
                  gap={1}
                  backgroundColor={sel ? t.selectionBg : undefined}
                  onMouseDown={() => {
                    if (!sel) dispatch({ type: "move", delta: i - model.searchSelected });
                  }}
                >
                  <text fg={queued ? t.success : t.textMuted}>{`${queued ? CHECK : " "}${sel ? ARROW : " "}`}</text>
                  <image source={sourceBadge(r.source, model.prefs.theme)} fit="fill" protocol="auto" style={{ width: 2, height: 1 }} />
                  <text fg={sel ? t.selectionText : t.text} attributes={sel ? TextAttributes.BOLD : TextAttributes.NONE}>
                    {r.name}
                  </text>
                  <text fg={sel ? t.selectionText : t.textMuted}>{r.source}</text>
                  <text fg={t.textMuted}>{`${r.installs}`}</text>
                </box>
              );
            })
          )}
          <text fg={!resultsActive ? t.primary : t.textMuted} attributes={!resultsActive ? TextAttributes.BOLD : TextAttributes.NONE}>
            {`${!resultsActive ? ARROW : " "} Selected (${model.queue.size})`}
          </text>
          {model.queue.size === 0 ? (
            <text fg={t.textMuted}>  (empty — space or + queues from Results)</text>
          ) : (
            [...model.queue.values()].map((r, i) => {
              const sel = !resultsActive && i === model.selectedCursor;
              return (
                <box key={`${r.source}#${r.name}`} width="100%" flexDirection="row" gap={1} backgroundColor={sel ? t.selectionBg : undefined}>
                  <text fg={t.textMuted}>{`${sel ? ARROW : " "} `}</text>
                  <text fg={sel ? t.selectionText : t.text} attributes={sel ? TextAttributes.BOLD : TextAttributes.NONE}>
                    {r.name}
                  </text>
                  <text fg={sel ? t.selectionText : t.textMuted}>{r.source}</text>
                </box>
              );
            })
          )}
        </scrollbox>
      </box>
      <box width="100%" flexShrink={0} flexDirection="row">
        <box flexDirection="row">
          <text fg={t.textMuted}>space/+ queue · -/d/x remove · Tab pane · u install queued</text>
        </box>
      </box>
    </box>
  );
}

function SettingsBody({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const motion = model.prefs.reduceMotion === "auto" ? "auto (explicit toggle is authoritative in terminals)" : String(model.prefs.reduceMotion);
  const skillsVersion = model.skillsVersion === undefined ? "…" : model.skillsVersion ?? "not found";
  const rows: Array<[string, string]> = [
    ["skills CLI", skillsVersion],
    ["t  theme", `${model.prefs.theme}${model.prefs.theme === "mocha" ? " → latte" : " → mocha"}`],
    [",  sound", model.prefs.sound ? "on → off" : "off → on"],
    ["m  motion", motion],
    ["theme/sound/motion persist to ~/.config/skills-ui/prefs.json", ""],
  ];
  return (
    <box width="100%" flexGrow={1} flexShrink={1} minHeight={0} flexDirection="column" paddingLeft={2} gap={1}>
      <box flexDirection="row">
        <text fg={t.primary} attributes={TextAttributes.BOLD}>Settings</text>
      </box>
      {rows.map(([label, value]) => (
        <box key={label} flexDirection="row" gap={2}>
          <text fg={t.text}>{label}</text>
          <text fg={t.textMuted}>{value}</text>
        </box>
      ))}
    </box>
  );
}

function Footer({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  // legend text is CONSTANT across states (S-88: swapping legends double-paint)
  const legend = "i installed · / search · a agents · f filter · , settings · ? help · q quit";
  const status = model.toast
    ? model.toast.text
    : model.confirm
      ? `${model.confirm.kind} ${model.confirm.names.join(", ")}? y/N`
      : "";
  return (
    <box width="100%" flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <box flexDirection="row">
        <text fg={t.textMuted}>{legend}</text>
      </box>
      <box flexDirection="row">
        <text fg={model.toast?.tone === "success" ? t.success : model.toast?.tone === "error" ? t.danger : model.confirm ? t.primary : t.textMuted}>
          {status.slice(0, 60)}
        </text>
      </box>
    </box>
  );
}

function HelpOverlay({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const pop = usePopInOverlay(model.prefs, 2);
  if (!model.help) return null;
  const keys: Array<[string, string]> = [
    ["i / ,", "installed / settings tabs"],
    ["/", "search tab"],
    ["f", "filter (or just type)"],
    ["tab", "detail scroll mode (arrows/PgUp/PgDn scroll the doc)"],
    ["a", "agent filter (multi, a=all)"],
    ["s", "sort checked first"],
    ["c", "check for updates"],
    ["A | I", "check all / invert"],
    ["g | p", "global / project scope"],
    ["G", "3D skills graph (esc/G closes)"],
    ["space", "toggle check"],
    ["u / d / r", "update / delete (checked or focused)"],
    ["PgUp/PgDn/HOME/END", "page · top / bottom"],
    ["mouse", "wheel scrolls · click selects"],
    ["?", "this help"],
    ["q", "quit"],
  ];
  return (
    <box ref={pop.ref} position="absolute" zIndex={11} top={pop.top} left="25%" width="50%" flexDirection="column" padding={1} border={true} borderStyle="rounded" borderColor={t.border} backgroundColor={t.surface} title=" help ">
      {keys.map(([key, label]) => (
        <box key={key} flexDirection="row" gap={2}>
          <text fg={t.primary}>{key.padEnd(18)}</text>
          <text fg={t.text}>{label}</text>
        </box>
      ))}
    </box>
  );
}

function AgentSelectOverlay({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const sel = model.agentSelect;
  const pop = usePopInOverlay(model.prefs, 4);
  if (!sel) return null;
  return (
    <box ref={pop.ref} position="absolute" zIndex={12} top={pop.top} left="25%" width="50%" flexDirection="column" padding={1} border={true} borderStyle="rounded" borderColor={t.border} backgroundColor={t.surface} title=" filter by agent ">
      {sel.agents.map((agent, i) => {
        const cursor = i === sel.index;
        const staged = sel.staged.has(agent);
        return (
          <box key={agent} flexDirection="row" gap={2}>
            <text fg={cursor ? t.selectionText : staged ? t.success : t.textMuted}>{`${staged ? CHECK : " "} ${cursor ? ARROW : " "}`}</text>
            <text fg={cursor ? t.selectionText : t.text} attributes={cursor ? TextAttributes.BOLD : TextAttributes.NONE}>{agent}</text>
          </box>
        );
      })}
      <text fg={t.textMuted}>space toggle · a all · enter apply · esc cancel</text>
    </box>
  );
}

function ConfirmOverlay({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const pop = usePopInOverlay(model.prefs, 7);
  if (!model.confirm) return null;
  return (
    <box ref={pop.ref} position="absolute" zIndex={10} top={pop.top} left="25%" width="50%" flexDirection="column" gap={1} padding={1} border={true} borderStyle="rounded" borderColor={model.confirm.kind === "delete" ? t.danger : t.primary} backgroundColor={t.surface} title={model.confirm.kind === "delete" ? " delete skills " : " update skills "}>
      <text fg={t.text}>{model.confirm.names.join(", ")}</text>
      <text fg={t.textMuted}>y confirm · esc cancel</text>
    </box>
  );
}

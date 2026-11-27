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
import { SEARCH_RENDER_CAP, type Action, type TuiModel } from "./model.ts";
import type { SoundKind } from "./audio.ts";
import { APP_VERSION } from "../core/version.ts";
import type { InstalledSkill, SearchSkill, SourceSkill, UpdatesResult } from "../core/index.ts";
import type { UiPreferences } from "../core/prefs.ts";
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
      <HealthOverlay model={model} />
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
  const skillsRef = useRef(model.visible); // snapshot at open (precomputed, S-183)
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
        <text fg={t.textMuted}>3D graph unavailable: requires the Bun runtime with WebGPU (@opentui/three)</text>
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
  const healthColor = !model.health ? t.textMuted : model.health.ok ? t.success : t.danger;
  const healthText = model.health ? `● ${model.health.summary} [H]` : "● health… [H]";
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
      <box flexDirection="row" gap={2}>
        {model.healthCapability ? <text fg={healthColor}>{healthText}</text> : null}
        <text fg={t.textMuted}>{right.join(" ")}</text>
      </box>
    </box>
  );
}

/* S-187: the checked count in the list title. The pane fits a 19-char
   title at 80 cols (S-162 ladder: 19 renders, 20 drops) — past that keep
   the checked count and drop the total rather than lose the title. */
export function checkedTitle(checked: number, total: number): string {
  const full = ` ${checked} checked of ${total}`;
  return full.length <= 19 ? full : ` ${checked} checked`;
}

export function installedListTitle(model: TuiModel, visibleCount: number, listWidthPct: number): string {
  if (model.agentFilter.size > 0) return ` agents: ${[...model.agentFilter].sort().join(", ")} `;
  if (model.filter || model.filtering) return ` filter: ${model.filter}${model.filtering ? "▌" : ""} `;
  if (model.checked.size > 0) return checkedTitle(model.checked.size, visibleCount);
  const sortLabel = model.sortBy === "checked" ? "checked" : model.sortBy === "name" ? "name" : "order";
  const provSuffix = model.provenanceFilter !== "all" ? `·${model.provenanceFilter}` : "";
  return listWidthPct < 35 ? ` ${visibleCount}·${sortLabel}${provSuffix}` : ` ${visibleCount} skills·${sortLabel}${provSuffix}`;
}

export function searchListTitle(model: TuiModel): string {
  const cursor = model.query && model.searching ? "▌" : "";
  const adjusted = model.adjustedQuery && model.query ? ` · showing "${model.adjustedQuery}"` : "";
  const fullTitle = ` search: ${model.query}${cursor} · ${model.results.length} results${adjusted} `;
  if (fullTitle.length <= 19) return fullTitle;
  const compactTitle = ` search: ${model.query}${cursor} `;
  if (compactTitle.length <= 19) return compactTitle;
  return ` search: ${model.query.slice(0, 8)}${model.searching ? "▌" : ""} `;
}

function useSelectionScrollFollow(
  scrollRef: ReturnType<typeof useRef<ScrollBoxRenderable | null>>,
  rowRef: ReturnType<typeof useRef<BoxRenderable | null>>,
  deps: readonly unknown[],
  fallbackIndex?: number
): void {
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const vs = scroll.viewport?.height ?? 0;
    if (vs <= 0) return;
    // .y is an absolute SCREEN row — offset inside the viewport is row.y - scroll.y (S-101)
    const y = rowRef.current?.y;
    const sy = scroll.y;
    if (typeof y === "number" && typeof sy === "number") {
      const rel = y - sy;
      if (rel < 0) scroll.scrollTop += rel;
      else if (rel >= vs) scroll.scrollTop += rel - vs + 1;
    } else if (fallbackIndex !== undefined) {
      if (fallbackIndex < scroll.scrollTop) scroll.scrollTop = fallbackIndex;
      else if (fallbackIndex >= scroll.scrollTop + vs) scroll.scrollTop = fallbackIndex - vs + 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const PROVENANCE_BADGE: Record<NonNullable<InstalledSkill["provenance"]>, string> = {
  locked: "[lck]",
  linked: "[lnk]",
  local: "[loc]",
};

function skillRowStyle(
  sel: boolean,
  checked: boolean,
  provenance: InstalledSkill["provenance"],
  t: ReturnType<typeof tokensFor>
) {
  if (sel) {
    return {
      textFg: t.selectionText,
      mutedFg: t.selectionText,
      prefixFg: t.selectionText,
      provFg: t.selectionText,
      attrs: TextAttributes.BOLD,
      bg: t.selectionBg,
    };
  }
  return {
    textFg: t.text,
    mutedFg: t.textMuted,
    prefixFg: checked ? t.success : t.textMuted,
    provFg: provenance === "locked" ? t.textMuted : t.primary,
    attrs: TextAttributes.NONE,
    bg: undefined,
  };
}

function InstalledSkillRow({
  skill,
  sel,
  checked,
  hasUpdate,
  selectedRowRef,
  onSelect,
  t,
}: {
  skill: InstalledSkill;
  sel: boolean;
  checked: boolean;
  hasUpdate: boolean;
  selectedRowRef: ReturnType<typeof useRef<BoxRenderable | null>>;
  onSelect: () => void;
  t: ReturnType<typeof tokensFor>;
}): ReactNode {
  const style = skillRowStyle(sel, checked, skill.provenance, t);
  const prefix = `${checked ? CHECK : " "} ${sel ? ARROW : " "}`;
  const provBadge = skill.provenance ? PROVENANCE_BADGE[skill.provenance] : null;
  return (
    <box
      width="100%"
      height={1}
      overflow="hidden"
      flexDirection="row"
      gap={1}
      backgroundColor={style.bg}
      ref={sel ? selectedRowRef : undefined}
      onMouseDown={() => {
        if (!sel) onSelect();
      }}
    >
      <text flexShrink={0} fg={style.prefixFg}>{prefix}</text>
      <text flexShrink={0} fg={style.textFg} attributes={style.attrs}>
        {skill.name}
      </text>
      {provBadge ? <text flexShrink={0} fg={style.provFg}>{provBadge}</text> : null}
      {skill.source ? <text fg={style.mutedFg}>{skill.source}</text> : null}
      {hasUpdate ? <text fg={t.success}>↑</text> : null}
    </box>
  );
}

function InstalledDetailPane({
  model,
  selected,
  syntaxStyle,
  detailScrollRef,
  t,
}: {
  model: TuiModel;
  selected: InstalledSkill | undefined;
  syntaxStyle: SyntaxStyle;
  detailScrollRef: ReturnType<typeof useRef<ScrollBoxRenderable | null>>;
  t: ReturnType<typeof tokensFor>;
}): ReactNode {
  const { dispatch } = useApp();
  const updatesAvailable = model.updatesAvailable[model.scope];
  const updateErrors = model.updateErrors[model.scope];
  const title = selected ? ` ${selected.name}${model.detailScroll ? " · scroll (tab)" : ""} ` : " detail ";
  const provPart = selected?.provenance ? ` · ${selected.provenance}` : "";
  const updPart = selected && updatesAvailable.has(selected.name) ? " · ↑ update available" : "";
  const errMsg = selected ? updateErrors.get(selected.name) : undefined;
  return (
    <box
      flexGrow={1}
      flexShrink={1}
      flexDirection="column"
      border={true}
      borderStyle="rounded"
      borderColor={model.detailScroll ? t.primary : t.border}
      title={title}
      onMouseDown={() => {
        if (!model.detailScroll) dispatch({ type: "detail-scroll", on: true });
      }}
    >
      <scrollbox ref={detailScrollRef} width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
        <markdown content={model.detailBody || "(no description)"} fg={t.text} syntaxStyle={syntaxStyle} />
      </scrollbox>
      {selected ? (
        <text fg={t.textMuted}>
          {`${selected.agents.length} agent(s) · ${selected.scope}${provPart} · ${selected.path}${updPart}`}
        </text>
      ) : null}
      {errMsg ? <text fg={t.textMuted}>{`check: ${errMsg}`}</text> : null}
    </box>
  );
}

function InstalledBody({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const { dispatch, loadDetail, refs } = useApp();
  const renderer = useRenderer();
  const syntaxStyle = useMemo(
    () =>
      SyntaxStyle.fromTheme(
        syntaxTokensFor(model.prefs.theme === "latte" ? CATPPUCCIN_LATTE : CATPPUCCIN_MOCHA),
        renderer.nativeScene
      ),
    [model.prefs.theme, renderer]
  );
  const listScrollRef = useRef<ScrollBoxRenderable>(null);
  const selectedRowRef = useRef<BoxRenderable>(null);
  const detailScrollRef = useRef<ScrollBoxRenderable>(null);
  const visible = model.visible;
  const selected = visible[model.selected];
  const updatesAvailable = model.updatesAvailable[model.scope];
  const listWidthPct = model.prefs.listWidth ?? 42;
  const listTitle = installedListTitle(model, visible.length, listWidthPct);

  useEffect(() => {
    refs.detailScroll = detailScrollRef.current ?? undefined;
  });
  useSelectionScrollFollow(listScrollRef, selectedRowRef, [model.selected, visible.length], model.selected);

  return (
    <box width="100%" flexGrow={1} flexShrink={1} minHeight={0} flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
      <box width={`${listWidthPct}%`} flexDirection="column" border={true} borderStyle="rounded" borderColor={t.border} title={listTitle}>
        <scrollbox ref={listScrollRef} width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
          {visible.length === 0 ? (
            <text fg={t.textMuted}>{model.filter ? "no matches" : "no skills installed in this scope"}</text>
          ) : (
            visible.map((skill, i) => (
              <InstalledSkillRow
                key={skill.name}
                skill={skill}
                sel={i === model.selected}
                checked={model.checked.has(skill.name)}
                hasUpdate={updatesAvailable.has(skill.name)}
                selectedRowRef={selectedRowRef}
                onSelect={() => {
                  dispatch({ type: "move", delta: i - model.selected });
                  void loadDetail();
                }}
                t={t}
              />
            ))
          )}
        </scrollbox>
      </box>
      <InstalledDetailPane model={model} selected={selected} syntaxStyle={syntaxStyle} detailScrollRef={detailScrollRef} t={t} />
    </box>
  );
}

/** Query-match segmentation (S-103): splits `text` into runs, marking
 * case-insensitive occurrences of the first needle that matches anywhere
 * in the text (the raw query, else the fuzzy-adjusted one). Exported for
 * unit tests. */
export function highlightSegments(
  text: string,
  needles: Array<string | null | undefined>,
): Array<{ text: string; match: boolean }> {
  const needle = needles.find((n) => n && n.trim() !== "" && text.toLowerCase().includes(n.trim().toLowerCase()));
  const q = needle?.trim();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const out: Array<{ text: string; match: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lq, i);
    if (idx === -1) {
      out.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) out.push({ text: text.slice(i, idx), match: false });
    out.push({ text: text.slice(idx, idx + q.length), match: true });
    i = idx + q.length;
  }
  return out;
}

function HighlightedRuns({
  text,
  needles,
  sel,
  baseFg,
  boldWhenSelected,
  t,
}: {
  text: string;
  needles: Array<string | null | undefined>;
  sel: boolean;
  baseFg: string;
  boldWhenSelected: boolean;
  t: ReturnType<typeof tokensFor>;
}): ReactNode {
  return (
    <>
      {highlightSegments(text, needles).map((seg, j) => (
        <text
          key={j}
          fg={seg.match ? (sel ? t.selectionText : t.primary) : sel ? t.selectionText : baseFg}
          attributes={seg.match || (boldWhenSelected && sel) ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          {seg.text}
        </text>
      ))}
    </>
  );
}

function SearchResultRow({
  result,
  sel,
  queued,
  theme,
  needles,
  rowRef,
  onSelect,
  t,
}: {
  result: SearchSkill;
  sel: boolean;
  queued: boolean;
  theme: UiPreferences["theme"];
  needles: Array<string | null | undefined>;
  rowRef: ReturnType<typeof useRef<BoxRenderable | null>>;
  onSelect: () => void;
  t: ReturnType<typeof tokensFor>;
}): ReactNode {
  return (
    <box
      ref={sel ? rowRef : undefined}
      width="100%"
      height={1}
      overflow="hidden"
      flexDirection="row"
      gap={1}
      backgroundColor={sel ? t.selectionBg : undefined}
      onMouseDown={() => {
        if (!sel) onSelect();
      }}
    >
      <text flexShrink={0} fg={queued ? t.success : t.textMuted}>{`${queued ? CHECK : " "}${sel ? ARROW : " "}`}</text>
      <image source={sourceBadge(result.source, theme)} fit="fill" protocol="auto" style={{ width: 2, height: 1 }} />
      <box flexDirection="row" flexShrink={0}>
        <HighlightedRuns text={result.name} needles={needles} sel={sel} baseFg={t.text} boldWhenSelected={true} t={t} />
      </box>
      <box flexDirection="row">
        <HighlightedRuns text={result.source} needles={needles} sel={sel} baseFg={t.textMuted} boldWhenSelected={false} t={t} />
      </box>
      <text fg={t.textMuted}>{`${result.installs}`}</text>
    </box>
  );
}

function SearchQueueSection({
  model,
  resultsActive,
  queueRowRef,
  t,
}: {
  model: TuiModel;
  resultsActive: boolean;
  queueRowRef: ReturnType<typeof useRef<BoxRenderable | null>>;
  t: ReturnType<typeof tokensFor>;
}): ReactNode {
  return (
    <>
      <text fg={!resultsActive ? t.primary : t.textMuted} attributes={!resultsActive ? TextAttributes.BOLD : TextAttributes.NONE}>
        {`${!resultsActive ? ARROW : " "} install list (${model.queue.size})`}
      </text>
      {model.queue.size === 0 ? (
        <text fg={t.textMuted}>  (empty; space or + adds from Results)</text>
      ) : (
        [...model.queue.values()].map((r, i) => {
          const sel = !resultsActive && i === model.selectedCursor;
          return (
            <box key={`${r.source}#${r.name}`} ref={sel ? queueRowRef : undefined} width="100%" height={1} overflow="hidden" flexDirection="row" gap={1} backgroundColor={sel ? t.selectionBg : undefined}>
              <text flexShrink={0} fg={t.textMuted}>{`${sel ? ARROW : " "}`}</text>
              <text flexShrink={0} fg={sel ? t.selectionText : t.text} attributes={sel ? TextAttributes.BOLD : TextAttributes.NONE}>
                {r.name}
              </text>
              <text fg={sel ? t.selectionText : t.textMuted}>{r.source}</text>
            </box>
          );
        })
      )}
    </>
  );
}

function SearchRepoSkillsList({
  source,
  selectedName,
  repoSkills,
  t,
}: {
  source: string;
  selectedName: string;
  repoSkills: SourceSkill[] | undefined;
  t: ReturnType<typeof tokensFor>;
}): ReactNode {
  if (!repoSkills || repoSkills.length === 0) return null;
  return (
    <box flexDirection="column">
      <text fg={t.primary} attributes={TextAttributes.BOLD}>{`skills in ${source} (${repoSkills.length}):`}</text>
      {repoSkills.map((s) => (
        <text key={s.name} fg={s.name === selectedName ? t.primary : t.text}>
          {`  ${s.name === selectedName ? ARROW : "·"} ${s.name}${s.description ? `: ${s.description}` : ""}`}
        </text>
      ))}
    </box>
  );
}

function SearchDetailPane({
  model,
  selectedResult,
  t,
}: {
  model: TuiModel;
  selectedResult: SearchSkill | undefined;
  t: ReturnType<typeof tokensFor>;
}): ReactNode {
  if (!selectedResult) {
    return (
      <box flexGrow={1} flexShrink={1} flexDirection="column" border={true} borderStyle="rounded" borderColor={t.border} title=" detail ">
        <scrollbox width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
          <text fg={model.searchFailed ? t.danger : t.textMuted}>
            {model.searchFailed
              ? "search failed: skills.sh unreachable"
              : "Select a search result to inspect its source and install options."}
          </text>
        </scrollbox>
      </box>
    );
  }
  const installedMatch = model.skills.find((s) => s.name === selectedResult.name && (!s.source || s.source === selectedResult.source));
  const hasUpdate = model.updatesAvailable[model.scope].has(selectedResult.name);
  const inQueue = model.queue.has(`${selectedResult.source}#${selectedResult.name}`);
  const repoSkills = model.sourceSkills[selectedResult.source];
  const installedSuffix = hasUpdate ? " · ↑ update available (u updates)" : "";
  return (
    <box flexGrow={1} flexShrink={1} flexDirection="column" border={true} borderStyle="rounded" borderColor={t.border} title={` ${selectedResult.name} `}>
      <scrollbox width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
        <box flexDirection="column" gap={1}>
          <text fg={t.primary} attributes={TextAttributes.BOLD}>{selectedResult.name}</text>
          <text fg={t.text}>{`source: ${selectedResult.source}`}</text>
          <text fg={t.textMuted}>{`installs: ${selectedResult.installs} · target scope: ${model.scope}`}</text>
          <text fg={installedMatch ? t.success : t.textMuted}>
            {installedMatch ? `status: installed in ${installedMatch.scope}${installedSuffix}` : "status: not installed in this scope"}
          </text>
          <text fg={inQueue ? t.success : t.textMuted}>
            {inQueue
              ? "queue: ✓ in install list (space/- removes · u installs list)"
              : "queue: not in install list (space/+ adds · enter installs now)"}
          </text>
          <SearchRepoSkillsList source={selectedResult.source} selectedName={selectedResult.name} repoSkills={repoSkills} t={t} />
        </box>
      </scrollbox>
    </box>
  );
}

function SearchBody({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const { dispatch } = useApp();
  const listWidthPct = model.prefs.listWidth ?? 42;
  const resultsActive = model.searchPane === "results";
  const visibleResults = model.visibleResults;
  const selectedResult = visibleResults[model.searchSelected];
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const resultRowRef = useRef<BoxRenderable>(null);
  const queueRowRef = useRef<BoxRenderable>(null);

  useSelectionScrollFollow(
    scrollRef,
    resultsActive ? resultRowRef : queueRowRef,
    [model.searchSelected, model.selectedCursor, model.searchPane, visibleResults.length, model.queue.size]
  );

  const queryPart = model.query ? ` (${model.query})` : "";
  const adjPart = model.adjustedQuery && model.query ? ` · showing "${model.adjustedQuery}"` : "";
  const resultsHeader = `${resultsActive ? ARROW : " "} Results${queryPart} · ${model.results.length} results${adjPart}`;
  const emptyText = model.searchFailed ? "search failed: skills.sh unreachable" : model.query ? "no results" : "search the skills.sh registry";

  return (
    <box width="100%" flexGrow={1} flexShrink={1} minHeight={0} flexDirection="column" paddingLeft={1} paddingRight={1}>
      <box width="100%" flexGrow={1} flexShrink={1} minHeight={0} flexDirection="row" gap={1}>
        <box width={`${listWidthPct}%`} flexDirection="column" border={true} borderStyle="rounded" borderColor={t.border} title={searchListTitle(model)}>
          <scrollbox ref={scrollRef} width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
            <text fg={resultsActive ? t.primary : t.textMuted} attributes={resultsActive ? TextAttributes.BOLD : TextAttributes.NONE}>
              {resultsHeader}
            </text>
            {visibleResults.length === 0 ? (
              <text fg={model.searchFailed ? t.danger : t.textMuted}>{emptyText}</text>
            ) : (
              visibleResults.slice(0, SEARCH_RENDER_CAP).map((r, i) => (
                <SearchResultRow
                  key={`${r.source}#${r.name}`}
                  result={r}
                  sel={resultsActive && i === model.searchSelected}
                  queued={model.queue.has(`${r.source}#${r.name}`)}
                  theme={model.prefs.theme}
                  needles={[model.query, model.adjustedQuery]}
                  rowRef={resultRowRef}
                  onSelect={() => dispatch({ type: "move", delta: i - model.searchSelected })}
                  t={t}
                />
              ))
            )}
            <SearchQueueSection model={model} resultsActive={resultsActive} queueRowRef={queueRowRef} t={t} />
          </scrollbox>
        </box>
        <SearchDetailPane model={model} selectedResult={selectedResult} t={t} />
      </box>
      <box width="100%" flexShrink={0} flexDirection="row">
        <box flexDirection="row">
          <text fg={t.textMuted}>space/+ add · -/d/x remove · enter install · s sort · Tab pane · u install list</text>
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
    ["skills-ui", APP_VERSION],
    ["skills CLI", skillsVersion],
    ["t  theme", `${model.prefs.theme}${model.prefs.theme === "mocha" ? " → latte" : " → mocha"}`],
    [",  sound", model.prefs.sound ? "on → off" : "off → on"],
    ["m  motion", motion],
    ["[ / ]  list width", model.prefs.listWidth != null ? `${model.prefs.listWidth}% (0 resets to 35%)` : "Auto (35%)"],
    ["theme/sound/motion/width persist to ~/.config/skills-ui/prefs.json", ""],
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
      ? `${model.confirm.kind === "delete" ? "remove" : "update"} ${model.confirm.names.join(", ")}? y/N`
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
  const pop = usePopInOverlay(model.prefs, 1);
  if (!model.help) return null;
  const keys: Array<[string, string]> = [
    ["i / ,", "installed / settings tabs"],
    ["/", "search tab"],
    ["f", "filter (or just type)"],
    ["tab", "detail scroll mode (arrows/PgUp/PgDn)"],
    ["a", "agent filter (multi, a=all)"],
    ["P | H", "provenance filter / hub health"],
    ["s", "sort checked first (cycles name/order)"],
    ["[ / ] / 0", "resize list pane (10% to 50%, 0 resets)"],
    ["c", "check for updates"],
    ["A | I", "check all / invert"],
    ["g | p", "global / project scope"],
    ["G", "3D skills graph (esc/G closes)"],
    ["space", "toggle check"],
    ["u / d / r", "update / remove (checked or focused)"],
    ["PgUp/PgDn/HOME/END", "page · top / bottom"],
    ["mouse", "wheel scrolls · click selects"],
    ["?", "this help"],
    ["q", "quit (press twice)"],
  ];
  return (
    <box ref={pop.ref} position="absolute" zIndex={11} top={pop.top} left="15%" width="70%" flexDirection="column" padding={1} border={true} borderStyle="rounded" borderColor={t.border} backgroundColor={t.surface} title=" help ">
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

function HealthOverlay({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const pop = usePopInOverlay(model.prefs, 5);
  if (!model.healthOpen || !model.healthCapability) return null;
  const h = model.health;
  const details = h?.details ?? [];
  return (
    <box ref={pop.ref} position="absolute" zIndex={13} top={pop.top} left="20%" width="60%" flexDirection="column" gap={1} padding={1} border={true} borderStyle="rounded" borderColor={h?.ok === false ? t.danger : t.primary} backgroundColor={t.surface} title=" hub health ">
      <text fg={h?.ok === false ? t.danger : t.success} attributes={TextAttributes.BOLD}>
        {h ? `${h.ok ? "OK" : "FAIL"}: ${h.summary}` : "Loading health status…"}
      </text>
      {details.length > 0 ? (
        <box flexDirection="column">
          {details.map((line, i) => (
            <text key={i} fg={t.text}>{`· ${line}`}</text>
          ))}
        </box>
      ) : null}
      <text fg={t.textMuted}>r refresh · H/esc close</text>
    </box>
  );
}

function ConfirmOverlay({ model }: { model: TuiModel }): ReactNode {
  const t = tokensFor(model.prefs.theme);
  const pop = usePopInOverlay(model.prefs, 7);
  if (!model.confirm) return null;
  const nonLocked = model.confirm.kind === "delete" ? (model.confirm.nonLocked ?? []) : [];
  return (
    <box ref={pop.ref} position="absolute" zIndex={10} top={pop.top} left="25%" width="50%" flexDirection="column" gap={1} padding={1} border={true} borderStyle="rounded" borderColor={model.confirm.kind === "delete" ? t.danger : t.primary} backgroundColor={t.surface} title={model.confirm.kind === "delete" ? " remove skills " : " update skills "}>
      <text fg={t.text}>{model.confirm.names.join(", ")}</text>
      {nonLocked.length > 0 ? (
        <text fg={t.danger}>
          {`Warning: non-locked (${nonLocked.map((x) => `${x.name} [${x.provenance}]`).join(", ")})`}
        </text>
      ) : null}
      <text fg={t.textMuted}>y confirm · n/esc cancel</text>
    </box>
  );
}

import { BoxRenderable, createCliRenderer, type CliRenderer } from "@opentui/core";
import {
  checkForUpdates as svcCheckForUpdates,
  install as svcInstall,
  listInstalled as svcListInstalled,
  remove as svcRemove,
  searchWithFallback as svcSearch,
  skillBody as svcSkillBody,
  update as svcUpdate,
} from "../core/index.ts";
import { loadUiPreferences, saveUiPreferences, type UiPreferences } from "../core/prefs.ts";
import { skillsVersion } from "../core/skills-client.ts";
import type { InstalledSkill, SearchSkill, UpdatesResult } from "../core/services/types.ts";
import type { UiSeed } from "../core/seed.ts";
import { readSkillDoc } from "../core/services/skill-doc.ts";
import { disposeAudio, playSound, type SoundKind } from "./audio.ts";
import { applySeed, createTuiModel, tabFor, update, visibleSkills, type Action, type TuiModel } from "./model.ts";
import {
  buildAgentSelectOverlay,
  buildConfirmOverlay,
  buildFooter,
  buildHeader,
  buildHelpOverlay,
  buildInstalledBody,
  buildSearchBody,
  buildSettingsBody,
  type BodyRefs,
} from "./views.ts";

export { buildSpikeScreen, SPIKE_MARKDOWN, spikeSyntaxTokens } from "./spike.ts";

/** Rows per PgUp/PgDn press — the fork's fast-scroll step. */
const PAGE = 10;

/**
 * Fork-style crash guard: trap exit signals and fatal errors so the shipped
 * binary always restores the terminal. Cleanup is idempotent and best-effort
 * — the guard itself must never throw. Injectable `exit`/`process` for tests.
 */
export interface CrashGuard {
  dispose(): void;
}

export function installCrashGuard(opts: {
  cleanup: () => void;
  exit: (code: number) => void;
  process?: { on(...args: never[]): unknown; off(...args: never[]): unknown };
}): CrashGuard {
  const p = (opts.process ?? process) as unknown as {
    on(event: string, listener: (...args: never[]) => void): unknown;
    off(event: string, listener: (...args: never[]) => void): unknown;
  };
  let closed = false;
  const run = (code: number): void => {
    if (closed) return;
    closed = true;
    try {
      opts.cleanup();
    } catch {
      // best-effort by contract
    }
    opts.exit(code);
  };
  const listeners: Array<[string, (...args: never[]) => void]> = [];
  const bind = (event: string, listener: (...args: never[]) => void): void => {
    p.on(event, listener);
    listeners.push([event, listener]);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    bind(signal, () => run(0));
  }
  bind("uncaughtException", (error: unknown) => {
    console.error("skills-ui: fatal:", error);
    run(1);
  });
  bind("exit", () => {
    if (!closed) {
      closed = true;
      try {
        opts.cleanup();
      } catch {
        // best-effort by contract
      }
    }
  });
  return {
    dispose(): void {
      for (const [event, listener] of listeners) p.off(event, listener);
    },
  };
}

function descriptionOf(path: string): string {
  const doc = readSkillDoc(path);
  return doc?.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
}

/** Injectable surface — tests/selftest pass fakes; production uses core. */
export interface TuiDeps {
  listInstalled(scope: "project" | "global"): Promise<InstalledSkill[]>;
  search(query: string): Promise<{ results: SearchSkill[]; adjustedQuery: string | null }>;
  install(source: string, skills: string[]): Promise<{ ok: boolean; summary: string }>;
  remove(names: string[], scope: "project" | "global"): Promise<{ ok: boolean; summary: string }>;
  update(names: string[], scope: "project" | "global"): Promise<{ ok: boolean; summary: string }>;
  skillBody(path: string): Promise<string | null>;
  checkUpdates(scope: "project" | "global"): Promise<UpdatesResult>;
  skillsVersion(): Promise<string | null>;
  savePrefs(prefs: UiPreferences): void;
  play(kind: SoundKind, prefs: UiPreferences): Promise<void>;
}

export const realDeps: TuiDeps = {
  // enrich with frontmatter descriptions so the TUI text filter can match them (secondary)
  listInstalled: async (scope) => {
    const skills = await svcListInstalled(scope);
    return skills.map((s) => ({ ...s, description: descriptionOf(s.path) }));
  },
  search: (query) => svcSearch(query),
  install: async (source, skills) => {
    const result = await svcInstall({ source, skills });
    const failed = result.results.filter((r) => r.status !== "installed");
    return {
      ok: result.ok,
      summary: failed.length
        ? `${failed.length} failed: ${failed.map((f) => f.name ?? "?").join(", ")}`
        : `installed ${result.results.map((r) => r.name ?? "?").join(", ")}`,
    };
  },
  remove: async (names, scope) => {
    const result = await svcRemove(names, scope);
    return {
      ok: result.ok,
      summary: result.ok ? `removed ${result.removed.join(", ")}` : `failed: ${result.missing.join(", ")}`,
    };
  },
  update: async (names, scope) => {
    const result = await svcUpdate(names, scope);
    return { ok: result.ok, summary: result.ok ? "updated" : "update failed" };
  },
  skillBody: (path) => Promise.resolve(svcSkillBody(path)),
  checkUpdates: (scope) => svcCheckForUpdates(scope),
  skillsVersion: async () => {
    try {
      return await skillsVersion();
    } catch {
      return null; // the CLI may be missing — settings shows "not found"
    }
  },
  savePrefs: (prefs) => saveUiPreferences(prefs),
  play: (kind, prefs) => playSound(kind, prefs),
};

export async function runTui(seed?: UiSeed, deps: TuiDeps = realDeps): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error("skills-ui: no TTY — run with --selftest for the in-memory check");
    process.exitCode = 1;
    return;
  }
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  const guard = installCrashGuard({
    cleanup: () => {
      try {
        renderer.destroy();
      } catch {
        // renderer may already be gone
      }
      void disposeAudio();
    },
    exit: (code) => process.exit(code),
  });
  try {
    await runTuiOn(renderer, seed, deps);
  } finally {
    guard.dispose();
    await disposeAudio();
  }
}

/** Mount the app on any renderer (real or in-memory test renderer). */
export async function runTuiOn(renderer: CliRenderer, seed: UiSeed | undefined, deps: TuiDeps): Promise<() => void> {
  let model = createTuiModel(loadUiPreferences());
  applySeed(model, seed);

  // whole-tree re-render per dispatch adds selection listeners on the
  // renderer (ScrollBox etc.) — raise the ceiling high enough for long
  // scrolling sessions (warnings leak into the TTY otherwise); listener
  // cleanup lands with the rich-rendering phase
  (renderer as unknown as { setMaxListeners?: (n: number) => void }).setMaxListeners?.(50_000);

  const frame = new BoxRenderable(renderer as never, { width: "100%", height: "100%", flexDirection: "column" });
  renderer.root.add(frame);

  let header: ReturnType<typeof buildHeader> | null = null;
  let body: ReturnType<typeof buildInstalledBody> | null = null;
  let footer: ReturnType<typeof buildFooter> | null = null;
  let overlay: ReturnType<typeof buildConfirmOverlay> | null = null;

  const render = (): void => {
    if (header) frame.remove(header);
    if (body) frame.remove(body);
    if (footer) frame.remove(footer);
    if (overlay) frame.remove(overlay);
    header = buildHeader(renderer, model);
    const refs: BodyRefs = {};
    body =
      model.tab === "installed"
        ? buildInstalledBody(renderer, model, refs)
        : model.tab === "search"
          ? buildSearchBody(renderer, model, refs)
          : buildSettingsBody(renderer, model);
    footer = buildFooter(renderer, model);
    overlay = buildConfirmOverlay(renderer, model) ?? buildHelpOverlay(renderer, model) ?? buildAgentSelectOverlay(renderer, model);
    frame.add(header);
    frame.add(body);
    frame.add(footer);
    if (overlay) frame.add(overlay);
    followSelection(refs);
  };

  // Keep the cursor row visible: the ScrollBox does not follow selection on
  // its own. Rows are height 1, so row i sits at content offset i. The
  // viewport height is only known after layout — read it on a macrotask.
  const followSelection = (refs: BodyRefs): void => {
    const settle = (): void => {
      if (model.tab === "installed" && refs.listScroll) {
        const scroll = refs.listScroll;
        const vs = scroll.viewport?.height ?? 0;
        if (vs > 0) {
          // wrapped rows make index ≠ content offset: use the row's computed y
          const rowY = (refs.selectedRow as unknown as { y?: number })?.y;
          const i = typeof rowY === "number" ? rowY : model.selected;
          if (i < scroll.scrollTop) scroll.scrollTop = i;
          else if (i >= scroll.scrollTop + vs) scroll.scrollTop = i - vs + 1;
          (renderer as unknown as { requestRender?: () => void }).requestRender?.();
        }
      } else if (model.tab === "search" && refs.searchScroll && refs.searchLayout) {
        const scroll = refs.searchScroll;
        const vs = scroll.viewport?.height ?? 0;
        if (vs > 0) {
          // layout: [Results header, results…, Selected header, queue…]
          const i =
            model.searchPane === "results"
              ? 1 + model.searchSelected
              : 1 + refs.searchLayout.resultsShown + 1 + model.selectedCursor;
          if (i < scroll.scrollTop) scroll.scrollTop = i;
          else if (i >= scroll.scrollTop + vs) scroll.scrollTop = i - vs + 1;
        }
      }
    };
    setTimeout(settle, 50); // after the renderer's next frame
  };

  const dispatch = (action: Action): void => {
    model = update(model, action);
    render();
  };

  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const toast = (text: string, tone: "info" | "success" | "error"): void => {
    if (toastTimer) clearTimeout(toastTimer);
    dispatch({ type: "toast", toast: { text, tone } });
    toastTimer = setTimeout(() => dispatch({ type: "toast", toast: null }), 3500);
  };

  // ---- effects ----
  const reloadSkills = async (): Promise<void> => {
    dispatch({ type: "busy", label: "loading skills" });
    try {
      const skills = await deps.listInstalled(model.scope);
      dispatch({ type: "skills-loaded", skills });
      const selected = visibleSkills(model)[model.selected];
      const body = selected ? await deps.skillBody(selected.path) : null;
      dispatch({ type: "detail", body });
    } catch (error) {
      toast(`load failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      dispatch({ type: "busy", label: null });
    }
  };

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSearch = (): void => {
    if (searchTimer) clearTimeout(searchTimer);
    const query = model.query.trim();
    if (!query) {
      dispatch({ type: "results", results: [] });
      return;
    }
    searchTimer = setTimeout(async () => {
      dispatch({ type: "busy", label: `searching "${query}"` });
      try {
        const { results, adjustedQuery } = await deps.search(query);
        dispatch({ type: "results", results, adjustedQuery });
      } catch {
        toast("search failed — check your connection", "error");
      } finally {
        dispatch({ type: "busy", label: null });
      }
    }, 300);
  };

  const loadDetail = async (): Promise<void> => {
    const skill = visibleSkills(model)[model.selected];
    if (!skill) return;
    dispatch({ type: "busy", label: `loading ${skill.name}` });
    try {
      const body = await deps.skillBody(skill.path);
      dispatch({ type: "detail", body });
    } finally {
      dispatch({ type: "busy", label: null });
    }
  };

  const runQueue = async (): Promise<void> => {
    if (model.queue.size === 0) return;
    const bySource = new Map<string, string[]>();
    for (const skill of model.queue.values()) {
      const list = bySource.get(skill.source) ?? [];
      list.push(skill.name);
      bySource.set(skill.source, list);
    }
    dispatch({ type: "busy", label: "installing queue" });
    try {
      for (const [source, names] of bySource) {
        const result = await deps.install(source, names);
        toast(`${source}: ${result.summary}`, result.ok ? "success" : "error");
        await deps.play(result.ok ? "success" : "error", model.prefs);
      }
      dispatch({ type: "queue-clear" });
      await reloadSkills();
    } finally {
      dispatch({ type: "busy", label: null });
    }
  };

  const confirmRun = async (): Promise<void> => {
    if (!model.confirm) return;
    const { kind, names } = model.confirm;
    dispatch({ type: "confirm", confirm: null });
    dispatch({ type: "busy", label: `${kind === "delete" ? "deleting" : "updating"} ${names.length} skill(s)` });
    try {
      const result = kind === "delete" ? await deps.remove(names, model.scope) : await deps.update(names, model.scope);
      toast(result.summary, result.ok ? "success" : "error");
      await deps.play(result.ok ? "success" : "error", model.prefs);
      dispatch({ type: "clear-checks" });
      await reloadSkills();
    } finally {
      dispatch({ type: "busy", label: null });
    }
  };

  // ---- keyboard contract ----
  const queueKeyAt = (): { key: string; skill: SearchSkill } | null => {
    if (model.searchPane === "selected") {
      const skill = [...model.queue.values()][model.selectedCursor];
      return skill ? { key: `${skill.source}#${skill.name}`, skill } : null;
    }
    const skill = model.results[model.searchSelected];
    return skill ? { key: `${skill.source}#${skill.name}`, skill } : null;
  };

  const handleQueueKey = (k: string): void => {
    if (k === "tab") {
      dispatch({ type: "search-pane", pane: model.searchPane === "results" ? "selected" : "results" });
      void deps.play("select", model.prefs);
      return;
    }
    const at = queueKeyAt();
    if (!at) return;
    if (k === "+") {
      dispatch({ type: "queue-toggle", skill: at.skill });
      void deps.play("select", model.prefs);
    } else {
      // "-", "d", "x" — per-item removal from the queue
      dispatch({ type: "queue-delete-at", key: at.key });
      void deps.play("select", model.prefs);
    }
  };

  const onKey = (key: { name: string; shift?: boolean; ctrl?: boolean }): void => {
    if (key.ctrl && key.name === "c") return; // exitOnCtrlC owns ctrl+c
    const k = key.name;

    if (model.confirm) {
      if (k === "y") void confirmRun();
      else if (k === "escape") dispatch({ type: "confirm", confirm: null });
      return;
    }
    if (model.help) {
      if (k === "escape" || k === "?" || k === "q") dispatch({ type: "help", on: false });
      return;
    }
    if (model.agentSelect) {
      if (k === "up" || k === "k") dispatch({ type: "agent-select-move", delta: -1 });
      else if (k === "down" || k === "j") dispatch({ type: "agent-select-move", delta: 1 });
      else if (k === "space") dispatch({ type: "agent-select-toggle" });
      else if (k === "a") dispatch({ type: "agent-select-toggle-all" });
      else if (k === "return") dispatch({ type: "agent-select-apply" });
      else if (k === "escape") dispatch({ type: "agent-select-cancel" });
      return;
    }
    // Search-tab queue keys work in both text-entry and command mode (fork
    // contract): Tab flips Results/Selected anywhere on the search tab.
    if (model.tab === "search" && (k === "tab" || k === "+" || k === "-" || k === "d" || k === "x")) {
      handleQueueKey(k);
      return;
    }

    // Text-entry modes (filter/search) capture printable input; letter
    // hotkeys must not fire mid-word (the "cli"→i-jumps-tabs trap). Arrows
    // still navigate; Esc/Return exit the mode but keep the text (contract).
    const inFilter = model.tab === "installed" && model.filtering;
    const inSearch = model.tab === "search" && model.searching;
    if (inFilter || inSearch) {
      if (k === "escape" || k === "return") {
        if (inFilter) dispatch({ type: "filtering", on: false });
        else dispatch({ type: "searching", on: false });
        return;
      }
      if (k === "up" || k === "down" || k === "home" || k === "end") {
        dispatch({ type: "move", delta: k === "up" ? -1 : k === "down" ? 1 : 0 });
        if (k === "home") dispatch({ type: "home" });
        if (k === "end") dispatch({ type: "end" });
        if (model.tab === "installed") void loadDetail();
        return;
      }
      if (k === "pageup" || k === "pagedown") {
        // paging must survive text-entry modes too — the branch swallows
        // unlisted keys, which silently ate PgUp/PgDn mid-filter (S-88)
        dispatch({ type: "move", delta: k === "pageup" ? -PAGE : PAGE });
        if (model.tab === "installed") void loadDetail();
        return;
      }
      if (k === "space") {
        // on the search tab space queues the selection; in filter mode it
        // toggles the check under the cursor (fork contract)
        if (inSearch) {
          const skill = model.results[model.searchSelected];
          if (skill) {
            dispatch({ type: "queue-toggle", skill });
            void deps.play("select", model.prefs);
          }
        } else {
          dispatch({ type: "toggle-check" });
          void deps.play("select", model.prefs);
        }
        return;
      }
      if (k === "backspace") {
        if (inSearch) {
          dispatch({ type: "query", text: model.query.slice(0, -1) });
          scheduleSearch();
        } else {
          dispatch({ type: "filter", text: model.filter.slice(0, -1) });
        }
        return;
      }
      if (k.length === 1 && /[a-z0-9\-_/.]/i.test(k)) {
        if (inSearch) {
          dispatch({ type: "query", text: model.query + k });
          scheduleSearch();
        } else {
          dispatch({ type: "filter", text: model.filter + k });
        }
      }
      return;
    }

    // Shifted batch keys (fork contract): A toggles all checks, I inverts;
    // lowercase a keeps its check-all meaning in the switch below.
    if (key.shift && (k === "a" || k === "i")) {
      if (model.tab === "installed") {
        dispatch({ type: k === "a" ? "toggle-all-checks" : "invert-checks" });
        void deps.play("select", model.prefs);
      }
      return;
    }

    const tab = tabFor(k === "/" ? "/" : k);
    // `,` doubles as the sound toggle once settings is open — fall through
    if (tab && !(k === "," && model.tab === "settings")) {
      dispatch({ type: "tab", tab });
      void deps.play("select", model.prefs);
      if (tab === "settings" && model.skillsVersion === undefined) {
        void deps
          .skillsVersion()
          .then((version) => dispatch({ type: "skills-version", version }))
          .catch(() => dispatch({ type: "skills-version", version: null }));
      }
      return;
    }

    switch (k) {
      case "q":
        renderer.destroy();
        return;
      case "?":
        dispatch({ type: "help", on: true });
        return;
      case "g":
        dispatch({ type: "scope", scope: "global" });
        void reloadSkills();
        return;
      case "p":
        dispatch({ type: "scope", scope: "project" });
        void reloadSkills();
        return;
      case "f":
        if (model.tab === "installed") dispatch({ type: "filtering", on: true });
        return;
      case "a":
        if (model.tab === "installed") dispatch({ type: "agent-select-open" });
        return;
      case "up":
      case "k":
        dispatch({ type: "move", delta: -1 });
        if (model.tab === "installed") void loadDetail();
        return;
      case "down":
      case "j":
        dispatch({ type: "move", delta: 1 });
        if (model.tab === "installed") void loadDetail();
        return;
      case "home":
        dispatch({ type: "home" });
        return;
      case "end":
        dispatch({ type: "end" });
        return;
      case "pageup":
      case "pagedown":
        dispatch({ type: "move", delta: k === "pageup" ? -PAGE : PAGE });
        if (model.tab === "installed") void loadDetail();
        return;
      case "space":
        if (model.tab === "installed") {
          dispatch({ type: "toggle-check" });
          void deps.play("select", model.prefs);
        } else if (model.tab === "search") {
          const skill = model.results[model.searchSelected];
          if (skill) {
            dispatch({ type: "queue-toggle", skill });
            void deps.play("select", model.prefs);
          }
        }
        return;
      case "c":
        if (model.tab === "installed") {
          void (async () => {
            const scope = model.scope;
            dispatch({ type: "busy", label: "checking for updates" });
            try {
              const result = await deps.checkUpdates(scope);
              const names = Object.values(result.updates)
                .filter((u) => u.updateAvailable)
                .map((u) => u.name);
              dispatch({ type: "updates-loaded", names });
              toast(
                names.length > 0 ? `${names.length} update(s) available` : "no updates available",
                names.length > 0 ? "info" : "success"
              );
            } catch (error) {
              toast(`update check failed: ${error instanceof Error ? error.message : String(error)}`, "error");
            } finally {
              dispatch({ type: "busy", label: null });
            }
          })();
        }
        return;
      case "r":
        if (model.tab === "installed") {
          const skill = visibleSkills(model)[model.selected];
          if (skill) dispatch({ type: "confirm", confirm: { kind: "delete", names: [skill.name] } });
        }
        return;
      case "u":
        if (model.tab === "search") void runQueue();
        else if (model.checked.size > 0) dispatch({ type: "confirm", confirm: { kind: "update", names: [...model.checked] } });
        else {
          // nothing checked — update everything in scope, behind the same gate
          const names = visibleSkills(model).map((s) => s.name);
          if (names.length > 0) dispatch({ type: "confirm", confirm: { kind: "update", names } });
        }
        return;
      case "d":
        if (model.checked.size > 0) dispatch({ type: "confirm", confirm: { kind: "delete", names: [...model.checked] } });
        return;
      case "return":
        if (model.tab === "installed") {
          void loadDetail();
        } else if (model.tab === "search") {
          const skill = model.results[model.searchSelected];
          if (skill) {
            void (async () => {
              dispatch({ type: "busy", label: `installing ${skill.name}` });
              const result = await deps.install(skill.source, [skill.name]);
              toast(result.summary, result.ok ? "success" : "error");
              await deps.play(result.ok ? "success" : "error", model.prefs);
              dispatch({ type: "busy", label: null });
              await reloadSkills();
            })();
          }
        }
        return;
      case "t":
        if (model.tab === "settings") {
          const prefs: UiPreferences = { ...model.prefs, theme: model.prefs.theme === "mocha" ? "latte" : "mocha" };
          deps.savePrefs(prefs);
          dispatch({ type: "prefs", prefs });
        }
        return;
      case "s":
        if (model.tab === "installed") dispatch({ type: "sort-toggle" });
        return;
      case ",":
      case "comma":
        if (model.tab === "settings") {
          const prefs: UiPreferences = { ...model.prefs, sound: !model.prefs.sound };
          deps.savePrefs(prefs);
          dispatch({ type: "prefs", prefs });
        }
        return;
      case "m":
        if (model.tab === "settings") {
          const next: UiPreferences["reduceMotion"] =
            model.prefs.reduceMotion === "auto" ? true : model.prefs.reduceMotion === true ? false : "auto";
          const prefs: UiPreferences = { ...model.prefs, reduceMotion: next };
          deps.savePrefs(prefs);
          dispatch({ type: "prefs", prefs });
        }
        return;
      default:
        // fork UX: typing a printable char on the installed list starts the
        // text filter directly (the agent overlay owns `f`)
        if (model.tab === "installed" && k.length === 1 && /[a-z0-9\-_/.]/i.test(k)) {
          dispatch({ type: "filtering", on: true });
          dispatch({ type: "filter", text: model.filter + k });
        }
        break;
    }
  };

  renderer.keyInput.on("keypress", onKey);
  // terminal resizes (SIGWINCH → stdout "resize") must re-render: the
  // whole-tree rebuild is the only re-layout path (S-87)
  const onStdoutResize = (): void => {
    (renderer as unknown as { requestResize?: (width: number, height: number) => void }).requestResize?.(
      process.stdout.columns ?? 0,
      process.stdout.rows ?? 0
    );
    render();
  };
  process.stdout.on("resize", onStdoutResize);
  renderer.once("destroy", () => {
    renderer.keyInput.off("keypress", onKey);
    process.stdout.off("resize", onStdoutResize);
    if (toastTimer) clearTimeout(toastTimer); // pending toasts must not render after teardown
  });

  render();
  await reloadSkills();
  if (seed?.kind === "add") scheduleSearch();

  return () => renderer.keyInput.off("keypress", onKey);
}

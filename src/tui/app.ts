import { createCliRenderer, type CliRenderer, type ScrollBoxRenderable } from "@opentui/core";
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
import { mountApp, type AppBridge, type RefsHolder } from "./Views.tsx";

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
  search(query: string): Promise<{ results: SearchSkill[]; adjustedQuery: string | null; failed?: boolean }>;
  install(source: string, skills: string[], scope: "project" | "global"): Promise<{ ok: boolean; summary: string }>;
  remove(names: string[], scope: "project" | "global"): Promise<{ ok: boolean; summary: string }>;
  update(names: string[], scope: "project" | "global"): Promise<{ ok: boolean; summary: string }>;
  skillBody(path: string): Promise<string | null>;
  checkUpdates(scope: "project" | "global"): Promise<UpdatesResult>;
  skillsVersion(): Promise<string | null>;
  savePrefs(prefs: UiPreferences): void;
  play(kind: SoundKind, prefs: UiPreferences): Promise<void>;
}

// `skills ls --json` is the load cost (~5s at 295 skills — the CLI scans
// every agent dir); the description enrichment is ~12ms and innocent.
// Cache per scope so g↔p switches don't re-pay the subprocess; any
// mutation drops the cache (S-89).
const listCache = new Map<"project" | "global", InstalledSkill[]>();

export const realDeps: TuiDeps = {
  // enrich with frontmatter descriptions so the TUI text filter can match them (secondary)
  listInstalled: async (scope) => {
    const cached = listCache.get(scope);
    if (cached) return cached.map((s) => ({ ...s }));
    const skills = await svcListInstalled(scope);
    const enriched = skills.map((s) => ({ ...s, description: descriptionOf(s.path) }));
    listCache.set(scope, enriched);
    return enriched.map((s) => ({ ...s }));
  },
  search: (query) => svcSearch(query),
  install: async (source, skills, scope) => {
    const result = await svcInstall({ source, skills, global: scope === "global" });
    const failed = result.results.filter((r) => r.status !== "installed");
    listCache.clear();
    return {
      ok: result.ok,
      summary: failed.length
        ? `${failed.length} failed: ${failed.map((f) => f.name ?? "?").join(", ")}`
        : `installed ${result.results.map((r) => r.name ?? "?").join(", ")}`,
    };
  },
  remove: async (names, scope) => {
    const result = await svcRemove(names, scope);
    listCache.clear();
    return {
      ok: result.ok,
      summary: result.ok ? `removed ${result.removed.join(", ")}` : `failed: ${result.missing.join(", ")}`,
    };
  },
  update: async (names, scope) => {
    const result = await svcUpdate(names, scope);
    listCache.clear();
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

  // ---- store (S-96): model.ts stays the Elm core; React subscribes ----
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const getState = (): TuiModel => model;
  const refsHolder: RefsHolder = {};

  // detail-scroll mode: arrows/PgUp/PgDn page the doc, not the list
  const scrollDetail = (scroll: ScrollBoxRenderable | undefined, delta: number): void => {
    if (!scroll) return;
    const vs = scroll.viewport?.height ?? 0;
    if (vs <= 0) return;
    scroll.scrollTop = Math.max(0, scroll.scrollTop + delta);
    (renderer as unknown as { requestRender?: () => void }).requestRender?.();
  };

  const dispatch = (action: Action): void => {
    model = update(model, action);
    for (const fn of listeners) fn();
  };

  // Toast queue (ST7): the single toast slot stays, but a toast fired
  // while one is showing waits in a FIFO pending list instead of
  // clobbering it. When the 3.5s window ends, the next pending toast pops
  // and gets a full window of its own; an empty queue clears the slot.
  const TOAST_MS = 3500;
  type ToastTone = "info" | "success" | "error";
  const toastQueue: Array<{ text: string; tone: ToastTone }> = [];
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const showNextToast = (): void => {
    const next = toastQueue.shift();
    if (next) {
      dispatch({ type: "toast", toast: next });
      toastTimer = setTimeout(showNextToast, TOAST_MS);
    } else {
      dispatch({ type: "toast", toast: null });
      toastTimer = null;
    }
  };
  const toast = (text: string, tone: ToastTone): void => {
    toastQueue.push({ text, tone });
    if (!toastTimer) showNextToast(); // idle slot — show immediately
  };

  // Double-press quit (S-161): a bare `q` in command mode must not be a
  // one-keystroke destructive exit — the first press arms with a toast,
  // the second destroys. Any non-q key, any text-entry key, or ~1.5s of
  // silence disarms.
  let quitArmed = false;
  let quitTimer: ReturnType<typeof setTimeout> | null = null;
  const disarmQuit = (): void => {
    quitArmed = false;
    if (quitTimer) {
      clearTimeout(quitTimer);
      quitTimer = null;
    }
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
      // success or failure, the first settled load ends the splash (S-100)
      dispatch({ type: "splash-dismiss" });
    }
  };

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  // S-182 stale guard: a monotonic token captured when the debounced search
  // is dispatched and checked before anything touches the model — a slow
  // older query resolving after a newer one can never overwrite the newer
  // results (or clobber the newer search's busy label / failure toast).
  let searchSeq = 0;
  const scheduleSearch = (): void => {
    if (searchTimer) clearTimeout(searchTimer);
    const query = model.query.trim();
    if (!query) {
      searchSeq++; // clearing the query is newer state — any in-flight search is now stale
      dispatch({ type: "results", results: [] });
      // clear only a search-owned busy slot — a non-search label (install,
      // load) in flight must survive clearing the query (S-182 review OPTIONAL 1)
      if (model.busy?.startsWith("searching ")) dispatch({ type: "busy", label: null });
      return;
    }
    searchTimer = setTimeout(async () => {
      const seq = ++searchSeq; // captured at dispatch…
      dispatch({ type: "busy", label: `searching "${query}"` });
      try {
        const { results, adjustedQuery, failed } = await deps.search(query);
        if (seq !== searchSeq) return; // …checked at resolve: stale, drop
        dispatch({ type: "results", results, adjustedQuery, failed });
      } catch {
        if (seq !== searchSeq) return; // stale failures never toast over newer state
        toast("search failed — check your connection", "error");
      } finally {
        if (seq === searchSeq) dispatch({ type: "busy", label: null });
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
    dispatch({ type: "busy", label: "installing list" });
    try {
      for (const [source, names] of bySource) {
        const result = await deps.install(source, names, model.scope);
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
    dispatch({ type: "busy", label: `${kind === "delete" ? "removing" : "updating"} ${names.length} skill(s)` });
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
    if (k !== "q") disarmQuit(); // any non-q press cancels an armed quit (S-161)

    if (model.confirm) {
      if (k === "y") void confirmRun();
      // n/N cancel (S-162): the y/N copy promised it; shift lands as name
      // "n" or "N" depending on the parser, so accept both spellings
      else if (k === "escape" || k === "n" || k === "N") dispatch({ type: "confirm", confirm: null });
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
    if (model.graph) {
      // the 3D graph owns the body — leave-intent keys only (q still quits)
      if (k === "escape" || k === "G" || (key.shift && k === "g")) dispatch({ type: "graph", on: false });
      else if (k === "q") renderer.destroy();
      return;
    }
    // Search-tab queue keys: Tab flips Results/Selected anywhere on the
    // search tab (not printable text, safe mid-word). The -/d/x/+ queue
    // keys are COMMAND-MODE only — they used to fire while typing too,
    // eating every d/x/+/- out of the query ("vercel-labs" → "vercellabs",
    // S-103). After Esc/Return all five work as queue keys again.
    const queueKey = model.tab === "search" && (k === "tab" || (!model.searching && (k === "+" || k === "-" || k === "d" || k === "x")));
    if (queueKey) {
      handleQueueKey(k);
      return;
    }
    if (model.tab === "installed" && k === "tab") {
      dispatch({ type: "detail-scroll", on: !model.detailScroll });
      void deps.play("select", model.prefs);
      return;
    }
    if (model.detailScroll && model.tab === "installed") {
      if (k === "up" || k === "down" || k === "pageup" || k === "pagedown") {
        scrollDetail(refsHolder.detailScroll, k === "up" ? -1 : k === "down" ? 1 : k === "pageup" ? -PAGE : PAGE);
        return;
      }
      if (k === "home" || k === "end") {
        const scroll = refsHolder.detailScroll;
        if (scroll) {
          const vs = scroll.viewport?.height ?? 0;
          scroll.scrollTop = k === "home" ? 0 : Math.max(0, scroll.scrollHeight - vs);
          (renderer as unknown as { requestRender?: () => void }).requestRender?.();
        }
        return;
      }
      if (k === "escape" || k === "tab") {
        dispatch({ type: "detail-scroll", on: false });
        return;
      }
    }

    // Text-entry modes (filter/search) capture printable input; letter
    // hotkeys must not fire mid-word (the "cli"→i-jumps-tabs trap). This
    // claims `q` too (S-161): while the filter/search is live, a filter
    // word starting with q must type, never quit — quitting is reachable
    // only after Esc/Return leaves text mode. Arrows still navigate;
    // Esc/Return exit the mode but keep the text (contract).
    const inFilter = model.tab === "installed" && model.filtering;
    const inSearch = model.tab === "search" && model.searching;
    if (inFilter || inSearch) {
      disarmQuit(); // typing — any key here, even q — cancels an armed quit
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

    // G (shift+g) opens the 3D skills graph (S-100); g stays scope-global
    if (k === "G" || (key.shift && k === "g")) {
      dispatch({ type: "graph", on: true });
      void deps.play("select", model.prefs);
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

    // Keymap ratification (S-161): command-mode single letters are
    // a c d f g i j k m p q r s t u (+ shift A/G/I). Intentionally unbound:
    // b e h l n o v w x y z — an unbound printable falls through to the
    // filter-start below, so filter words can BEGIN with those. Binding any
    // of them costs that first character (the user must press `f` first);
    // `q` stays the quit key, now DOUBLE-PRESS (arm, then confirm) so no
    // single bare keystroke reaches the destructive destroy — while the
    // filter/search is live the text-entry branch above claims q entirely
    // (S-161 q-guard).
    switch (k) {
      case "q": // double-press quit — unreachable while filtering/searching (claimed above)
        if (quitArmed) {
          disarmQuit();
          renderer.destroy();
        } else {
          quitArmed = true;
          quitTimer = setTimeout(disarmQuit, 1500);
          toast("press q again to quit", "info");
        }
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
              const entries = Object.values(result.updates);
              const names = entries.filter((u) => u.updateAvailable).map((u) => u.name);
              // G4: keep the per-skill check-status errors so the detail pane
              // can show WHY a skill is badge-less (not checkable / check failed)
              const errors: Record<string, string> = {};
              for (const u of entries) if (u.error) errors[u.name] = u.error;
              dispatch({ type: "updates-loaded", names, errors });
              const notCheckable = Object.keys(errors).length;
              toast(
                names.length > 0
                  ? `${names.length} update(s) available`
                  : notCheckable > 0
                    ? `no updates available · ${notCheckable} not checkable`
                    : "no updates available",
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
              const result = await deps.install(skill.source, [skill.name], model.scope);
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
  // terminal resizes (SIGWINCH → stdout "resize"): the React tree re-layouts
  // with the renderer; we only nudge the size (S-87)
  const onStdoutResize = (): void => {
    (renderer as unknown as { requestResize?: (width: number, height: number) => void }).requestResize?.(
      process.stdout.columns ?? 0,
      process.stdout.rows ?? 0
    );
  };
  process.stdout.on("resize", onStdoutResize);
  let unmount: (() => void) | null = null;
  renderer.once("destroy", () => {
    renderer.keyInput.off("keypress", onKey);
    process.stdout.off("resize", onStdoutResize);
    if (toastTimer) clearTimeout(toastTimer); // pending toasts must not render after teardown
    toastTimer = null; // a stale non-null id must not delay exit or swallow a late toast
    toastQueue.length = 0; // same for toasts still queued behind the visible one
    if (quitTimer) clearTimeout(quitTimer); // same for an armed-quit timer
    unmount?.();
  });

  const bridge: AppBridge = { subscribe, getState, dispatch, loadDetail, play: (k, prefs) => void deps.play(k, prefs), refs: refsHolder };
  unmount = mountApp(renderer, bridge);
  await reloadSkills();
  if (seed?.kind === "add") scheduleSearch();

  return () => {
    renderer.keyInput.off("keypress", onKey);
    unmount?.();
  };
}

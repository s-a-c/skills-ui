import { BoxRenderable, createCliRenderer, type CliRenderer } from "@opentui/core";
import {
  install as svcInstall,
  listInstalled as svcListInstalled,
  remove as svcRemove,
  searchWithFallback as svcSearch,
  skillBody as svcSkillBody,
  update as svcUpdate,
} from "../core/index.ts";
import { loadUiPreferences, saveUiPreferences, type UiPreferences } from "../core/prefs.ts";
import type { InstalledSkill, SearchSkill } from "../core/services/types.ts";
import type { UiSeed } from "../core/seed.ts";
import { disposeAudio, playSound, type SoundKind } from "./audio.ts";
import { applySeed, createTuiModel, tabFor, update, visibleSkills, type Action, type TuiModel } from "./model.ts";
import {
  buildConfirmOverlay,
  buildFooter,
  buildHeader,
  buildHelpOverlay,
  buildInstalledBody,
  buildSearchBody,
  buildSettingsBody,
} from "./views.ts";

export { buildSpikeScreen, SPIKE_MARKDOWN, spikeSyntaxTokens } from "./spike.ts";

/** Rows per PgUp/PgDn press — the fork's fast-scroll step. */
const PAGE = 10;

/** Injectable surface — tests/selftest pass fakes; production uses core. */
export interface TuiDeps {
  listInstalled(scope: "project" | "global"): Promise<InstalledSkill[]>;
  search(query: string): Promise<{ results: SearchSkill[]; adjustedQuery: string | null }>;
  install(source: string, skills: string[]): Promise<{ ok: boolean; summary: string }>;
  remove(names: string[], scope: "project" | "global"): Promise<{ ok: boolean; summary: string }>;
  update(names: string[], scope: "project" | "global"): Promise<{ ok: boolean; summary: string }>;
  skillBody(path: string): Promise<string | null>;
  savePrefs(prefs: UiPreferences): void;
  play(kind: SoundKind, prefs: UiPreferences): Promise<void>;
}

export const realDeps: TuiDeps = {
  listInstalled: (scope) => svcListInstalled(scope),
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
  try {
    await runTuiOn(renderer, seed, deps);
  } finally {
    await disposeAudio();
  }
}

/** Mount the app on any renderer (real or in-memory test renderer). */
export async function runTuiOn(renderer: CliRenderer, seed: UiSeed | undefined, deps: TuiDeps): Promise<() => void> {
  let model = createTuiModel(loadUiPreferences());
  applySeed(model, seed);

  // whole-tree re-render per dispatch adds selection listeners on the
  // renderer (ScrollBox etc.) — raise the ceiling; incremental updates
  // land in the rich-rendering phase
  (renderer as unknown as { setMaxListeners?: (n: number) => void }).setMaxListeners?.(200);

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
    body =
      model.tab === "installed"
        ? buildInstalledBody(renderer, model)
        : model.tab === "search"
          ? buildSearchBody(renderer, model)
          : buildSettingsBody(renderer, model);
    footer = buildFooter(renderer, model);
    overlay = buildConfirmOverlay(renderer, model) ?? buildHelpOverlay(renderer, model);
    frame.add(header);
    frame.add(body);
    frame.add(footer);
    if (overlay) frame.add(overlay);
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
        const { results } = await deps.search(query);
        dispatch({ type: "results", results });
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
    if (tab) {
      dispatch({ type: "tab", tab });
      void deps.play("select", model.prefs);
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
      case "a":
        dispatch({ type: "check-all" });
        return;
      case "u":
        if (model.tab === "search") void runQueue();
        else if (model.checked.size > 0) dispatch({ type: "confirm", confirm: { kind: "update", names: [...model.checked] } });
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
        break;
    }
  };

  renderer.keyInput.on("keypress", onKey);
  renderer.once("destroy", () => renderer.keyInput.off("keypress", onKey));

  render();
  await reloadSkills();
  if (seed?.kind === "add") scheduleSearch();

  return () => renderer.keyInput.off("keypress", onKey);
}

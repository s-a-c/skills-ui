import type { InstalledSkill, SearchSkill } from "../core/services/types.ts";
import type { UiPreferences } from "../core/prefs.ts";
import type { UiSeed } from "../core/seed.ts";

/**
 * Pure TUI model — the same Elm-style discipline as the fork's TUI
 * (state transitions are pure functions; the app layer owns all I/O).
 * Renderer-agnostic: unit-tested without OpenTUI.
 */

export type Tab = "installed" | "search" | "settings";
export type Scope = "project" | "global";

/** Search results render at most this many rows — a memory bound against
 * pathological registry responses, NOT a renderer workaround: under the
 * React shell large single-frame scrollbox growth renders clean (the
 * installed list ships 390 rows; the S-92 spike proved the shape). The
 * title always carries the true count; the cursor clamps to this so it
 * stays on rendered rows (S-101/S-102 — the old 50-row cap froze tall
 * terminals on the first screen). */
export const SEARCH_RENDER_CAP = 200;

export interface Toast {
  text: string;
  tone: "info" | "success" | "error";
}

export interface TuiModel {
  tab: Tab;
  scope: Scope;
  prefs: UiPreferences;
  // installed
  skills: InstalledSkill[];
  selected: number;
  checked: Set<string>;
  updatesAvailable: Set<string>;
  /** Per-skill check-status errors from the last `c` check (G4): name →
   * "not checkable yet (…)" / "check failed (…)". Rendered in the detail
   * pane so not-checkable skills stop being silently badge-less. */
  updateErrors: Map<string, string>;
  filter: string;
  filtering: boolean;
  agentFilter: Set<string>;
  agentSelect: { agents: string[]; staged: Set<string>; index: number } | null;
  sortCheckedFirst: boolean;
  // search
  query: string;
  searching: boolean;
  results: SearchSkill[];
  adjustedQuery: string | null;
  /** True when the last completed search failed at the registry (F4) —
   * the pane says "search failed", never an honest-looking "no results". */
  searchFailed: boolean;
  searchSelected: number;
  searchPane: "results" | "selected";
  selectedCursor: number;
  queue: Map<string, SearchSkill>; // key: source#name
  busy: string | null;
  toast: Toast | null;
  confirm: { kind: "delete" | "update"; names: string[] } | null;
  help: boolean;
  detailBody: string | null;
  /** detail-scroll mode: arrows/PgUp/PgDn scroll the doc, not the list */
  detailScroll: boolean;
  /** startup splash (S-100): shows until the first skills load settles */
  splash: boolean;
  /** 3D graph view open (S-100): takes over the body, G closes */
  graph: boolean;
  /** Discovered `skills` CLI version: undefined = not queried yet, null = not found. */
  skillsVersion: string | null | undefined;
  /** Rider (S-183): the visible installed list computed by the LAST update()
   * dispatch. update() runs the filter+sort at most once per dispatch and
   * stores it here; render paths and app.ts read this instead of re-running
   * visibleSkills (S-154 measured it twice per keystroke). Maintained ONLY
   * by update()/createTuiModel — never mutate by hand. */
  visible: InstalledSkill[];
}

export function createTuiModel(prefs: UiPreferences): TuiModel {
  return {
    tab: "installed",
    scope: "project",
    prefs,
    skills: [],
    selected: 0,
    checked: new Set(),
    updatesAvailable: new Set(),
    updateErrors: new Map(),
    filter: "",
    filtering: false,
    sortCheckedFirst: true,
    agentFilter: new Set(),
    agentSelect: null,
    query: "",
    searching: false,
    results: [],
    adjustedQuery: null,
    searchFailed: false,
    searchSelected: 0,
    searchPane: "results",
    selectedCursor: 0,
    queue: new Map(),
    busy: null,
    toast: null,
    confirm: null,
    help: false,
    detailBody: null,
    detailScroll: false,
    splash: true,
    graph: false,
    skillsVersion: undefined,
    visible: [],
  };
}

export function applySeed(model: TuiModel, seed: UiSeed | undefined): void {
  if (!seed || seed.kind === "none") return;
  if (seed.kind === "add") {
    model.tab = "search";
    model.query = seed.source;
  } else if (seed.kind === "update") {
    for (const name of seed.skills) model.checked.add(name);
  } else if (seed.kind === "remove") {
    model.tab = "installed";
    for (const name of seed.skills) model.checked.add(name);
  }
}

/** Visible installed skills under the current filters: text (name, source,
 * agents — description as a secondary match) intersected with the agent
 * multi-select. Checked-first then A→Z when sortCheckedFirst (the fork's
 * selection UX); load order otherwise. Returns a sorted copy — never
 * mutates the model. Render paths should prefer `model.visible` (S-183
 * rider): update() computes this once per dispatch and stores it there. */
export function visibleSkills(model: TuiModel): InstalledSkill[] {
  const q = model.filter.trim().toLowerCase();
  const byText = q
    ? model.skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.source?.toLowerCase().includes(q) ||
          s.agents.some((a) => a.toLowerCase().includes(q)) ||
          (s.description?.toLowerCase().includes(q) ?? false)
      )
    : model.skills;
  const visible =
    model.agentFilter.size > 0
      ? byText.filter((s) => s.agents.some((a) => model.agentFilter.has(a)))
      : byText;
  if (!model.sortCheckedFirst) return visible;
  return [...visible].sort((a, b) => {
    const ca = model.checked.has(a.name) ? 0 : 1;
    const cb = model.checked.has(b.name) ? 0 : 1;
    return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
  });
}

/** Clamps the selection to the rendered rows. `visibleOf` is update()'s
 * per-dispatch memo (S-183 rider) — this must not re-run the filter+sort. */
function clamp(model: TuiModel, visibleOf: () => InstalledSkill[]): void {
  const count = model.tab === "installed" ? visibleOf().length : model.results.length;
  if (model.selected >= count) model.selected = Math.max(0, count - 1);
}

function clampSelectedCursor(model: TuiModel): void {
  if (model.selectedCursor >= model.queue.size) model.selectedCursor = Math.max(0, model.queue.size - 1);
}

export type Action =
  | { type: "tab"; tab: Tab }
  | { type: "detail-scroll"; on: boolean }
  | { type: "scope"; scope: Scope }
  | { type: "skills-loaded"; skills: InstalledSkill[] }
  | { type: "updates-loaded"; names: string[]; errors?: Record<string, string> }
  | { type: "move"; delta: number }
  | { type: "home" }
  | { type: "end" }
  | { type: "toggle-check" }
  | { type: "check-all" }
  | { type: "toggle-all-checks" }
  | { type: "invert-checks" }
  | { type: "sort-toggle" }
  | { type: "clear-checks" }
  | { type: "filter"; text: string }
  | { type: "filtering"; on: boolean }
  | { type: "agent-select-open" }
  | { type: "agent-select-move"; delta: number }
  | { type: "agent-select-toggle" }
  | { type: "agent-select-toggle-all" }
  | { type: "agent-select-apply" }
  | { type: "agent-select-cancel" }
  | { type: "query"; text: string }
  | { type: "searching"; on: boolean }
  | { type: "results"; results: SearchSkill[]; adjustedQuery?: string | null; failed?: boolean }
  | { type: "search-pane"; pane: "results" | "selected" }
  | { type: "queue-toggle"; skill: SearchSkill }
  | { type: "queue-delete-at"; key: string }
  | { type: "queue-clear" }
  | { type: "busy"; label: string | null }
  | { type: "toast"; toast: Toast | null }
  | { type: "confirm"; confirm: TuiModel["confirm"] }
  | { type: "help"; on: boolean }
  | { type: "splash-dismiss" }
  | { type: "graph"; on: boolean }
  | { type: "detail"; body: string | null }
  | { type: "skills-version"; version: string | null }
  | { type: "prefs"; prefs: UiPreferences };

export function update(model: TuiModel, action: Action): TuiModel {
  const next: TuiModel = {
    ...model,
    checked: new Set(model.checked),
    updatesAvailable: new Set(model.updatesAvailable),
    updateErrors: new Map(model.updateErrors),
    agentFilter: new Set(model.agentFilter),
    agentSelect: model.agentSelect
      ? { ...model.agentSelect, staged: new Set(model.agentSelect.staged) }
      : null,
    queue: new Map(model.queue),
  };
  // Rider (S-183): at most ONE filter+sort per dispatch. The memo serves the
  // action's own reads (clamps, check ops) AND the final `next.visible` the
  // render path consumes; `forget()` after any mutation of the visible
  // inputs (skills / filter / agentFilter / sortCheckedFirst / checked).
  let memo: InstalledSkill[] | null = null;
  const forget = (): void => {
    memo = null;
  };
  const visibleOf = (): InstalledSkill[] => {
    if (!memo) memo = visibleSkills(next);
    return memo;
  };
  switch (action.type) {
    case "tab":
      next.tab = action.tab;
      next.searching = action.tab === "search";
      next.detailScroll = false;
      break;
    case "detail-scroll":
      next.detailScroll = action.on;
      break;
    case "scope":
      next.scope = action.scope;
      next.selected = 0;
      next.checked.clear();
      forget(); // checked order input changed
      break;
    case "skills-loaded": {
      // S-183 swap reconciliation (the stale->fresh swap AND every fresh
      // load share this action): keep the cursor on the same skill NAME
      // when fresh truth still has it (the fresh checked-first sort can
      // reshuffle indices), else the clamp below keeps today's index
      // behavior. Seen-set prune rule: drop a checked name only when the
      // model has actually SEEN it in a loaded list (previous skills) and
      // the new list lacks it — checks seeded by `skills ui update/remove`
      // before the first load have never been seen, so a stale paint whose
      // index predates the seeded skill can never silently drop them (no
      // lost checks); true vanishings still prune exactly where they
      // vanish. Filter and agent filter are untouched — the view stays
      // narrowed across the swap.
      const selectedName = visibleOf()[next.selected]?.name;
      const seen = new Set(next.skills.map((s) => s.name)); // names the model has shown
      next.skills = action.skills;
      const alive = new Set(action.skills.map((s) => s.name));
      for (const name of next.checked) if (!alive.has(name) && seen.has(name)) next.checked.delete(name);
      forget();
      const at = visibleOf().findIndex((s) => s.name === selectedName);
      if (at >= 0) next.selected = at;
      else clamp(next, visibleOf);
      break;
    }
    case "updates-loaded":
      next.updatesAvailable = new Set(action.names);
      next.updateErrors = new Map(Object.entries(action.errors ?? {}));
      break;
    case "move": {
      if (next.tab === "search" && next.searchPane === "selected") {
        next.selectedCursor = Math.max(0, Math.min(next.queue.size - 1, next.selectedCursor + action.delta));
        break;
      }
      const count =
        next.tab === "installed" ? visibleOf().length : Math.min(next.results.length, SEARCH_RENDER_CAP);
      next.selected = Math.max(0, Math.min(count - 1, (next.tab === "installed" ? next.selected : next.searchSelected) + action.delta));
      if (next.tab === "search") next.searchSelected = next.selected;
      break;
    }
    case "home":
      if (next.tab === "search") {
        if (next.searchPane === "selected") next.selectedCursor = 0;
        else next.searchSelected = 0;
      } else next.selected = 0;
      break;
    case "end": {
      if (next.tab === "search") {
        // clamp to the rendered rows — the cursor must stay visible (S-101)
        if (next.searchPane === "selected") next.selectedCursor = Math.max(0, next.queue.size - 1);
        else next.searchSelected = Math.max(0, Math.min(next.results.length, SEARCH_RENDER_CAP) - 1);
      } else {
        next.selected = Math.max(0, visibleOf().length - 1);
      }
      break;
    }
    case "toggle-check": {
      const skill = visibleOf()[next.selected];
      if (skill) {
        if (next.checked.has(skill.name)) next.checked.delete(skill.name);
        else next.checked.add(skill.name);
      }
      forget(); // checked order input changed (the read above was pre-toggle, as before)
      break;
    }
    case "check-all":
      for (const s of visibleOf()) next.checked.add(s.name);
      forget();
      break;
    case "toggle-all-checks": {
      const list = visibleOf();
      const all = list.length > 0 && list.every((s) => next.checked.has(s.name));
      if (all) for (const s of list) next.checked.delete(s.name);
      else for (const s of list) next.checked.add(s.name);
      forget();
      break;
    }
    case "invert-checks":
      for (const s of visibleOf()) {
        if (next.checked.has(s.name)) next.checked.delete(s.name);
        else next.checked.add(s.name);
      }
      forget();
      break;
    case "sort-toggle":
      next.sortCheckedFirst = !next.sortCheckedFirst;
      forget(); // sort order input changed
      clamp(next, visibleOf);
      break;
    case "clear-checks":
      next.checked.clear();
      forget();
      break;
    case "filter":
      next.filter = action.text;
      forget(); // text filter input changed
      clamp(next, visibleOf);
      break;
    case "filtering":
      next.filtering = action.on;
      break;
    case "agent-select-open": {
      const agents = new Set<string>();
      for (const skill of next.skills) for (const a of skill.agents) agents.add(a);
      next.agentSelect = { agents: [...agents].sort(), staged: new Set(next.agentFilter), index: 0 };
      break;
    }
    case "agent-select-move":
      if (next.agentSelect) {
        const count = next.agentSelect.agents.length;
        next.agentSelect.index = Math.max(0, Math.min(count - 1, next.agentSelect.index + action.delta));
      }
      break;
    case "agent-select-toggle":
      if (next.agentSelect) {
        const agent = next.agentSelect.agents[next.agentSelect.index];
        if (agent !== undefined) {
          if (next.agentSelect.staged.has(agent)) next.agentSelect.staged.delete(agent);
          else next.agentSelect.staged.add(agent);
        }
      }
      break;
    case "agent-select-toggle-all":
      if (next.agentSelect) {
        const sel = next.agentSelect;
        if (sel.agents.length > 0 && sel.staged.size === sel.agents.length) sel.staged.clear();
        else for (const agent of sel.agents) sel.staged.add(agent);
      }
      break;
    case "agent-select-apply":
      if (next.agentSelect) {
        // staging every agent filters nothing — normalize to "no filter"
        const all = next.agentSelect.agents.length > 0
          && next.agentSelect.staged.size === next.agentSelect.agents.length;
        next.agentFilter = all ? new Set<string>() : new Set(next.agentSelect.staged);
        next.agentSelect = null;
        forget(); // agent filter input changed
        clamp(next, visibleOf);
      }
      break;
    case "agent-select-cancel":
      next.agentSelect = null;
      break;
    case "query":
      next.query = action.text;
      next.adjustedQuery = null; // stale until the next results arrive
      next.searchFailed = false; // same staleness rule (F4)
      break;
    case "searching":
      next.searching = action.on;
      break;
    case "results":
      next.results = action.results;
      next.adjustedQuery = action.adjustedQuery ?? null;
      next.searchFailed = action.failed ?? false;
      next.searchSelected = 0;
      break;
    case "search-pane":
      next.searchPane = action.pane;
      clampSelectedCursor(next);
      break;
    case "queue-toggle": {
      const key = `${action.skill.source}#${action.skill.name}`;
      if (next.queue.has(key)) next.queue.delete(key);
      else next.queue.set(key, action.skill);
      clampSelectedCursor(next);
      break;
    }
    case "queue-delete-at":
      next.queue.delete(action.key);
      clampSelectedCursor(next);
      break;
    case "queue-clear":
      next.queue.clear();
      break;
    case "busy":
      next.busy = action.label;
      break;
    case "toast":
      next.toast = action.toast;
      break;
    case "confirm":
      next.confirm = action.confirm;
      break;
    case "help":
      next.help = action.on;
      break;
    case "splash-dismiss":
      next.splash = false;
      break;
    case "graph":
      next.graph = action.on;
      next.detailScroll = false;
      break;
    case "detail":
      next.detailBody = action.body;
      break;
    case "skills-version":
      next.skillsVersion = action.version;
      break;
    case "prefs":
      next.prefs = action.prefs;
      break;
  }
  next.visible = visibleOf(); // the render path's copy — no recompute (S-183 rider)
  return next;
}

/** Keyboard contract — user steer 2026-10-28: `i` installed, `/` search,
 * `,` settings (and `,` toggles sound once there). `x` is free; `a` owns the
 * agent filter, `f` the text filter. */
export function tabFor(key: string): Tab | null {
  if (key === "i") return "installed";
  if (key === "/") return "search";
  if (key === "," || key === "comma") return "settings";
  return null;
}

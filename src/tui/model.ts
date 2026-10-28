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
  searchSelected: number;
  searchPane: "results" | "selected";
  selectedCursor: number;
  queue: Map<string, SearchSkill>; // key: source#name
  transient
  busy: string | null;
  toast: Toast | null;
  confirm: { kind: "delete" | "update"; names: string[] } | null;
  help: boolean;
  detailBody: string | null;
  /** Discovered `skills` CLI version: undefined = not queried yet, null = not found. */
  skillsVersion: string | null | undefined;
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
    filter: "",
    filtering: false,
    sortCheckedFirst: true,
    agentFilter: new Set(),
    agentSelect: null,
    query: "",
    searching: false,
    results: [],
    adjustedQuery: null,
    searchSelected: 0,
    searchPane: "results",
    selectedCursor: 0,
    queue: new Map(),
    busy: null,
    toast: null,
    confirm: null,
    help: false,
    detailBody: null,
    skillsVersion: undefined,
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
 * mutates the model. */
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

function clamp(model: TuiModel): void {
  const count = model.tab === "installed" ? visibleSkills(model).length : model.results.length;
  if (model.selected >= count) model.selected = Math.max(0, count - 1);
}

function clampSelectedCursor(model: TuiModel): void {
  if (model.selectedCursor >= model.queue.size) model.selectedCursor = Math.max(0, model.queue.size - 1);
}

export type Action =
  | { type: "tab"; tab: Tab }
  | { type: "scope"; scope: Scope }
  | { type: "skills-loaded"; skills: InstalledSkill[] }
  | { type: "updates-loaded"; names: string[] }
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
  | { type: "results"; results: SearchSkill[]; adjustedQuery?: string | null }
  | { type: "search-pane"; pane: "results" | "selected" }
  | { type: "queue-toggle"; skill: SearchSkill }
  | { type: "queue-delete-at"; key: string }
  | { type: "queue-clear" }
  | { type: "busy"; label: string | null }
  | { type: "toast"; toast: Toast | null }
  | { type: "confirm"; confirm: TuiModel["confirm"] }
  | { type: "help"; on: boolean }
  | { type: "detail"; body: string | null }
  | { type: "skills-version"; version: string | null }
  | { type: "prefs"; prefs: UiPreferences };

export function update(model: TuiModel, action: Action): TuiModel {
  const next: TuiModel = {
    ...model,
    checked: new Set(model.checked),
    updatesAvailable: new Set(model.updatesAvailable),
    agentFilter: new Set(model.agentFilter),
    agentSelect: model.agentSelect
      ? { ...model.agentSelect, staged: new Set(model.agentSelect.staged) }
      : null,
    queue: new Map(model.queue),
  };
  switch (action.type) {
    case "tab":
      next.tab = action.tab;
      next.searching = action.tab === "search";
      break;
    case "scope":
      next.scope = action.scope;
      next.selected = 0;
      next.checked.clear();
      break;
    case "skills-loaded":
      next.skills = action.skills;
      clamp(next);
      break;
    case "updates-loaded":
      next.updatesAvailable = new Set(action.names);
      break;
    case "move": {
      if (next.tab === "search" && next.searchPane === "selected") {
        next.selectedCursor = Math.max(0, Math.min(next.queue.size - 1, next.selectedCursor + action.delta));
        break;
      }
      const count = next.tab === "installed" ? visibleSkills(next).length : next.results.length;
      next.selected = Math.max(0, Math.min(count - 1, (next.tab === "installed" ? next.selected : next.searchSelected) + action.delta));
      if (next.tab === "search") next.searchSelected = next.selected;
      break;
    }
    case "home":
      if (next.tab === "search") next.searchSelected = 0;
      else next.selected = 0;
      break;
    case "end": {
      const count = next.tab === "search" ? next.results.length : visibleSkills(next).length;
      if (next.tab === "search") next.searchSelected = Math.max(0, count - 1);
      else next.selected = Math.max(0, count - 1);
      break;
    }
    case "toggle-check": {
      const skill = visibleSkills(next)[next.selected];
      if (skill) {
        if (next.checked.has(skill.name)) next.checked.delete(skill.name);
        else next.checked.add(skill.name);
      }
      break;
    }
    case "check-all":
      for (const s of visibleSkills(next)) next.checked.add(s.name);
      break;
    case "toggle-all-checks": {
      const list = visibleSkills(next);
      const all = list.length > 0 && list.every((s) => next.checked.has(s.name));
      if (all) for (const s of list) next.checked.delete(s.name);
      else for (const s of list) next.checked.add(s.name);
      break;
    }
    case "invert-checks":
      for (const s of visibleSkills(next)) {
        if (next.checked.has(s.name)) next.checked.delete(s.name);
        else next.checked.add(s.name);
      }
      break;
    case "sort-toggle":
      next.sortCheckedFirst = !next.sortCheckedFirst;
      clamp(next);
      break;
    case "clear-checks":
      next.checked.clear();
      break;
    case "filter":
      next.filter = action.text;
      clamp(next);
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
        clamp(next);
      }
      break;
    case "agent-select-cancel":
      next.agentSelect = null;
      break;
    case "query":
      next.query = action.text;
      next.adjustedQuery = null; // stale until the next results arrive
      break;
    case "searching":
      next.searching = action.on;
      break;
    case "results":
      next.results = action.results;
      next.adjustedQuery = action.adjustedQuery ?? null;
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

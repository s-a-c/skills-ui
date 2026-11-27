import {
  skillMatches,
  type HealthCheckResult,
  type InstalledSkill,
  type SearchSkill,
  type SkillProvenance,
  type SourceSkill,
} from "../core/index.ts";
import type { UiPreferences } from "../core/prefs.ts";
import type { UiSeed } from "../core/seed.ts";

/**
 * Pure TUI model — the same Elm-style discipline as the fork's TUI
 * (state transitions are pure functions; the app layer owns all I/O).
 * Renderer-agnostic: unit-tested without OpenTUI.
 */

export type Tab = "installed" | "search" | "settings";
export type Scope = "project" | "global";
export type SortMode = "checked" | "name" | "load";

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
  /** Per-scope update-check results (UI-07): scope → names with an update
   * available. Same-name project/global rows are DIFFERENT rows — a project
   * result must never badge the global one (and vice versa). Records are
   * retained across scope switches; views read the model.scope projection. */
  updatesAvailable: Record<Scope, Set<string>>;
  /** Per-scope per-skill check-status errors from the last `c` check in that
   * scope (G4 + UI-07): name → "not checkable yet (…)" / "check failed (…)".
   * Rendered in the detail pane so not-checkable skills stop being silently
   * badge-less. */
  updateErrors: Record<Scope, Map<string, string>>;
  filter: string;
  filtering: boolean;
  agentFilter: Set<string>;
  agentSelect: { agents: string[]; staged: Set<string>; index: number } | null;
  provenanceFilter: "all" | SkillProvenance;
  sortBy: SortMode;
  searchSortBy: SortMode;
  sortCheckedFirst: boolean;
  // search
  query: string;
  searching: boolean;
  results: SearchSkill[];
  visibleResults: SearchSkill[];
  sourceSkills: Record<string, SourceSkill[]>;
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
  confirm: {
    kind: "delete" | "update";
    names: string[];
    nonLocked?: Array<{ name: string; provenance: SkillProvenance }>;
  } | null;
  help: boolean;
  healthCapability: boolean;
  health: HealthCheckResult | null;
  healthOpen: boolean;
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
    updatesAvailable: { project: new Set(), global: new Set() },
    updateErrors: { project: new Map(), global: new Map() },
    filter: "",
    filtering: false,
    sortBy: "checked",
    searchSortBy: "load",
    sortCheckedFirst: true,
    agentFilter: new Set(),
    agentSelect: null,
    provenanceFilter: "all",
    query: "",
    searching: false,
    results: [],
    visibleResults: [],
    sourceSkills: {},
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
    healthCapability: false,
    health: null,
    healthOpen: false,
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
  const byText = q ? model.skills.filter((s) => skillMatches(s, q)) : model.skills;
  const byAgent =
    model.agentFilter.size > 0
      ? byText.filter((s) => s.agents.some((a) => model.agentFilter.has(a)))
      : byText;
  const prov = model.provenanceFilter ?? "all";
  const visible =
    prov === "all" ? byAgent : byAgent.filter((s) => (s.provenance ?? "local") === prov);
  const mode: SortMode = !model.sortCheckedFirst && model.sortBy === "checked" ? "load" : model.sortBy;
  if (mode === "load") return visible;
  if (mode === "name") return [...visible].sort((a, b) => a.name.localeCompare(b.name));
  return [...visible].sort((a, b) => {
    const ca = model.checked.has(a.name) ? 0 : 1;
    const cb = model.checked.has(b.name) ? 0 : 1;
    return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
  });
}

/** Visible search results sorted by `model.searchSortBy` (`load` -> registry
 * relevance/installs order by default, `checked` -> queued first, `name` -> A->Z). */
export function visibleSearchResults(model: TuiModel): SearchSkill[] {
  const mode: SortMode = model.searchSortBy ?? "load";
  if (mode === "load") return model.results;
  if (mode === "name") return [...model.results].sort((a, b) => a.name.localeCompare(b.name));
  return [...model.results].sort((a, b) => {
    const ca = model.queue.has(`${a.source}#${a.name}`) ? 0 : 1;
    const cb = model.queue.has(`${b.source}#${b.name}`) ? 0 : 1;
    return ca !== cb ? ca - cb : 0;
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
  | { type: "updates-loaded"; scope: Scope; names: string[]; errors?: Record<string, string> }
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
  | { type: "source-skills-loaded"; source: string; skills: SourceSkill[] }
  | { type: "provenance-cycle" }
  | { type: "health-capability"; on: boolean }
  | { type: "health-loaded"; health: HealthCheckResult }
  | { type: "health-open"; on: boolean }
  | { type: "prefs"; prefs: UiPreferences };

interface UpdateCtx {
  next: TuiModel;
  visibleOf: () => InstalledSkill[];
  visibleSearchOf: () => SearchSkill[];
  forget: () => void;
}

function applySkillsLoaded(ctx: UpdateCtx, skills: InstalledSkill[]): void {
  const { next, visibleOf, forget } = ctx;
  // S-183 swap reconciliation (the stale->fresh swap AND every fresh
  // load share this action): keep the cursor on the same skill NAME
  // when fresh truth still has it, else clamp below.
  const selectedName = visibleOf()[next.selected]?.name;
  const seen = new Set(next.skills.map((s) => s.name));
  next.skills = skills;
  const alive = new Set(skills.map((s) => s.name));
  for (const name of next.checked) if (!alive.has(name) && seen.has(name)) next.checked.delete(name);
  forget();
  const at = visibleOf().findIndex((s) => s.name === selectedName);
  if (at >= 0) next.selected = at;
  else clamp(next, visibleOf);
}

function applyMove(ctx: UpdateCtx, delta: number): void {
  const { next, visibleOf } = ctx;
  if (next.tab === "search" && next.searchPane === "selected") {
    next.selectedCursor = Math.max(0, Math.min(next.queue.size - 1, next.selectedCursor + delta));
    return;
  }
  const count = next.tab === "installed" ? visibleOf().length : Math.min(next.results.length, SEARCH_RENDER_CAP);
  const cur = next.tab === "installed" ? next.selected : next.searchSelected;
  next.selected = Math.max(0, Math.min(count - 1, cur + delta));
  if (next.tab === "search") next.searchSelected = next.selected;
}

function applyHomeEnd(ctx: UpdateCtx, edge: "home" | "end"): void {
  const { next, visibleOf } = ctx;
  if (next.tab === "search") {
    if (next.searchPane === "selected") {
      next.selectedCursor = edge === "home" ? 0 : Math.max(0, next.queue.size - 1);
    } else {
      next.searchSelected = edge === "home" ? 0 : Math.max(0, Math.min(next.results.length, SEARCH_RENDER_CAP) - 1);
    }
    return;
  }
  next.selected = edge === "home" ? 0 : Math.max(0, visibleOf().length - 1);
}

function applyCheckAction(
  ctx: UpdateCtx,
  kind: "toggle-check" | "check-all" | "toggle-all-checks" | "invert-checks" | "clear-checks"
): void {
  const { next, visibleOf, forget } = ctx;
  if (kind === "clear-checks") {
    next.checked.clear();
  } else if (kind === "toggle-check") {
    const skill = visibleOf()[next.selected];
    if (skill) {
      if (next.checked.has(skill.name)) next.checked.delete(skill.name);
      else next.checked.add(skill.name);
    }
  } else if (kind === "check-all") {
    for (const s of visibleOf()) next.checked.add(s.name);
  } else if (kind === "toggle-all-checks") {
    const list = visibleOf();
    const all = list.length > 0 && list.every((s) => next.checked.has(s.name));
    if (all) for (const s of list) next.checked.delete(s.name);
    else for (const s of list) next.checked.add(s.name);
  } else {
    for (const s of visibleOf()) {
      if (next.checked.has(s.name)) next.checked.delete(s.name);
      else next.checked.add(s.name);
    }
  }
  forget();
}

function applyAgentSelectAction(
  ctx: UpdateCtx,
  action: Extract<
    Action,
    {
      type:
        | "agent-select-move"
        | "agent-select-toggle"
        | "agent-select-toggle-all"
        | "agent-select-apply";
    }
  >
): void {
  const { next, visibleOf, forget } = ctx;
  const sel = next.agentSelect;
  if (!sel) return;
  if (action.type === "agent-select-move") {
    sel.index = Math.max(0, Math.min(sel.agents.length - 1, sel.index + action.delta));
  } else if (action.type === "agent-select-toggle") {
    const agent = sel.agents[sel.index];
    if (agent !== undefined) {
      if (sel.staged.has(agent)) sel.staged.delete(agent);
      else sel.staged.add(agent);
    }
  } else if (action.type === "agent-select-toggle-all") {
    if (sel.agents.length > 0 && sel.staged.size === sel.agents.length) sel.staged.clear();
    else for (const agent of sel.agents) sel.staged.add(agent);
  } else {
    // staging every agent filters nothing — normalize to "no filter"
    const all = sel.agents.length > 0 && sel.staged.size === sel.agents.length;
    next.agentFilter = all ? new Set<string>() : new Set(sel.staged);
    next.agentSelect = null;
    forget();
    clamp(next, visibleOf);
  }
}

function applySortToggle(ctx: UpdateCtx): void {
  const { next, visibleOf, forget } = ctx;
  if (next.tab === "search") {
    next.searchSortBy = next.searchSortBy === "load" ? "checked" : next.searchSortBy === "checked" ? "name" : "load";
  } else {
    next.sortBy = next.sortBy === "checked" ? "name" : next.sortBy === "name" ? "load" : "checked";
    next.sortCheckedFirst = next.sortBy === "checked";
  }
  forget();
  clamp(next, visibleOf);
}

function applyProvenanceCycle(ctx: UpdateCtx): void {
  const { next, visibleOf, forget } = ctx;
  const order: Array<"all" | SkillProvenance> = ["all", "locked", "linked", "local"];
  const idx = order.indexOf(next.provenanceFilter ?? "all");
  next.provenanceFilter = order[(idx + 1) % order.length]!;
  forget();
  clamp(next, visibleOf);
}

type ActionHandlers = {
  [K in Action["type"]]: (ctx: UpdateCtx, action: Extract<Action, { type: K }>) => void;
};

const ACTION_HANDLERS: ActionHandlers = {
  tab: ({ next }, a) => {
    next.tab = a.tab;
    next.searching = a.tab === "search";
    next.detailScroll = false;
  },
  "detail-scroll": ({ next }, a) => {
    next.detailScroll = a.on;
  },
  scope: ({ next, forget }, a) => {
    next.scope = a.scope;
    next.selected = 0;
    next.checked.clear();
    forget();
  },
  "skills-loaded": (ctx, a) => applySkillsLoaded(ctx, a.skills),
  "updates-loaded": ({ next }, a) => {
    next.updatesAvailable[a.scope] = new Set(a.names);
    next.updateErrors[a.scope] = new Map(Object.entries(a.errors ?? {}));
  },
  move: (ctx, a) => applyMove(ctx, a.delta),
  home: (ctx) => applyHomeEnd(ctx, "home"),
  end: (ctx) => applyHomeEnd(ctx, "end"),
  "toggle-check": (ctx) => applyCheckAction(ctx, "toggle-check"),
  "check-all": (ctx) => applyCheckAction(ctx, "check-all"),
  "toggle-all-checks": (ctx) => applyCheckAction(ctx, "toggle-all-checks"),
  "invert-checks": (ctx) => applyCheckAction(ctx, "invert-checks"),
  "clear-checks": (ctx) => applyCheckAction(ctx, "clear-checks"),
  "sort-toggle": (ctx) => applySortToggle(ctx),
  filter: ({ next, visibleOf, forget }, a) => {
    next.filter = a.text;
    forget();
    clamp(next, visibleOf);
  },
  filtering: ({ next }, a) => {
    next.filtering = a.on;
  },
  "agent-select-open": ({ next }) => {
    const agents = new Set<string>();
    for (const skill of next.skills) for (const a of skill.agents) agents.add(a);
    next.agentSelect = { agents: [...agents].sort(), staged: new Set(next.agentFilter), index: 0 };
  },
  "agent-select-move": (ctx, a) => applyAgentSelectAction(ctx, a),
  "agent-select-toggle": (ctx, a) => applyAgentSelectAction(ctx, a),
  "agent-select-toggle-all": (ctx, a) => applyAgentSelectAction(ctx, a),
  "agent-select-apply": (ctx, a) => applyAgentSelectAction(ctx, a),
  "agent-select-cancel": ({ next }) => {
    next.agentSelect = null;
  },
  query: ({ next }, a) => {
    next.query = a.text;
    next.adjustedQuery = null;
    next.searchFailed = false;
  },
  searching: ({ next }, a) => {
    next.searching = a.on;
  },
  results: ({ next, forget }, a) => {
    next.results = a.results;
    next.adjustedQuery = a.adjustedQuery ?? null;
    next.searchFailed = a.failed ?? false;
    next.searchSelected = 0;
    forget();
  },
  "search-pane": ({ next }, a) => {
    next.searchPane = a.pane;
    clampSelectedCursor(next);
  },
  "queue-toggle": ({ next, forget }, a) => {
    const key = `${a.skill.source}#${a.skill.name}`;
    if (next.queue.has(key)) next.queue.delete(key);
    else next.queue.set(key, a.skill);
    clampSelectedCursor(next);
    forget();
  },
  "queue-delete-at": ({ next, forget }, a) => {
    next.queue.delete(a.key);
    clampSelectedCursor(next);
    forget();
  },
  "queue-clear": ({ next, forget }) => {
    next.queue.clear();
    forget();
  },
  busy: ({ next }, a) => {
    next.busy = a.label;
  },
  toast: ({ next }, a) => {
    next.toast = a.toast;
  },
  confirm: ({ next }, a) => {
    next.confirm = a.confirm;
  },
  help: ({ next }, a) => {
    next.help = a.on;
  },
  "splash-dismiss": ({ next }) => {
    next.splash = false;
  },
  graph: ({ next }, a) => {
    next.graph = a.on;
    next.detailScroll = false;
  },
  detail: ({ next }, a) => {
    next.detailBody = a.body;
  },
  "skills-version": ({ next }, a) => {
    next.skillsVersion = a.version;
  },
  "source-skills-loaded": ({ next }, a) => {
    next.sourceSkills[a.source] = a.skills;
  },
  "provenance-cycle": (ctx) => applyProvenanceCycle(ctx),
  "health-capability": ({ next }, a) => {
    next.healthCapability = a.on;
  },
  "health-loaded": ({ next }, a) => {
    next.health = a.health;
  },
  "health-open": ({ next }, a) => {
    next.healthOpen = a.on;
  },
  prefs: ({ next }, a) => {
    next.prefs = a.prefs;
  },
};

export function update(model: TuiModel, action: Action): TuiModel {
  const next: TuiModel = {
    ...model,
    checked: new Set(model.checked),
    // UI-07: both scope records are copied so a result for one scope can
    // never bleed into the other (or into the previous model state).
    updatesAvailable: {
      project: new Set(model.updatesAvailable.project),
      global: new Set(model.updatesAvailable.global),
    },
    updateErrors: {
      project: new Map(model.updateErrors.project),
      global: new Map(model.updateErrors.global),
    },
    agentFilter: new Set(model.agentFilter),
    agentSelect: model.agentSelect
      ? { ...model.agentSelect, staged: new Set(model.agentSelect.staged) }
      : null,
    queue: new Map(model.queue),
    sourceSkills: { ...model.sourceSkills },
  };
  // Rider (S-183): at most ONE filter+sort per dispatch.
  let memo: InstalledSkill[] | null = null;
  let searchMemo: SearchSkill[] | null = null;
  const ctx: UpdateCtx = {
    next,
    forget: () => {
      memo = null;
      searchMemo = null;
    },
    visibleOf: () => {
      if (!memo) memo = visibleSkills(next);
      return memo;
    },
    visibleSearchOf: () => {
      if (!searchMemo) searchMemo = visibleSearchResults(next);
      return searchMemo;
    },
  };
  const handler = ACTION_HANDLERS[action.type] as (c: UpdateCtx, a: Action) => void;
  handler(ctx, action);
  next.visible = ctx.visibleOf(); // the render path's copy — no recompute (S-183 rider)
  next.visibleResults = ctx.visibleSearchOf();
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

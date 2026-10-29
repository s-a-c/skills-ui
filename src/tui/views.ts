import {
  BoxRenderable,
  MarkdownRenderable,
  ScrollBoxRenderable,
  SyntaxStyle,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";
import { syntaxTokensFor, THEME_TOKENS, CATPPUCCIN_MOCHA, CATPPUCCIN_LATTE, type ThemeName } from "../core/theme.ts";
import { visibleSkills, type TuiModel } from "./model.ts";

/**
 * View builders — pure renderable construction from the model. The app
 * layer swaps these into the body container on each state change; the
 * cell-diff renderer keeps that cheap.
 */

function paletteFor(theme: ThemeName) {
  return theme === "latte" ? CATPPUCCIN_LATTE : CATPPUCCIN_MOCHA;
}

export function tokensFor(theme: ThemeName) {
  return THEME_TOKENS[theme];
}

const CHECK = "✔";
const ARROW = "❯";

export function buildHeader(renderer: CliRenderer, model: TuiModel): BoxRenderable {
  const t = tokensFor(model.prefs.theme);
  const header = new BoxRenderable(renderer, {
    width: "100%",
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 0, paddingBottom: 0, paddingLeft: 1, paddingRight: 1,
  });
  const tabs = new BoxRenderable(renderer, { flexDirection: "row", gap: 2 });
  for (const [tab, label] of [
    ["installed", "Installed"],
    ["search", "Search"],
    ["settings", "Settings"],
  ] as const) {
    const active = model.tab === tab;
    tabs.add(
      new TextRenderable(renderer, {
        content: `${active ? ARROW + " " : "  "}${label}${tab === "search" && model.queue.size ? ` (${model.queue.size})` : ""}`,
        fg: active ? t.primary : t.textMuted,
        attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
      })
    );
  }
  const right = new BoxRenderable(renderer, { flexDirection: "row", gap: 1 });
  // one persistent text: conditional children here left stale cells on the
  // real renderer (S-87) — content swaps on a stable node paint correctly
  const rightParts = [`[${model.scope === "project" ? "p" : "g"}] ${model.scope}`];
  if (model.busy) rightParts.push(`· ${model.busy}…`);
  right.add(
    new TextRenderable(renderer, {
      content: rightParts.join(" "),
      fg: t.textMuted,
    })
  );
  header.add(tabs);
  header.add(right);
  return header;
}

export function buildInstalledBody(renderer: CliRenderer, model: TuiModel): BoxRenderable {
  const t = tokensFor(model.prefs.theme);
  // flexGrow without flexShrink overflows the terminal with long content —
  // Yoga's default flexShrink is 0, so growing panes must also shrink (S-87)
  const body = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexShrink: 1, minHeight: 0, flexDirection: "row", gap: 1, paddingLeft: 1, paddingRight: 1 });

  // list pane — a bordered, scrollable container (user-confirmed design).
  // The border is also the renderer fix: an unbordered pane sharing a
  // subtree with a massively-growing ScrollBox paints siblings at stale
  // coordinates on `g` (short project list → long global list), overlaying
  // the filter bar. A bordered pane absorbs the growth — the detail pane
  // has always survived 600-line doc loads in this exact shape (S-88).
  const listPane = new BoxRenderable(renderer, {
    width: "42%",
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: t.border,
    // titles render on the border line — the one dynamic surface that
    // survives big scroll mutations on the real renderer (S-88). Keep it
    // short: overlong titles are dropped at narrow pane widths.
    title:
      model.agentFilter.size > 0
        ? ` agents: ${[...model.agentFilter].sort().join(", ")} `
        : model.filter || model.filtering
          ? ` filter: ${model.filter}${model.filtering ? "▌" : ""} `
          : ` ${visibleSkills(model).length} skills · f filter `,
  });
  const visible = visibleSkills(model);
  const scroll = new ScrollBoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    scrollY: true,
  });
  if (visible.length === 0) {
    scroll.add(
      new TextRenderable(renderer, {
        content: model.filter ? "no matches" : "no skills installed in this scope",
        fg: t.textMuted,
      })
    );
  }
  let renderedSelected = -1;
  visible.forEach((skill, i) => {
    const selected = i === model.selected;
    if (selected) renderedSelected = i;
    const row = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      gap: 1,
      backgroundColor: selected ? t.selectionBg : undefined,
    });
    const checked = model.checked.has(skill.name);
    row.add(
      new TextRenderable(renderer, {
        content: `${checked ? CHECK : " "} ${selected ? ARROW : " "}`,
        fg: selected ? t.selectionText : checked ? t.success : t.textMuted,
      })
    );
    row.add(
      new TextRenderable(renderer, {
        content: skill.name,
        fg: selected ? t.selectionText : t.text,
        attributes: selected ? TextAttributes.BOLD : TextAttributes.NONE,
      })
    );
    if (skill.source) {
      row.add(new TextRenderable(renderer, { content: skill.source, fg: selected ? t.selectionText : t.textMuted }));
    }
    if (model.updatesAvailable.has(skill.name)) {
      row.add(new TextRenderable(renderer, { content: "↑", fg: t.success }));
    }
    scroll.add(row);
  });
  listPane.add(scroll);

  // detail pane (markdown)
  const detailPane = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: t.border,
    title: visible[model.selected] ? ` ${visible[model.selected]!.name} ` : " detail ",
  });
  const detailScroll = new ScrollBoxRenderable(renderer, { width: "100%", flexGrow: 1, flexShrink: 1, scrollY: true });
  const syntaxStyle = SyntaxStyle.fromTheme(syntaxTokensFor(paletteFor(model.prefs.theme)), renderer.nativeScene);
  if (model.detailBody !== null) {
    detailScroll.add(
      new MarkdownRenderable(renderer, { content: model.detailBody || "(no description)", fg: t.text, syntaxStyle })
    );
  } else {
    detailScroll.add(new TextRenderable(renderer, { content: "enter to load detail…", fg: t.textMuted }));
  }
  detailPane.add(detailScroll);
  const skill = visible[model.selected];
  if (skill) {
    const updateHint = model.updatesAvailable.has(skill.name) ? " · ↑ update available" : "";
    detailPane.add(
      new TextRenderable(renderer, {
        content: `${skill.agents.length} agent(s) · ${skill.scope} · ${skill.path}${updateHint}`,
        fg: t.textMuted,
      })
    );
  }

  body.add(listPane);
  body.add(detailPane);
  void renderedSelected;
  return body;
}

export function buildSearchBody(renderer: CliRenderer, model: TuiModel): BoxRenderable {
  const t = tokensFor(model.prefs.theme);
  const body = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexShrink: 1, minHeight: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1 });
  // bordered scroll container — same renderer-isolation shape as the
  // installed list pane (see note there); search line lives inside it
  const searchPane = new BoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: t.border,
    title: ` search: ${model.query}${model.query && model.searching ? "▌" : ""} · ${model.results.length} results${model.adjustedQuery && model.query ? ` · showing "${model.adjustedQuery}"` : ""} `,
  });

  // Results and Selected panes share one scroll column: the active pane's
  // header carries the cursor arrow; panes are visually stacked like the fork.
  const scroll = new ScrollBoxRenderable(renderer, { width: "100%", flexGrow: 1, flexShrink: 1, scrollY: true });
  const resultsActive = model.searchPane === "results";
  scroll.add(
    new TextRenderable(renderer, {
      content: `${resultsActive ? ARROW : " "} Results`,
      fg: resultsActive ? t.primary : t.textMuted,
      attributes: resultsActive ? TextAttributes.BOLD : TextAttributes.NONE,
    })
  );
  if (model.results.length === 0) {
    scroll.add(new TextRenderable(renderer, { content: model.query ? "no results" : "search the skills.sh registry", fg: t.textMuted }));
  }
  // growth beyond ~60 rows in one render garbles neighbors on the real
  // renderer (S-88) — cap the fed rows; the title keeps the true count
  const MAX_ROWS = 50;
  model.results.slice(0, MAX_ROWS).forEach((r, i) => {
    const selected = resultsActive && i === model.searchSelected;
    const row = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      gap: 1,
      backgroundColor: selected ? t.selectionBg : undefined,
    });
    const queued = model.queue.has(`${r.source}#${r.name}`);
    row.add(
      new TextRenderable(renderer, {
        content: `${queued ? CHECK : " "}${selected ? ARROW : " "}`,
        fg: queued ? t.success : t.textMuted,
      })
    );
    row.add(
      new TextRenderable(renderer, {
        content: r.name,
        fg: selected ? t.selectionText : t.text,
        attributes: selected ? TextAttributes.BOLD : TextAttributes.NONE,
      })
    );
    row.add(new TextRenderable(renderer, { content: r.source, fg: selected ? t.selectionText : t.textMuted }));
    row.add(new TextRenderable(renderer, { content: `${r.installs}`, fg: t.textMuted }));
    scroll.add(row);
  });

  const selectedActive = model.searchPane === "selected";
  scroll.add(
    new TextRenderable(renderer, {
      content: `${selectedActive ? ARROW : " "} Selected (${model.queue.size})`,
      fg: selectedActive ? t.primary : t.textMuted,
      attributes: selectedActive ? TextAttributes.BOLD : TextAttributes.NONE,
    })
  );
  const queued = [...model.queue.values()];
  if (queued.length === 0) {
    scroll.add(new TextRenderable(renderer, { content: "  (empty — space or + queues from Results)", fg: t.textMuted }));
  }
  queued.forEach((r, i) => {
    const selected = selectedActive && i === model.selectedCursor;
    const row = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      gap: 1,
      backgroundColor: selected ? t.selectionBg : undefined,
    });
    row.add(new TextRenderable(renderer, { content: `${selected ? ARROW : " "} `, fg: t.textMuted }));
    row.add(
      new TextRenderable(renderer, {
        content: r.name,
        fg: selected ? t.selectionText : t.text,
        attributes: selected ? TextAttributes.BOLD : TextAttributes.NONE,
      })
    );
    row.add(new TextRenderable(renderer, { content: r.source, fg: selected ? t.selectionText : t.textMuted }));
    scroll.add(row);
  });
  searchPane.add(scroll);
  body.add(searchPane);

  const hintBar = new BoxRenderable(renderer, { width: "100%", flexDirection: "row" });
  hintBar.add(
    new TextRenderable(renderer, {
      content: "space/+ queue · -/d/x remove · Tab pane · u install queued",
      fg: t.textMuted,
    })
  );
  body.add(hintBar);
  return body;
}

export function buildSettingsBody(renderer: CliRenderer, model: TuiModel): BoxRenderable {
  const t = tokensFor(model.prefs.theme);
  const body = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexShrink: 1, minHeight: 0, flexDirection: "column", paddingLeft: 2, gap: 1 });
  body.add(new TextRenderable(renderer, { content: "Settings", fg: t.primary, attributes: TextAttributes.BOLD }));
  const motion = model.prefs.reduceMotion === "auto" ? "auto (explicit toggle is authoritative in terminals)" : String(model.prefs.reduceMotion);
  const skillsVersion =
    model.skillsVersion === undefined ? "…" : model.skillsVersion ?? "not found";
  const rows: Array<[string, string]> = [
    ["skills CLI", skillsVersion],
    ["t  theme", `${model.prefs.theme}${model.prefs.theme === "mocha" ? " → latte" : " → mocha"}`],
    [",  sound", model.prefs.sound ? "on → off" : "off → on"],
    ["m  motion", motion],
    ["", ""],
    ["theme/sound/motion persist to ~/.config/skills-ui/prefs.json", ""],
  ];
  for (const [label, value] of rows) {
    if (!label) continue;
    const row = new BoxRenderable(renderer, { flexDirection: "row", gap: 2 });
    row.add(new TextRenderable(renderer, { content: label, fg: t.text }));
    row.add(new TextRenderable(renderer, { content: value, fg: t.textMuted }));
    body.add(row);
  }
  return body;
}

export function buildFooter(renderer: CliRenderer, model: TuiModel): BoxRenderable {
  const t = tokensFor(model.prefs.theme);
  const footer = new BoxRenderable(renderer, { width: "100%", flexShrink: 0, flexDirection: "row", justifyContent: "space-between", paddingLeft: 1, paddingRight: 1 });
  // legend text is CONSTANT across states: a legend that changes content in
  // the same render as a body swap double-paints on the real renderer (S-88)
  const legend = "i installed · / search · a agents · f filter · , settings · ? help · q quit";
  footer.add(new TextRenderable(renderer, { content: legend, fg: t.textMuted }));
  const status = model.toast
    ? model.toast.text
    : model.confirm
      ? `${model.confirm.kind} ${model.confirm.names.join(", ")}? y/N`
      : "";
  footer.add(
    new TextRenderable(renderer, {
      content: status.slice(0, 60),
      fg: model.toast?.tone === "success" ? t.success : model.toast?.tone === "error" ? t.danger : model.confirm ? t.primary : t.textMuted,
    })
  );
  return footer;
}

export function buildConfirmOverlay(renderer: CliRenderer, model: TuiModel): BoxRenderable | null {
  if (!model.confirm) return null;
  const t = tokensFor(model.prefs.theme);
  const overlay = new BoxRenderable(renderer, {
    position: "absolute",
    zIndex: 10,
    top: "30%",
    left: "25%",
    width: "50%",
    flexDirection: "column",
    gap: 1,
    padding: 1,
    border: true,
    borderStyle: "rounded",
    borderColor: model.confirm.kind === "delete" ? t.danger : t.primary,
    backgroundColor: t.surface,
    title: model.confirm.kind === "delete" ? " delete skills " : " update skills ",
  });
  overlay.add(new TextRenderable(renderer, { content: model.confirm.names.join(", "), fg: t.text }));
  overlay.add(new TextRenderable(renderer, { content: "y confirm · esc cancel", fg: t.textMuted }));
  return overlay;
}

export function buildAgentSelectOverlay(renderer: CliRenderer, model: TuiModel): BoxRenderable | null {
  if (!model.agentSelect) return null;
  const t = tokensFor(model.prefs.theme);
  const sel = model.agentSelect;
  const overlay = new BoxRenderable(renderer, {
    position: "absolute",
    zIndex: 12,
    top: "15%",
    left: "25%",
    width: "50%",
    flexDirection: "column",
    gap: 0,
    padding: 1,
    border: true,
    borderStyle: "rounded",
    borderColor: t.border,
    backgroundColor: t.surface,
    title: " filter by agent ",
  });
  for (const [i, agent] of sel.agents.entries()) {
    const cursor = i === sel.index;
    const staged = sel.staged.has(agent);
    const row = new BoxRenderable(renderer, { flexDirection: "row", gap: 2 });
    row.add(
      new TextRenderable(renderer, {
        content: `${staged ? CHECK : " "} ${cursor ? ARROW : " "}`,
        fg: cursor ? t.selectionText : staged ? t.success : t.textMuted,
      })
    );
    row.add(
      new TextRenderable(renderer, {
        content: agent,
        fg: cursor ? t.selectionText : t.text,
        attributes: cursor ? TextAttributes.BOLD : TextAttributes.NONE,
      })
    );
    overlay.add(row);
  }
  overlay.add(
    new TextRenderable(renderer, { content: "space toggle · a all · enter apply · esc cancel", fg: t.textMuted })
  );
  return overlay;
}

export function buildHelpOverlay(renderer: CliRenderer, model: TuiModel): BoxRenderable | null {
  if (!model.help) return null;
  const t = tokensFor(model.prefs.theme);
  const overlay = new BoxRenderable(renderer, {
    position: "absolute",
    zIndex: 11,
    top: "10%",
    left: "25%",
    width: "50%",
    flexDirection: "column",
    gap: 0,
    padding: 1,
    border: true,
    borderStyle: "rounded",
    borderColor: t.border,
    backgroundColor: t.surface,
    title: " help ",
  });
  const keys: Array<[string, string]> = [
    ["i / ,", "installed / settings tabs"],
    ["/", "search tab"],
    ["f", "filter (or just type)"],
    ["a", "agent filter (multi, a=all)"],
    ["s", "sort checked first"],
    ["c", "check for updates"],
    ["A | I", "check all / invert"],
    ["g | p", "global / project scope"],
    ["space", "toggle check"],
    ["u / d / r", "update / delete (checked or focused)"],
    ["PgUp/PgDn/HOME/END", "page · top / bottom"],
    ["?", "this help"],
    ["q", "quit"],
  ];
  for (const [key, label] of keys) {
    const row = new BoxRenderable(renderer, { flexDirection: "row", gap: 2 });
    row.add(new TextRenderable(renderer, { content: key.padEnd(18), fg: t.primary }));
    row.add(new TextRenderable(renderer, { content: label, fg: t.text }));
    overlay.add(row);
  }
  return overlay;
}

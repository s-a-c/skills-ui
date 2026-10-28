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
  right.add(
    new TextRenderable(renderer, {
      content: `[${model.scope === "project" ? "p" : "g"}] ${model.scope}`,
      fg: t.textMuted,
    })
  );
  if (model.busy) {
    right.add(new TextRenderable(renderer, { content: `· ${model.busy}…`, fg: t.primary }));
  }
  header.add(tabs);
  header.add(right);
  return header;
}

export function buildInstalledBody(renderer: CliRenderer, model: TuiModel): BoxRenderable {
  const t = tokensFor(model.prefs.theme);
  const body = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexDirection: "row", gap: 1, paddingLeft: 1, paddingRight: 1 });

  // list pane (fixed 42% like the fork's split)
  const listPane = new BoxRenderable(renderer, {
    width: "42%",
    flexDirection: "column",
  });
  const visible = visibleSkills(model);
  const scroll = new ScrollBoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
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
    scroll.add(row);
  });
  listPane.add(scroll);
  if (model.filtering || model.filter) {
    listPane.add(
      new TextRenderable(renderer, {
        content: `filter: ${model.filter}${model.filtering ? "▌" : ""}`,
        fg: t.primary,
      })
    );
  }

  // detail pane (markdown)
  const detailPane = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: t.border,
    title: visible[model.selected] ? ` ${visible[model.selected]!.name} ` : " detail ",
  });
  const detailScroll = new ScrollBoxRenderable(renderer, { width: "100%", flexGrow: 1, scrollY: true });
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
    detailPane.add(
      new TextRenderable(renderer, {
        content: `${skill.agents.length} agent(s) · ${skill.scope} · ${skill.path}`,
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
  const body = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexDirection: "column", paddingLeft: 1, paddingRight: 1 });
  body.add(
    new TextRenderable(renderer, {
      content: `search: ${model.query || "type to search"}${model.query ? "▌" : ""}`,
      fg: t.primary,
    })
  );
  const scroll = new ScrollBoxRenderable(renderer, { width: "100%", flexGrow: 1, scrollY: true });
  if (model.results.length === 0) {
    scroll.add(new TextRenderable(renderer, { content: model.query ? "no results" : "search the skills.sh registry", fg: t.textMuted }));
  }
  model.results.forEach((r, i) => {
    const selected = i === model.searchSelected;
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
  body.add(scroll);
  body.add(
    new TextRenderable(renderer, {
      content: "space queue · enter install · u install all queued",
      fg: t.textMuted,
    })
  );
  return body;
}

export function buildSettingsBody(renderer: CliRenderer, model: TuiModel): BoxRenderable {
  const t = tokensFor(model.prefs.theme);
  const body = new BoxRenderable(renderer, { width: "100%", flexGrow: 1, flexDirection: "column", paddingLeft: 2, gap: 1 });
  body.add(new TextRenderable(renderer, { content: "Settings", fg: t.primary, attributes: TextAttributes.BOLD }));
  const motion = model.prefs.reduceMotion === "auto" ? "auto (explicit toggle is authoritative in terminals)" : String(model.prefs.reduceMotion);
  const rows: Array<[string, string]> = [
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
  const footer = new BoxRenderable(renderer, { width: "100%", flexDirection: "row", justifyContent: "space-between", paddingLeft: 1, paddingRight: 1 });
  const legend =
    model.tab === "installed" && (model.filtering || model.filter)
      ? "u update · d delete checked · HOME/END · SPACE toggle · ESC clear filter"
      : "i installed · / search · f filter · g|p scope · x settings · ? help · q quit";
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

export function buildHelpOverlay(renderer: CliRenderer, model: TuiModel): BoxRenderable | null {
  if (!model.help) return null;
  const t = tokensFor(model.prefs.theme);
  const overlay = new BoxRenderable(renderer, {
    position: "absolute",
    zIndex: 11,
    top: "20%",
    left: "25%",
    width: "50%",
    flexDirection: "column",
    gap: 1,
    padding: 1,
    border: true,
    borderStyle: "rounded",
    borderColor: t.border,
    backgroundColor: t.surface,
    title: " help ",
  });
  const keys: Array<[string, string]> = [
    ["i / x", "installed / settings tabs"],
    ["/", "search tab"],
    ["f", "filter installed"],
    ["s", "sort checked first"],
    ["A | I", "check all / invert"],
    ["g | p", "global / project scope"],
    ["space", "toggle check"],
    ["u / d", "update / delete checked"],
    ["PgUp/PgDn", "page up / down"],
    ["HOME/END", "top / bottom"],
    ["?", "this help"],
    ["q", "quit"],
  ];
  for (const [key, label] of keys) {
    const row = new BoxRenderable(renderer, { flexDirection: "row", gap: 2 });
    row.add(new TextRenderable(renderer, { content: key.padEnd(9), fg: t.primary }));
    row.add(new TextRenderable(renderer, { content: label, fg: t.text }));
    overlay.add(row);
  }
  return overlay;
}

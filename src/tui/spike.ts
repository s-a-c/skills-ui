import {
  BoxRenderable,
  MarkdownRenderable,
  SyntaxStyle,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
  type RenderContext,
  type ThemeTokenStyle,
} from "@opentui/core";

/**
 * Spike screen: title, a markdown panel (headings, list, code block — prose
 * and code both parse through the tree-sitter worker, the path that compiled
 * binaries break on without OTUI_TREE_SITTER_WORKER_PATH), and a quit hint.
 */
export const SPIKE_MARKDOWN = `# skills-ui spike

The **wrapper** for \`skills\` — this panel proves markdown rendering.

- subprocess contract: \`ls --json\`, \`add --json -y\`
- registry search: skills.sh \`/api/search\`
- theming: catppuccin latte | mocha

\`\`\`ts
const renderer = await createCliRenderer({ exitOnCtrlC: true });
renderer.root.add(buildSpikeScreen(renderer));
\`\`\`
`;

/** Catppuccin mocha hexes — the theme port lands in phase 1; spike subset. */
const MOCHA = {
  mauve: "#cba6f7",
  red: "#f38ba8",
  peach: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  sky: "#89dceb",
  blue: "#89b4fa",
  overlay1: "#7f849c",
  text: "#cdd6f4",
} as const;

/** Minimal TextMate-scope → catppuccin map; full set comes with the theme port. */
export function spikeSyntaxTokens(): ThemeTokenStyle[] {
  return [
    { scope: ["markup.heading"], style: { foreground: MOCHA.mauve, bold: true } },
    { scope: ["markup.italic", "emphasis"], style: { foreground: MOCHA.peach, italic: true } },
    { scope: ["markup.bold", "strong"], style: { foreground: MOCHA.red, bold: true } },
    { scope: ["markup.raw", "code"], style: { foreground: MOCHA.green } },
    { scope: ["markup.underline.link", "link"], style: { foreground: MOCHA.blue, underline: true } },
    { scope: ["keyword"], style: { foreground: MOCHA.mauve } },
    { scope: ["string"], style: { foreground: MOCHA.green } },
    { scope: ["constant.numeric", "number"], style: { foreground: MOCHA.peach } },
    { scope: ["entity.name.function", "function"], style: { foreground: MOCHA.sky } },
    { scope: ["punctuation"], style: { foreground: MOCHA.overlay1 } },
    { scope: ["source", "source.ts"], style: { foreground: MOCHA.text } },
  ];
}

export function buildSpikeScreen(renderer: CliRenderer | RenderContext): BoxRenderable {
  const ctx = renderer as RenderContext;
  const syntaxStyle = SyntaxStyle.fromTheme(spikeSyntaxTokens(), (renderer as CliRenderer).nativeScene);
  const panel = new BoxRenderable(ctx, {
    width: 64,
    padding: 1,
    flexDirection: "column",
    gap: 1,
    border: true,
    borderStyle: "rounded",
    title: " skills-ui 0.0.0 ",
    titleAlignment: "center",
  });
  panel.add(new TextRenderable(ctx, { content: "skills-ui — OpenTUI spike", fg: MOCHA.mauve, attributes: TextAttributes.BOLD }));
  panel.add(new MarkdownRenderable(ctx, { content: SPIKE_MARKDOWN, fg: MOCHA.text, syntaxStyle }));
  panel.add(new TextRenderable(ctx, { content: "q quit · ctrl+c quit", fg: "#a6adc8" }));
  return panel;
}

export async function runSpikeTui(): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error("skills-ui: no TTY — run with --selftest for the in-memory check");
    process.exitCode = 1;
    return;
  }
  const { createCliRenderer } = await import("@opentui/core");
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  renderer.root.add(buildSpikeScreen(renderer));
  const onKey = (key: { name: string }): void => {
    if (key.name === "q") renderer.destroy();
  };
  renderer.keyInput.on("keypress", onKey);
  renderer.once("destroy", () => renderer.keyInput.off("keypress", onKey));
}

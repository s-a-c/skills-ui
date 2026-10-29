/**
 * Ported from vercel-labs/skills `src/ui/theme.ts` (MIT) — catppuccin palettes,
 * WCAG contrast math, and semantic token resolution, unchanged. The wrapper's
 * additions start at `syntaxTokensFor` below.
 */
import type { ThemeName } from './prefs.ts';
export type { ThemeName };

/**
 * Catppuccin palette hex values. Sources of truth:
 * https://github.com/catppuccin/catppuccin (mocha + latte flavors).
 */
export interface CatppuccinPalette {
  base: string;
  mantle: string;
  crust: string;
  surface0: string;
  surface1: string;
  surface2: string;
  overlay0: string;
  overlay1: string;
  overlay2: string;
  text: string;
  subtext0: string;
  subtext1: string;
  rosewater: string;
  flamingo: string;
  pink: string;
  mauve: string;
  red: string;
  maroon: string;
  peach: string;
  yellow: string;
  green: string;
  teal: string;
  sky: string;
  sapphire: string;
  blue: string;
  lavender: string;
}

export const CATPPUCCIN_MOCHA: CatppuccinPalette = {
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  overlay0: '#6c7086',
  overlay1: '#7f849c',
  overlay2: '#9399b2',
  text: '#cdd6f4',
  subtext0: '#a6adc8',
  subtext1: '#bac2de',
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
};

export const CATPPUCCIN_LATTE: CatppuccinPalette = {
  base: '#eff1f5',
  mantle: '#e6e9ef',
  crust: '#dce0e8',
  surface0: '#ccd0da',
  surface1: '#bcc0cc',
  surface2: '#acb0be',
  overlay0: '#9ca0b0',
  overlay1: '#8c8fa1',
  overlay2: '#7c7f93',
  text: '#4c4f69',
  subtext0: '#6c6f85',
  subtext1: '#5c5f77',
  rosewater: '#dc8a78',
  flamingo: '#dd7878',
  pink: '#ea76cb',
  mauve: '#8839ef',
  red: '#d20f39',
  maroon: '#e64553',
  peach: '#fe640b',
  yellow: '#df8e1d',
  green: '#40a02b',
  teal: '#179299',
  sky: '#04a5e5',
  sapphire: '#209fb5',
  blue: '#1e66f5',
  lavender: '#7287fd',
};

export interface ThemeTokens {
  /** Main page background. */
  bg: string;
  /** Panels, cards, list rows. */
  surface: string;
  /** Alternating rows / wells inside a panel. */
  surfaceAlt: string;
  /** Border color, >= 3:1 against surface (WCAG non-text). */
  border: string;
  /** Primary reading text, >= 4.5:1 against bg, surface, and surfaceAlt. */
  text: string;
  /** Secondary text, >= 4.5:1 against bg, surface, and surfaceAlt. */
  textMuted: string;
  /** Primary accent (brand). */
  primary: string;
  /** Text color on accent fills, >= 4.5:1. */
  primaryText: string;
  danger: string;
  dangerText: string;
  success: string;
  successText: string;
  /** Selected row highlight, selectionText >= 4.5:1 on it. */
  selectionBg: string;
  selectionText: string;
  /** Focus indicator, >= 3:1 against bg (WCAG 2.4.7 / non-text). */
  focusRing: string;
}

// ---------- WCAG math ----------

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** WCAG contrast ratio between two hex colors, 1..21. */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Scales a color's channels toward black until it reaches `min` contrast on
 * `bg`. Used to derive WCAG-compliant status colors for latte, whose pastel
 * accents are too light for 4.5:1 text on its light backgrounds. Mocha colors
 * already pass and come back unchanged.
 */
export function darkenToContrast(hex: string, bg: string, min: number): string {
  let [r, g, b] = hexToRgb(hex);
  const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  let step = 1;
  while (contrastRatio(rgbToHex([r, g, b]), bg) < min && step < 64) {
    r *= 0.95;
    g *= 0.95;
    b *= 0.95;
    step++;
  }
  return rgbToHex([clamp255(r), clamp255(g), clamp255(b)]);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const part = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

// ---------- Token resolution ----------

/** WCAG AA minimum for normal text. */
export const AA_TEXT_RATIO = 4.5;
/** WCAG minimum for UI components / graphical objects (borders, focus rings). */
export const AA_UI_RATIO = 3;

/**
 * Builds the semantic token set for a theme. Status colors that fail AA on the
 * theme's surfaces (latte's pastels do) are darkened just enough to pass; the
 * palette keeps its catppuccin character.
 */
/**
 * Builds the semantic token set for a theme. Colors that fail AA on any of the
 * theme's reading surfaces (latte's pastels do) are darkened just enough to
 * pass; the palette keeps its catppuccin character. Mocha colors already pass
 * and come through unchanged.
 */
export function buildThemeTokens(palette: CatppuccinPalette, name: ThemeName): ThemeTokens {
  const light = name === 'latte';
  const bg = palette.base;
  const surface = palette.mantle;
  const surfaceAlt = palette.surface0;
  const onAccent = light ? palette.base : palette.crust;

  const darkenForSurfaces = (hex: string) => {
    const worst = Math.min(
      contrastRatio(hex, bg),
      contrastRatio(hex, surface),
      contrastRatio(hex, surfaceAlt)
    );
    return worst >= AA_TEXT_RATIO ? hex : darkenToContrast(hex, surfaceAlt, AA_TEXT_RATIO);
  };

  const tokens: ThemeTokens = {
    bg,
    surface,
    surfaceAlt,
    border: light ? palette.overlay2 : palette.overlay1,
    text: darkenForSurfaces(palette.text),
    textMuted: darkenForSurfaces(light ? palette.subtext1 : palette.subtext0),
    primary: palette.mauve,
    primaryText: onAccent,
    danger: darkenForSurfaces(palette.red),
    dangerText: onAccent,
    success: darkenForSurfaces(palette.green),
    successText: onAccent,
    selectionBg: palette.mauve,
    selectionText: onAccent,
    // Latte lavender is 2.7:1 on its light base — under the 3:1 non-text
    // minimum — so the lighter theme focuses with its darker primary accent.
    focusRing: light ? palette.mauve : palette.lavender,
  };
  return tokens;
}

export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  mocha: buildThemeTokens(CATPPUCCIN_MOCHA, 'mocha'),
  latte: buildThemeTokens(CATPPUCCIN_LATTE, 'latte'),
};

/** Semantic tokens for a theme — the accessor every view layer uses. */
export function tokensFor(theme: ThemeName): ThemeTokens {
  return THEME_TOKENS[theme];
}

// ---------- Terminal color output ----------

function supportsTruecolor(): boolean {
  const colorterm = process.env.COLORTERM ?? '';
  return /truecolor|24bit/i.test(colorterm);
}

const BASIC_COLORS: Record<string, number> = {
  '#1e1e2e': 0,
  '#11111b': 0,
  '#181825': 0,
  '#f38ba8': 9,
  '#d20f39': 1,
  '#a6e3a1': 10,
  '#40a02b': 2,
  '#f9e2af': 11,
  '#fab387': 3,
  '#cba6f7': 5,
  '#8839ef': 5,
  '#89b4fa': 4,
  '#1e66f5': 4,
  '#eff1f5': 7,
  '#cdd6f4': 7,
  '#4c4f69': 8,
  '#6c6f85': 8,
  '#a6adc8': 8,
};

function to256(hex: string): number {
  const known = BASIC_COLORS[hex.toLowerCase()];
  if (known !== undefined) return known;
  const [r, g, b] = hexToRgb(hex);
  // 6x6x6 xterm cube, nearest downsample
  const q = (c: number) => Math.round((c / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

export interface AnsiPainter {
  fg(hex: string): string;
  bg(hex: string): string;
  bold(text: string): string;
  reset(): string;
  readonly colorDepth: 'truecolor' | '256';
}

export function createAnsiPainter(
  colorDepth: 'truecolor' | '256' = supportsTruecolor() ? 'truecolor' : '256'
): AnsiPainter {
  const encode = (hex: string, isBg: boolean): string => {
    const [r, g, b] = hexToRgb(hex);
    if (colorDepth === 'truecolor') {
      return `\x1b[${isBg ? 48 : 38};2;${r};${g};${b}m`;
    }
    return `\x1b[${isBg ? 48 : 38};5;${to256(hex)}m`;
  };
  return {
    fg: (hex) => encode(hex, false),
    bg: (hex) => encode(hex, true),
    bold: (text) => `\x1b[1m${text}\x1b[0m`,
    reset: () => '\x1b[0m',
    colorDepth,
  };
}

// ---------- OpenTUI syntax styling (wrapper addition) ----------

export interface ScopeStyle {
  foreground?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
}

export interface ScopeTokenStyle {
  scope: string[];
  style: ScopeStyle;
}

/**
 * TextMate-scope → catppuccin map for OpenTUI's SyntaxStyle.fromTheme.
 * Follows the catppuccin textmate conventions, driven entirely by the
 * palette so latte/mocha stay in character. Prose-first: markdown markup
 * plus the common code scopes the detail view highlights.
 */
export function syntaxTokensFor(palette: CatppuccinPalette): ScopeTokenStyle[] {
  return [
    { scope: ["markup.heading"], style: { foreground: palette.mauve, bold: true } },
    { scope: ["markup.italic", "emphasis"], style: { foreground: palette.peach, italic: true } },
    { scope: ["markup.bold", "strong"], style: { foreground: palette.red, bold: true } },
    { scope: ["markup.raw", "code"], style: { foreground: palette.green } },
    { scope: ["markup.underline.link", "link"], style: { foreground: palette.blue, underline: true } },
    { scope: ["markup.list"], style: { foreground: palette.lavender } },
    { scope: ["markup.quote"], style: { foreground: palette.subtext0, italic: true } },
    { scope: ["keyword", "keyword.control"], style: { foreground: palette.mauve } },
    { scope: ["string", "string.quoted"], style: { foreground: palette.green } },
    { scope: ["constant.numeric", "number"], style: { foreground: palette.peach } },
    { scope: ["constant.language"], style: { foreground: palette.peach } },
    { scope: ["entity.name.function", "function"], style: { foreground: palette.sky } },
    { scope: ["entity.name.type", "type", "support.type"], style: { foreground: palette.yellow } },
    { scope: ["variable", "variable.other"], style: { foreground: palette.text } },
    { scope: ["variable.parameter"], style: { foreground: palette.maroon } },
    { scope: ["comment", "punctuation.definition.comment"], style: { foreground: palette.overlay0, italic: true } },
    { scope: ["punctuation"], style: { foreground: palette.overlay1 } },
    { scope: ["source"], style: { foreground: palette.text } },
  ];
}

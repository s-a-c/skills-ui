/**
 * Procedural art (S-100 B6) — the splash banner and search source badges
 * are generated as raw RGBA pixels (NativeImage.fromRgba), so the binary
 * ships no image assets and the visuals follow the catppuccin palettes.
 * Images are cached per key and live for the process lifetime; ownership
 * stays with the renderer's resource context.
 */
import { NativeImage } from "@opentui/core";
import { CATPPUCCIN_LATTE, CATPPUCCIN_MOCHA, hexToRgb, type CatppuccinPalette, type ThemeName } from "../core/theme.ts";

function paletteFor(theme: ThemeName): CatppuccinPalette {
  return theme === "latte" ? CATPPUCCIN_LATTE : CATPPUCCIN_MOCHA;
}

/** Mixes two hex colors; `t` 0..1 (no gamma math — banded terminal cells
 * forgive it, and both endpoints come from the same palette). */
function mix(a: string, b: string, t: number): [number, number, number] {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return [
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  ];
}

const splashCache = new Map<ThemeName, NativeImage>();

/** Splash banner: diagonal gradient through the theme's accent path with a
 * soft edge fade — the one branded surface of the app (96×28 px shown at
 * 44×12 cells). */
export function splashImage(theme: ThemeName): NativeImage {
  const cached = splashCache.get(theme);
  if (cached) return cached;
  const p = paletteFor(theme);
  const W = 96;
  const H = 28;
  const stops = [p.mauve, p.sapphire, p.teal];
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const grad = (x / (W - 1) + y / (H - 1)) / 2; // diagonal
      const seg = Math.min(stops.length - 2, Math.floor(grad * (stops.length - 1)));
      const [r, g, b] = mix(stops[seg]!, stops[seg + 1]!, grad * (stops.length - 1) - seg);
      const edge = Math.min(x, W - 1 - x) / (W / 6); // fade both side edges
      const alpha = Math.round(255 * Math.max(0.25, Math.min(1, edge)));
      const i = (y * W + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = alpha;
    }
  }
  const image = NativeImage.fromRgba(px, W, H);
  splashCache.set(theme, image);
  return image;
}

const ACCENTS = ["mauve", "pink", "blue", "sapphire", "teal", "green", "peach", "yellow"] as const;

function hash32(text: string): number {
  let h = 2166136261;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const badgeCache = new Map<string, NativeImage>();

/** Search source badge: a deterministic 2-color 4×2 px identicon — every
 * result from the same source gets the same mark, different sources get
 * different marks/colors. Shown at 2×1 cells. */
export function sourceBadge(source: string, theme: ThemeName): NativeImage {
  const key = `${theme}:${source}`;
  const cached = badgeCache.get(key);
  if (cached) return cached;
  const p = paletteFor(theme);
  const h = hash32(source);
  const colorA = p[ACCENTS[h % ACCENTS.length]!];
  const colorB = p[ACCENTS[(h >>> 3) % ACCENTS.length]!];
  const W = 4;
  const H = 2;
  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const on = (h >>> (i + 8)) & 1;
    const [r, g, b] = on === 1 ? hexToRgb(colorA) : hexToRgb(colorB);
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  const image = NativeImage.fromRgba(px, W, H);
  badgeCache.set(key, image);
  return image;
}

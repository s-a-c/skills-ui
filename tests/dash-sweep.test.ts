import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S-184 — dash-sweep gate: no en-dash (U+2013) or em-dash (U+2014) may appear
 * in a user-facing runtime string on the swept surfaces (web APP_JS; TUI
 * Views/app/model). Hallmark gate 19 bans them in copy unconditionally; S-168
 * swept the static copy, this file guards the runtime half. Extraction, not
 * site enumeration: a small lexer walks each file, skips comments and regex
 * literals, and collects every string literal ('…' / "…") and template-
 * literal text chunk; Views.tsx JSX text runs are scanned too. Comments are
 * exempt by construction (the swept files carry many em-dashed comments that
 * must stay). Anchored on content (the `const APP_JS = \`` template), never
 * line numbers.
 */

const HERE = import.meta.dir;
const ROOT = join(HERE, "..");
const DASH = /[\u2013\u2014]/;
/** Review hardening (S-184 round): a dash can also hide behind JS escapes or
 * HTML entities — both render as en/em dashes in the UI. All three forms are
 * absent from the tree today; the check flags them so they stay absent. */
const DASH_EVASION = /\\u201[34]|&mdash;|&ndash;|&#821[23]|&#x201[34]/i;

type Hit = { file: string; kind: "string" | "template" | "jsx"; text: string };

/** Regex-vs-division: a `/` opens a regex unless the previous significant
 *  character closes an expression (identifier, number, quote, `)`/`]`). */
function opensRegex(prevSig: string): boolean {
  if (prevSig === "") return true;
  return !/[\w$)\]"'`]/.test(prevSig);
}

/**
 * Single-pass lexer for the JS/TS subset this repo ships. Returns every
 * string/template literal found (comment- and regex-safe: `/[&<>"']/g` must
 * not flip string state) plus the source with comments, string contents and
 * regex bodies blanked to spaces (layout preserved) for JSX-text scanning.
 * Template-literal `${…}` interpolations are lexed as code, recursively.
 */
function lex(src: string): { literals: { kind: Hit["kind"]; text: string }[]; blanked: string } {
  const literals: { kind: Hit["kind"]; text: string }[] = [];
  const buf = src.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (buf[k] !== "\n") buf[k] = " ";
  };
  const prevSig = (): string => {
    for (let k = i - 1; k >= 0; k--) {
      if (!/\s/.test(src[k]!)) return src[k]!;
    }
    return "";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1] ?? "";
    if (c === "/" && n === "/") {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      blank(start, i);
    } else if (c === "/" && n === "*") {
      const start = i;
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(src.length, i + 2);
      blank(start, i);
    } else if (c === "'" || c === '"') {
      const start = i;
      const quote = c;
      i++;
      let text = "";
      while (i < src.length && src[i] !== quote && src[i] !== "\n") {
        if (src[i] === "\\") {
          text += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        text += src[i]!;
        i++;
      }
      i = Math.min(src.length, i + 1); // closing quote
      blank(start, i);
      literals.push({ kind: "string", text });
    } else if (c === "`") {
      const start = i;
      i++;
      let text = "";
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") {
          text += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          const exprStart = i + 2;
          let depth = 1;
          i += 2;
          while (i < src.length && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            if (depth > 0) i++;
          }
          const inner = lex(src.slice(exprStart, i));
          literals.push(...inner.literals);
          blank(exprStart, i);
          i++; // closing }
          continue;
        }
        text += src[i]!;
        i++;
      }
      i = Math.min(src.length, i + 1); // closing backtick
      blank(start, i);
      literals.push({ kind: "template", text });
    } else if (c === "/" && opensRegex(prevSig())) {
      const start = i;
      i++;
      while (i < src.length && src[i] !== "/" && src[i] !== "\n") {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        i++;
      }
      i = Math.min(src.length, i + 1); // closing /
      while (i < src.length && /[a-z]/i.test(src[i]!)) i++; // flags
      blank(start, i);
    } else {
      i++;
    }
  }
  return { literals, blanked: buf.join("") };
}

/** The APP_JS template body, found by its content anchor (never line numbers). */
function appJsBody(pageTs: string): string {
  const anchor = "const APP_JS = `";
  const at = pageTs.indexOf(anchor);
  if (at < 0) throw new Error("APP_JS anchor not found in src/web/page.ts");
  const start = at + anchor.length;
  let i = start;
  while (i < pageTs.length && pageTs[i] !== "`") {
    if (pageTs[i] === "\\") {
      i += 2;
      continue;
    }
    i++;
  }
  return pageTs.slice(start, i);
}

/** JSX text runs in blanked .tsx source: anything between `>` and `<`. */
function jsxTextRuns(blanked: string): string[] {
  const runs: string[] = [];
  for (const m of blanked.matchAll(/>([^<>]*)</g)) runs.push(m[1]!);
  return runs;
}

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const pageTs = read("src/web/page.ts");
const views = read("src/tui/Views.tsx");
const app = read("src/tui/app.ts");
const model = read("src/tui/model.ts");

function dashHits(file: string, candidates: { kind: Hit["kind"]; text: string }[]): Hit[] {
  const hits: Hit[] = [];
  for (const c of candidates) {
    if (DASH.test(c.text) || DASH_EVASION.test(c.text)) hits.push({ file, kind: c.kind, text: c.text });
  }
  return hits;
}

describe("S-184: dash sweep — no en/em dash in user-facing runtime strings", () => {
  test("web APP_JS: no string literal carries an en/em dash", () => {
    const { literals } = lex(appJsBody(pageTs));
    expect(dashHits("src/web/page.ts APP_JS", literals)).toEqual([]);
  });

  test("TUI Views.tsx: no string literal or JSX text carries an en/em dash", () => {
    const { literals, blanked } = lex(views);
    const hits = dashHits("src/tui/Views.tsx", literals);
    for (const run of jsxTextRuns(blanked)) {
      if (DASH.test(run) || DASH_EVASION.test(run)) hits.push({ file: "src/tui/Views.tsx", kind: "jsx", text: run });
    }
    expect(hits).toEqual([]);
  });

  test("TUI app.ts and model.ts: no string literal carries an en/em dash", () => {
    const appLex = lex(app);
    const modelLex = lex(model);
    expect([...dashHits("src/tui/app.ts", appLex.literals), ...dashHits("src/tui/model.ts", modelLex.literals)]).toEqual([]);
  });

  test("the extractor reaches the runtime copy (guard against a vacuous pass)", () => {
    const appJs = lex(appJsBody(pageTs)).literals.map((l) => l.text);
    const viewsLiterals = lex(views).literals.map((l) => l.text);
    const appLiterals = lex(app).literals.map((l) => l.text);
    const modelLiterals = lex(model).literals.map((l) => l.text);
    // the swept search-empty-state copy must be present in both surfaces
    expect(appJs.some((t) => t.includes("skills.sh unreachable"))).toBe(true);
    expect(viewsLiterals.some((t) => t.includes("skills.sh unreachable"))).toBe(true);
    // and the sweep reached the far corners of each file
    expect(appLiterals.some((t) => t.includes("selftest for the in-memory check"))).toBe(true);
    expect(modelLiterals.length).toBeGreaterThan(0);
    // JSX text scanning really runs (ratified legend copy, via terminology G2)
    expect(jsxTextRuns(lex(views).blanked).some((t) => t.includes("esc cancel"))).toBe(true);
  });
});

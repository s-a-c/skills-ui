import { describe, expect, test } from "bun:test";
import { renderPage } from "../src/web/page.ts";

/**
 * S-165: the web markdown detail renderer (zero-dep, escape-first).
 *
 * Every proof below runs against the REAL emitted page bytes: renderPage()
 * → the APP_JS <script> block → slice renderMarkdown plus its esc()
 * dependency from that exact text → evaluate with new Function → run the
 * fixtures through the shipped code. A copy of the renderer in this file
 * would prove nothing about what actually ships.
 */

const SCRIPT_BLOCK_RE = /<script>([\s\S]*?)<\/script>/g;

function emittedAppJs(): string {
  const html = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });
  const blocks = [...html.matchAll(SCRIPT_BLOCK_RE)].map((m) => m[1] ?? "");
  return blocks[1] ?? "";
}

/** Slice the shipped esc() + renderMarkdown() out of the emitted script and
 *  evaluate them together — the test exercises the exact shipped bytes, not
 *  a re-typed copy. Anchors are the two stable function signatures plus the
 *  Hosted-mode comment that has followed esc() since 0.5.1 impl B. */
function loadRenderer(): (md: string) => string {
  const js = emittedAppJs();
  const escStart = js.indexOf("function esc(s){");
  const escEnd = js.indexOf("/* Hosted mode");
  const mdStart = js.indexOf("function renderMarkdown(md){");
  const mdEnd = js.indexOf("function showDetail(name){");
  expect(escStart).toBeGreaterThan(-1);
  expect(escEnd).toBeGreaterThan(escStart);
  expect(mdStart).toBeGreaterThan(-1);
  expect(mdEnd).toBeGreaterThan(mdStart);
  const src =
    js.slice(escStart, escEnd) + "\n" + js.slice(mdStart, mdEnd) + "\nreturn renderMarkdown;";
  const fn = new Function(src)();
  expect(typeof fn).toBe("function");
  return fn as (md: string) => string;
}

const md = loadRenderer();

describe("markdown renderer (S-165): shipped-bytes invariants", () => {
  test("renderMarkdown lives inside the emitted APP_JS and showDetail renders through it", () => {
    const js = emittedAppJs();
    expect(js).toContain("function renderMarkdown(md){");
    // the integration point: innerHTML of the rendered output, with the
    // honest empty-body fallback carried through the renderer
    expect(js).toContain("renderMarkdown(d.body || '(empty SKILL.md)')");
    expect(js).toContain("renderMarkdown('(SKILL.md unavailable)')");
    expect(js).not.toContain("$('#readme').textContent = d.body");
  });

  test("the emitted APP_JS contains zero raw backtick characters", () => {
    // rule: renderMarkdown lives inside a template literal in page.ts, so
    // every backtick must be a \u0060 escape — a raw one would terminate the
    // template. Asserting it on the shipped bytes keeps the invariant visible.
    expect(emittedAppJs()).not.toContain("`");
  });
});

describe("markdown renderer (S-165): corpus subset structure", () => {
  const corpus = [
    "# Usage",
    "",
    "Run with **care** and *attention*, see `skills-ui serve`.",
    "",
    "- item one",
    "- item two",
    "",
    "1. first",
    "2. second",
    "",
    "> quoted wisdom",
    "",
    "```ts",
    "const x = 1;",
    "```",
    "",
    "| name | value |",
    "| ---- | ----- |",
    "| a    | b     |",
    "",
    "---",
  ].join("\n");
  const out = md(corpus);

  test("ATX headings map to h2..h5 under the pane's skill-name h1", () => {
    expect(out).toContain('<h2 class="md-h md-h2">Usage</h2>');
    const deeper = md("## two\n\n### three\n\n#### four");
    expect(deeper).toContain('<h3 class="md-h md-h3">two</h3>');
    expect(deeper).toContain('<h4 class="md-h md-h4">three</h4>');
    expect(deeper).toContain('<h5 class="md-h md-h5">four</h5>');
    // five #s is past the subset cap — plain paragraph text
    expect(md("##### five")).toContain('<p class="md-p">##### five</p>');
  });

  test("inline code, bold, italic render as renderer-tagged spans of escaped text", () => {
    expect(out).toContain('<code class="md-code">skills-ui serve</code>');
    expect(out).toContain('<strong class="md-strong">care</strong>');
    expect(out).toContain('<em class="md-em">attention</em>');
  });

  test("flat unordered and ordered lists keep their element types", () => {
    expect(out).toContain('<ul class="md-list"><li class="md-li">item one</li><li class="md-li">item two</li></ul>');
    expect(out).toContain('<ol class="md-list"><li class="md-li">first</li><li class="md-li">second</li></ol>');
    // lazy continuation folds a plain follow-on line into the open item
    expect(md("- a\n  continued\n- b")).toContain("<li class=\"md-li\">a continued</li>");
  });

  test("fenced code blocks escape their content and echo the info string as a label", () => {
    expect(out).toContain('<span class="md-lang">ts</span>');
    expect(out).toContain('<code class="md-codeblock">const x = 1;</code>');
    expect(out).toContain("<pre class=\"md-pre\">");
  });

  test("blockquotes, horizontal rules, and paragraphs render", () => {
    expect(out).toContain('<blockquote class="md-quote">quoted wisdom</blockquote>');
    expect(out).toContain('<hr class="md-hr">');
    expect(out).toContain('<p class="md-p">');
  });

  test("tables render header and body rows (separator row skipped)", () => {
    expect(out).toContain("<th>name</th><th>value</th>");
    expect(out).toContain("<td>a</td><td>b</td>");
    expect(out).not.toContain("<td>----");
  });

  test("empty input renders empty; fallback strings render as plain paragraphs", () => {
    expect(md("")).toBe("");
    expect(md("(empty SKILL.md)")).toBe('<p class="md-p">(empty SKILL.md)</p>');
  });
});

describe("markdown renderer (S-165): links never navigate", () => {
  test("a benign link emits styled text plus the visible URL — no href anywhere", () => {
    const out = md("See the [docs](https://example.com/guide?a=1&b=2).");
    expect(out).toContain('<span class="md-link">docs</span>');
    expect(out).toContain("<span class=\"md-link-url\"> (https://example.com/guide?a=1&amp;b=2)</span>");
    expect(out).not.toContain("href");
    expect(out).not.toMatch(/<a[\s>]/);
  });

  test("link text still inlines bold/italic (recursion is renderer-only tags)", () => {
    const out = md("[**hot** key](https://e.com)");
    expect(out).toContain('<span class="md-link"><strong class="md-strong">hot</strong> key</span>');
    expect(out).not.toContain("href");
  });
});

describe("markdown renderer (S-165): hostile fixture — the sink-side proof", () => {
  // Every ingress is already scrubbed core-side (S-159 sanitize suite); this
  // fixture proves the SINK independently: even raw hostile markdown text
  // that reached the page byte-for-byte could not form a tag, attribute, or
  // navigation out of renderMarkdown's output.
  const hostile = [
    "<script>alert(1)</script>",
    "",
    "<img src=x onerror=alert(1)>",
    "",
    "[x](javascript:alert(1))",
    "",
    "[y](data:text/html;base64,PHNjcmlwdD4=)",
    "",
    "```",
    "</pre><script>alert(2)</script>",
    "```",
    "",
    "# \" onmouseover=\"alert(3)",
    "",
    "plain <b>bold</b> and <i>italic</i> text",
  ].join("\n");
  const out = md(hostile);

  test("no script, img, or anchor tag can form — and no href is ever emitted", () => {
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<a[\s>]/i);
    expect(out).not.toContain("href");
    expect(out).not.toContain('" onmouseover=');
  });

  test("every hostile payload is visible as inert escaped text", () => {
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // the scheme-bearing URLs render as text inside the link-url span
    expect(out).toContain('<span class="md-link-url"> (javascript:alert(1)');
    expect(out).toContain("(data:text/html;base64,PHNjcmlwdD4=)");
    // attribute injection through a heading is defused at the quote
    expect(out).toContain('&quot; onmouseover=&quot;alert(3)');
    // raw HTML in a paragraph stays text
    expect(out).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  test("a fence containing a pre/script breakout is escaped inside md-codeblock", () => {
    expect(out).toContain('<code class="md-codeblock">&lt;/pre&gt;&lt;script&gt;alert(2)&lt;/script&gt;</code>');
    // the only </pre> in the output is the renderer's own closing tag for
    // md-pre (one fence in, one </pre> out); no payload-kind closing tag
    // (script/img/...) exists anywhere
    expect(out.match(/<\/pre>/g) ?? []).toHaveLength(1);
    expect(out).toContain("</code></pre>");
    expect(out).not.toMatch(/<\/(script|img|iframe|object|embed|svg|math)\b/i);
  });

  test("every tag in the output is renderer-made — payload text never lands inside a tag", () => {
    const tags = out.match(/<[^>]+>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      // whitelisted element, at most a renderer class attribute
      expect(tag).toMatch(
        /^<\/?(p|h[2-5]|ul|ol|li|blockquote|pre|code|span|table|thead|tbody|tr|th|td|hr|strong|em)(\s+class="(md-[\w-]+(?: md-[\w-]+)?)"?)?>$/
      );
      expect(tag).not.toMatch(/javascript:|data:|alert|onerror|onmouseover/);
    }
  });
});

describe("markdown renderer (S-165): determinism", () => {
  test("renderPage twice is byte-identical (export stays byte-stable with the renderer inlined)", () => {
    const a = renderPage("0.0.0-test", undefined, 9999, undefined, { hosted: true });
    const b = renderPage("0.0.0-test", undefined, 9999, undefined, { hosted: true });
    expect(a).toBe(b);
  });
});

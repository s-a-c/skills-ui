# Gates: S-165 — 0.5.2 impl E, web markdown detail view (zero-dep renderer, escape-first)

OWNS: src/web/page.ts, tests/markdown-render.test.ts (new), tests/e2e/hosted.e2e.ts, docs/app.html (artifact)

Scope: S-152 item 9 / matrix G7 — the web detail pane renders SKILL.md as markdown (headings, flat lists, fences, inline code, bold/italic, non-navigating links, blockquotes, hr, GFM tables) through a 136-LOC zero-dep renderer inside APP_JS, escape-first through esc() at every branch; the sink-side hostile-input proof joins the S-159 ingress suite.

- [x] G1: full suite green on phase/ux052 (132 + 16 markdown tests)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test 2>&1 | grep -q "^ 0 fail" && echo G1-OK
  EXPECT: G1-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=986486af3abf561fddc558c60474a9712a50a64e80e273f3151ea4c5cf9cca09; exit=0; EXPECT=matched; output-sha256=19632071a036d8e39fcea5793b668811e792a46f3b88ffab32a8b37d64963f3c; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G2: e2e green — 16 prior + 2 markdown cases (structure renders, hostile SKILL.md inert with zero pageerrors)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bunx playwright test 2>&1 | grep -q " 18 passed" && echo G2-OK
  EXPECT: G2-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=8627d2749e53dad65a5227a359f2f2b4151138926f8519a1195b19d438fc97a2; exit=0; EXPECT=matched; output-sha256=93890fd4c80f3df391be82be697d08d9ab7694e662e180c61c319e9d3b574fb7; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G3: the sink-side hostile proof — the markdown suite runs the REAL emitted renderer (source-extraction + new Function) and asserts inert output for every hostile payload class
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun test tests/markdown-render.test.ts 2>&1 | grep -q "^ 0 fail" && echo G3-OK
  EXPECT: G3-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=db4c20818edacfd5ce2d38b0ec7414a0071c9056019661f4337b01045d2edccb; exit=0; EXPECT=matched; output-sha256=a9eb3bc2e899bd52e566183b7004d6a5cd180f090d4eba5d8e54076e77033f5e; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

- [x] G4: template-literal integrity — no raw backtick anywhere in the emitted APP_JS (fence chars travel as u0060 escapes)
  CHECK: PATH="$HOME/.bun/bin:$PATH" bun run export:page >/dev/null 2>&1 && ! grep -q '\x60' docs/app.html 2>/dev/null; node -e "const fs=require('fs');const h=fs.readFileSync('docs/app.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g)||[];const bad=m.some(b=>b.includes(String.fromCharCode(96)));process.exit(bad?1:0)" && echo G4-OK
  EXPECT: G4-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=54cb746fc933f74c2a7e5330c8ba7800f5423f74b02087023714383f47918ee4; exit=0; EXPECT=matched; output-sha256=c06dfdf569316f388706dba0652fac318a21b267f17a26932ff2594832f008ce; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui/ux052; path=b4c10f371094/9 entries

## Notes

- Review: code-review-and-quality five axes APPROVE, zero Critical/Required, after a 53-case bypass hunt (title syntax, image syntax, unclosed fences, nested brackets, entity smuggling, CRLF/lone-CR, 100 KB lines, table-separator abuse, info-string injection) — every branch escapes first; tag whitelist audit over all outputs shows only renderer-static tags with class-only attributes.
- Reviewer mutation: removing the fence-content esc() fails 3 hostile tests; restored byte-identical.
- Optional #1 folded in by the orchestrator with a correction: the reviewer's `indexOf(']') === -1` early-return skips code/bold/em on bracket-less lines; the shipped guard gates ONLY the link alternative (`canLink = s.indexOf('](') >= 0` picks between two precompiled regexes), so the O(n²) unmatched-`[` scan is gone without changing inline semantics. (Two intermediate broken states during that edit — a stray replace() argument and a backslash-escaping slip — were caught by the suite/node --check and fixed before commit; final state green.)
- Optional #2 recorded, not fixed: md-strong/md-em classes emitted unstyled (browser defaults for strong/em are acceptable typography; S-168 may style them).
- Subset: nesting = flat (corpus is flat, stated); italic via * only (snake_case safety); links NEVER carry href (no-navigation CSP posture — rel attrs moot, noted in code); heading #..#### maps to h2..h5 (the detail title stays the h1).
- Determinism: two export runs byte-identical (cmp); the extraction harness anchors fail loudly (missing anchor / truncated slice both throw).

# Gates: skills-ui project bootstrap

Scope: Linear planning plane created, env vars renamed to SKILLS_UI_*, agent contracts written and committed

- [x] G0: this ledger states outcomes that can fail
  CHECK: node /Users/s-a-c/.agents/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=cd22131c7d2757032febd806bdeaf517c309470d8c8962498f9cd6866beb7011; exit=0; EXPECT=matched; output-sha256=7b1bdcf4069943c35c16cd0e4711984b38fa5e73cf15280caadefc49205318d0; output-bytes=150; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G1: no unprefixed SKILLS_BIN or SKILLS_API_URL remains under main/
  CHECK: sh -c 'n=$(grep -rnE "SKILLS_BIN|SKILLS_API_URL" main --include="*.ts" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist | grep -c SKILLS_UI_ || true); b=$(grep -rnE "SKILLS_BIN|SKILLS_API_URL" main --include="*.ts" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist | grep -cv SKILLS_UI_ || true); echo "prefixed:$n unprefixed:$b"; test "$n" -ge 3 && test "$b" -eq 0 && echo rename-clean'
  EXPECT: rename-clean
  EVIDENCE: automatic-evidence=v1; definition-sha256=c2d9eda1fa9f1c15bbdcde15e61f6272c707184e7b7475e7e5d5fda20e606ca7; exit=0; EXPECT=matched; output-sha256=7453ac12fa5cdf140f07d29ae600c28f6402d8e9d1ea9c896b9d3d6d5cbcd6df; output-bytes=38; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G2: the full test suite passes in main/ after the rename
  CHECK: sh -c 'cd main && bun test 2>&1 | tail -4'
  EXPECT: 0 fail
  EVIDENCE: automatic-evidence=v1; definition-sha256=93c0e703049d177a5adb1ea115185f51a9ec9771cc9cac29f0a5c9da08d4baf9; exit=0; EXPECT=matched; output-sha256=b2d75b781145fff4c9a7c14337ad9e26a6ffc1b5f2016fdde426b423f2ad18d0; output-bytes=74; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G3: the workspace-root AGENTS.md references the global instructions and the Linear project
  CHECK: sh -c 'grep -q "config/agents/AGENTS.md" AGENTS.md && grep -q "linear.app/s-a-c/project/skills-ui" AGENTS.md && echo root-agentsmd-refs-present'
  EXPECT: root-agentsmd-refs-present
  EVIDENCE: automatic-evidence=v1; definition-sha256=00af68fbc00235d1dfb92616e4a5fdb8569ad15a54d59030418af08947bcdd0a; exit=0; EXPECT=matched; output-sha256=326ee06a231252a6a72a53e42976d689b623aea4cc615c15395632db9ac2d941; output-bytes=27; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G4: AGENTS.md is tracked on the main branch tip in the main/ worktree
  CHECK: sh -c 'test "$(git -C main ls-tree --name-only HEAD -- AGENTS.md)" = "AGENTS.md" && echo agentsmd-tracked-on-main'
  EXPECT: agentsmd-tracked-on-main
  EVIDENCE: automatic-evidence=v1; definition-sha256=132bce2c87eda1472c7fc311369b7ba87f71729a1d7abb9019abe2316d5dc15d; exit=0; EXPECT=matched; output-sha256=5045ebb566ed3b9f3faff1b6274e63f62afb549cb49983998155f4c5483dbc9a; output-bytes=25; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G5: the repo AGENTS.md states the env var convention and the wayfinder workflow
  CHECK: sh -c 'grep -q "SKILLS_UI_SKILLS_BIN" main/AGENTS.md && grep -q "wayfinder:map" main/AGENTS.md && echo repo-agentsmd-complete'
  EXPECT: repo-agentsmd-complete
  EVIDENCE: automatic-evidence=v1; definition-sha256=4453dc5ba3d57cab81ce925dbe27ded2c350ba62f5d1649430f4ae16de45307e; exit=0; EXPECT=matched; output-sha256=9490484e3efe0bc222d87a3c1493c9381e7767140d8c051ca08d24739ae71755; output-bytes=23; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G6: the Linear planning plane holds the bootstrap artifacts
  EVIDENCE: verified 2026-10-28 via Linear MCP: project skills-ui (P-S-4) In Progress with 5 milestones (0.1.x–0.5.x) and 3 documents (Vision & Goals, Roadmap, Conventions & Integration); wayfinder map S-57 carries child tickets S-61, S-62, S-63 with S-63 blocked by S-61+S-62; seed issues S-58, S-59, S-60 open in Backlog.

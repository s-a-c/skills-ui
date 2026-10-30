# Gates: 0.2.x milestone delivery (S-69–S-75)

Scope: seven build issues implemented, merged to main, version 0.2.0, binary built, roadmaps updated

- [x] G0: this ledger states outcomes that can fail
  CHECK: node /Users/s-a-c/.agents/skills/unlazy/scripts/gate-lint.mjs GATES-0.2.x.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=1f8ea615b5f0565cee231331349d4327bd85e7646fb17c86fca53018f21f8ab1; exit=0; EXPECT=matched; output-sha256=82020476e1b3890996fe965b5a4dbb6b9f69858d3e23accb63dbd10e5c9740de; output-bytes=357; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G1: the full test suite passes on main
  CHECK: sh -c 'cd main && bun test 2>&1 | tail -4'
  EXPECT: 0 fail
  EVIDENCE: automatic-evidence=v1; definition-sha256=93c0e703049d177a5adb1ea115185f51a9ec9771cc9cac29f0a5c9da08d4baf9; exit=0; EXPECT=matched; output-sha256=76965519034677d4fe3f341d7310bd8ec1ef56f59baad3873c1a713023ba3a2b; output-bytes=74; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G2: the current binary exists, is executable, and passes its own selftest
  CHECK: sh -c 'test -x main/dist/skills-ui-0.4.0-darwin-arm64 && main/dist/skills-ui-0.4.0-darwin-arm64 --selftest'
  EXPECT: SELFTEST PASS
  EVIDENCE: automatic-evidence=v1; definition-sha256=49f01790a1d8bc9b08fd7aa673416799ebdc6fcad994c9c1fca3c5dd3fcd8ccf; exit=0; EXPECT=matched; output-sha256=95cef9c89716e2baf8ad2d7f747d82463deb41b4204d54609d28d011f8269dfe; output-bytes=54; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=8f49f3ac95ce/10 entries

- [x] G3: main carries the current package version and the merged 0.2.x + 0.4.x work
  CHECK: sh -c 'grep -q "\"version\": \"0.4.0\"" main/package.json && git -C main log --oneline -50 | grep -q "S-69" && git -C main log --oneline -10 | grep -q "S-110" && echo version-and-merges-present'
  EXPECT: version-and-merges-present
  EVIDENCE: automatic-evidence=v1; definition-sha256=1353b2de53734637018081a39a25013c2ac3f9891260999b53f945e35a6e314a; exit=0; EXPECT=matched; output-sha256=36f1065bddf4e588d2597da0110ef253b694b0afea48881e06bd7b1cb6f30b55; output-bytes=27; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=8f49f3ac95ce/10 entries

- [x] G4: the roadmap records 0.2.x as done on the repo side
  CHECK: sh -c 'grep -q "S-69–S-75 shipped" main/ROADMAP.md && grep -q "done" main/ROADMAP.md && echo roadmap-done-recorded'
  EXPECT: roadmap-done-recorded
  EVIDENCE: automatic-evidence=v1; definition-sha256=837ec45fd388d9ec65e055c40dab6b472f1decdf5772c56b4aa871305728b161; exit=0; EXPECT=matched; output-sha256=2abe4643f7dbb9b160ec2212ac181ec2b03c017bb58c09d00d3f66b8245d41ed; output-bytes=22; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=ce8587e6215c/40 entries

- [x] G5: Linear records the delivery — S-69–S-75 Done, 0.2.x milestone 100%, Roadmap document and project description updated
  EVIDENCE: verified 2026-10-28 via Linear MCP: get_project shows milestone 0.2.x — OpenTUI TUI parity at progress 100% (issues S-69..S-75 all status Done, each with an implementation comment); Roadmap document 0.2.x row patched to "done — S-69–S-75 shipped on main, 50 tests green, binary skills-ui-0.2.0-darwin-arm64"; project description names 0.3.x as the active milestone with 0.2.x shipped.

0.4.x packaging-matrix gates (S-111): G6–G10 run against `packaging/dist`, the full four-target artifact set rebuilt by `bun run build --all` there. G8/G9 execute linux binaries via docker and need colima up.

- [x] G6: target darwin-arm64 (matrix build) is executable and passes selftest
  CHECK: sh -c 'test -x packaging/dist/skills-ui-0.4.0-darwin-arm64 && packaging/dist/skills-ui-0.4.0-darwin-arm64 --selftest'
  EXPECT: SELFTEST PASS
  EVIDENCE: automatic-evidence=v1; definition-sha256=39ed217f31607d0e0e77b1dab7914f02f1fe74565f277b9423785f3bbf1d7a38; exit=0; EXPECT=matched; output-sha256=95cef9c89716e2baf8ad2d7f747d82463deb41b4204d54609d28d011f8269dfe; output-bytes=54; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=8f49f3ac95ce/10 entries

- [x] G7: target darwin-x64 passes selftest under Rosetta
  CHECK: sh -c 'packaging/dist/skills-ui-0.4.0-darwin-x64 --selftest'
  EXPECT: SELFTEST PASS
  EVIDENCE: automatic-evidence=v1; definition-sha256=dd0d380031d7732179c4353411c301306981641039b189c82092378828fc6fa3; exit=0; EXPECT=matched; output-sha256=95cef9c89716e2baf8ad2d7f747d82463deb41b4204d54609d28d011f8269dfe; output-bytes=54; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=8f49f3ac95ce/10 entries

- [x] G8: target linux-arm64 passes selftest in docker (colima required)
  CHECK: sh -c 'docker run --rm --platform linux/arm64 -v "$PWD/packaging/dist:/d:ro" debian:bookworm-slim /d/skills-ui-0.4.0-linux-arm64 --selftest'
  EXPECT: SELFTEST PASS
  EVIDENCE: automatic-evidence=v1; definition-sha256=49c2a2bef4839f26fd3e5885d65b4d831805662f7cf90f068619fc0d11a0d123; exit=0; EXPECT=matched; output-sha256=95cef9c89716e2baf8ad2d7f747d82463deb41b4204d54609d28d011f8269dfe; output-bytes=54; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=8f49f3ac95ce/10 entries

- [x] G9: target linux-x64 boots under qemu and carries the stamped version (selftest frame is a known qemu false red — A1 finding)
  CHECK: sh -c 'docker run --rm --platform linux/amd64 -v "$PWD/packaging/dist:/d:ro" debian:bookworm-slim /d/skills-ui-0.4.0-linux-x64 --version'
  EXPECT: 0.4.0
  EVIDENCE: automatic-evidence=v1; definition-sha256=2efc14d2e9a9cf46099e90cab2015b00f121922c0f4a5f068b7ebb9a80618648; exit=0; EXPECT=matched; output-sha256=40b8eb4000a913a7791090535f291d3d369874162a89ef3c9e3d4e887a1b9e79; output-bytes=6; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=8f49f3ac95ce/10 entries

- [x] G10: the checksum manifest matches the artifacts on disk
  CHECK: sh -c 'cd packaging/dist && shasum -a 256 -c checksums-0.4.0.txt 2>/dev/null | grep -c ": OK"'
  EXPECT: 4
  EVIDENCE: automatic-evidence=v1; definition-sha256=107694b0d72b9c8b52d6052334cc5b1f0170d092446482528bd8623c58047098; exit=0; EXPECT=matched; output-sha256=7de1555df0c2700329e815b93b32c571c3ea54dc967b89e81ab73b9972b72d1d; output-bytes=2; shell=/bin/sh; cwd=/Users/s-a-c/Projects/s-a-c/skills-ui; path=8f49f3ac95ce/10 entries

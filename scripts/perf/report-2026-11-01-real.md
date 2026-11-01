# skills-ui performance budget report

- generated: 2026-11-01T15:48:12.226Z
- scenario: real (S-177 harness; budgets ratified in S-155)
- corpus: real skills CLI on this machine — 1 project + 300 global skills, 301 SKILL.md files, 5 agent dirs
- NEVER RUN IN CI — numbers are specific to this machine and this corpus
- reps: 5 per API-timed wall-clock row (median reported); filter-render row: 1 sample x 7 needles (median across needles); filter matching row: 5 full-corpus passes x 8 needles (median across all passes)
- app under test: skills-ui 0.5.2 — serve API + served page
- NOTE: BUDGET-MISS rows on current main are the recorded baseline — the fixes several rows measure land in later tickets (S-155 sequencing).

| hot path | budget | measured | verdict |
|---|---|---|---|
| cold project list — GET /api/skills, first call on a fresh serve | ≤ 500 ms | 181.9 ms | MET |
| warm list — repeated GET /api/skills?scope=project on a live serve | ≤ 100 ms | 0.1 ms | MET |
| detail read — GET /api/skill (name+path, exact-path resolution) for gate-demo on a live serve | ≤ 100 ms | 0.2 ms | MET |
| search wrapper overhead over registry RTT (GET /api/search vs direct stub call) | ≤ 50 ms | 0.9 ms | MET |
| in-flight identical upstream search requests (3 concurrent GET /api/search?q=stub) | ≤ 1 | 1 concurrent (of 11 upstream calls) | MET |
| cold global perceived first paint — scope switch on a fresh serve, median of fresh-serve reps | ≤ 300 ms | 62471.2 ms | BUDGET-MISS |
| filter matching alone — skillMatches over 1 entries, per needle pass, median | ≤ 5 ms | 0.0 ms | MET |
| filter render work per debounced render (User Timing measure of the pass) — median over varied needles | ≤ 50 ms | 0.2 ms | MET |
| filter full rebuilds per same-result keystroke (row DOM identity preserved?) | 0 full rebuilds | 0 (no list mutation — 1/1 rows preserved) | MET |
| filter animation replays per same-result keystroke | 0 replays | 0 (no list mutation — nothing replayed) | MET |
| stale search response overwrites newer render (slow query answers after fast one) | never overwrites | held — the fresh render survived the late stale response | MET |

## observations
- cold global list via API (context only — the ratified row is the page's perceived first paint): 78439.2 ms median
- warm global list via API: 1.2 ms median
- search overhead inputs: stub RTT fixed at 40 ms; direct median 40.5 ms; wrapped median 41.4 ms
- upstream search calls logged: 11 total, 11 for q=stub (1 of them is the concurrent identical-search pin; S-182 deduped 3 concurrent callers onto it)
- filter matching instrument: 25 matches counted across 40 timed full-corpus passes (liveness check; per-needle row counts are the filter probe samples below)
- filter probe samples: "g" → 1 rows, no DOM change, render 0.1 ms (perceived 411.1 ms); "zzz-real-no-match" → 0 rows, render 0.2 ms (perceived 152.5 ms); "gat" → 1 rows, render 0.2 ms (perceived 150.9 ms); "zzz-real-no-match" → 0 rows, render 0.2 ms (perceived 150.5 ms); "gate-" → 1 rows, render 0.2 ms (perceived 151.6 ms); "zzz-real-no-match" → 0 rows, render 0.2 ms (perceived 151.8 ms); "gate-demo" → 1 rows, render 0.1 ms (perceived 153.2 ms)
- filter perceived dispatch→render (INCLUDES the ratified debounce wait, context only — the budget row charges the render work): 151.8 ms median


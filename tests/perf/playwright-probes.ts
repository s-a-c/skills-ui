/**
 * Playwright probes for the S-177 perf harness — the reusable instruments
 * the budget script runs today and the fix tickets' own tests build on:
 *
 *   - probeFilterRender      one filter keystroke → render duration, DOM
 *                            identity (row nodes preserved?), animation
 *                            replays (fresh list animations?)
 *   - probeScopeFirstPaint   scope switch → first painted row of that scope
 *                            (the perceived-first-paint instrument for the
 *                            cold-global SWR row)
 *   - probeStaleOverwrite    slow-then-fast registry search → does the stale
 *                            response overwrite the newer render?
 *
 * Every probe is measurement/observation only: none of them asserts a
 * wall-clock budget (that is the budget script's job) and none of them
 * patches page code — they observe the shipped APP_JS from the outside.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Context for perf probes: animations MUST run (reducedMotion would clamp
 * every animation to 0.01 ms and the replay probe would read zero always),
 * so pin `no-preference` regardless of the machine's OS setting.
 */
export async function newPerfContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ reducedMotion: "no-preference" });
}

/**
 * Bounded browser teardown: `browser.close()` takes ~10 s to come back under
 * the bun runtime (transport quirk, not a chromium hang — the same close is
 * sub-second under node). Await it briefly, then SIGKILL the browser
 * process; the suite must not stall on shutdown.
 */
export async function closeBrowser(browser: Browser): Promise<void> {
  // `process()` is chromium-launch-specific and missing from the shared
  // Browser type — read it structurally
  const child =
    (browser as unknown as { process?: () => { kill: (signal?: string) => void; killed: boolean } | null })
      .process?.() ?? null;
  if (!child) {
    await browser.close().catch(() => {});
    return;
  }
  await Promise.race([browser.close().catch(() => {}), Bun.sleep(2_000)]);
  if (!child.killed) child.kill("SIGKILL");
}

/**
 * The page auto-runs an updates check on load and after scope switches;
 * stub it at the network layer (house pattern from tests/e2e) so probes are
 * deterministic and network-free.
 */
export async function stubUpdates(page: Page): Promise<void> {
  await page.route("**/api/updates*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ scope: "project", updates: {}, checkedCount: 0 }),
    })
  );
}

/** Open the served page and wait until the installed list is rendered and idle. */
export async function openServedPage(
  page: Page,
  base: string,
  expectedRows: number,
  timeoutMs = 30_000
): Promise<void> {
  await page.goto(`${base}/`);
  await page.waitForFunction(
    (n) => document.querySelectorAll("#skillList li").length === n,
    expectedRows,
    { timeout: timeoutMs }
  );
  await page.waitForFunction(() => {
    const bar = document.querySelector("#busyBar") as HTMLElement | null;
    return bar !== null && bar.style.display !== "block";
  }, undefined, { timeout: timeoutMs });
}

export interface FilterProbeResult {
  /** input dispatch → first list mutation (the render work; a future
   * debounced fix moves the mutation later, which this instrument reports
   * as the longer perceived value — documented, not hidden). When
   * noMutation, this is the full observation window (there was no render
   * to time). */
  durationMs: number;
  /** rendered list rows (li) after the render (or at timeout) */
  rows: number;
  /** li nodes present before AND after — 0 ⇒ full rebuild, === rows ⇒ identity fully preserved */
  preservedRows: number;
  /** list-scoped animations that did not exist before the render — the
   * animation-replay count; always 0 when noMutation */
  freshAnimations: number;
  /** the RENDER WORK of the debounced pass: the page's own User Timing
   * measure (skills-ui:filter-render, marks placed around every debounced
   * render pass) for the pass this probe triggered — the execution time of
   * the render itself (matching + reconcile + DOM ops). Excludes BOTH the
   * ratified debounce wait and the browser's frame pacing; `durationMs` is
   * the perceived dispatch→first-mutation value that INCLUDES the wait.
   * Falls back to a mutation-burst estimate on page builds without the
   * marks. Read on no-op passes too: a legitimate reconcile-to-nothing
   * reports its own measure (the true O(N) signature-read cost), so 0
   * means only that no measure exists AND no mutation fired. The
   * S-155 budget "≤ 50 ms per debounced render" is asserted against THIS
   * number; the debounce window itself is ratified UX, reported as
   * context, not charged to the budget. */
  renderWorkMs: number;
  /** the observation window elapsed with ZERO list mutations while the
   * probed value held and every pre-probe row kept identity — a legitimate
   * no-mutation render (the DOM-reuse path a same-result keystroke should
   * produce once the S-180 fix lands). NOT a timeout. */
  noMutation: boolean;
  /** true ONLY when the expected content never appeared: rows were lost or
   * the filter value diverged — a real probe failure */
  timedOut: boolean;
}

/**
 * One filter keystroke, observed end to end. Sets #filter to `value`,
 * dispatches the same `input` event the app listens for, and reports:
 * duration, resulting row count, DOM-identity preservation, and how many
 * list animations were created fresh (i.e. replayed). Restores nothing —
 * the caller owns the filter state (probe with value "" to reset).
 */
export async function probeFilterRender(
  page: Page,
  value: string,
  timeoutMs = 5_000
): Promise<FilterProbeResult> {
  return page.evaluate(
    ({ value, timeoutMs }) => {
      return new Promise<{
        durationMs: number;
        rows: number;
        preservedRows: number;
        freshAnimations: number;
        renderWorkMs: number;
        noMutation: boolean;
        timedOut: boolean;
      }>((resolve) => {
        const filter = document.querySelector("#filter") as HTMLInputElement;
        const list = document.querySelector("#skillList") as HTMLElement;
        const listScoped = (anim: Animation): boolean => {
          const target = (anim.effect as KeyframeEffect | null)?.target;
          return target instanceof Element && target.closest("#skillList") !== null;
        };
        const liBefore = new Set(Array.from(list.querySelectorAll("li")));
        const animsBefore = new Set(document.getAnimations().filter(listScoped));
        let durationMs = -1;
        let byMutation = false;
        let firstMutationAt = 0;
        let lastMutationAt = 0;
        let mutCount = 0;
        // The page's own User Timing measure for the pass this probe
        // triggered (marks land around every debounced render pass). Falls
        // back to the mutation-burst estimate on page builds without the
        // marks. Frame pacing and the debounce wait stay out of the number.
        const measuredRenderWork = (): number => {
          const entries = performance.getEntriesByName("skills-ui:filter-render");
          for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i]!.startTime >= t0) return entries[i]!.duration;
          }
          return byMutation ? Math.max(0, lastMutationAt - firstMutationAt) : 0;
        };
        const finish = () => {
          clearTimeout(timer);
          obs.disconnect();
          // double-rAF: rendering steps must have run so freshly created
          // CSSAnimation objects actually exist before we count them.
          // renderWork is the MUTATION BURST (first → last list mutation),
          // read before this settle — frame pacing stays out of the number.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              // renderWorkMs assigned at the call sites below from the
              // burst timestamps captured by the observer
              const liAfter = Array.from(list.querySelectorAll("li"));
              let preservedRows = 0;
              for (const li of liAfter) if (liBefore.has(li)) preservedRows++;
              const freshAnimations = document
                .getAnimations()
                .filter(listScoped)
                .filter((a) => !animsBefore.has(a)).length;
              if (!byMutation) {
                // The observation window elapsed with no list mutation.
                // Value still set and every pre-probe row still in place ⇒
                // a legitimate no-mutation render (DOM reuse), not a
                // timeout. Rows lost or value diverged ⇒ the expected
                // content never appeared.
                const valueHeld = filter.value === value;
                const identityHeld =
                  liAfter.length > 0 &&
                  liAfter.length === liBefore.size &&
                  preservedRows === liAfter.length;
                if (valueHeld && identityHeld) {
                  resolve({
                    durationMs: performance.now() - t0,
                    rows: liAfter.length,
                    preservedRows,
                    freshAnimations: 0,
                    renderWorkMs: measuredRenderWork(),
                    noMutation: true,
                    timedOut: false,
                  });
                  return;
                }
                resolve({
                  durationMs,
                  rows: liAfter.length,
                  preservedRows,
                  freshAnimations,
                  renderWorkMs: 0,
                  noMutation: false,
                  timedOut: true,
                });
                return;
              }
              resolve({
                durationMs,
                rows: liAfter.length,
                preservedRows,
                freshAnimations,
                renderWorkMs: measuredRenderWork(),
                noMutation: false,
                timedOut: false,
              });
            })
          );
        };
        // Stay connected for the WHOLE mutation burst: lastMutationAt drives
        // renderWorkMs, so disconnecting at the first mutation would
        // undercount a long reconcile. The settle (double-rAF) only proceeds
        // once the burst has been quiet for two frames — a late mutation
        // reschedules it.
        const scheduleSettle = (): void => {
          const countAtSchedule = mutCount;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (mutCount !== countAtSchedule) {
                scheduleSettle();
                return;
              }
              finish();
            })
          );
        };
        const obs = new MutationObserver(() => {
          const now = performance.now();
          if (durationMs < 0) {
            firstMutationAt = now;
            durationMs = now - t0;
          }
          lastMutationAt = now;
          mutCount += 1;
          byMutation = true;
          scheduleSettle();
        });
        const timer = setTimeout(() => finish(), timeoutMs);
        const t0 = performance.now();
        obs.observe(list, { childList: true, subtree: true });
        filter.value = value;
        filter.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    { value, timeoutMs }
  );
}

export interface ScopeFirstPaintOptions {
  scope: "project" | "global";
  /** text that can only appear once THAT scope's rows are painted (a skill
   * name unique to the target scope's listing) */
  markerText: string;
  /** row count of the target scope — the paint is also recognized when the
   * list length flips to it (robust when project/global names overlap) */
  expectedRowCount?: number;
  timeoutMs?: number;
}

/**
 * Perceived first paint of a scope switch: clicks the scope button and
 * measures until the first row of that scope is in the DOM (marker text
 * present or the list length flipped to the scope's row count). Today the
 * wait is the full cold `skills ls` behind the spawn queue; the SWR fix
 * will make this the stale-paint+refresh window.
 */
export async function probeScopeFirstPaint(
  page: Page,
  options: ScopeFirstPaintOptions
): Promise<number> {
  const { scope, markerText, expectedRowCount, timeoutMs = 30_000 } = options;
  return page.evaluate(
    ({ scope, markerText, expectedRowCount, timeoutMs }) => {
      return new Promise<number>((resolve, reject) => {
        const button = document.querySelector(`[data-scope="${scope}"]`) as HTMLButtonElement | null;
        if (!button) {
          reject(new Error(`scope button [data-scope="${scope}"] not found`));
          return;
        }
        const list = document.querySelector("#skillList") as HTMLElement;
        const painted = (): boolean => {
          const text = list.textContent ?? "";
          if (markerText && text.includes(markerText)) return true;
          return (
            typeof expectedRowCount === "number" &&
            list.querySelectorAll("li").length === expectedRowCount
          );
        };
        const obs = new MutationObserver(() => {
          if (painted()) {
            obs.disconnect();
            resolve(performance.now() - t0);
          }
        });
        const timer = setTimeout(() => {
          obs.disconnect();
          reject(new Error(`first paint of scope ${scope} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        const t0 = performance.now();
        obs.observe(list, { childList: true, subtree: true, characterData: true });
        button.click();
      });
    },
    { scope, markerText, expectedRowCount, timeoutMs }
  );
}

export interface StaleOverwriteOptions {
  /** slow query — its response is still in flight when the fresh one renders */
  staleQuery: string;
  /** fast query fired while the stale one is in flight */
  freshQuery: string;
  /** unique marker text of the stale result row */
  staleMarker: string;
  /** unique marker text of the fresh result row */
  freshMarker: string;
  /** the stub's slow RTT (drives how long we wait for the late response) */
  staleRttMs: number;
  timeoutMs?: number;
}

export interface StaleOverwriteResult {
  /** the newer render happened at all */
  freshRendered: boolean;
  /** the stale response replaced the newer render — the ratified budget is
   * "stale can't overwrite newer", so true = violation. Discriminated by
   * RENDER CONTENT, not stale-marker presence (S-182): the harness stub
   * answers every query with one shared payload, so the fresh render itself
   * shows the stale row's marker — the stale response won only if the fresh
   * marker is GONE while the stale one is present (the guarded page keeps
   * the fresh render; an unguarded one swaps in the stale-only result set). */
  staleOverwrote: boolean;
  /** final visible text of #results (diagnostics) */
  finalText: string;
}

/**
 * In-flight ordering probe over the real page flow: fire the slow query,
 * fire the fast query while it is in flight, then wait past the slow
 * response and read what finally rendered. The 300 ms search debounce in
 * APP_JS is part of the measured flow: the first wait (500 ms) guarantees
 * the stale query was actually dispatched before the fresh keystroke.
 */
export async function probeStaleOverwrite(
  page: Page,
  options: StaleOverwriteOptions
): Promise<StaleOverwriteResult> {
  const { staleQuery, freshQuery, staleMarker, freshMarker, staleRttMs, timeoutMs = 15_000 } =
    options;
  await page.locator('[data-tab="search"]').click();
  await page.locator("#searchInput").fill(staleQuery);
  await page.waitForTimeout(500); // debounce (300 ms) fired; stale response in flight
  await page.locator("#searchInput").fill(freshQuery);
  let freshRendered = true;
  try {
    await page.waitForFunction(
      (marker) => {
        const results = document.querySelector("#results");
        return results !== null && results.textContent !== null && results.textContent.includes(marker);
      },
      freshMarker,
      { timeout: timeoutMs }
    );
  } catch {
    freshRendered = false;
  }
  // wait past the stale response's late landing (its RTT plus the debounce
  // head start it already burned, with slack)
  await page.waitForTimeout(staleRttMs + 3_000);
  const finalText = await page.evaluate(() => {
    const results = document.querySelector("#results");
    return results?.textContent ?? "";
  });
  return {
    freshRendered,
    staleOverwrote: finalText.includes(staleMarker) && !finalText.includes(freshMarker),
    finalText: finalText.slice(0, 400),
  };
}

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
        const finish = () => {
          clearTimeout(timer);
          obs.disconnect();
          // double-rAF: rendering steps must have run so freshly created
          // CSSAnimation objects actually exist before we count them
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
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
                noMutation: false,
                timedOut: false,
              });
            })
          );
        };
        const obs = new MutationObserver(() => {
          if (durationMs < 0) durationMs = performance.now() - t0;
          byMutation = true;
          obs.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(finish));
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
   * "stale can't overwrite newer", so true = violation */
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
    staleOverwrote: finalText.includes(staleMarker),
    finalText: finalText.slice(0, 400),
  };
}

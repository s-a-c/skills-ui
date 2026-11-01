import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderPage } from "../src/web/page.ts";

/**
 * S-167 G2 — terminology assertions: the ratified 0.5.2 vocabulary holds on
 * BOTH surfaces (S-152 direction calls: the queue is an "install list"
 * everywhere; the remove verb is "remove", never "delete"; confirm copy
 * matches the keys that actually work). Source-level assertions are the
 * regression net for vocabulary drift; the behavioral halves (n/N cancels,
 * Esc cancels) are covered by the TUI and e2e suites this file cites.
 */

const HERE = import.meta.dir;
const read = (rel: string): string => readFileSync(join(HERE, rel), "utf8");

const tuiViews = read("../src/tui/Views.tsx");
const tuiApp = read("../src/tui/app.ts");
const pageHtml = renderPage("0.0.0-test", undefined, undefined, undefined, { hosted: true });

describe("S-167 G2: ratified terminology — TUI surface", () => {
  test("the queue pane is the install list", () => {
    expect(tuiViews).toContain("install list (${model.queue.size})");
    expect(tuiViews).toContain("u install list");
  });

  test("the remove verb is 'remove' everywhere user-visible", () => {
    expect(tuiViews).toContain('" remove skills "');
    expect(tuiViews).toContain("update / remove (checked or focused)");
    expect(tuiApp).toContain('"removing"');
    // footer confirm line maps the internal kind to the user verb
    expect(tuiViews).toContain('? "remove" : "update"');
  });

  test("confirm copy matches its keys — y/N line, n wired, hint says so", () => {
    expect(tuiViews).toContain("? y/N");
    expect(tuiViews).toContain("y confirm · n/esc cancel");
    // the key itself is wired (behavior proven in tui.test.ts S-162 cases)
    expect(tuiApp).toMatch(/k === "escape" \|\| k === "n" \|\| k === "N"/);
  });

  test("banned pre-ratification strings are gone", () => {
    expect(tuiViews).not.toContain("Selected (${");
    expect(tuiViews).not.toContain("delete skills");
    expect(tuiViews).not.toContain("queues from");
    expect(tuiViews).not.toContain("install queued");
    expect(tuiApp).not.toContain('"deleting"');
    expect(tuiApp).not.toContain("installing queue");
  });
});

describe("S-167 G2: ratified terminology — web surface (emitted page)", () => {
  test("the queue is the install list", () => {
    expect(pageHtml).toContain("+ Add to list");
    expect(pageHtml).toContain("In list");
    expect(pageHtml).toContain("install list");
  });

  test("the remove verb is 'remove' everywhere user-visible", () => {
    expect(pageHtml).toContain("Remove selected");
    expect(pageHtml).toContain("Yes, remove");
    expect(pageHtml).toContain('">Remove');
  });

  test("banned pre-ratification strings are gone", () => {
    expect(pageHtml).not.toContain("Delete selected");
    expect(pageHtml).not.toContain("delete skills");
  });
});

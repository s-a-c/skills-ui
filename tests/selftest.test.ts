import { describe, expect, test } from "bun:test";
import { buildSpikeScreen } from "../src/tui/app.ts";
import { createTestRenderer } from "@opentui/core/testing";
import { waitForFrame } from "../src/tui/renderer-ready.ts";

describe("spike screen", () => {
  test("renders markdown prose and code through the tree-sitter worker", async () => {
    const setup = await createTestRenderer({ width: 80, height: 30 });
    try {
      setup.renderer.root.add(buildSpikeScreen(setup.renderer));
      // S-212: readiness is a bounded predicate, not a fixed sleep — the
      // worker-rendered markers land asynchronously (observed ~20–190 ms).
      // The predicate IS the four-marker assertion; a deadline miss reports
      // the last frame.
      await waitForFrame(setup, (f) =>
        ["skills-ui", "wrapper", "ls --json", "catppuccin"].every((marker) => f.includes(marker))
      );
    } finally {
      setup.renderer.destroy();
    }
  });

  test("CLI selftest observes all required worker-rendered markers", async () => {
    const child = Bun.spawn([process.execPath, "run", "src/main.ts", "--selftest"],
      { stdout: "pipe", stderr: "pipe", timeout: 10000 });
    const [out, err, exit] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited
    ]);
    expect({ exit, err }).toEqual({ exit: 0, err: "" });
    expect(out).toContain("SELFTEST PASS");
  }, 12000);
});

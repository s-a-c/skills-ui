import { describe, expect, test } from "bun:test";
import { buildSpikeScreen } from "../src/tui/app.ts";
import { createTestRenderer } from "@opentui/core/testing";

describe("spike screen", () => {
  test("renders markdown prose and code through the tree-sitter worker", async () => {
    const setup = await createTestRenderer({ width: 80, height: 30 });
    try {
      setup.renderer.root.add(buildSpikeScreen(setup.renderer));
      await setup.renderOnce();
      await setup.flush();
      await new Promise((r) => setTimeout(r, 500));
      await setup.renderOnce();
      const frame = setup.captureCharFrame();
      for (const marker of ["skills-ui", "wrapper", "ls --json", "catppuccin"]) {
        expect(frame).toContain(marker);
      }
    } finally {
      setup.renderer.destroy();
    }
  });
});

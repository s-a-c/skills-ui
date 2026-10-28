import { describe, expect, test } from "bun:test";
import { ImageRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";

/**
 * Phase-4 capability proof: the image pipeline renders through the blocks
 * protocol in the in-memory renderer (kitty/sixel kick in on real
 * terminals; protocol "auto" picks the best the terminal supports).
 */
const TINY_PNG = Buffer.from(
  // 1x1 red PNG
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("image renderable", () => {
  test("constructs and renders without a real terminal", async () => {
    const setup = await createTestRenderer({ width: 40, height: 10 });
    try {
      const image = new ImageRenderable(setup.renderer, {
        source: TINY_PNG,
        protocol: "blocks",
        width: 2,
        height: 1,
      });
      setup.renderer.root.add(image);
      await setup.renderOnce();
      await setup.flush();
      expect(true).toBe(true); // constructed + rendered without throwing
    } finally {
      setup.renderer.destroy();
    }
  });
});

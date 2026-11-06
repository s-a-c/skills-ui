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

  test("vendored @opentui/three: file-image utilities are pinned unsupported (S-228 / DEP-01)", async () => {
    // The skills-ui fork of @opentui/three (vendor/opentui-three, ADR:
    // preserve-graph-behavior-with-a-pinned-jimp-free-opentui-three-fork)
    // replaced the two Jimp-consuming bodies with explicit unsupported-
    // operation throws; the app never calls either. Pin both throws so a
    // future upstream re-pin cannot silently restore the Jimp chain.
    const { CLICanvas, TextureUtils } = await import("@opentui/three");
    await expect(
      // prototype call: the mandated stub throws before touching `this`,
      // so no constructed canvas is needed
      CLICanvas.prototype.saveToFile.call(null, "unused.png")
    ).rejects.toThrow("Image file export is not included in the skills-ui graph adapter");
    await expect(TextureUtils.loadTextureFromFile("unused.png")).rejects.toThrow(
      "Image file loading is not included in the skills-ui graph adapter"
    );
  });
});

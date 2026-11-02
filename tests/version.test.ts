import { describe, expect, test } from "bun:test";
import pkg from "../package.json";
import { APP_VERSION } from "../src/core/version.ts";

describe("version", () => {
  test("without the build-time define, APP_VERSION falls back to package.json", () => {
    // `bun test` never defines __APP_VERSION__, so this exercises the
    // dev/test fallback path; the compiled-binary path is proven by
    // `--version` on every target in the packaging matrix.
    expect(APP_VERSION).toBe(pkg.version);
  });

  test("APP_VERSION is a semver-shaped string", () => {
    // 3 or 4 segments: the roadmap versions patches of patches (0.5.3.1)
    // alongside plain patches (0.5.3) — a 3-segment-only regex failed the
    // moment the first 4-segment release landed (S-187-era catch).
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(\.\d+)?$/);
  });
});

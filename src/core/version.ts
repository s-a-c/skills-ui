import pkg from "../../package.json";

/**
 * Single source of the wrapper's version, used by the TUI, the WebUI page,
 * GET /api/version and `--version`.
 *
 * scripts/build.ts stamps the exact package.json version into every compiled
 * binary via `--define __APP_VERSION__='"x.y.z"'` — a bare global baked in at
 * bundle time, so runtime env scrubbing can't touch it. Everywhere the define
 * is absent (`bun run src/main.ts`, tests), fall back to package.json.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : pkg.version;

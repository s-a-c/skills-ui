import { defineConfig } from "@playwright/test";

/**
 * Hosted-UI e2e (S-138 harness): the REAL GitHub Pages page talking to a
 * local serve subprocess. The local-network-access permission is granted in
 * the happy-path contexts and withheld in the negative test — a plain
 * localhost test page would be loopback→loopback and never trigger LNA.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts", // keep `bun test` (which matches *.spec.*) away from these
  timeout: 30_000,
  workers: 1,
  reporter: [["list"]],
});

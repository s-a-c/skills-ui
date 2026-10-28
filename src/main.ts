import { buildSpikeScreen, runTui } from "./tui/app.ts";

/**
 * skills-ui entry: mode dispatch.
 *   skills-ui              → terminal UI (phase 3; spike screen for now)
 *   skills-ui --web        → HTTP API + WebUI in the browser
 *   skills-ui serve        → headless HTTP API
 *   skills-ui --selftest   → in-memory renderer smoke check (no TTY needed)
 * Shared flags: --port <n> · seed passthrough (add/update/remove args).
 */

function parsePortArg(args: string[]): { port: number | null; rest: string[] } {
  const rest: string[] = [];
  let port: number | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--port") {
      const value = Number(args[i + 1]);
      if (Number.isInteger(value) && value >= 1 && value <= 65535) port = value;
      i++;
      continue;
    }
    rest.push(arg);
  }
  return { port, rest };
}

async function selftest(): Promise<void> {
  const { createTestRenderer } = await import("@opentui/core/testing");
  const setup = await createTestRenderer({ width: 80, height: 30 });
  try {
    setup.renderer.root.add(buildSpikeScreen(setup.renderer));
    await setup.renderOnce();
    await setup.flush();
    await new Promise((r) => setTimeout(r, 500));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    const mustContain = ["skills-ui", "wrapper", "ls --json", "catppuccin"];
    const missing = mustContain.filter((s) => !frame.includes(s));
    if (missing.length > 0) {
      console.error("SELFTEST FAIL — frame missing: " + missing.join(", "));
      process.exitCode = 1;
      return;
    }
    console.log("SELFTEST PASS — frame contains all expected markers");
  } finally {
    setup.renderer.destroy();
  }
}

async function runWeb(headless: boolean, portArg: number | null, seedArgs: string[]): Promise<void> {
  const { createSkillsUiServer } = await import("./core/api.ts");
  const { parseUiSeed } = await import("./core/seed.ts");
  const seed = parseUiSeed(seedArgs);
  const server = await createSkillsUiServer({
    port: portArg,
    seed,
    withPage: !headless,
    onReady: ({ port, fellBack }) => {
      if (fellBack) console.log(`Port ${portArg} is in use — picked a random unused port instead.`);
      console.log(`skills-ui ${headless ? "API" : "web UI"} running at http://127.0.0.1:${port}`);
      console.log("Press Ctrl+C to stop.");
    },
  });
  if (!headless && process.stdout.isTTY) {
    const url = `http://127.0.0.1:${server.port}`;
    const opener =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    Bun.spawn([opener, url], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
  }
  await new Promise<void>((resolve) => {
    const done = (): void => resolve();
    process.on("SIGINT", done);
    process.on("SIGTERM", done);
  });
  await server.stop();
}

const argv = process.argv.slice(2);
const { port, rest } = parsePortArg(argv);

if (rest.includes("--selftest")) {
  await selftest();
} else if (rest[0] === "serve") {
  await runWeb(true, port, rest.slice(1));
} else if (rest[0] === "--web" || rest[0] === "web") {
  await runWeb(false, port, rest.slice(1));
} else {
  const { parseUiSeed } = await import("./core/seed.ts");
  await runTui(parseUiSeed(rest.filter((a) => a[0] !== "-")));
}

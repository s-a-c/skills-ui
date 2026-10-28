import { buildSpikeScreen, runSpikeTui } from "./tui/app.ts";

/**
 * --selftest: render the spike screen on an in-memory renderer and assert
 * the frame contains the expected content (incl. the markdown code block —
 * the path that silently degrades in compiled binaries). Works without a
 * TTY, so the compiled binary can prove its embedded natives + worker.
 */
async function selftest(): Promise<void> {
  const { createTestRenderer } = await import("@opentui/core/testing");
  const setup = await createTestRenderer({ width: 80, height: 30 });
  try {
    setup.renderer.root.add(buildSpikeScreen(setup.renderer));
    await setup.renderOnce();
    // markdown prose parses asynchronously through the tree-sitter worker —
    // flush, let highlights settle, then capture the settled frame
    await setup.flush();
    await new Promise((r) => setTimeout(r, 500));
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    const mustContain = ["skills-ui", "wrapper", "ls --json", "catppuccin"];
    const missing = mustContain.filter((s) => !frame.includes(s));
    if (missing.length > 0) {
      console.error("SELFTEST FAIL — frame missing: " + missing.join(", "));
      console.error("--- frame ---\n" + frame + "\n-------------");
      process.exitCode = 1;
      return;
    }
    console.log("SELFTEST PASS — frame contains all expected markers");
  } finally {
    setup.renderer.destroy();
  }
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  await selftest();
} else {
  await runSpikeTui();
}

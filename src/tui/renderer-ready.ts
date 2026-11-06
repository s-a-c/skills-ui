/**
 * Bounded frame observation for in-memory renderers (S-212 / Q01).
 *
 * OpenTUI commits React work and tree-sitter worker output asynchronously;
 * a fixed sleep before captureCharFrame() is a guess that flakes under
 * suite load. waitForFrame polls the actual frame until a predicate holds,
 * under a deadline — renderer readiness becomes observable and bounded
 * instead of slept, and a deadline miss surfaces the last frame.
 *
 * No OpenTUI import here: any renderer exposing renderOnce()/flush()/
 * captureCharFrame() (createTestRenderer's setup object, in particular)
 * satisfies FrameDriver structurally.
 */
export interface FrameDriver {
  renderOnce(): Promise<void>;
  flush(): Promise<void>;
  captureCharFrame(): string;
}

export async function waitForFrame(
  driver: FrameDriver,
  predicate: (frame: string) => boolean,
  timeoutMs = 5000
): Promise<string> {
  const deadline = performance.now() + timeoutMs;
  let frame = "";
  do {
    await driver.renderOnce();
    await driver.flush();
    await driver.renderOnce();
    frame = driver.captureCharFrame();
    if (predicate(frame)) return frame;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (performance.now() < deadline);
  throw new Error("Renderer readiness deadline exceeded; last frame:\n" + frame);
}

/**
 * Serialized subprocess gate (0.5.1 impl A): at most one `skills` CLI child
 * runs at a time and the waiting line is capped, so a request storm (hostile
 * page fan-out or a stuck UI retry loop) cannot multiply 60 s subprocesses.
 * Queue cap is SKILLS_UI_SPAWN_QUEUE_CAP (default 8); overflow rejects fast.
 */

export class SkillsBusyError extends Error {
  constructor() {
    super("skills CLI queue is full — too many concurrent requests");
    this.name = "SkillsBusyError";
  }
}

interface Slot {
  resolve: () => void;
  reject: (error: SkillsBusyError) => void;
}

export function queueCap(): number {
  const raw = Number(process.env.SKILLS_UI_SPAWN_QUEUE_CAP);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 8;
}

/**
 * FIFO semaphore. `run` executes `task` once a slot is free; when the queue
 * is at capacity the call rejects with SkillsBusyError instead of waiting.
 */
export function createSpawnQueue(maxConcurrent = 1) {
  let running = 0;
  const waiting: Slot[] = [];

  const run = <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        running += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            running -= 1;
            waiting.shift()?.resolve();
          });
      };
      if (running < maxConcurrent) {
        start();
        return;
      }
      if (waiting.length >= queueCap()) {
        reject(new SkillsBusyError());
        return;
      }
      waiting.push({ resolve: start, reject });
    });

  return { run, get running() { return running; }, get queued() { return waiting.length; } };
}

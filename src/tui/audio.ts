import type { UiPreferences } from "../core/prefs.ts";

/**
 * Synthesized UI sounds via OpenTUI's Audio engine (playStream with
 * generated PCM) — replaces the fork's BEL-only alerts with the webUI's
 * synth design. Pref-gated; disposal on app exit. Audio failures degrade
 * silently: a broken sound must never surface in the UI (S-88).
 */

export type SoundKind = "select" | "confirm" | "success" | "error";

interface AudioStreamLike {
  closed: Promise<void> | void;
  dispose(): Promise<void> | void;
}

interface AudioLike {
  start(): boolean | Promise<void>;
  playStream(
    source: AsyncIterable<Uint8Array>,
    options: {
      format: "pcm";
      sampleFormat: "f32le";
      sampleRate: number;
      channels: number;
    }
  ): Promise<AudioStreamLike>;
  dispose(): Promise<void> | void;
}

let audio: AudioLike | null = null;
let failed = false;

async function ensure(): Promise<AudioLike | null> {
  if (audio || failed) return audio;
  try {
    const mod = (await import("@opentui/core")) as unknown as {
      Audio?: { create?: (opts?: { autoStart?: boolean }) => AudioLike };
    };
    if (!mod.Audio?.create) return null;
    const instance = mod.Audio.create();
    instance.start();
    audio = instance;
    return instance;
  } catch {
    failed = true; // no audio device — degrade silently, never block the UI
    return null;
  }
}

/** A short sine tone as little-endian f32 PCM bytes (44.1 kHz mono). */
async function* toneBytes(freq: number, seconds: number, gain: number): AsyncGenerator<Uint8Array> {
  const rate = 44100;
  const framesPerChunk = 441;
  const total = Math.floor(rate * seconds);
  for (let offset = 0; offset < total; offset += framesPerChunk) {
    const frames = Math.min(framesPerChunk, total - offset);
    const chunk = new Uint8Array(frames * 4);
    const view = new DataView(chunk.buffer);
    for (let frame = 0; frame < frames; frame++) {
      const t = (offset + frame) / rate;
      const envelope = Math.min(1, t / 0.008) * Math.exp(-4 * t);
      view.setFloat32(frame * 4, Math.sin(2 * Math.PI * freq * t) * gain * envelope, true);
    }
    yield chunk;
  }
}

const PATTERNS: Record<SoundKind, Array<[number, number, number]>> = {
  select: [[523, 0.06, 0.06]],
  confirm: [[392, 0.06, 0.05], [523, 0.07, 0.05]],
  success: [[523, 0.07, 0.05], [659, 0.09, 0.05]],
  error: [[196, 0.12, 0.06], [185, 0.14, 0.06]],
};

export async function playSound(kind: SoundKind, prefs: UiPreferences): Promise<void> {
  if (!prefs.sound) return;
  try {
    const instance = await ensure();
    if (!instance) return;
    for (const [freq, seconds, gain] of PATTERNS[kind]) {
      const stream = await instance.playStream(toneBytes(freq, seconds, gain), {
        format: "pcm",
        sampleFormat: "f32le",
        sampleRate: 44100,
        channels: 1,
      });
      await stream.closed;
      stream.dispose?.();
    }
  } catch {
    // never let a sound failure reach the renderer's error console
    failed = true;
    audio = null;
  }
}

export async function disposeAudio(): Promise<void> {
  if (audio) {
    try {
      await audio.dispose();
    } catch {
      // best effort — shutdown path
    }
    audio = null;
  }
}

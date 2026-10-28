import type { UiPreferences } from "../core/prefs.ts";

/**
 * Synthesized UI sounds via OpenTUI's Audio engine (playStream with
 * generated PCM) — replaces the fork's BEL-only alerts with the webUI's
 * synth design. Pref-gated; disposal on app exit.
 */

export type SoundKind = "select" | "confirm" | "success" | "error";

interface AudioLike {
  start(): Promise<void> | void;
  playStream(
    data: Float32Array,
    options?: { sampleRate?: number; channels?: number; format?: string }
  ): Promise<void> | void;
  dispose(): Promise<void> | void;
}

let audio: AudioLike | null = null;
let failed = false;

async function ensure(): Promise<AudioLike | null> {
  if (audio || failed) return audio;
  try {
    const mod = (await import("@opentui/core")) as unknown as {
      Audio?: { create?: () => AudioLike };
    };
    if (!mod.Audio?.create) return null;
    const instance = mod.Audio.create();
    await instance.start();
    audio = instance;
    return instance;
  } catch {
    failed = true; // no audio device — degrade silently, never block the UI
    return null;
  }
}

/** A short sine tone as Float32 PCM (44.1 kHz mono). */
function tone(freq: number, seconds: number, gain: number): Float32Array {
  const rate = 44100;
  const total = Math.floor(rate * seconds);
  const data = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t / 0.008) * Math.exp(-4 * t);
    data[i] = Math.sin(2 * Math.PI * freq * t) * gain * envelope;
  }
  return data;
}

const PATTERNS: Record<SoundKind, Array<[number, number, number]>> = {
  select: [[523, 0.06, 0.06]],
  confirm: [[392, 0.06, 0.05], [523, 0.07, 0.05]],
  success: [[523, 0.07, 0.05], [659, 0.09, 0.05]],
  error: [[196, 0.12, 0.06], [185, 0.14, 0.06]],
};

export async function playSound(kind: SoundKind, prefs: UiPreferences): Promise<void> {
  if (!prefs.sound) return;
  const instance = await ensure();
  if (!instance) return;
  for (const [freq, seconds, gain] of PATTERNS[kind]) {
    await instance.playStream(tone(freq, seconds, gain), {
      sampleRate: 44100,
      channels: 1,
      format: "f32le",
    });
  }
}

export async function disposeAudio(): Promise<void> {
  if (audio) {
    await audio.dispose();
    audio = null;
  }
}

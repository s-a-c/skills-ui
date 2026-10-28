/** Ported from vercel-labs/skills `src/ui-seed.ts` (MIT) — unchanged. */
export type UiSeed =
  | { kind: 'none' }
  | { kind: 'add'; source: string; skills: string[] }
  | { kind: 'update'; skills: string[] }
  | { kind: 'remove'; skills: string[] };

/** Flags whose following tokens are values, not positionals. */
const VALUE_FLAGS = new Set([
  '-a',
  '--agent',
  '-s',
  '--skill',
  '--subagent',
  '--metadata',
  '--owner',
  '--port',
  '--include',
  '--exclude',
]);

/** Flag-aware walk: bare tokens are positionals; known flags and their values are skipped. */
function positionals(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('-')) {
      if (VALUE_FLAGS.has(arg)) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

/** Values collected from value-taking flags, e.g. `--skill a b`. */
function flagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) {
      for (let j = i + 1; j < args.length && !args[j]!.startsWith('-'); j++) {
        values.push(args[j]!);
        i++;
      }
    }
  }
  return values;
}

/**
 * Interprets `<command> ...args` (with --tui/--web already stripped) as a UI
 * seed: what the interface should have pre-selected when it opens. Unknown
 * commands seed nothing — the UI just opens plainly.
 */
export function parseUiSeed(argv: string[]): UiSeed {
  const command = argv[0];
  const rest = argv.slice(1);
  if (!command) return { kind: 'none' };

  if (command === 'add' || command === 'install' || command === 'a' || command === 'i') {
    const positionals_ = positionals(rest);
    const source = positionals_[0];
    if (!source) return { kind: 'none' };
    const skills = [
      ...new Set([
        ...flagValues(rest, '--skill'),
        ...flagValues(rest, '-s'),
        ...positionals_.slice(1),
      ]),
    ];
    return { kind: 'add', source, skills };
  }

  if (command === 'update' || command === 'upgrade' || command === 'check') {
    return { kind: 'update', skills: positionals(rest) };
  }

  if (command === 'remove' || command === 'rm' || command === 'r') {
    return { kind: 'remove', skills: positionals(rest) };
  }

  return { kind: 'none' };
}

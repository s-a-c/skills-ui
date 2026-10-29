/**
 * Minimal upstream repro (S-99): cell-diff paints a text renderable at
 * stale coordinates when its content changes in the same frame as a big
 * ScrollBox content mutation. Same shape as spike.tsx variant A (the S-88
 * killer) with everything skills-ui-specific stripped out.
 *
 * Keys: g swaps the list 2 ↔ 390 rows · letters filter live · q quits.
 * Expected: the status line always reads `filter: <text>▌ · N skills`.
 * Actual (0.7.0, real pty): after g + typing, the line shows fragments of
 * old and new content merged (e.g. `❯iskill-001pe)▌`).
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useState } from "react";

const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => `skill-${String(i + 1).padStart(3, "0")}`);

interface State {
  count: number;
  filter: string;
}

function App() {
  const [state, setState] = useState<State>({ count: 2, filter: "" });
  useKeyboard((key: { name: string }) => {
    const k = key.name;
    if (k === "q") process.exit(0);
    else if (k === "g") setState((s) => ({ count: s.count === 2 ? 390 : 2, filter: "" }));
    else if (k === "backspace") setState((s) => ({ ...s, filter: s.filter.slice(0, -1) }));
    else if (k.length === 1 && /[a-z0-9-]/i.test(k)) setState((s) => ({ ...s, filter: s.filter + k }));
  });
  const rows = makeRows(state.count).filter((n) => n.includes(state.filter));
  return (
    <box width="100%" height="100%" flexDirection="column">
      {/* the bug: this bare text changes content in the same frame as the
          scroll content swaps below */}
      <text>{`filter: ${state.filter || "(type)"}▌ · ${rows.length} skills`}</text>
      <scrollbox width="100%" flexGrow={1} minHeight={0} scrollY={true}>
        {rows.map((name, i) => (
          <text key={name}>{`${i === 0 ? "❯ " : "  "}${name}`}</text>
        ))}
      </scrollbox>
    </box>
  );
}

const renderer = await createCliRenderer({ exitOnCtrlC: false });
createRoot(renderer).render(<App />);

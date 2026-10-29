/**
 * React reconciliation spike (S-92, map S-91).
 *
 * A minimal React clone of the installed view, driving the exact state
 * changes that corrupt the whole-tree-rebuild app: short→390 list swap,
 * live filter text in a pane above a mutating ScrollBox (the S-88 killer
 * shape), a real markdown detail doc (the S-90 measurement), and
 * selection-follow. The pty probe drives keys; this file reports the
 * S-90 measurement unconditionally to a log file.
 *
 * Keys: g swaps list size · f+letters filter live · END/HOME move the
 * selection · q quits.
 */
import { appendFileSync } from "node:fs";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useEffect, useRef, useState } from "react";

const LOG = "/tmp/react-spike.log";
const log = (m: string) => appendFileSync(LOG, m + "\n");

const makeSkills = (n: number) =>
  Array.from({ length: n }, (_, i) => `skill-${String(i + 1).padStart(3, "0")}`);
const DOC = Array.from({ length: 80 }, (_, i) => `Doc line ${i + 1} — markdown content for the S-90 measurement`).join("\n\n");

interface State {
  count: number;
  filter: string;
  selected: number;
}

function App({ state, setState }: { state: State; setState: (fn: (s: State) => State) => void }) {
  const detailRef = useRef<any>(null);

  useKeyboard((key: { name: string }) => {
    const k = key.name;
    if (k === "q") process.exit(0);
    if (k === "g") setState((s) => ({ ...s, count: s.count === 2 ? 390 : 2, selected: 0, filter: "" }));
    else if (k === "f") setState((s) => ({ ...s })); // filter mode marker: typing below
    else if (k === "end") setState((s) => ({ ...s, selected: Math.max(0, visible(s).length - 1) }));
    else if (k === "home") setState((s) => ({ ...s, selected: 0 }));
    else if (k === "up") setState((s) => ({ ...s, selected: Math.max(0, s.selected - 1) }));
    else if (k === "down") setState((s) => ({ ...s, selected: Math.min(visible(s).length - 1, s.selected + 1) }));
    else if (k === "backspace") setState((s) => ({ ...s, filter: s.filter.slice(0, -1), selected: 0 }));
    else if (k.length === 1 && /[a-z0-9-]/i.test(k)) setState((s) => ({ ...s, filter: s.filter + k, selected: 0 }));
  });

  const rows = visible(state);

  // S-90 measurement + selection follow: after React commits, read the
  // detail ScrollBox's real geometry and keep the cursor row in view —
  // WITHOUT any manual requestRender.
  useEffect(() => {
    const scroll = detailRef.current;
    if (scroll?.scrollHeight !== undefined) {
      log(`MEASURE vs=${scroll.viewport?.height} h=${scroll.scrollHeight}`);
    }
  }, [state.count]);

  return (
    <box width="100%" height="100%" flexDirection="column">
      <box width="100%" flexShrink={0} flexDirection="row" paddingLeft={1}>
        <box flexDirection="row" gap={2}>
          <text>❯ Installed   Search   Settings</text>
        </box>
        <box flexDirection="row">
          <text> [{state.count === 390 ? "g" : "p"}] {state.count === 390 ? "global" : "project"}</text>
        </box>
      </box>
      <box width="100%" flexGrow={1} flexShrink={1} minHeight={0} flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
        <box
          width="42%"
          flexDirection="column"
          border={true}
          borderStyle="rounded"
          title={` filter: ${state.filter || "(type)"}▌ · ${rows.length} skills `}
        >
          {/* variant B: the app's proven shape — the live text lives in the
              border TITLE, not as a bare text above the scroll */}
          <scrollbox width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
            {rows.map((name, i) => (
              <text key={name} fg={i === state.selected ? "#ffffff" : "#a5adcb"}>
                {i === state.selected ? "❯ " : "  "}
                {name}
              </text>
            ))}
          </scrollbox>
        </box>
        <box flexGrow={1} flexShrink={1} flexDirection="column" border={true} borderStyle="rounded" title={` ${rows[state.selected] ?? "detail"} `}>
          <scrollbox ref={detailRef} width="100%" flexGrow={1} flexShrink={1} scrollY={true}>
            <markdown content={DOC} />
          </scrollbox>
          <text> {rows.length} skills · spike</text>
        </box>
      </box>
      <box width="100%" flexShrink={0} flexDirection="row" paddingLeft={1}>
        <box flexDirection="row">
          <text>q quit · g swap list · f/letters filter · END/HOME · up/down</text>
        </box>
      </box>
    </box>
  );
}

function visible(s: State): string[] {
  return makeSkills(s.count).filter((n) => n.includes(s.filter));
}

const renderer = await createCliRenderer({ exitOnCtrlC: true });
let state: State = { count: 2, filter: "", selected: 0 };
const setState = (fn: (s: State) => State) => {
  state = fn(state);
  root.render(<App state={state} setState={setState} />);
};
const root = createRoot(renderer);
root.render(<App state={state} setState={setState} />);
log("SPIKE-START");

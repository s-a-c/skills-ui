# skills-ui

TUI and WebUI wrapper for the `skills` CLI, providing a unified two-pane workspace over a local HTTP API and terminal renderer.

## Language

### Layout & Containers

**Frame**:
The root viewport container of the application (`<main>` below the header in the WebUI, or the body flex row between Header and Footer in the TUI) that holds the Filter List Panel and the Detail Panel side by side.
_Avoid_: Window, page body, canvas, screen

**Filter List Panel**:
The left-hand pane of the Frame (`#listPane` in WebUI, the left bordered box in TUI `InstalledBody` and `SearchBody`) that hosts filter/search inputs, sort controls, selection summary, and the scrollable list of Filter List Cards. Its width is user-adjustable between `10%` and `50%` of the Frame width (default `35%`).
_Avoid_: Sidebar, left rail, master pane, drawer

**Detail Panel**:
The right-hand pane of the Frame (`#detailPane` in WebUI, the right bordered box in TUI) that displays metadata, action controls, sibling repository skills, and rendered `SKILL.md` documentation for the currently focused Filter List Card.
_Avoid_: Preview pane, inspector, right column, modal

### Filter List Cards & Anatomy

**Filter List Card**:
An individual selectable row item inside the Filter List Panel representing either an installed skill (`#skillList li` / TUI Installed row) or a registry search result (`#results li` / TUI Search row).
_Avoid_: Tile, list box, entry, cell

**Name-Checkbox Unit**:
The unbreakable leading inline group on a Filter List Card consisting of the selection checkbox (or TUI check/cursor indicator), optional status dot, and the skill name. The checkbox and skill name never wrap onto separate lines; when constrained, the skill name truncates with an ellipsis on the same line as the checkbox while secondary badges wrap below.
_Avoid_: Card header, title row, prefix

**Penultimate Card Line**:
The secondary metadata or description line on a Filter List Card immediately preceding the card's trailing actions or chips (for example, the repository `owner/repo` source on Search cards or the skill description on Installed cards). Its text is always left-justified.
_Avoid_: Subtitle, caption, subtext

**Contiguous Action Group**:
The non-breaking, right-justified group of action buttons on a Filter List Card (such as `+ Add to list` and `Install` on Search cards). It occupies the last line of the card when horizontal space is tight and merges onto the Penultimate Card Line (right-justified) when the card is wide enough to fit both without wrapping individual buttons.
_Avoid_: Button bar, toolbar, card footer

### Provenance, Hooks & Health

**Skill Provenance**:
The filesystem and lockfile origin of an installed skill (`locked`, `linked`, or `local`), determined from `lstat(skill.path)` and the active lockfile (`readLock(scope)`). `locked` identifies a real directory tracked in the lockfile, `linked` identifies a filesystem symlink (such as an externally linked framework skill), and `local` identifies an untracked real directory absent from the lockfile. Removal of `linked` or `local` skills requires explicit confirmation in both WebUI and TUI.
_Avoid_: Source type, origin tag, ownership flag

**Post-Mutation Hook**:
An optional executable path supplied solely via the host process environment variable `SKILLS_UI_POST_MUTATION_HOOK` (never configurable via HTTP or `prefs.json`), invoked directly via `Bun.spawn` without a shell after successful `install`, `remove`, or `update` mutations. Failures surface as non-fatal warning toasts and response telemetry rather than reverting the `skills` CLI change.
_Avoid_: Shell callback, lifecycle script, webhook

**Health Pill**:
The compact status indicator in the application header driven by host-env `SKILLS_UI_HEALTH_CMD` via `GET /api/health-check` (and hidden completely when `SKILLS_UI_HEALTH_CMD` is unset). It refreshes automatically after mutations and toggles a read-only detail view on click in the WebUI or `H` in the TUI.
_Avoid_: Status banner, telemetry widget, diagnostics modal

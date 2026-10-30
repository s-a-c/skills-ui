/**
 * Terminal-escape and control-character scrubbing for every string that
 * originates outside the wrapper (0.5.1 impl D): the `skills` CLI's output,
 * lockfile metadata, SKILL.md content, and registry responses all cross a
 * trust boundary and must never carry escape sequences into a TUI or web
 * sink. CWE-150 defense; regex set ported from the original search-side
 * sanitizer (search.ts, S-138 era).
 */

const CSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g; // CSI …m / …H etc.
const C1_CSI_RE = /\u009b[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g; // C1 CSI (8-bit form)
const OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g; // OSC …(BEL|ST)
const DCS_RE = /\x1b[P^_][\s\S]*?(?:\x1b\\)/g; // DCS/PM/APC …ST
const SIMPLE_ESCAPE_RE = /\x1b[\x20-\x7e]/g; // two-byte escapes
// C0 + C1 controls minus \t (\x09) and \n (\x0a)
const CONTROL_RE = /[\x00-\x08\x0b-\x1f\x7f\x80-\x9f]/g;

export function stripEscapes(str: string): string {
  return str
    .replace(OSC_RE, "")
    .replace(DCS_RE, "")
    .replace(CSI_RE, "")
    .replace(C1_CSI_RE, "")
    .replace(SIMPLE_ESCAPE_RE, "");
}

/**
 * Single-line metadata — names, descriptions, errors, CLI output destined
 * for toasts: escapes and controls stripped, line breaks collapsed.
 */
export function sanitizeMetadata(str: string): string {
  return stripEscapes(str).replace(CONTROL_RE, "").replace(/[\r\n]+/g, " ").trim();
}

/**
 * Multi-line bodies — SKILL.md rendered as markdown: escapes and controls
 * stripped, structure (newlines, tabs) preserved.
 */
export function sanitizeBody(str: string): string {
  return stripEscapes(str).replace(CONTROL_RE, "");
}

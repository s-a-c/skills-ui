/**
 * Single source of truth for the installed-skill filter predicate (F1
 * filter parity, S-164): BOTH surfaces run this match set — name, source,
 * each agent, then description as the secondary match. The web embeds
 * SKILL_MATCHES_SRC (this function's transpiled source) inside APP_JS and
 * calls it from filteredSkills(); the TUI applies the identical match order
 * inside visibleSkills (src/tui/model.ts). tests/filter-parity.test.ts runs
 * the same fixtures through both surfaces and asserts identical results.
 *
 * Constraints: no backticks, no template literals, no regex literals in the
 * body — the toString() output is interpolated verbatim into the APP_JS
 * template literal, and node --check (page-hardening) must accept the page.
 */
export function skillMatches(
  skill: { name: string; description?: string | null; source?: string | null; agents: string[] },
  needle: string
): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    skill.name.toLowerCase().includes(q) ||
    (skill.source != null && skill.source.toLowerCase().includes(q)) ||
    skill.agents.some((a) => a.toLowerCase().includes(q)) ||
    (skill.description != null && skill.description.toLowerCase().includes(q))
  );
}

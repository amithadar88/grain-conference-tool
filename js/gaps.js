// Gaps: measures the TEAM'S PLAN (status/reps), not just which events exist on the list.
// "Where are we under-invested" needs to know what's actually staffed, not just what's real.
import { scoreAll, inWindow, windowMonths, REGIONS, CORE_VERTICALS, WINDOW } from './scoring.js';

const isAB = (s) => ['A+', 'A', 'B'].includes(s.tier);
const isTopTier = (s) => ['A+', 'A'].includes(s.tier);

function quarterOf(iso) {
  const q = Math.floor((+iso.slice(5, 7) - 1) / 3) + 1;
  return `${iso.slice(0, 4)} Q${q}`;
}

// "2026 Q3" -> "2026-09-30" (the quarter's last calendar day). Passing the 0-indexed
// month right after the quarter's last month with day 0 rolls back to that last day,
// handling variable month lengths (and Q4 rolling into next year) for free.
export function quarterEndDate(quarter) {
  const [year, qtr] = quarter.split(' ');
  const d = new Date(Date.UTC(+year, +qtr.slice(1) * 3, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Every quarter touched by the window, in chronological order (may include a partial
// quarter at either end — that's fine, it only ever looks at the months actually in scope).
function quartersInWindow(win) {
  const seen = [];
  for (const ym of windowMonths(win)) {
    const q = quarterOf(`${ym}-01`);
    if (!seen.includes(q)) seen.push(q);
  }
  return seen;
}

/**
 * store: the app store (conferences() + conferencePlan()). win unused directly but kept
 * for symmetry with the other Today/Plan selectors. Deliberately takes no `today`: which
 * gaps exist is a fact about the data, independent of the date; "is this quarter still
 * worth flagging" is a display decision the view layer makes (quarterLines(gaps, today)
 * drops one ending within 30 days — nothing left to act on).
 * Every gap carries the scored events behind it, not just a count or a name, so the view
 * layer can state a fact ("N events, none marked Going") and name the highest-scored
 * options — never a label the data can't prove, and never a C/D option (that would
 * contradict our own tiers: "highest-scored" only ever means A+/A/B). Returns:
 *   unassigned: top-tier (A+/A) events in the window with nobody assigned, earliest first.
 *   verticals: [{ vertical, events }] — core verticals with an A/B event but none marked
 *     Going, events (already A/B by definition) sorted highest-scored first.
 *   quarters: [{ quarter, options }] — quarters (in the window) with no Going event at
 *     all (checked against every event, any tier); options is the A+/A/B events in that
 *     quarter, highest-scored first — may be empty if the quarter's only events are C/D.
 *   regionNames: regions with no A-tier event at all.
 *   regionOptions: the A+/A/B events (any of those regions), highest-scored first —
 *     paired with regionNames for "highest-scored options there"; may be empty.
 *   quietMonths: months with no A/B event at all.
 */
export function computeGaps(store, win = WINDOW) {
  const scored = scoreAll(store.conferences());
  const inWin = scored.filter((s) => inWindow(s.conf, win));
  const planOf = (id) => store.conferencePlan(id);
  const byScoreDesc = (a, b) => b.score - a.score;

  const unassigned = inWin
    .filter((s) => isTopTier(s) && !planOf(s.id).reps.length)
    .sort((a, b) => a.conf.startDate.localeCompare(b.conf.startDate));

  const verticals = CORE_VERTICALS
    .map((vertical) => {
      const events = inWin.filter((s) => isAB(s) && (s.conf.verticals || []).includes(vertical));
      if (!events.length || events.some((s) => planOf(s.id).status === 'going')) return null;
      return { vertical, events: [...events].sort(byScoreDesc) };
    })
    .filter(Boolean);

  const quarters = quartersInWindow(win)
    .map((quarter) => {
      const events = inWin.filter((s) => quarterOf(s.conf.startDate) === quarter);
      if (events.some((s) => planOf(s.id).status === 'going')) return null;
      return { quarter, options: events.filter(isAB).sort(byScoreDesc) };
    })
    .filter(Boolean);

  const regionNames = REGIONS.filter((r) => !inWin.some((s) => s.conf.region === r && isTopTier(s)));
  const regionOptions = inWin.filter((s) => regionNames.includes(s.conf.region) && isAB(s)).sort(byScoreDesc);

  const quietMonths = windowMonths(win).filter((ym) => !inWin.some((s) => s.conf.startDate.slice(0, 7) === ym && isAB(s)));

  return { unassigned, verticals, quarters, regionNames, regionOptions, quietMonths };
}

// Gaps: measures the TEAM'S PLAN (status/reps), not just which events exist on the list.
// "Where are we under-invested" needs to know what's actually staffed, not just what's real.
import { scoreAll, inWindow, windowMonths, REGIONS, CORE_VERTICALS, WINDOW } from './scoring.js';

const isAB = (s) => ['A+', 'A', 'B'].includes(s.tier);
const isTopTier = (s) => ['A+', 'A'].includes(s.tier);

function quarterOf(iso) {
  const q = Math.floor((+iso.slice(5, 7) - 1) / 3) + 1;
  return `${iso.slice(0, 4)} Q${q}`;
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
 * store: the app store (conferences() + conferencePlan()). today/win unused directly but
 * kept for symmetry with the other Today/Plan selectors and future "as of" filtering.
 * Returns:
 *   unassigned: top-tier (A+/A) events in the window with nobody assigned — actionable, links out.
 *   verticals: core verticals with an A/B event but none of them marked Going — actionable.
 *   quarters: quarters (in the window) with no Going event at all — actionable.
 *   regions: regions with no A-tier event at all — secondary "market" note (about the events, not the plan).
 *   quietMonths: months with no A/B event — informational ("quiet season"), never a problem.
 */
export function computeGaps(store, win = WINDOW) {
  const scored = scoreAll(store.conferences());
  const inWin = scored.filter((s) => inWindow(s.conf, win));
  const planOf = (id) => store.conferencePlan(id);

  const unassigned = inWin
    .filter((s) => isTopTier(s) && !planOf(s.id).reps.length)
    .sort((a, b) => a.conf.startDate.localeCompare(b.conf.startDate));

  const verticals = CORE_VERTICALS.filter((v) => {
    const hasAB = inWin.some((s) => isAB(s) && (s.conf.verticals || []).includes(v));
    const hasGoing = inWin.some((s) => isAB(s) && (s.conf.verticals || []).includes(v) && planOf(s.id).status === 'going');
    return hasAB && !hasGoing;
  });

  const quarters = quartersInWindow(win)
    .filter((q) => !inWin.some((s) => quarterOf(s.conf.startDate) === q && planOf(s.id).status === 'going'));

  const regions = REGIONS.filter((r) => !inWin.some((s) => s.conf.region === r && isTopTier(s)));

  const quietMonths = windowMonths(win).filter((ym) => !inWin.some((s) => s.conf.startDate.slice(0, 7) === ym && isAB(s)));

  return { unassigned, verticals, quarters, regions, quietMonths };
}

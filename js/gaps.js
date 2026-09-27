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
 * Every gap carries the scored events behind it, not just a count or a name, so the view
 * layer can state a fact ("N events, none marked Going") and name the highest-scored
 * options — never a label the data can't prove. Returns:
 *   unassigned: top-tier (A+/A) events in the window with nobody assigned, earliest first.
 *   verticals: [{ vertical, events }] — core verticals with an A/B event but none marked
 *     Going, events sorted highest-scored first.
 *   quarters: [{ quarter, events }] — quarters (in the window) with no Going event at all;
 *     events is everything in that quarter (any tier), highest-scored first, so the view
 *     can point at the best options even though none are staffed yet.
 *   regionNames: regions with no A-tier event at all.
 *   regionEvents: every event (any tier) in one of those regions, highest-scored first —
 *     paired with regionNames for "highest-scored options there".
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
      return { quarter, events: [...events].sort(byScoreDesc) };
    })
    .filter(Boolean);

  const regionNames = REGIONS.filter((r) => !inWin.some((s) => s.conf.region === r && isTopTier(s)));
  const regionEvents = inWin.filter((s) => regionNames.includes(s.conf.region)).sort(byScoreDesc);

  const quietMonths = windowMonths(win).filter((ym) => !inWin.some((s) => s.conf.startDate.slice(0, 7) === ym && isAB(s)));

  return { unassigned, verticals, quarters, regionNames, regionEvents, quietMonths };
}

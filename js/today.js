// Pure selection logic for the Today page: "what should the rep do right now?" No DOM.
import { relationshipSignal, isActNow, actNowReason, withEncounterContact } from './signals.js';
import { scoreAll, dayNumber } from './scoring.js';

// Contacts whose rules label is Warming, or whose saved AI summary overrides to act-now.
// Sorted most-recently-met first.
export function actNowRows(store, today) {
  return store.people()
    .map((p) => {
      const encounters = store.encountersFor(p.id);
      if (!encounters.length) return null;
      const person = withEncounterContact(p, encounters);
      const signal = relationshipSignal(encounters, today);
      const ai = store.aiSummary(p.id);
      return { person, encounters, signal, ai, reason: actNowReason(signal, ai, encounters) };
    })
    .filter((r) => r && isActNow(r.signal, r.ai))
    .sort((a, b) => b.encounters.at(-1).date.localeCompare(a.encounters.at(-1).date));
}

// Events staffed (Going/Considering) within the window, nearest first; if none, the next
// A+/A events with no status yet, so the rep has something concrete to decide on.
export function comingUpRows(store, today, windowDays = 60) {
  const withStatus = (s) => ({ ...s, plan: store.conferencePlan(s.id), daysUntil: dayNumber(s.conf.startDate) - dayNumber(today) });
  const scored = scoreAll(store.conferences()).map(withStatus).filter((s) => s.daysUntil >= 0);

  const planned = scored.filter((s) => s.daysUntil <= windowDays && ['going', 'considering'].includes(s.plan.status))
    .sort((a, b) => a.daysUntil - b.daysUntil);
  if (planned.length) return { mode: 'planned', items: planned };

  const undecided = scored.filter((s) => ['A+', 'A'].includes(s.tier) && !s.plan.status)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return { mode: 'decide', items: undecided };
}

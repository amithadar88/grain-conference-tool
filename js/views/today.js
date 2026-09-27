// Today tab: the default landing page. "What should I do right now?" — all rules-based
// except the follow-up draft button, which reuses the same AI call as the contact page.
import { actNowRows, comingUpRows, yourNextTrip, nextTeamTrips } from '../today.js';
import { scoreAll } from '../scoring.js';
import { computeGaps } from '../gaps.js';
import { peopleYouKnow } from '../eventHistory.js';
import { staffingChip } from './plan.js';
import { renderFollowup } from './followup.js';
import { esc, fmtRange, signalClass, tierClass } from './ui.js';

const GUIDE_STEPS = [
  {
    text: 'Open Ahmed Hassan and generate the AI summary: it disagrees with the rules',
    find: (store) => store.people().find((p) => p.name === 'Ahmed Hassan'),
    href: (p) => `#contacts/${encodeURIComponent(p.id)}`,
  },
  { text: 'Go to Capture and type "dana levy"', find: () => true, href: () => '#capture' },
  {
    text: 'Open "Why A+?" on any event',
    find: (store) => scoreAll(store.conferences()).find((s) => s.tier === 'A+'),
    href: (s) => `#events/${encodeURIComponent(s.id)}`,
  },
];

function guideHTML(store) {
  if (store.guideDismissed()) return '';
  const items = GUIDE_STEPS.map((s) => {
    const found = s.find(store);
    return found ? `<li><a href="${s.href(found)}">${esc(s.text)}</a></li>` : '';
  }).filter(Boolean);
  if (!items.length) return '';
  return `<div class="box guide" id="guide"><b>New here? Try this</b><ol>${items.join('')}</ol>
    <button class="link" type="button" id="guide-dismiss">Dismiss</button></div>`;
}

function actNowHTML(rows) {
  if (!rows.length) return '<div class="box"><b>Act now</b><p class="hint">Nothing urgent right now.</p></div>';
  return `<div class="box"><b>Act now</b><ul class="rows">${rows.map((r, i) => `<li>
      <b>${esc(r.person.name)}</b> · ${esc(r.person.company || '')}
      <div><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
      ${r.ai && r.ai.label !== r.signal.label ? `<span class="sig ${signalClass(r.ai.label)}">AI: ${esc(r.ai.label)}</span>` : ''}</div>
      <p class="hint">${esc(r.reason)}</p>
      <div class="row">
        <a class="btn" href="#contacts/${encodeURIComponent(r.person.id)}">Open</a>
        <span class="fu" data-fu="${i}"></span>
      </div>
    </li>`).join('')}</ul></div>`;
}

// One trip row. Personal view excludes me from the "who else" line; team view lists everyone.
function tripMiniHTML(store, today, trip, showAllReps) {
  const reps = showAllReps ? trip.plan.reps : trip.plan.reps.filter((r) => r !== store.settings().me);
  const known = peopleYouKnow(trip.conf, store, today).length;
  return `<a class="mini next-trip tier-${tierClass(trip.tier)}" href="#events/${encodeURIComponent(trip.id)}">
    <b>${esc(trip.conf.name)}</b> <span class="muted">in ${trip.daysUntil} day${trip.daysUntil === 1 ? '' : 's'}</span>
    <small>${esc(fmtRange(trip.conf.startDate, trip.conf.endDate))} · ${esc(trip.conf.city)}</small>
    ${reps.length ? `<div class="hint">${showAllReps ? 'Going' : 'Also going'}: ${esc(reps.join(', '))}</div>` : ''}
    ${known ? `<div class="hint">👥 ${known} from a previous edition</div>` : ''}
  </a>`;
}

// Signed-in rep: their own next trip. Team-wide view (nobody signed in): the next few
// trips anyone on the team has, instead of one person's.
function highlightBlock(store, today) {
  const me = store.settings().me;
  if (me) {
    const trip = yourNextTrip(store, today);
    return trip ? { label: 'Your next trip', html: tripMiniHTML(store, today, trip, false), ids: [trip.id] } : { label: '', html: '', ids: [] };
  }
  const trips = nextTeamTrips(store, today);
  return trips.length
    ? { label: 'Next team trips', html: trips.map((t) => tripMiniHTML(store, today, t, true)).join(''), ids: trips.map((t) => t.id) }
    : { label: '', html: '', ids: [] };
}

function tripRowHTML(store, today, s) {
  const chip = staffingChip(s.plan);
  const known = peopleYouKnow(s.conf, store, today).length;
  return `<a class="mini tier-${tierClass(s.tier)}" href="#events/${encodeURIComponent(s.id)}">
    <b>${esc(s.conf.name)}</b> <span class="muted">in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'}</span>
    <small>${esc(fmtRange(s.conf.startDate, s.conf.endDate))} · ${esc(s.conf.city)}${known ? ` · 👥 ${known} from a previous edition` : ''}</small>
    ${chip ? `<span class="staff staff-${chip.kind}">${esc(chip.text)}</span>` : ''}
  </a>`;
}

function comingUpHTML(store, today) {
  const me = store.settings().me;
  const { label, html, ids } = highlightBlock(store, today);
  const { mode, items: rawItems } = comingUpRows(store, today);
  const idSet = new Set(ids);
  const items = rawItems.filter((s) => !idSet.has(s.id));
  if (!items.length && !html) return '<div class="box"><b>Coming up</b><p class="hint">Nothing planned in the next 60 days, and no A/A+ events waiting on a decision.</p></div>';

  // Signed-in rep, and there's a real "planned" list (not the undecided-events fallback,
  // where nothing is assigned to anyone yet): split into what's mine vs. everyone else's,
  // so "Coming up" stops reading as one mixed pile. Each event lands in exactly one group.
  if (me && mode === 'planned') {
    const mine = items.filter((s) => s.plan.reps.includes(me));
    const rest = items.filter((s) => !s.plan.reps.includes(me));
    return `<div class="box"><b>Your trips</b>
      ${html ? `<p class="subhead">✈️ ${esc(label)}</p>${html}` : ''}
      ${mine.length ? `<div class="rows">${mine.map((s) => tripRowHTML(store, today, s)).join('')}</div>`
        : (html ? '' : '<p class="hint">No other upcoming trips assigned to you.</p>')}
      <p class="subhead">Rest of the team</p>
      ${rest.length ? `<div class="rows">${rest.map((s) => tripRowHTML(store, today, s)).join('')}</div>`
        : '<p class="hint">Nothing else planned in the next 60 days.</p>'}
    </div>`;
  }

  const title = mode === 'planned' ? 'Coming up' : 'Coming up — nothing staffed yet, decide on these';
  return `<div class="box"><b>${title}</b>
    ${html ? `<p class="subhead">✈️ ${esc(label)}</p>${html}` : ''}
    <div class="rows">${items.map((s) => tripRowHTML(store, today, s)).join('')}</div></div>`;
}

// Short: only the actionable lines (unassigned top events, unstaffed verticals, empty
// quarters). Market notes and "quiet season" are secondary — see them in full on Plan.
function gapsHTML(store) {
  const gaps = computeGaps(store);
  const lines = [];
  if (gaps.unassigned.length) {
    lines.push(`${gaps.unassigned.length} top event${gaps.unassigned.length === 1 ? '' : 's'} (A+/A) with nobody assigned: ${
      gaps.unassigned.map((s) => `<a href="#events/${encodeURIComponent(s.id)}">${esc(s.conf.name)}</a>`).join(', ')}`);
  }
  if (gaps.verticals.length) lines.push(`No Going event yet for: ${esc(gaps.verticals.join(', '))}`);
  if (gaps.quarters.length) lines.push(`No Going event at all in: ${esc(gaps.quarters.join(', '))}`);
  return `<div class="box"><b>Plan gaps</b>
    ${lines.length ? `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : '<p class="hint">No gaps in the plan right now.</p>'}
    <p><a href="#plan">See Plan →</a></p></div>`;
}

export function render(el, ctx) {
  const { store } = ctx;
  const rows = actNowRows(store, ctx.today);

  el.innerHTML = `<section class="view">
    <h2>Today</h2>
    ${guideHTML(store)}
    ${actNowHTML(rows)}
    ${comingUpHTML(store, ctx.today)}
    ${gapsHTML(store)}
  </section>`;

  el.querySelector('#guide-dismiss')?.addEventListener('click', () => {
    store.dismissGuide();
    el.querySelector('#guide').remove();
  });

  rows.forEach((r, i) => {
    const slot = el.querySelector(`[data-fu="${i}"]`);
    if (slot) renderFollowup(slot, ctx, r);
  });
}

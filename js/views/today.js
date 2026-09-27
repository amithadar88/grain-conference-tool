// Today tab: the default landing page. "What should I do right now?" — all rules-based
// except the follow-up draft button, which reuses the same AI call as the contact page.
import { actNowRows, comingUpRows, yourNextTrip, nextTeamTrips } from '../today.js';
import { computeGaps } from '../gaps.js';
import { peopleYouKnow, peopleYouKnowLabel } from '../eventHistory.js';
import { staffingChip, unassignedLine, verticalLines, quarterLines } from './plan.js';
import { renderFollowup } from './followup.js';
import { esc, fmtRange, signalClass, tierClass } from './ui.js';

// Onboarding, not an evaluator crib sheet: static copy about what each section does,
// no lookups against demo data.
const WELCOME_ROWS = [
  { title: 'Events', desc: "Every conference scored for Grain's ICP, with the reasons behind each score.", link: 'Browse events', href: '#events' },
  { title: 'Plan', desc: "Who covers what across the year, and where we're under-invested.", link: 'Open the plan', href: '#plan' },
  { title: 'Capture', desc: "Log a lead in seconds on the show floor, even offline. It recognizes people you've met before.", link: 'Capture a lead', href: '#capture' },
  { title: 'Contacts', desc: 'See which relationships are warming up and which are just listening, with an AI read of your notes.', link: 'View contacts', href: '#contacts' },
];

// Collapsed by default to save space on mobile; kept between tab switches like Events'
// and Plan's own filter state, not persisted (a reappeared card — after Reset demo data —
// always starts collapsed again).
let guideExpanded = false;

function guideHTML(store) {
  if (store.guideDismissed()) return '';
  const rows = guideExpanded
    ? `<ul class="welcome-rows">${WELCOME_ROWS.map((r) => `<li>
        <div><b>${esc(r.title)}</b> <span class="hint">${esc(r.desc)}</span></div>
        <a href="${esc(r.href)}">${esc(r.link)} →</a>
      </li>`).join('')}</ul>
      <div class="guide-foot"><button type="button" class="btn-gotit" id="guide-dismiss-bottom">Got it!</button></div>`
    : '';
  return `<div class="box guide" id="guide">
    <div class="guide-head">
      <b>Welcome to Grain Conferences</b>
      <button type="button" class="guide-close" id="guide-dismiss" aria-label="Dismiss">×</button>
    </div>
    <button type="button" class="link" id="guide-toggle">${guideExpanded ? 'Hide' : 'See what this tool does'}</button>
    ${rows}
  </div>`;
}

// A plain class of its own (not the "rows" list Contacts uses for whole-row-is-a-link
// cards): each act-now row has its own inline "Open" button alongside "Draft follow-up",
// which would otherwise collide with Contacts' ".rows li a { display: block }" card rule
// and get forced full-width (that was the actual bug — the two rules were never meant to
// share a class).
function actNowHTML(rows) {
  if (!rows.length) return '<div class="box"><b>Act now</b><p class="hint">Nothing urgent right now.</p></div>';
  return `<div class="box"><b>Act now</b><ul class="act-rows">${rows.map((r, i) => `<li>
      <div class="an-head"><b>${esc(r.person.name)}</b> <span class="muted">· ${esc(r.person.company || '')}</span></div>
      <div class="an-signals"><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
      ${r.ai && r.ai.label !== r.signal.label ? `<span class="sig ${signalClass(r.ai.label)}">AI: ${esc(r.ai.label)}</span>` : ''}</div>
      <p class="hint an-reason">${esc(r.reason)}</p>
      <div class="an-actions">
        <a class="btn" href="#contacts/${encodeURIComponent(r.person.id)}">Open</a>
        <span class="fu" data-fu="${i}"></span>
      </div>
    </li>`).join('')}</ul></div>`;
}

// One trip row. Personal view excludes me from the "who else" line; team view lists everyone.
function tripMiniHTML(store, today, trip, showAllReps) {
  const reps = showAllReps ? trip.plan.reps : trip.plan.reps.filter((r) => r !== store.settings().me);
  const knownLabel = peopleYouKnowLabel(peopleYouKnow(trip.conf, store, today));
  return `<a class="mini next-trip tier-${tierClass(trip.tier)}" href="#events/${encodeURIComponent(trip.id)}">
    <b>${esc(trip.conf.name)}</b> <span class="muted">in ${trip.daysUntil} day${trip.daysUntil === 1 ? '' : 's'}</span>
    <small>${esc(fmtRange(trip.conf.startDate, trip.conf.endDate))} · ${esc(trip.conf.city)}</small>
    ${reps.length ? `<div class="hint">${showAllReps ? 'Going' : 'Also going'}: ${esc(reps.join(', '))}</div>` : ''}
    ${knownLabel ? `<div class="hint">${knownLabel}</div>` : ''}
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
  const knownLabel = peopleYouKnowLabel(peopleYouKnow(s.conf, store, today));
  return `<a class="mini tier-${tierClass(s.tier)}" href="#events/${encodeURIComponent(s.id)}">
    <b>${esc(s.conf.name)}</b> <span class="muted">in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'}</span>
    <small>${esc(fmtRange(s.conf.startDate, s.conf.endDate))} · ${esc(s.conf.city)}${knownLabel ? ` · ${knownLabel}` : ''}</small>
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
// quarters), same fact+action phrasing as the full list on Plan (shared with plan.js so
// the two pages never say the same gap two different ways). Regions/months are Plan-only.
function gapsHTML(store, today) {
  const gaps = computeGaps(store);
  const lines = [unassignedLine(gaps), ...verticalLines(gaps), ...quarterLines(gaps, today)].filter(Boolean);
  return `<div class="box"><b>Plan gaps</b>
    ${lines.length ? `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : '<p class="hint">No gaps in the plan right now.</p>'}
    <p><a href="#plan">See Plan →</a></p></div>`;
}

export function render(el, ctx) {
  const { store } = ctx;
  const rows = actNowRows(store, ctx.today);

  el.innerHTML = `<section class="view">
    <h2>Today</h2>
    <div id="guide-wrap">${guideHTML(store)}</div>
    ${actNowHTML(rows)}
    ${comingUpHTML(store, ctx.today)}
    ${gapsHTML(store, ctx.today)}
  </section>`;

  const guideWrap = el.querySelector('#guide-wrap');
  const dismissGuide = () => { guideExpanded = false; store.dismissGuide(); drawGuide(); };
  function drawGuide() {
    guideWrap.innerHTML = guideHTML(store);
    guideWrap.querySelector('#guide-dismiss')?.addEventListener('click', dismissGuide);
    guideWrap.querySelector('#guide-dismiss-bottom')?.addEventListener('click', dismissGuide);
    guideWrap.querySelector('#guide-toggle')?.addEventListener('click', () => { guideExpanded = !guideExpanded; drawGuide(); });
  }
  drawGuide();

  rows.forEach((r, i) => {
    const slot = el.querySelector(`[data-fu="${i}"]`);
    if (slot) renderFollowup(slot, ctx, r);
  });
}

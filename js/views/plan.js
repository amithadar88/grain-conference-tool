// Plan tab: 13-month timeline by tier, clusters, status/rep, and a gaps list that
// measures the team's plan (not just which events exist).
import { scoreAll, windowMonths, monthLabel, inWindow } from '../scoring.js';
import { computeGaps } from '../gaps.js';
import { peopleYouKnow } from '../eventHistory.js';
import { esc, fmtRange, tierClass } from './ui.js';
import { clusterBadgeHTML, eventCardHTML, bindEventCardControls } from './eventCard.js';

// Every Gaps line states a fact from the data and, where one exists, a concrete next
// step with named events — never a label or interpretation the data can't prove (no
// "quiet season", no editorializing). At most 3 named events per line, so a big gap
// still reads as one short sentence; the count in the sentence is the true total.
const VERTICAL_LABELS = { payments: 'Payments', 'cross-border': 'Cross-border', travel: 'Travel', treasury: 'Treasury', fx: 'FX' };

const eventLink = (s) => `<a href="#events/${encodeURIComponent(s.id)}">${esc(s.conf.name)}</a>`;
const namedEvents = (events, max = 3) => events.slice(0, max).map(eventLink).join(', ');
const scoredEvents = (events, max = 3) => events.slice(0, max)
  .map((s) => `<a href="#events/${encodeURIComponent(s.id)}">${esc(s.conf.name)} (${esc(s.tier)} ${s.score})</a>`).join(', ');
// "2027 Q2" (internal, sorts chronologically) -> "Q2 2027" (how a rep reads a quarter).
const quarterLabel = (q) => { const [year, qtr] = q.split(' '); return `${qtr} ${year}`; };

export function unassignedLine(gaps) {
  if (!gaps.unassigned.length) return '';
  const n = gaps.unassigned.length;
  return `${n} A+/A event${n === 1 ? '' : 's'} with nobody assigned: ${namedEvents(gaps.unassigned)}. Assign someone or mark Skip.`;
}

export function verticalLines(gaps) {
  return gaps.verticals.map((v) => {
    const n = v.events.length;
    const label = VERTICAL_LABELS[v.vertical] || v.vertical;
    return `${esc(label)}: ${n} A/B event${n === 1 ? '' : 's'}, none marked Going: ${namedEvents(v.events)}.`;
  });
}

export function quarterLines(gaps) {
  return gaps.quarters.map((q) => {
    const options = q.events.length ? ` Highest-scored options: ${scoredEvents(q.events)}.` : '';
    return `${quarterLabel(q.quarter)}: no events marked Going.${options}`;
  });
}

export function regionsLine(gaps) {
  if (!gaps.regionNames.length) return '';
  const options = gaps.regionEvents.length ? ` Highest-scored there: ${scoredEvents(gaps.regionEvents)}.` : '';
  return `No A-tier events in ${esc(gaps.regionNames.join(', '))}.${options}`;
}

export function monthsLine(gaps) {
  if (!gaps.quietMonths.length) return '';
  return `No A/B events in: ${gaps.quietMonths.map(monthLabel).join(', ')}.`;
}

// Full detail: every applicable line, equal weight (no more "actionable" vs. "market
// notes" split — a region or month gap is as much a fact as an unassigned event).
export function gapsHTML(gaps) {
  const lines = [unassignedLine(gaps), ...verticalLines(gaps), ...quarterLines(gaps), regionsLine(gaps), monthsLine(gaps)].filter(Boolean);
  return `<b>Gaps</b>${lines.length ? `<ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : '<p class="hint">No gaps in the plan right now.</p>'}`;
}

const STATUS_TEXT = { going: '✓ Going', considering: 'Considering', skip: 'Skip' };

// Staffing at a glance: { kind: 'going'|'considering'|'skip'|'rep', text } or null.
export function staffingChip({ status, reps = [] }) {
  const who = reps.join(', ');
  if (!status && !who) return null;
  if (!status) return { kind: 'rep', text: who };
  return { kind: status, text: [STATUS_TEXT[status], who].filter(Boolean).join(' · ') };
}

// Plan filters: "Mine" (assigned to me), Status, and hiding the low tiers. A pure
// predicate (testable without the DOM) — never touches Gaps, which reads the whole team's plan.
export function matchesPlanFilters(s, plan, state, me) {
  if (state.mine && !plan.reps.includes(me)) return false;
  if (state.status) {
    if (state.status === 'undecided' ? plan.status : plan.status !== state.status) return false;
  }
  if (state.tier === 'hide-cd' && ['C', 'D'].includes(s.tier)) return false;
  return true;
}

// Kept between tab switches (per browser session only), same convention as Events' state.
const state = { mine: false, status: '', tier: '' };

export function render(el, ctx) {
  const { store } = ctx;
  const months = windowMonths();

  const mini = (s) => {
    const c = s.conf;
    const p = store.conferencePlan(s.id);
    const chip = staffingChip(p);
    return `<a class="mini tier-${tierClass(s.tier)}${p.status === 'skip' ? ' dimmed' : ''}" href="#events/${encodeURIComponent(s.id)}" data-open="${esc(s.id)}">
      <b>${esc(s.tier)} ${s.score}</b> ${esc(c.name)}
      <small>${esc(fmtRange(c.startDate, c.endDate))} · ${esc(c.city)}${c.dateStatus === 'estimated' ? ' · est.' : ''}</small>
      ${clusterBadgeHTML(s.cluster)}
      ${chip ? `<span class="staff staff-${chip.kind}">${esc(chip.text)}</span>` : ''}
    </a>`;
  };

  const me = store.settings().me; // '' = team-wide view; the "Mine" filter only makes sense for a real person
  const filtersHTML = () => `<div class="plan-row">
    ${me ? `<button type="button" class="chip" id="plan-mine" aria-pressed="${state.mine}">Mine</button>` : ''}
    <select id="plan-status" aria-label="Status">
      <option value="">All statuses</option>
      <option value="going"${state.status === 'going' ? ' selected' : ''}>Going</option>
      <option value="considering"${state.status === 'considering' ? ' selected' : ''}>Considering</option>
      <option value="undecided"${state.status === 'undecided' ? ' selected' : ''}>Undecided</option>
    </select>
    <select id="plan-tier" aria-label="Tier">
      <option value="">All tiers</option>
      <option value="hide-cd"${state.tier === 'hide-cd' ? ' selected' : ''}>Hide C &amp; D</option>
    </select>
  </div>`;

  const timelineHTML = () => {
    const effective = me ? state : { ...state, mine: false };
    const now = scoreAll(store.conferences()).filter((x) => inWindow(x.conf))
      .filter((s) => matchesPlanFilters(s, store.conferencePlan(s.id), effective, me));
    return months.map((m) => {
      const inMonth = now.filter((x) => x.conf.startDate.slice(0, 7) === m).sort((a, b) => a.conf.startDate.localeCompare(b.conf.startDate));
      return `<div class="month"><h4>${monthLabel(m)}</h4>${inMonth.map(mini).join('') || '<div class="empty">No events match</div>'}</div>`;
    }).join('');
  };

  el.innerHTML = `<section class="view">
  <h2>Plan · ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}</h2>
  <div class="gaps">${gapsHTML(computeGaps(store))}</div>
  ${filtersHTML()}
  <div class="timeline">${timelineHTML()}</div>
  <dialog class="sheet" id="detail" aria-label="Event details">
    <div class="sheet-inner">
      <div class="sheet-head"><b class="sheet-title"></b><button type="button" class="sheet-close" aria-label="Close">✕</button></div>
      <div class="sheet-body"></div>
    </div>
  </dialog>
</section>`;

  // Tapping a card opens its details over the Plan (a bottom sheet on phones, a window on desktop).
  // The Plan stays where it was underneath; changes made in the sheet update it in place.
  const timeline = el.querySelector('.timeline');
  const gapsBox = el.querySelector('.gaps');
  const dialog = el.querySelector('#detail');
  const body = dialog.querySelector('.sheet-body');
  let openId = null;
  const drawDetail = () => {
    const s = scoreAll(store.conferences()).find((x) => x.id === openId);
    dialog.querySelector('.sheet-title').textContent = s ? s.conf.name : '';
    body.innerHTML = s ? eventCardHTML(s, {
      plan: store.conferencePlan(s.id), team: store.team(), today: ctx.today, open: true,
      peopleYouKnow: peopleYouKnow(s.conf, store, ctx.today),
    }) : '';
  };
  const redrawTimeline = () => {
    const left = timeline.scrollLeft;
    timeline.innerHTML = timelineHTML();
    timeline.scrollLeft = left;
  };
  el.querySelector('#plan-mine')?.addEventListener('click', (e) => {
    state.mine = !state.mine;
    e.currentTarget.setAttribute('aria-pressed', state.mine);
    redrawTimeline();
  });
  el.querySelector('#plan-status').addEventListener('change', (e) => { state.status = e.target.value; redrawTimeline(); });
  el.querySelector('#plan-tier').addEventListener('change', (e) => { state.tier = e.target.value; redrawTimeline(); });
  timeline.addEventListener('click', (e) => {
    const card = e.target.closest('[data-open]');
    if (!card || e.metaKey || e.ctrlKey || e.shiftKey || typeof dialog.showModal !== 'function') return; // new tab / old browser: follow the link
    e.preventDefault();
    openId = card.dataset.open;
    drawDetail();
    dialog.showModal();
    dialog.querySelector('.sheet-inner').scrollTop = 0;
  });
  bindEventCardControls(body, store, () => {
    drawDetail();
    redrawTimeline();
    gapsBox.innerHTML = gapsHTML(computeGaps(store));
  });
  dialog.querySelector('.sheet-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // tap on the dimmed area
}

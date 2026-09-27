// Events tab: filterable list of scored events with the "Why?" breakdown.
import { scoreAll, filterEvents, REGIONS, TIERS, windowMonths, monthLabel } from '../scoring.js';
import { peopleYouKnow } from '../eventHistory.js';
import { eventCardHTML, bindEventCardControls } from './eventCard.js';
import { esc } from './ui.js';

// Kept between tab switches (per browser session only).
const state = { sort: 'score', q: '', vertical: '', region: '', tier: '', month: '' };

const options = (values, current, all, label = (v) => v) =>
  [`<option value="">${all}</option>`, ...values.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(label(v))}</option>`)].join('');

export function render(el, ctx, focusId) {
  const { store } = ctx;
  if (focusId) Object.assign(state, { q: '', vertical: '', region: '', tier: '', month: '' });
  const scored = scoreAll(store.conferences());
  const verticals = [...new Set(scored.flatMap((s) => s.conf.verticals || []))].sort();

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Events</h2><a class="btn" href="#add">+ Add conference</a></div>
  <form class="filters" onsubmit="return false">
    <input class="wide" type="search" name="q" placeholder="Search name, city…" value="${esc(state.q)}" aria-label="Search">
    <select name="vertical" aria-label="Vertical">${options(verticals, state.vertical, 'All verticals')}</select>
    <select name="region" aria-label="Region">${options(REGIONS, state.region, 'All regions')}</select>
    <select name="tier" aria-label="Tier">${options(TIERS.map((t) => t.tier), state.tier, 'All tiers')}</select>
    <select name="month" aria-label="Month">${options(windowMonths(), state.month, 'All months', monthLabel)}</select>
    <div class="seg" role="radiogroup" aria-label="Sort">
      <label><input type="radio" name="sort" value="score"${state.sort === 'score' ? ' checked' : ''}><span>Score</span></label>
      <label><input type="radio" name="sort" value="date"${state.sort === 'date' ? ' checked' : ''}><span>Date</span></label>
    </div>
  </form>
  <p class="muted" id="ev-count"></p>
  <div id="ev-list"></div>
</section>`;

  const list = el.querySelector('#ev-list');
  const draw = () => {
    const items = filterEvents(scoreAll(store.conferences()), state);
    el.querySelector('#ev-count').textContent = `${items.length} event${items.length === 1 ? '' : 's'}`;
    list.innerHTML = items.map((s) => eventCardHTML(s, {
      plan: store.conferencePlan(s.id), team: store.team(), today: ctx.today, open: s.id === focusId,
      peopleYouKnow: peopleYouKnow(s.conf, store, ctx.today),
    })).join('') || '<p class="muted">No events match these filters.</p>';
  };
  el.querySelector('.filters').addEventListener('input', (e) => {
    if (e.target.name in state) { state[e.target.name] = e.target.value; draw(); }
  });
  bindEventCardControls(list, store, draw);
  draw();
  if (focusId) {
    const card = document.getElementById(`ev-${focusId}`);
    if (card) setTimeout(() => card.scrollIntoView({ block: 'start' }), 0);
  }
}

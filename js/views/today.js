// Today tab: the default landing page. "What should I do right now?" — all rules-based
// except the follow-up draft button, which reuses the same AI call as the contact page.
import { actNowRows, comingUpRows } from '../today.js';
import { findGaps, gapLines, scoreAll } from '../scoring.js';
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

function comingUpHTML(store, today) {
  const { mode, items } = comingUpRows(store, today);
  if (!items.length) return '<div class="box"><b>Coming up</b><p class="hint">Nothing planned in the next 60 days, and no A/A+ events waiting on a decision.</p></div>';
  const title = mode === 'planned' ? 'Coming up' : 'Coming up — nothing staffed yet, decide on these';
  return `<div class="box"><b>${title}</b><div class="rows">${items.map((s) => {
    const chip = staffingChip(s.plan);
    return `<a class="mini tier-${tierClass(s.tier)}" href="#events/${encodeURIComponent(s.id)}">
      <b>${esc(s.conf.name)}</b> <span class="muted">in ${s.daysUntil} day${s.daysUntil === 1 ? '' : 's'}</span>
      <small>${esc(fmtRange(s.conf.startDate, s.conf.endDate))} · ${esc(s.conf.city)}</small>
      ${chip ? `<span class="staff staff-${chip.kind}">${esc(chip.text)}</span>` : ''}
    </a>`;
  }).join('')}</div></div>`;
}

function gapsHTML(store) {
  const gaps = findGaps(scoreAll(store.conferences()));
  const lines = gapLines(gaps).filter((l) => !l.startsWith('Every'));
  return `<div class="box"><b>Plan gaps</b>
    ${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="hint">No gaps in the plan right now.</p>'}
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

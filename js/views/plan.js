// Plan tab: 13-month timeline by tier, clusters, status/rep, and a short gaps list.
import { scoreAll, findGaps, gapLines, windowMonths, monthLabel, inWindow } from '../scoring.js';
import { peopleYouKnow } from '../eventHistory.js';
import { esc, fmtRange, tierClass, viewingAsHTML } from './ui.js';
import { clusterBadgeHTML, eventCardHTML, bindEventCardControls } from './eventCard.js';

const STATUS_TEXT = { going: '✓ Going', considering: 'Considering', skip: 'Skip' };

// Staffing at a glance: { kind: 'going'|'considering'|'skip'|'rep', text } or null.
export function staffingChip({ status, reps = [] }) {
  const who = reps.join(', ');
  if (!status && !who) return null;
  if (!status) return { kind: 'rep', text: who };
  return { kind: status, text: [STATUS_TEXT[status], who].filter(Boolean).join(' · ') };
}

export function render(el, ctx) {
  const { store } = ctx;
  const scored = scoreAll(store.conferences()).filter((s) => inWindow(s.conf));
  const months = windowMonths();
  const gaps = findGaps(scored);

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

  const timelineHTML = () => {
    const now = scoreAll(store.conferences()).filter((x) => inWindow(x.conf));
    return months.map((m) => {
      const inMonth = now.filter((x) => x.conf.startDate.slice(0, 7) === m).sort((a, b) => a.conf.startDate.localeCompare(b.conf.startDate));
      return `<div class="month"><h4>${monthLabel(m)}</h4>${inMonth.map(mini).join('') || '<div class="empty">No events</div>'}</div>`;
    }).join('');
  };

  el.innerHTML = `<section class="view">
  <h2>Plan · ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}</h2>
  ${viewingAsHTML(store)}
  <div class="gaps"><b>Gaps</b><ul>${gapLines(gaps).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
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
  timeline.addEventListener('click', (e) => {
    const card = e.target.closest('[data-open]');
    if (!card || e.metaKey || e.ctrlKey || e.shiftKey || typeof dialog.showModal !== 'function') return; // new tab / old browser: follow the link
    e.preventDefault();
    openId = card.dataset.open;
    drawDetail();
    dialog.showModal();
    dialog.querySelector('.sheet-inner').scrollTop = 0;
  });
  bindEventCardControls(body, store, () => { drawDetail(); redrawTimeline(); });
  dialog.querySelector('.sheet-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // tap on the dimmed area
}

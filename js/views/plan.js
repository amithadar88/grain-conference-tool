// Plan tab: 13-month timeline by tier, clusters, status/rep, and a short gaps list.
import { scoreAll, findGaps, windowMonths, monthLabel, inWindow } from '../scoring.js';
import { esc, fmtRange, tierClass } from './ui.js';

const STATUS_TEXT = { going: '✓ Going', considering: 'Considering', skip: 'Skip' };

// Staffing at a glance: { kind: 'going'|'considering'|'skip'|'rep', text } or null.
export function staffingChip({ status, rep }) {
  if (!status && !rep) return null;
  if (!status) return { kind: 'rep', text: rep };
  return { kind: status, text: [STATUS_TEXT[status], rep].filter(Boolean).join(' · ') };
}

function gapLines(gaps) {
  const lines = [];
  lines.push(gaps.months.length
    ? `No A/B event in: ${gaps.months.map(monthLabel).join(', ')}`
    : 'Every month has at least one A/B event');
  lines.push(gaps.regions.length
    ? `No A-tier event in: ${gaps.regions.join(', ')}`
    : 'Every region has an A-tier event');
  lines.push(gaps.verticals.length
    ? `No A/B event for: ${gaps.verticals.join(', ')}`
    : 'Every core vertical (payments, cross-border, travel, treasury, FX) has an A/B event');
  return lines;
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
    return `<a class="mini tier-${tierClass(s.tier)}${p.status === 'skip' ? ' dimmed' : ''}" href="#events/${encodeURIComponent(s.id)}">
      <b>${esc(s.tier)} ${s.score}</b> ${esc(c.name)}
      <small>${esc(fmtRange(c.startDate, c.endDate))} · ${esc(c.city)}${c.dateStatus === 'estimated' ? ' · est.' : ''}</small>
      ${s.cluster ? `<span class="badge cluster">+5 cluster</span>` : ''}
      ${chip ? `<span class="staff staff-${chip.kind}">${esc(chip.text)}</span>` : ''}
    </a>`;
  };

  el.innerHTML = `<section class="view">
  <h2>Plan · ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}</h2>
  <div class="gaps"><b>Gaps</b><ul>${gapLines(gaps).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
  <div class="timeline">${months.map((m) => {
    const inMonth = scored.filter((s) => s.conf.startDate.slice(0, 7) === m).sort((a, b) => a.conf.startDate.localeCompare(b.conf.startDate));
    return `<div class="month"><h4>${monthLabel(m)}</h4>${inMonth.map(mini).join('') || '<div class="empty">No events</div>'}</div>`;
  }).join('')}</div>
</section>`;
}

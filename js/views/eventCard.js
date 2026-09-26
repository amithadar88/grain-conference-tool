// The event card, shared by Events, Plan detail and the Add-conference review screen.
import { FACTORS, FACTOR_LABELS, oneLineSummary } from '../scoring.js';
import { esc, safeUrl, fmtRange, fmtDate, tierClass } from './ui.js';

const STATUSES = [['going', 'Going'], ['considering', 'Considering'], ['skip', 'Skip']];

function listItems(items, empty) {
  if (!items.length) return `<li class="muted">${empty}</li>`;
  return items.map((i) => `<li><b>${esc(i.label)} (${i.score}/5)</b> ${esc(i.why)}</li>`).join('');
}

// "🔗 +5 · same week as CrossTech World" (the exact gap is on hover). null when there is no cluster.
export function clusterBadge(cluster) {
  if (!cluster) return null;
  const when = cluster.gap === 0 ? 'overlaps' : `is ${cluster.gap} day${cluster.gap === 1 ? '' : 's'} away`;
  return {
    text: `🔗 +5 · same ${cluster.gap === 0 ? 'days' : 'week'} as ${cluster.name}`,
    title: `Cluster bonus +5: ${cluster.name} ${when}, in the same region`,
  };
}

export const clusterBadgeHTML = (cluster) => {
  const b = clusterBadge(cluster);
  return b ? `<span class="badge cluster" title="${esc(b.title)}">${esc(b.text)}</span>` : '';
};

function provenance(c) {
  if (!c.addedBy) return '';
  const how = c.source === 'ai' ? 'AI-drafted, confirmed by' : 'Added manually by';
  return `<span class="badge">${how} ${esc(c.addedBy)}, ${esc(fmtDate(c.addedAt))}</span>`;
}

/**
 * s: one item from scoreAll(). opts: { plan, team, today, controls, open }
 * Returns an HTML string. Controls are wired by bindEventCardControls().
 */
export function eventCardHTML(s, { plan = { status: null, rep: null }, team = [], today = '', controls = true, open = false } = {}) {
  const c = s.conf;
  const past = today && c.endDate < today;
  const site = safeUrl(c.website);
  const statusButtons = STATUSES.map(([v, label]) =>
    `<button type="button" class="chip" data-status="${v}" data-id="${esc(c.id)}" aria-pressed="${plan.status === v}">${label}</button>`).join('');
  const repOptions = ['<option value="">Assign rep…</option>', ...team.map((n) =>
    `<option value="${esc(n)}"${plan.rep === n ? ' selected' : ''}>${esc(n)}</option>`)].join('');

  return `<article class="card tier-${tierClass(s.tier)}${past ? ' past' : ''}" id="ev-${esc(c.id)}">
  <div class="card-head">
    <div>
      <h3>${esc(c.name)}</h3>
      <div class="meta">${esc(fmtRange(c.startDate, c.endDate))}${c.dateStatus === 'estimated' ? ' <span class="tag">estimated</span>' : ''}
        · ${esc(c.city)}${c.country && c.country !== c.city ? `, ${esc(c.country)}` : ''}${past ? ' <span class="tag">past</span>' : ''}</div>
    </div>
    <div class="score" title="Score out of 100"><span class="tier">${esc(s.tier)}</span><span class="num">${s.score}</span></div>
  </div>
  <div class="action">${esc(s.action)}</div>
  <div class="oneliner">${esc(oneLineSummary(s))}</div>
  <div class="badges">${s.borderline ? `<span class="badge warn">${esc(s.borderline)}</span>` : ''}${clusterBadgeHTML(s.cluster)}${provenance(c)}</div>
  ${controls ? `<div class="plan-row">${statusButtons}<select data-rep data-id="${esc(c.id)}" aria-label="Assigned rep">${repOptions}</select></div>` : ''}
  <details${open ? ' open' : ''}>
    <summary>Why ${esc(s.tier)}?</summary>
    <div class="why">
      <div class="pc pros"><h4>✅ Pros</h4><ul>${listItems(s.pros, 'No factor rated 4-5')}</ul></div>
      <div class="pc cons"><h4>⚠️ Cons</h4><ul>${listItems(s.cons, 'No factor rated 1-2')}</ul></div>
      <p class="pc drag"><b>🔻 Biggest drag:</b> ${s.drag ? esc(s.drag.text) : 'none'}</p>
      <table class="ratings"><tbody>${FACTORS.map((k) => `<tr><td>${esc(FACTOR_LABELS[k])}</td><td>${c.ratings[k].score}/5</td><td>${Math.round(s.points[k] * 10) / 10} pts</td><td>${esc(c.ratings[k].why)}</td></tr>`).join('')}
        ${s.bonus ? `<tr><td>Cluster bonus</td><td></td><td>+5 pts</td><td>${esc(s.cluster.name)}</td></tr>` : ''}</tbody></table>
      ${c.description ? `<p>${esc(c.description)}</p>` : ''}
      ${c.audienceSize ? `<p class="muted">~${Number(c.audienceSize).toLocaleString('en-US')} attendees · ${esc((c.verticals || []).join(', '))}</p>` : ''}
      ${c.notes ? `<p class="muted">${esc(c.notes)}</p>` : ''}
      ${site ? `<p><a href="${esc(site)}" target="_blank" rel="noopener">Event website ↗</a></p>` : ''}
    </div>
  </details>
</article>`;
}

// Event delegation: one listener on the list container. onChange() re-draws the list.
export function bindEventCardControls(root, store, onChange) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    const id = btn.dataset.id;
    const current = store.conferencePlan(id).status;
    store.setConferencePlan(id, { status: current === btn.dataset.status ? null : btn.dataset.status });
    onChange();
  });
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-rep]');
    if (!sel) return;
    store.setConferencePlan(sel.dataset.id, { rep: sel.value || null });
    onChange();
  });
}

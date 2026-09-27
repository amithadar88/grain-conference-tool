// Contacts tab: list, contact page (timeline + signal), AI summary, HubSpot push, CSV.
import { relationshipSignal, timelineMarkers, hubspotPayload, contactsCsv, withEncounterContact, urgencyRank } from '../signals.js';
import { validateArc } from '../validate.js';
import { aiArc, hubspotPush } from '../api.js';
import { renderFollowup } from './followup.js';
import { esc, fmtDate, signalClass, flash } from './ui.js';

let query = '';
let sortMode = 'urgency'; // 'urgency' | 'name' | 'recent'
let filterBucket = ''; // '' (All) | 'Warming' | 'Cooling' | 'Stalled' | 'Steady' | 'New'

// AI summaries in flight, personId -> the request's own promise, so navigating away and
// back shows "Generating…" instead of a fresh "Generate" button — the request itself
// keeps running either way (nothing here cancels it); the result lands in the store
// (store.setAiSummary) whichever page happens to be open when it arrives.
const pendingArc = new Map();

// "Warming - act now" -> "Warming" (matches signalClass's own bucketing, used for filter chips).
const labelBucket = (label) => label.split(' ')[0];
const lastDate = (r) => r.encounters.at(-1).date;
const SORTERS = {
  urgency: (a, b) => urgencyRank(a.signal, a.ai) - urgencyRank(b.signal, b.ai) || lastDate(b).localeCompare(lastDate(a)),
  name: (a, b) => a.person.name.localeCompare(b.person.name),
  recent: (a, b) => lastDate(b).localeCompare(lastDate(a)),
};

// The last push result stays on screen until the next push or until the rep leaves the page.
let pushResult = null; // { where: 'list' | personId, html }
const keptResult = (where) => (pushResult && pushResult.where === where ? pushResult.html : '');
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { pushResult = null; });

function rowsFor(store, today) {
  return store.people().map((p) => {
    const encounters = store.encountersFor(p.id);
    return { person: withEncounterContact(p, encounters), encounters, signal: relationshipSignal(encounters, today), ai: store.aiSummary(p.id) };
  }).filter((r) => r.encounters.length);
}

const BUCKET_ORDER = ['Warming', 'Stalled', 'Steady', 'New', 'Cooling'];

export function render(el, ctx, personId) {
  if (personId) return renderPerson(el, ctx, personId);
  const { store } = ctx;
  const rows = rowsFor(store, ctx.today);
  const unpushed = rows.filter((r) => r.person.email && !store.hubspotPushed(r.person.id));
  const counts = rows.reduce((m, r) => { const b = labelBucket(r.signal.label); m[b] = (m[b] || 0) + 1; return m; }, {});

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Contacts</h2>
    <div class="row">
      <button class="btn" id="push-all" data-needs-net ${unpushed.length ? '' : 'data-blocked="true"'}>Push all not yet pushed (${unpushed.length})</button>
      <button class="btn" id="csv">Export CSV</button>
    </div></div>
  <p class="needs-net-hint" hidden>HubSpot push needs a connection.</p>
  <input type="search" id="q" placeholder="Search name or company…" value="${esc(query)}" aria-label="Search contacts" style="margin:8px 0">
  <div class="seg" id="sort-seg" role="radiogroup" aria-label="Sort" style="margin-bottom:8px">
    ${[['urgency', 'Urgency'], ['name', 'Name A-Z'], ['recent', 'Last met']].map(([v, label]) =>
      `<label><input type="radio" name="sort" value="${v}"${sortMode === v ? ' checked' : ''}><span>${label}</span></label>`).join('')}
  </div>
  <div class="row" id="label-filter" style="flex-wrap:wrap;margin-bottom:8px">
    <button type="button" class="chip" data-filter="" aria-pressed="${filterBucket === ''}">All (${rows.length})</button>
    ${BUCKET_ORDER.filter((b) => counts[b]).map((b) =>
      `<button type="button" class="chip" data-filter="${b}" aria-pressed="${filterBucket === b}">${b} (${counts[b]})</button>`).join('')}
  </div>
  <div id="push-result">${keptResult('list')}</div>
  ${reviewHTML(store)}
  <ul class="rows" id="list"></ul>
</section>`;

  const list = el.querySelector('#list');
  const draw = () => {
    const q = query.toLowerCase();
    const filtered = rows
      .filter((r) => !filterBucket || labelBucket(r.signal.label) === filterBucket)
      .filter((r) => !q || `${r.person.name} ${r.person.company}`.toLowerCase().includes(q))
      .sort(SORTERS[sortMode]);
    list.innerHTML = filtered.map((r) => {
      const last = r.encounters[r.encounters.length - 1];
      return `<li><a href="#contacts/${encodeURIComponent(r.person.id)}">
        <b>${esc(r.person.name)}</b> · ${esc(r.person.company || '')}
        <div><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
        ${r.ai && r.ai.label !== r.signal.label ? `<span class="sig ${signalClass(r.ai.label)}">AI: ${esc(r.ai.label)}</span>` : ''}
        <span class="muted">${r.encounters.length} meeting${r.encounters.length === 1 ? '' : 's'} · last: ${esc(last.event)}, ${esc(fmtDate(last.date))}</span></div>
      </a></li>`;
    }).join('') || '<li class="muted">No contacts match.</li>';
  };
  el.querySelector('#q').addEventListener('input', (e) => { query = e.target.value; draw(); });
  el.querySelector('#sort-seg').addEventListener('change', (e) => {
    if (e.target.name === 'sort') { sortMode = e.target.value; render(el, ctx); }
  });
  el.querySelector('#label-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filterBucket = b.dataset.filter;
    render(el, ctx);
  });
  draw();

  el.querySelectorAll('[data-review]').forEach((b) => b.addEventListener('click', () => {
    const [from, to] = b.dataset.pair.split('|');
    if (b.dataset.review === 'same') {
      const name = store.person(to).name;
      store.mergeInto(from, to);
      flash(`✓ Merged into ${name}`);
    } else {
      store.resolveDifferent(from, to);
      flash('✓ Kept as two people');
    }
    render(el, ctx);
    ctx.applyNet();
  }));
  el.querySelector('#csv').addEventListener('click', () => downloadCsv(rows, ctx.today));
  el.querySelector('#push-all').addEventListener('click', (e) => {
    e.currentTarget.disabled = true;
    pushRows(ctx, unpushed, el.querySelector('#push-result'), 'list', () => { render(el, ctx); ctx.applyNet(); });
  });
}

// "Needs review (N)": every suggestion the rep skipped at capture, to clean up in the evening.
function reviewHTML(store) {
  const pairs = store.unresolvedPairs();
  if (!pairs.length) return '';
  const who = (id) => {
    const p = store.person(id);
    const n = store.encountersFor(id).length;
    return `<a href="#contacts/${encodeURIComponent(id)}"><b>${esc(p.name)}</b></a> <span class="muted">(${[p.company, `${n} meeting${n === 1 ? '' : 's'}`].filter(Boolean).map(esc).join(', ')})</span>`;
  };
  return `<section class="review box"><h3>Needs review (${pairs.length})</h3>
    <p class="hint">Possible matches skipped at capture. Same person merges them; Different never asks again.</p>
    <ul>${pairs.map(([from, to]) => `<li>${who(from)} ↔ ${who(to)}
      <div class="row"><button class="chip" data-review="same" data-pair="${esc(from)}|${esc(to)}">Same person</button>
      <button class="chip" data-review="diff" data-pair="${esc(from)}|${esc(to)}">Different</button></div></li>`).join('')}</ul></section>`;
}

function downloadCsv(rows, today) {
  const blob = new Blob(['\uFEFF' + contactsCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `grain-leads-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Push in batches of 10 (the function has ~10 seconds). Demo mode without a token.
async function pushRows(ctx, rows, out, where, done) {
  const { store } = ctx;
  pushResult = null;
  const show = (html) => { pushResult = { where, html }; out.innerHTML = html; };
  const token = store.settings().hubspotToken;
  const payloads = rows.filter((r) => r.person.email).map((r) => ({ id: r.person.id, payload: hubspotPayload(r.person, r.encounters, r.signal) }));
  const skipped = rows.filter((r) => !r.person.email).map((r) => r.person.name);
  if (!token) {
    show(`<div class="box"><b>Demo mode: nothing was sent.</b> Add a HubSpot token in Settings to push for real. This is exactly what would be sent:
      <pre>${esc(JSON.stringify(payloads.map((p) => p.payload), null, 2))}</pre>
      ${skipped.length ? `<p class="hint">Skipped (no email): ${esc(skipped.join(', '))}</p>` : ''}</div>`);
    if (done) done();
    return;
  }
  out.innerHTML = '<p class="muted">Pushing to HubSpot…</p>';
  const lines = []; // [text, isError]
  const retry = (res) => (res.retried ? ' (after 1 automatic retry)' : '');
  for (let i = 0; i < payloads.length; i += 10) {
    const batch = payloads.slice(i, i + 10);
    const r = await hubspotPush(token, batch.map((b) => b.payload));
    if (!r.ok) { lines.push([`Not sent: ${r.message}${retry(r)}`, true]); break; }
    r.results.forEach((res, j) => {
      if (res.action === 'error') lines.push([`${res.email}: not sent. ${res.message || 'Unknown error'}${retry(res)}`, true]);
      else { store.markPushed(batch[j].id, ctx.today); lines.push([`${res.email}: ${res.action} ✓${retry(res)}`, false]); }
    });
  }
  if (skipped.length) lines.push([`Skipped (no email): ${skipped.join(', ')}`, false]);
  show(`<div class="box"><b>HubSpot</b><ul>${lines.map(([l, bad]) => `<li${bad ? ' class="error"' : ''}>${esc(l)}</li>`).join('')}</ul></div>`);
  if (done) done();
}

function renderPerson(el, ctx, personId) {
  const { store } = ctx;
  const stored = store.person(personId);
  if (!stored) { el.innerHTML = '<section class="view"><p>Contact not found. <a href="#contacts">Back to contacts</a></p></section>'; return; }
  const encounters = store.encountersFor(personId);
  const person = withEncounterContact(stored, encounters);
  const signal = relationshipSignal(encounters, ctx.today);
  const unresolved = store.unresolvedFor(personId).map((id) => store.person(id)).filter(Boolean);
  const pushed = store.hubspotPushed(personId);

  el.innerHTML = `<section class="view">
  <p><a href="#contacts">← Contacts</a></p>
  <h2>${esc(person.name)}</h2>
  <p class="muted">${[person.title, person.company].filter(Boolean).map(esc).join(' · ')}
    ${person.email ? `<br>${esc(person.email)}` : ''}${person.linkedin ? `<br>${esc(person.linkedin)}` : ''}</p>

  <div id="ai"></div>
  <div id="followup"></div>

  ${unresolved.map((c) => {
    const encs = store.encountersFor(c.id);
    const last = encs[encs.length - 1];
    return `<div class="match low">Possible match: <b>${esc(c.name)}</b> (${esc(c.company || '')}${last ? `, last seen at ${esc(last.event)}` : ''}, ${encs.length} meeting${encs.length === 1 ? '' : 's'})
      <div class="row"><button class="chip" data-same="${esc(c.id)}">Same person</button><button class="chip" data-diff="${esc(c.id)}">Different</button></div></div>`;
  }).join('')}

  <div class="box"><b>Rules:</b> <span class="sig ${signalClass(signal.label)}">${esc(signal.label)}</span>
    <div class="hint">${signal.reasons.map(esc).join(' · ')}</div></div>

  <h3>Timeline</h3>
  <ol class="timeline-list">${timelineMarkers(encounters).map(({ encounter: e, marks }) => `<li>
    ${marks.map((m) => `<div class="mark">${esc(m.text)}</div>`).join('')}
    <b>${esc(e.event)}</b> · ${esc(fmtDate(e.date))} · <span class="sig">${esc(e.temperature)}</span>
    <div class="muted">${esc(e.nameAsEntered)}${e.title ? `, ${esc(e.title)}` : ''}${e.company ? ` @ ${esc(e.company)}` : ''} · met by ${esc(e.rep || '?')}</div>
    ${e.note ? `<div>${esc(e.note)}</div>` : ''}
  </li>`).join('')}</ol>

  <details class="box"><summary>Edit email / LinkedIn / title / company</summary>
    <form id="edit" onsubmit="return false">
      <label>Email <input name="email" type="email" value="${esc(person.email || '')}"></label>
      <label>LinkedIn <input name="linkedin" value="${esc(person.linkedin || '')}"></label>
      <label>Job title <input name="title" value="${esc(person.title || '')}"></label>
      <label>Company <input name="company" value="${esc(person.company || '')}"></label>
      <button class="btn" type="submit">Save details</button>
    </form>
  </details>

  <div class="box"><b>HubSpot</b> ${pushed ? `<span class="hint">Pushed ✓ ${esc(fmtDate(pushed))}</span>` : ''}
    <div class="row" style="margin-top:8px">
      ${person.email
    ? `<button class="btn" id="push" data-needs-net>${pushed ? 'Push again' : 'Push to HubSpot'}</button>`
    : '<button class="btn" disabled>Add an email to push</button>'}
    </div>
    <p class="needs-net-hint" hidden>Needs connection.</p>
    <div id="push-result">${keptResult(personId)}</div>
  </div>
</section>`;

  el.querySelectorAll('[data-same]').forEach((b) => b.addEventListener('click', () => {
    store.mergeInto(personId, b.dataset.same);
    ctx.go(`#contacts/${encodeURIComponent(b.dataset.same)}`);
  }));
  el.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
    store.resolveDifferent(personId, b.dataset.diff);
    renderPerson(el, ctx, personId);
  }));
  el.querySelector('#edit').addEventListener('submit', (e) => {
    const f = new FormData(e.target);
    store.patchPerson(personId, Object.fromEntries(['email', 'linkedin', 'title', 'company'].map((k) => [k, String(f.get(k) || '').trim()])));
    renderPerson(el, ctx, personId);
    ctx.applyNet();
  });
  const pushBtn = el.querySelector('#push');
  if (pushBtn) {
    pushBtn.addEventListener('click', () => {
      pushBtn.disabled = true;
      pushRows(ctx, [{ person, encounters, signal }], el.querySelector('#push-result'), personId, () => {
        renderPerson(el, ctx, personId);
        ctx.applyNet();
      });
    });
  }
  renderAi(el.querySelector('#ai'), ctx, person, encounters, signal);
  renderFollowup(el.querySelector('#followup'), ctx, { person, encounters, signal, ai: store.aiSummary(personId) });
}

// ---- AI relationship summary: a card at the top of the page, right under the name ----
function renderAi(box, ctx, person, encounters, signal) {
  const { store } = ctx;
  if (encounters.length < 2) { box.innerHTML = ''; return; }
  const s = store.aiSummary(person.id);
  const generating = pendingArc.has(person.id);
  const stale = s && s.basedOnEncounters < encounters.length;
  // A summary (seeded or generated) is never a dead end: Regenerate is always available,
  // styled small+secondary so it doesn't compete with the one-time primary Generate button.
  const showButton = !generating;
  const body = s
    ? `<span class="sig ${signalClass(s.label)}">${esc(s.label)}</span>
       ${s.agreesWithRules ? '' : `<p class="disagree">AI disagrees with the rules (${esc(signal.label)}): ${esc(s.disagreementReason)}</p>`}
       <p>${esc(s.arc)}</p>
       <p><b>Next step:</b> ${esc(s.nextStep)}</p>
       <p class="hint">AI · ${esc(fmtDate(s.generatedAt))} · based on ${s.basedOnEncounters} meetings${stale ? ' · new meeting since this summary' : ''}</p>`
    : '<p class="hint">AI reads the meeting notes and judges whether this is warming or a tire-kicker.</p>';
  box.innerHTML = `<div class="box ai${stale ? ' stale' : ''}"><b>AI summary</b>${body}
    ${generating ? '<p class="hint">Generating…</p>' : ''}
    ${showButton ? `<button class="btn${s ? ' small' : ''}" id="ai-btn" data-needs-net>${s ? 'Regenerate' : 'Generate'}</button>
    <span class="needs-net-hint" hidden>Needs connection</span>` : ''}<p class="error" id="ai-err" hidden></p></div>`;
  if (generating) {
    // Came back to this contact while its summary was still generating elsewhere: redraw
    // once it lands, whether that's this same box or a fresh one from a later visit.
    pendingArc.get(person.id).then(() => renderAi(box, ctx, person, encounters, signal));
    return;
  }
  const btn = box.querySelector('#ai-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    const request = aiArc(store.settings().geminiKey, {
      person: { name: person.name, company: person.company, title: person.title },
      encounters: encounters.map((e) => ({ date: e.date, event: e.event, name: e.nameAsEntered, company: e.company, title: e.title, temperature: e.temperature, note: e.note })),
      rules: { label: signal.label, reasons: signal.reasons },
      today: ctx.today,
    }, () => { btn.textContent = 'Taking longer than usual, retrying…'; }).then((r) => {
      pendingArc.delete(person.id);
      const check = r.ok ? validateArc(r.result) : null;
      if (!r.ok || !check.ok) {
        // Only meaningful if the rep is still on this exact page; if they've navigated
        // away, the next visit's renderAi() just sees "not generating any more" and
        // offers Generate again, same as a failed attempt they never started.
        if (btn.isConnected) {
          const err = box.querySelector('#ai-err');
          err.textContent = r.ok ? "The AI's answer didn't make sense: try again." : r.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = s ? 'Regenerate' : 'Generate';
        }
        return;
      }
      store.setAiSummary(person.id, { ...r.result, generatedAt: ctx.today, basedOnEncounters: encounters.length, model: r.model });
      renderAi(box, ctx, person, encounters, signal); // no-op if this box has since been replaced
      ctx.applyNet();
    });
    pendingArc.set(person.id, request);
  });
}

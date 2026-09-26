// Contacts tab: list, contact page (timeline + signal), AI summary, HubSpot push, CSV.
import { relationshipSignal, timelineMarkers, hubspotPayload, contactsCsv, withEncounterContact } from '../signals.js';
import { validateArc } from '../validate.js';
import { aiArc, hubspotPush } from '../api.js';
import { esc, fmtDate, signalClass, flash } from './ui.js';

let query = '';

// The last push result stays on screen until the next push or until the rep leaves the page.
let pushResult = null; // { where: 'list' | personId, html }
const keptResult = (where) => (pushResult && pushResult.where === where ? pushResult.html : '');
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => { pushResult = null; });

function rowsFor(store, today) {
  return store.people().map((p) => {
    const encounters = store.encountersFor(p.id);
    return { person: withEncounterContact(p, encounters), encounters, signal: relationshipSignal(encounters, today) };
  }).filter((r) => r.encounters.length)
    .sort((a, b) => b.encounters[b.encounters.length - 1].date.localeCompare(a.encounters[a.encounters.length - 1].date));
}

export function render(el, ctx, personId) {
  if (personId) return renderPerson(el, ctx, personId);
  const { store } = ctx;
  const rows = rowsFor(store, ctx.today);
  const unpushed = rows.filter((r) => r.person.email && !store.hubspotPushed(r.person.id));

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Contacts</h2>
    <div class="row">
      <button class="btn" id="push-all" data-needs-net ${unpushed.length ? '' : 'data-blocked="true"'}>Push all not yet pushed (${unpushed.length})</button>
      <button class="btn" id="csv">Export CSV</button>
    </div></div>
  <p class="needs-net-hint" hidden>HubSpot push needs a connection.</p>
  <input type="search" id="q" placeholder="Search name or company…" value="${esc(query)}" aria-label="Search contacts" style="margin:8px 0">
  <div id="push-result">${keptResult('list')}</div>
  ${reviewHTML(store)}
  <ul class="rows" id="list"></ul>
</section>`;

  const list = el.querySelector('#list');
  const draw = () => {
    const q = query.toLowerCase();
    list.innerHTML = rows.filter((r) => !q || `${r.person.name} ${r.person.company}`.toLowerCase().includes(q)).map((r) => {
      const last = r.encounters[r.encounters.length - 1];
      return `<li><a href="#contacts/${encodeURIComponent(r.person.id)}">
        <b>${esc(r.person.name)}</b> · ${esc(r.person.company || '')}
        <div><span class="sig ${signalClass(r.signal.label)}">${esc(r.signal.label)}</span>
        <span class="muted">${r.encounters.length} meeting${r.encounters.length === 1 ? '' : 's'} · last: ${esc(last.event)}, ${esc(fmtDate(last.date))}</span></div>
      </a></li>`;
    }).join('') || '<li class="muted">No contacts match.</li>';
  };
  el.querySelector('#q').addEventListener('input', (e) => { query = e.target.value; draw(); });
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

  ${unresolved.map((c) => {
    const encs = store.encountersFor(c.id);
    const last = encs[encs.length - 1];
    return `<div class="match low">Possible match: <b>${esc(c.name)}</b> (${esc(c.company || '')}${last ? `, last seen at ${esc(last.event)}` : ''}, ${encs.length} meeting${encs.length === 1 ? '' : 's'})
      <div class="row"><button class="chip" data-same="${esc(c.id)}">Same person</button><button class="chip" data-diff="${esc(c.id)}">Different</button></div></div>`;
  }).join('')}

  <div class="box"><b>Rules:</b> <span class="sig ${signalClass(signal.label)}">${esc(signal.label)}</span>
    <div class="hint">${signal.reasons.map(esc).join(' · ')}</div></div>

  <div id="ai"></div>

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
}

// ---- AI relationship summary ----
function renderAi(box, ctx, person, encounters, signal) {
  const { store } = ctx;
  if (encounters.length < 2) { box.innerHTML = ''; return; }
  const s = store.aiSummary(person.id);
  const stale = s && s.basedOnEncounters < encounters.length;
  const summaryHtml = s ? `<div class="box ai${stale ? ' stale' : ''}">
      <b>AI:</b> <span class="sig ${signalClass(s.label)}">${esc(s.label)}</span>
      ${s.agreesWithRules ? '' : `<p class="disagree">AI disagrees with rules: ${esc(s.disagreementReason)}</p>`}
      <p>${esc(s.arc)}</p>
      <p><b>Next step:</b> ${esc(s.nextStep)}</p>
      <p class="hint">AI · ${esc(fmtDate(s.generatedAt))} · based on ${s.basedOnEncounters} meetings${stale ? ' · new meeting since this summary' : ''}</p>
    </div>` : '';
  const showButton = !s || stale;
  box.innerHTML = `${summaryHtml}${showButton ? `<button class="btn" id="ai-btn" data-needs-net>${s ? 'Regenerate AI summary' : 'AI summary'}</button>
    <span class="needs-net-hint" hidden>Needs connection</span>` : ''}<p class="error" id="ai-err" hidden></p>`;
  const btn = box.querySelector('#ai-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Thinking…';
    const r = await aiArc(store.settings().geminiKey, {
      person: { name: person.name, company: person.company, title: person.title },
      encounters: encounters.map((e) => ({ date: e.date, event: e.event, name: e.nameAsEntered, company: e.company, title: e.title, temperature: e.temperature, note: e.note })),
      rules: { label: signal.label, reasons: signal.reasons },
      today: ctx.today,
    });
    const err = box.querySelector('#ai-err');
    const check = r.ok ? validateArc(r.result) : null;
    if (!r.ok || !check.ok) {
      err.textContent = r.ok ? "The AI's answer didn't make sense: try again." : r.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = s ? 'Regenerate AI summary' : 'AI summary';
      return;
    }
    store.setAiSummary(person.id, { ...r.result, generatedAt: ctx.today, basedOnEncounters: encounters.length, model: r.model });
    renderAi(box, ctx, person, encounters, signal);
    ctx.applyNet();
  });
}

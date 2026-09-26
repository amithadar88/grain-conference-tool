// Contacts tab: list, contact page (timeline + signal), AI summary.
import { relationshipSignal, timelineMarkers } from '../signals.js';
import { validateArc } from '../validate.js';
import { aiArc } from '../api.js';
import { esc, fmtDate, signalClass } from './ui.js';

let query = '';

function rowsFor(store, today) {
  return store.people().map((person) => {
    const encounters = store.encountersFor(person.id);
    return { person, encounters, signal: relationshipSignal(encounters, today) };
  }).filter((r) => r.encounters.length)
    .sort((a, b) => b.encounters[b.encounters.length - 1].date.localeCompare(a.encounters[a.encounters.length - 1].date));
}

export function render(el, ctx, personId) {
  if (personId) return renderPerson(el, ctx, personId);
  const { store } = ctx;
  const rows = rowsFor(store, ctx.today);

  el.innerHTML = `<section class="view">
  <div class="view-head"><h2>Contacts</h2></div>
  <input type="search" id="q" placeholder="Search name or company…" value="${esc(query)}" aria-label="Search contacts" style="margin:8px 0">
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

}

function renderPerson(el, ctx, personId) {
  const { store } = ctx;
  const person = store.person(personId);
  if (!person) { el.innerHTML = '<section class="view"><p>Contact not found. <a href="#contacts">Back to contacts</a></p></section>'; return; }
  const encounters = store.encountersFor(personId);
  const signal = relationshipSignal(encounters, ctx.today);
  const unresolved = store.unresolvedFor(personId).map((id) => store.person(id)).filter(Boolean);

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

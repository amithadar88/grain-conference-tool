// Capture tab: one screen, one hand, works offline. Matching runs locally as the rep types.
import { defaultCaptureConference, dayNumber } from '../scoring.js';
import { findMatches } from '../matching.js';
import { relationshipSignal } from '../signals.js';
import { esc, fmtShort, signalClass, flash } from './ui.js';

const OTHER = '__other';
const FIELDS = ['event', 'otherEvent', 'name', 'company', 'note', 'temperature', 'email', 'linkedin', 'title'];

// Match decision for the current form: null (not answered), { personId, via } or { newPerson: true }.
let decision = null;
let lastMatch = { auto: null, candidates: [] };
let lastSaved = null;
let stickyEvent = null; // last event used this session (a new day/reload goes back to today's event)
let stickyOther = '';

// Grouped picker: My events (assigned to me), Happening soon (running or starting within 30 days),
// then All events. Nothing is hidden: without team sync, a reassignment made on another device
// won't reach this phone, so every event stays under "All events".
export function eventPickerGroups(confs, planOf, me, today) {
  const sorted = [...confs].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const upcoming = sorted.filter((c) => c.endDate >= today);
  return [
    { label: 'My events', items: me ? upcoming.filter((c) => planOf(c.id).rep === me) : [] },
    { label: 'Happening soon', items: upcoming.filter((c) => dayNumber(c.startDate) <= dayNumber(today) + 30) },
    { label: 'All events', items: sorted },
  ].filter((g) => g.items.length);
}

export function render(el, ctx) {
  const { store } = ctx;
  const confs = [...store.conferences()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const def = defaultCaptureConference(confs, ctx.today);
  const draft = store.draft();
  const me = store.settings().me;
  const selected = draft.event || stickyEvent || (def ? def.id : OTHER);
  const otherName = draft.otherEvent || stickyOther;

  let marked = false; // an event can sit in two groups: only its first copy is selected
  const option = (c) => {
    const sel = !marked && c.id === selected;
    if (sel) marked = true;
    return `<option value="${esc(c.id)}"${sel ? ' selected' : ''}>${esc(c.name)} · ${esc(fmtShort(c.startDate))}</option>`;
  };

  el.innerHTML = `<section class="view capture">
  ${me ? '' : `<div class="whoami"><b>Who are you?</b> (asked once)<div class="row">${store.team().map((n) => `<button type="button" class="chip" data-me="${esc(n)}">${esc(n)}</button>`).join(' ')}</div></div>`}
  <form id="cap" autocomplete="off" novalidate>
    <label>Event
      <select name="event"><option value="${OTHER}"${selected === OTHER ? ' selected' : ''}>Other event… (dinner, meetup, side event)</option>
        ${eventPickerGroups(confs, (id) => store.conferencePlan(id), me, ctx.today).map((g) => `<optgroup label="${esc(g.label)}">${g.items.map(option).join('')}</optgroup>`).join('')}
      </select>
    </label>
    <input name="otherEvent" placeholder="Event name, e.g. Payments dinner London" aria-label="Other event name" value="${esc(otherName)}"${selected === OTHER ? '' : ' hidden'}>
    <label>Name <input name="name" autocapitalize="words" enterkeyhint="next" value="${esc(draft.name)}"></label>
    <label>Company <input name="company" autocapitalize="words" enterkeyhint="next" value="${esc(draft.company)}"></label>
    <div id="match" aria-live="polite"></div>
    <label>Note <textarea name="note" placeholder="What did they say? Volumes, pain, next step…">${esc(draft.note)}</textarea></label>
    <fieldset class="temps"><legend>Temperature</legend>
      ${['hot', 'warm', 'cold'].map((t) => `<label><input type="radio" name="temperature" value="${t}"${draft.temperature === t ? ' checked' : ''}><span class="${t}">${t[0].toUpperCase() + t.slice(1)}</span></label>`).join('')}
    </fieldset>
    <details${draft.email || draft.linkedin || draft.title ? ' open' : ''}><summary>More (email, LinkedIn, title)</summary>
      <label>Email <input name="email" type="email" inputmode="email" autocapitalize="off" value="${esc(draft.email)}"></label>
      <label>LinkedIn <input name="linkedin" inputmode="url" autocapitalize="off" placeholder="linkedin.com/in/…" value="${esc(draft.linkedin)}"></label>
      <label>Job title <input name="title" autocapitalize="words" value="${esc(draft.title)}"></label>
    </details>
    <p class="error" id="cap-err" hidden></p>
    <button class="btn primary big" type="submit" style="margin-top:14px">Save lead</button>
  </form>
  <div id="done" role="status">${lastSaved || ''}</div>
</section>`;

  const form = el.querySelector('#cap');
  const matchEl = el.querySelector('#match');
  const values = () => {
    const f = new FormData(form);
    return Object.fromEntries(FIELDS.map((k) => [k, String(f.get(k) || '').trim()]));
  };

  el.querySelectorAll('[data-me]').forEach((b) => b.addEventListener('click', () => {
    store.updateSettings({ me: b.dataset.me });
    render(el, ctx);
  }));

  // ---- Matching panel ----
  function patternText(person) {
    const encs = store.encountersFor(person.id);
    if (encs.length < 2) return encs.length ? `Seen once before at ${esc(encs[0].event)}` : '';
    const sig = relationshipSignal(encs, ctx.today);
    return `<span class="sig ${signalClass(sig.label)}">${esc(sig.label)}</span> · ${encs.length} meetings`;
  }
  function lastSeen(c) {
    const e = c.last;
    if (!e) return esc(c.person.company || '');
    return `${esc(e.company || c.person.company || 'unknown company')} (${[e.title, e.event].filter(Boolean).map(esc).join(', ')})`;
  }
  function drawMatch() {
    const m = lastMatch;
    if (m.auto) {
      const why = m.auto.via === 'email' ? 'same email' : 'same LinkedIn';
      matchEl.innerHTML = `<div class="match">✓ Linked to <b>${esc(m.auto.person.name)}</b> (${why}) · ${esc(m.auto.person.company || '')}<br>${patternText(m.auto.person)}</div>`;
      return;
    }
    const cands = m.candidates;
    if (!cands.length) { matchEl.innerHTML = ''; return; }
    const chosen = (id) => decision && decision.personId === id;
    if (cands.length === 1) {
      const c = cands[0];
      const q = c.level === 'high'
        ? `Looks like <b>${esc(c.person.name)}</b> (${esc(c.person.company || '')}) · ${patternText(c.person)}`
        : `Same <b>${esc(c.person.name)}</b>? Last seen at ${lastSeen(c)}.<br>${patternText(c.person)}`;
      const answered = decision ? `<div class="chosen">${decision.newPerson ? 'Saving as a new person' : 'Will add to their history'}</div>` : '';
      matchEl.innerHTML = `<div class="match ${c.level}">${q}
        <div class="row"><button type="button" class="chip" data-pick="${esc(c.person.id)}" aria-pressed="${chosen(c.person.id)}">${c.level === 'high' ? 'Same person' : 'Yes'}</button>
        <button type="button" class="chip" data-pick="new" aria-pressed="${!!(decision && decision.newPerson)}">No</button></div>${answered}</div>`;
      return;
    }
    matchEl.innerHTML = `<div class="match low">Which <b>${esc(cands[0].person.name)}</b>?
      ${cands.map((c) => `<div class="row"><button type="button" class="chip" data-pick="${esc(c.person.id)}" aria-pressed="${chosen(c.person.id)}">This one</button> ${lastSeen(c)} · ${patternText(c.person)}</div>`).join('')}
      <div class="row"><button type="button" class="chip" data-pick="new" aria-pressed="${!!(decision && decision.newPerson)}">New person</button></div></div>`;
  }
  function runMatch() {
    const v = values();
    const next = findMatches(v, store.people(), store.encounters(), store.notSamePairs());
    const key = (m) => (m.auto ? `a:${m.auto.person.id}` : m.candidates.map((c) => c.person.id).join(','));
    if (key(next) !== key(lastMatch)) decision = null; // new suggestions -> ask again
    lastMatch = next;
    if (next.auto) decision = { personId: next.auto.person.id, via: next.auto.via };
    drawMatch();
  }
  matchEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    decision = b.dataset.pick === 'new' ? { newPerson: true } : { personId: b.dataset.pick, via: 'confirmed' };
    drawMatch();
  });

  let timer = null;
  form.addEventListener('input', (e) => {
    const v = values();
    store.setDraft(v);
    if (e.target.name === 'event') form.otherEvent.hidden = v.event !== OTHER;
    if (['name', 'company', 'email', 'linkedin'].includes(e.target.name)) {
      clearTimeout(timer);
      timer = setTimeout(runMatch, 400);
    }
  });

  // ---- Save ----
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    runMatch();
    const v = values();
    const rep = store.settings().me;
    const missing = [];
    if (!v.name) missing.push('a name');
    if (!v.temperature) missing.push('a temperature (Hot / Warm / Cold)');
    if (v.event === OTHER && !v.otherEvent) missing.push('the event name');
    if (!rep) missing.push('your name (tap it at the top)');
    const err = el.querySelector('#cap-err');
    if (missing.length) { err.textContent = `Add ${missing.join(', ')}.`; err.hidden = false; return; }
    err.hidden = true;

    const conf = v.event === OTHER ? null : store.conference(v.event);
    const capture = {
      conferenceId: conf ? conf.id : null,
      event: conf ? conf.name : v.otherEvent,
      date: ctx.today,
      name: v.name, company: v.company, title: v.title, email: v.email, linkedin: v.linkedin,
      temperature: v.temperature, note: v.note, rep,
    };
    const ids = lastMatch.candidates.map((c) => c.person.id);
    let opts;
    if (decision && decision.personId) opts = { link: decision };
    else if (decision && decision.newPerson) opts = { rejectedIds: ids };
    else opts = { unresolvedIds: ids };
    const r = store.saveCapture(capture, opts);

    const person = store.person(r.personId);
    const n = store.encountersFor(r.personId).length;
    const outcome = r.isNew
      ? (opts.unresolvedIds && opts.unresolvedIds.length ? 'saved as a new contact; the possible match is waiting on their page' : 'new contact')
      : `added to ${esc(person.name)}'s history (${n} meetings)`;
    lastSaved = `<div class="done">Saved ✓ <b>${esc(v.name)}</b>, ${outcome}. <a href="#contacts/${encodeURIComponent(r.personId)}">Open contact</a></div>`;

    flash(`✓ Saved: ${v.name}`);
    stickyEvent = v.event;
    stickyOther = v.otherEvent;
    store.clearDraft();
    decision = null;
    lastMatch = { auto: null, candidates: [] };
    render(el, ctx);
    el.querySelector('input[name="name"]').focus();
  });

  runMatch();
}

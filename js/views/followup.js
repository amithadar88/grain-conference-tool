// Shared "Draft follow-up" button + result panel. Used on Today (Act-now rows) and the contact page.
import { aiFollowup } from '../api.js';
import { validateFollowup } from '../validate.js';
import { esc, flash } from './ui.js';

export function renderFollowup(container, ctx, { person, encounters, signal, ai }) {
  container.innerHTML = `<button class="btn" type="button" data-needs-net>Draft follow-up</button>
    <span class="needs-net-hint" hidden>Needs connection</span><div class="fu-out"></div>`;
  const btn = container.querySelector('button');
  const out = container.querySelector('.fu-out');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const wasRegenerate = btn.textContent === 'Draft again';
    btn.textContent = 'Drafting…';
    const rep = ctx.store.settings().me;
    const r = await aiFollowup(ctx.store.settings().geminiKey, {
      person: { name: person.name, company: person.company, title: person.title },
      encounters: encounters.map((e) => ({ date: e.date, event: e.event, name: e.nameAsEntered, company: e.company, title: e.title, temperature: e.temperature, note: e.note })),
      rules: { label: signal.label, reasons: signal.reasons },
      ai: ai ? { label: ai.label, arc: ai.arc, nextStep: ai.nextStep } : null,
      rep,
      today: ctx.today,
    }, () => { btn.textContent = 'Taking longer than usual, retrying…'; });
    const check = r.ok ? validateFollowup(r.result) : null;
    btn.disabled = false;
    btn.textContent = wasRegenerate ? 'Draft again' : 'Draft follow-up';
    if (!r.ok || !check.ok) {
      out.innerHTML = `<p class="error">${esc(r.ok ? "The AI's answer didn't make sense: try again." : r.message)}</p>`;
      ctx.applyNet();
      return;
    }
    const { subject, body } = r.result;
    const mailto = person.email
      ? `mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : '';
    out.innerHTML = `<div class="box"><b>${esc(subject)}</b><pre>${esc(body)}</pre>
      <div class="row">
        <button class="btn fu-copy" type="button">Copy</button>
        ${mailto ? `<a class="btn" href="${esc(mailto)}">Open in email</a>` : '<span class="hint">No email on file</span>'}
      </div></div>`;
    btn.textContent = 'Draft again';
    out.querySelector('.fu-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); flash('✓ Copied'); } catch { /* clipboard unavailable */ }
    });
    ctx.applyNet();
  });
}

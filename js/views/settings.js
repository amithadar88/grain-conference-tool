// Settings: who am I, team, keys, AI status, reset demo data.
import { esc } from './ui.js';
import { aiStatus } from '../api.js';

export function render(el, ctx) {
  const { store } = ctx;
  const s = store.settings();
  const team = store.team();

  el.innerHTML = `<section class="view form">
  <h2>Settings</h2>
  <form id="settings-form" onsubmit="return false">
    <label>I am
      <select name="me">${['<option value="">Choose your name…</option>', ...team.map((n) => `<option${n === s.me ? ' selected' : ''}>${esc(n)}</option>`)].join('')}</select>
    </label>
    <label>Team names (comma-separated)
      <input name="team" value="${esc(team.join(', '))}">
    </label>
    <label>Gemini API key (optional: overrides the site's key)
      <input name="geminiKey" type="password" autocomplete="off" value="${esc(s.geminiKey)}">
    </label>
    <p class="hint" id="ai-status">AI status: checking…</p>
    <label>HubSpot private-app token (optional: without it, HubSpot runs in demo mode)
      <input name="hubspotToken" type="password" autocomplete="off" value="${esc(s.hubspotToken)}">
    </label>
    <p class="hint">Keys stay in this browser and are sent only with each request. They are never stored on the server.</p>
    <p id="saved" class="hint" role="status"></p>
  </form>
  <h3>Demo data</h3>
  <p class="hint">Reset clears everything the team added or changed in this browser (leads, statuses, added events, AI summaries). Keys and "I am" are kept.</p>
  <button class="btn" id="reset" type="button">Reset demo data</button>
  <h3 style="margin-top:20px">AI summaries</h3>
  <p class="hint">Copies all AI summaries as JSON, to paste into data/contacts.json under "aiSummaries".</p>
  <button class="btn" id="copy-ai" type="button">Copy AI summaries (JSON)</button>
  <pre id="ai-json" hidden></pre>
  <p class="hint" style="margin-top:20px"><a href="tests.html">Run the tests</a></p>
</section>`;

  const form = el.querySelector('#settings-form');
  const saved = el.querySelector('#saved');
  form.addEventListener('change', () => {
    const f = new FormData(form);
    const teamList = String(f.get('team')).split(',').map((x) => x.trim()).filter(Boolean);
    store.updateSettings({
      me: String(f.get('me') || ''),
      team: teamList,
      geminiKey: String(f.get('geminiKey') || '').trim(),
      hubspotToken: String(f.get('hubspotToken') || '').trim(),
    });
    saved.textContent = 'Saved ✓';
    if (teamList.join() !== team.join()) render(el, ctx); // refresh the "I am" list
    else checkAi();
  });

  el.querySelector('#reset').addEventListener('click', () => {
    if (!confirm('Reset demo data? Leads, statuses and added events from this browser will be deleted. Keys are kept.')) return;
    store.resetOverlay();
    saved.textContent = 'Demo data reset ✓';
  });

  el.querySelector('#copy-ai').addEventListener('click', async () => {
    const json = JSON.stringify(store.exportAiSummaries(), null, 2);
    const pre = el.querySelector('#ai-json');
    pre.textContent = json;
    pre.hidden = false;
    try { await navigator.clipboard.writeText(json); saved.textContent = 'Copied ✓'; } catch { saved.textContent = 'Select the text below and copy it.'; }
  });

  const statusEl = el.querySelector('#ai-status');
  async function checkAi() {
    const key = store.settings().geminiKey;
    const r = await aiStatus(key);
    if (!r.ok) { statusEl.textContent = `AI status: ${r.message}`; return; }
    statusEl.textContent = key ? 'AI: ready (your key)' : r.hasServerKey ? `AI: ready (server key, ${r.model})` : 'AI: needs a key';
  }
  checkAi();
}

// Small display helpers shared by all views. Pure: returns strings, no DOM access.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ALWAYS pass user-typed, AI-written or fetched text through esc() before putting it in HTML.
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Only http(s) links are rendered as links (blocks javascript: URLs in data).
export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

export function fmtDate(iso) {
  if (!iso) return '';
  return `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;
}

export function fmtShort(iso) {
  return iso ? `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}` : '';
}

export function fmtRange(start, end) {
  if (!end || start === end) return fmtDate(start);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${+start.slice(8, 10)}–${fmtDate(end)}`;
  if (start.slice(0, 4) === end.slice(0, 4)) return `${fmtShort(start)} – ${fmtDate(end)}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export const tierClass = (tier) => (tier === 'A+' ? 'aplus' : tier.toLowerCase());

// CSS class for a relationship label: "Warming - act now" -> "sig-warming".
export const signalClass = (label) => `sig-${String(label).split(' ')[0].toLowerCase()}`;

// Local date (not UTC), 'YYYY-MM-DD'.
export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

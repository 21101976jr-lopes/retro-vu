const TOKEN = /^[a-f0-9]{64}$/;
export function parseInvitation(value) {
  const raw = String(value || '').trim();
  if (TOKEN.test(raw)) return raw;
  try {
    const url = new URL(raw);
    // Never accept invitations from a different app origin.
    const token = new URLSearchParams(url.hash.slice(1)).get('stream');
    if (url.origin === window.location.origin && TOKEN.test(token || '')) return token;
  } catch { /* Input may be an unfinished pasted invitation. */ }
  return null;
}
export function pendingInvitation() {
  return parseInvitation(window.location.href) || '';
}
export async function newInvitation() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const owner = Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(owner));
  const invite = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return {owner,invite};
}
export function invitationURL(invite) { return `${window.location.origin}/#stream=${invite}`; }

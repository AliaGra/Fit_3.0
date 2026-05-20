/**
 * Legacy: parse one-line invite text "FirstName LastName City" (deprecated).
 * Help-bot now collects name and location in separate steps — see helpInviteIntake.js.
 */

function parseInviteRequestText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const parts = raw
    .split(/\s+/)
    .map((p) => p.replace(/^[,.\s]+|[,.\s]+$/g, ''))
    .filter(Boolean);

  if (parts.length < 3) return null;

  const firstName = parts[0];
  const city = parts[parts.length - 1];
  const lastName = parts.slice(1, -1).join(' ');

  if (!firstName || !lastName || !city) return null;
  if (firstName.length < 2 || lastName.length < 2 || city.length < 2) return null;

  return {
    firstName,
    lastName,
    city,
    oblast: '',
    rawText: raw
  };
}

module.exports = { parseInviteRequestText };

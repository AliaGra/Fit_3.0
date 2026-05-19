/**
 * Parse invite request text from help-bot: "FirstName LastName City" (one message).
 * Oblast is collected later in main bot via oblast/city picker.
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

/**
 * Транслитерація українського тексту в латиницю для пошуку (runtime, без збереження в БД).
 */
const MAP = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
  А: 'A',
  Б: 'B',
  В: 'V',
  Г: 'H',
  Ґ: 'G',
  Д: 'D',
  Е: 'E',
  Є: 'Ye',
  Ж: 'Zh',
  З: 'Z',
  И: 'Y',
  І: 'I',
  Ї: 'Yi',
  Й: 'I',
  К: 'K',
  Л: 'L',
  М: 'M',
  Н: 'N',
  О: 'O',
  П: 'P',
  Р: 'R',
  С: 'S',
  Т: 'T',
  У: 'U',
  Ф: 'F',
  Х: 'Kh',
  Ц: 'Ts',
  Ч: 'Ch',
  Ш: 'Sh',
  Щ: 'Shch',
  Ь: '',
  Ю: 'Iu',
  Я: 'Ia',
  ы: 'y',
  э: 'e',
  ъ: '',
  Ё: 'Yo',
  ё: 'yo'
};

function translitUa(str) {
  if (str == null || str === '') return '';
  let out = '';
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (MAP[c] !== undefined) out += MAP[c];
    else if (/[a-zA-Z0-9]/.test(c)) out += c;
    else if (/\s/.test(c)) out += ' ';
    // інші символи пропускаємо (лапки, дефіс тощо)
  }
  return out
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

module.exports = { translitUa };

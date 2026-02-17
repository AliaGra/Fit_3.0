/**
 * Розшифровка медичних кодів (MC001, MC002…) та ступеня тяжкості (mild, moderate…) для картки вправи.
 * Джерело: таблиця кодів + документ «Расшифровка тяжести заболевания».
 */

const MEDICAL_NAMES_UK = Object.freeze({
  MC001: "Коліна (артрит, травми зв'язок)",
  MC002: "Нижня частина спини (грижі, протрузії)",
  MC003: "Плечі (імпінджмент, ротаторна манжета)",
  MC004: "Гіпертонія (високий тиск)",
  MC005: "Діабет (цукровий діабет)",
  MC006: "Астма",
  MC007: "Варикозне розширення вен",
  MC008: "Остеопороз",
  MC009: "Вагітність",
  MC010: "Післяпологовий період",
  MC011: "Діастаз прямих м'язів живота",
  MC012: "Серцеві захворювання",
  MC013: "Грижа стравоходу (хіатальна)",
  MC014: "Грижа пахової/пупкової",
  MC015: "Шийний остеохондроз",
  MC016: "Сколіоз",
  MC017: "Епілепсія",
  MC018: "Ожиріння",
  MC019: "Плоскостопість",
  MC020: "Ахіллове сухожилля (тендініт)",
  MC021: "Ревматоїдний артрит",
  MC022: "Глаукома",
  MC023: "Відшарування сітківки (в анамнезі)",
  MC024: "Постковідний синдром",
  MC025: "Гіпотиреоз"
});

const SEVERITY_LABELS = Object.freeze({
  mild: 'Легка ступінь',
  moderate: 'Помірна ступінь',
  severe: 'Тяжка ступінь',
  'moderate-severe': 'Помірно-тяжка ступінь',
  'mild-moderate': 'Легко-помірна ступінь',
  'mild-severe': 'Легко-тяжка ступінь',
  stage1: 'Стадія 1',
  stage2: 'Стадія 2',
  stage3: 'Стадія 3',
  type1: 'Тип 1',
  type2: 'Тип 2',
  acute: 'Гостра фаза',
  chronic: 'Хронічна',
  class1: 'Клас 1',
  class2: 'Клас 2',
  class3: 'Клас 3',
  trimester1: '1 триместр',
  trimester2: '2 триместр',
  trimester3: '3 триместр',
  '0-6wk': '0–6 тиж.',
  '6-12wk': '6–12 тиж.',
  '3-6mo': '3–6 міс.',
  controlled: 'Контрольована',
  uncontrolled: 'Неконтрольована',
  early: 'Рання',
  advanced: 'Прогресуюча',
  recent: 'Нещодавнє',
  remote: 'Давнє',
  osteopenia: 'Остеопенія'
});

/** Замінює кириличні М/С у кодах на латинські (МС003 → MC003). Не чіпає звичайний український текст. */
function latinizeCodeInString(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\u041C\u0421(\d)/g, 'MC$1');
}

/** Нормалізує код до виду MC001, MC002, … (3 цифри). */
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  const s = latinizeCodeInString(code.trim()).toUpperCase();
  const m = s.match(/^MC(\d+)$/);
  if (m) {
    const num = m[1].replace(/^0+/, '') || '0';
    return 'MC' + String(parseInt(num, 10)).padStart(3, '0');
  }
  return s;
}

/**
 * Повертає повну назву стану за кодом MC або оригінальний текст, якщо коду немає в словнику.
 */
function codeToName(code) {
  if (!code || typeof code !== 'string') return '';
  const key = normalizeCode(code);
  return MEDICAL_NAMES_UK[key] || code.trim();
}

/**
 * Повертає підпис ступеня тяжкості за ключем (mild, stage1 тощо).
 */
function severityToLabel(severity) {
  if (!severity || typeof severity !== 'string') return '';
  const key = severity.trim().toLowerCase();
  return SEVERITY_LABELS[key] || severity.trim();
}

/**
 * Декодує один фрагмент: "MC003 (mild)" або "MC003 (moderate-severe)" або "MC015" або "MC001, MC002".
 * Повертає рядок з повними назвами та ступенем (примітки не входять).
 */
function decodeSegment(segment) {
  const s = segment.trim();
  if (!s) return '';
  const latin = latinizeCodeInString(s);
  const slashIdx = latin.indexOf('/');
  if (slashIdx >= 0) {
    const codePart = latin.slice(0, slashIdx).trim();
    const severityKey = latin.slice(slashIdx + 1).trim().toLowerCase();
    const name = codeToName(codePart);
    const severityLabel = severityToLabel(severityKey);
    if (severityLabel) return name ? name + ' — ' + severityLabel : segment;
    return name || segment;
  }
  const parenMatch = latin.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const codePart = parenMatch[1].trim();
    const severityKey = parenMatch[2].trim().toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
    const severityLabel = severityToLabel(severityKey);
    const codes = codePart.split(',').map((c) => c.trim()).filter(Boolean);
    const names = codes.map((c) => codeToName(c));
    const nameStr = names.join(', ');
    if (severityLabel) return nameStr ? nameStr + ' — ' + severityLabel : segment;
    return nameStr || segment;
  }
  const codes = latin.split(',').map((c) => c.trim()).filter(Boolean);
  const decoded = codes.map((c) => codeToName(c));
  return decoded.join('; ') || segment;
}

/**
 * Розшифровує рядок з бібліотеки: коди MC (латинські або кириличні МС) та ступінь у дужках (mild), (moderate-severe)
 * або через слеш MC001/mild. Підтримує примітки після двокрапки: "MC003 (mild): кут нахилу...".
 * Повертає текст для картки: повні назви + ступінь захворювання.
 */
function decodeMedicalText(str) {
  if (str == null) return '';
  const raw = String(str).trim();
  if (!raw) return '';
  const withLatin = latinizeCodeInString(raw);
  const normalized = withLatin.replace(/\r\n|\r|\n/g, ', ');
  const segments = normalized.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  const result = [];
  for (const seg of segments) {
    const colonIdx = seg.indexOf(': ');
    if (colonIdx >= 0) {
      const prefix = seg.slice(0, colonIdx).trim();
      const notes = seg.slice(colonIdx + 1).trim();
      const decodedPrefix = decodeSegment(prefix);
      result.push(decodedPrefix ? decodedPrefix + ': ' + notes : seg);
    } else {
      const decoded = decodeSegment(seg);
      if (decoded) result.push(decoded);
    }
  }
  return result.join('; ');
}

module.exports = {
  MEDICAL_NAMES_UK,
  SEVERITY_LABELS,
  codeToName,
  severityToLabel,
  decodeMedicalText,
  normalizeCode,
  latinizeCodeInString
};

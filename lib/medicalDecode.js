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

/** Нормалізує код до виду MC001, MC002, … (3 цифри). */
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  const s = code.trim().toUpperCase();
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
 * Розшифровує рядок з бібліотеки: коди MC та ступінь тяжкості (наприклад "MC001/mild" або "MC001, MC004/stage2").
 * Підтримує роздільники: кома, крапка з комою, переноси рядків.
 * Повертає текст для відображення в картці: повні назви + ступінь захворювання.
 */
function decodeMedicalText(str) {
  if (str == null) return '';
  const raw = String(str).trim();
  if (!raw) return '';
  const normalized = raw.replace(/\r\n|\r|\n/g, ',').replace(/\s*,\s*/g, ',').replace(/\s*;\s*/g, ';');
  const parts = normalized.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const result = [];
  for (const part of parts) {
    const slashIdx = part.indexOf('/');
    if (slashIdx >= 0) {
      const code = part.slice(0, slashIdx).trim();
      const severity = part.slice(slashIdx + 1).trim();
      const name = codeToName(code);
      const severityLabel = severityToLabel(severity);
      if (severityLabel) {
        result.push(name ? name + ' — ' + severityLabel : part);
      } else {
        result.push(name || part);
      }
    } else {
      const decoded = codeToName(part);
      result.push(decoded || part);
    }
  }
  return result.join('; ');
}

module.exports = {
  MEDICAL_NAMES_UK,
  SEVERITY_LABELS,
  codeToName,
  severityToLabel,
  decodeMedicalText
};

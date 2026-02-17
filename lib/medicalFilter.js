/**
 * Медична фільтрація вправ для користувача (Логіка складання плану тренувань.md, розд. 3.3).
 * filterExerciseForUser(exercise, userMedConditions) → BLOCKED | ALLOWED_WITH_MOD | SAFE | NEUTRAL.
 * Парсинг полів medical_contraindications, medical_limitations, safe_for — формати як у medicalDecode.js.
 */

const { normalizeCode, latinizeCodeInString } = require('./medicalDecode');

/** Порядок тяжкості для порівняння (user.severity >= threshold → блок). */
const SEVERITY_RANK = Object.freeze({
  mild: 1,
  'mild-moderate': 1.5,
  moderate: 2,
  'moderate-severe': 2.5,
  severe: 3,
  'mild-severe': 2,
  stage1: 1,
  stage2: 2,
  stage3: 3,
  type1: 1,
  type2: 2,
  acute: 3,
  chronic: 2,
  controlled: 1,
  uncontrolled: 3,
  class1: 1,
  class2: 2,
  class3: 3,
  osteopenia: 1,
  early: 1,
  advanced: 3,
  recent: 3,
  remote: 1,
  trimester1: 1,
  trimester2: 2,
  trimester3: 3,
  '0-6wk': 3,
  '6-12wk': 2,
  '3-6mo': 1
});

function getSeverityRank(severity) {
  if (!severity || typeof severity !== 'string') return 0;
  const key = severity.trim().toLowerCase().replace(/\s*-\s*/g, '-');
  return SEVERITY_RANK[key] ?? 1;
}

/**
 * Нормалізує рядок поля (латиниця, без приміток після двокрапки).
 */
function normalizeFieldStr(str) {
  if (str == null) return '';
  const raw = String(str).trim();
  if (!raw) return '';
  const withLatin = latinizeCodeInString(raw);
  return withLatin.replace(/\r\n|\r|\n/g, ', ');
}

/**
 * Парсить один сегмент (до крапки з комою) на код(и) та опційну ступінь.
 * Формати: MC001, MC001/mild, MC003 (moderate-severe), MC001, MC002.
 * Повертає масив { mc_code, severityKey }; severityKey = null якщо не вказано.
 */
function parseSegmentWithSeverity(segment) {
  const s = segment.trim();
  if (!s) return [];
  const beforeColon = s.indexOf(': ') >= 0 ? s.slice(0, s.indexOf(': ')).trim() : s;
  const latin = latinizeCodeInString(beforeColon);

  const slashIdx = latin.indexOf('/');
  if (slashIdx >= 0) {
    const codePart = latin.slice(0, slashIdx).trim();
    const severityKey = latin.slice(slashIdx + 1).trim().toLowerCase().replace(/\s*-\s*/g, '-');
    const code = normalizeCode(codePart);
    return code ? [{ mc_code: code, severityKey }] : [];
  }

  const parenMatch = latin.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const codePart = parenMatch[1].trim();
    const severityKey = parenMatch[2].trim().toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
    const codes = codePart.split(',').map((c) => normalizeCode(c.trim())).filter(Boolean);
    return codes.map((mc_code) => ({ mc_code, severityKey }));
  }

  const codes = latin.split(',').map((c) => normalizeCode(c.trim())).filter(Boolean);
  return codes.map((mc_code) => ({ mc_code, severityKey: null }));
}

/**
 * Парсує поле типу medical_contraindications → [{ mc_code, severityThreshold }].
 * Якщо severity не вказано, threshold = 'mild' (будь-яка тяжкість користувача блокує).
 */
function parseContraindications(str) {
  const normalized = normalizeFieldStr(str);
  if (!normalized) return [];
  const segments = normalized.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  const result = [];
  for (const seg of segments) {
    const items = parseSegmentWithSeverity(seg);
    for (const { mc_code, severityKey } of items) {
      result.push({ mc_code, severityThreshold: severityKey || 'mild' });
    }
  }
  return result;
}

/**
 * Парсує поле medical_limitations або safe_for → масив нормалізованих mc_code.
 */
function parseCodeList(str) {
  const normalized = normalizeFieldStr(str);
  if (!normalized) return [];
  const segments = normalized.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  const codes = new Set();
  for (const seg of segments) {
    const items = parseSegmentWithSeverity(seg);
    for (const { mc_code } of items) codes.add(mc_code);
  }
  return Array.from(codes);
}

/**
 * Перевіряє, чи ступінь користувача >= порогу (вправа протипоказана при такій тяжкості).
 */
function severityMeetsThreshold(userSeverity, threshold) {
  const userRank = getSeverityRank(userSeverity);
  const thresholdRank = getSeverityRank(threshold);
  return userRank >= thresholdRank;
}

/**
 * Фільтр вправи для користувача за медичним профілем.
 * exercise: { medicalContraindications?, medicalLimitations?, safeFor?, modifications? } (camelCase як з getExerciseDetailById).
 * userMedConditions: [{ mc_code, severity }, ...], тільки активні (is_active = true).
 * Повертає: { status: 'BLOCKED'|'ALLOWED_WITH_MOD'|'SAFE'|'NEUTRAL', reason?, modification?, note? }.
 */
function filterExerciseForUser(exercise, userMedConditions) {
  if (!userMedConditions || !Array.isArray(userMedConditions) || userMedConditions.length === 0) {
    return { status: 'NEUTRAL' };
  }

  const contra = parseContraindications(exercise.medicalContraindications || exercise.medical_contraindications || '');
  const limitations = parseCodeList(exercise.medicalLimitations || exercise.medical_limitations || '');
  const safeFor = parseCodeList(exercise.safeFor || exercise.safe_for || '');
  const modificationsText = (exercise.modifications || '').toString().trim();

  let blocked = null;
  let allowedWithMod = null;
  let safe = null;

  for (const user of userMedConditions) {
    const uc = normalizeCode(user.mc_code);
    if (!uc) continue;
    const userSeverity = (user.severity || '').toString().trim();

    const contraEntry = contra.find((c) => c.mc_code === uc);
    if (contraEntry && severityMeetsThreshold(userSeverity, contraEntry.severityThreshold)) {
      blocked = { reason: uc + (userSeverity ? ' ' + userSeverity : '') };
      break;
    }

    if (limitations.includes(uc)) {
      allowedWithMod = { modification: modificationsText || 'Дотримуйтесь обмежень за станом.' };
      continue;
    }

    if (safeFor.includes(uc)) {
      safe = { note: 'Рекомендована при цьому стані.' };
    }
  }

  if (blocked) return { status: 'BLOCKED', reason: blocked.reason };
  if (allowedWithMod) return { status: 'ALLOWED_WITH_MOD', modification: allowedWithMod.modification };
  if (safe) return { status: 'SAFE', note: safe.note };
  return { status: 'NEUTRAL' };
}

module.exports = {
  filterExerciseForUser,
  parseContraindications,
  parseCodeList,
  getSeverityRank,
  SEVERITY_RANK
};

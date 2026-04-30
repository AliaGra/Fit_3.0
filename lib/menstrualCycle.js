/**
 * Фази циклу та модифікатори навантаження для генерації плану (жінки).
 * Граніці фаз масштабуються від середньої довжини циклу L та тривалості місячних B.
 */

const STATUS = Object.freeze({
  UNSPECIFIED: 'unspecified',
  REGULAR: 'regular',
  PERIMENOPAUSE: 'perimenopause',
  MENOPAUSE: 'menopause'
});

const PHASE = Object.freeze({
  MENSTRUAL: 'menstrual',
  FOLLICULAR: 'follicular',
  OVULATORY: 'ovulatory',
  LUTEAL: 'luteal',
  UNKNOWN: 'unknown',
  MENOPAUSE_LINEAR: 'menopause_linear',
  PERI_SUPPORT: 'perimenopause_support'
});

const PHASE_LABEL_UA = Object.freeze({
  menstrual: 'Місячні',
  follicular: 'Фолікулярна',
  ovulatory: 'Овуляторна',
  luteal: 'Лютеїнова',
  unknown: 'Цикл не уточнено',
  menopause_linear: 'Постменопауза',
  perimenopause_support: 'Перименопауза (підтримка)'
});

const DEFAULT_CYCLE_LEN = 28;
const DEFAULT_BLEEDING = 5;
const PERI_GAP_DAYS = 45;

function calendarDiffDays(fromDate, toDate) {
  const a = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const b = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function parseDateFromSettings(d) {
  if (!d) return null;
  if (d instanceof Date && !isNaN(d.getTime())) return d;
  const s = String(d).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

/**
 * День циклу 1 = перший день місячних (від last_period_start).
 */
function dayInCycle(lastStart, now, cycleLen) {
  const L = Math.max(15, Math.min(60, cycleLen || DEFAULT_CYCLE_LEN));
  const start = parseDateFromSettings(lastStart);
  if (!start) return null;
  let d = calendarDiffDays(start, now) + 1;
  if (d < 1) return null;
  while (d > L) d -= L;
  return d;
}

/**
 * Граніці фаз у днях (1..L), B = тривалість місячних.
 * Овуляторне вікно ~13–15-й день при L=28; масштабується пропорційно L.
 */
function phaseBounds(L, B) {
  const bleed = Math.max(1, Math.min(B || DEFAULT_BLEEDING, Math.floor(L / 2)));
  const ovStart = Math.min(L, Math.max(bleed + 1, Math.round((13 / 28) * L)));
  const ovEnd = Math.min(L, Math.max(ovStart, Math.round((15 / 28) * L)));
  return { bleedEnd: bleed, ovStart, ovEnd };
}

function classifyDay(day, L, B) {
  const b = phaseBounds(L, B);
  if (day <= b.bleedEnd) return PHASE.MENSTRUAL;
  if (day < b.ovStart) return PHASE.FOLLICULAR;
  if (day <= b.ovEnd) return PHASE.OVULATORY;
  return PHASE.LUTEAL;
}

function modifiersForPhase(phase) {
  switch (phase) {
    case PHASE.MENSTRUAL:
      return {
        setsMultiplier: 0.75,
        excludeHighImpact: true,
        hint: 'Фаза місячних: помірне навантаження, без стрибків; акцент на техніку та відновлення.'
      };
    case PHASE.FOLLICULAR:
      return {
        setsMultiplier: 1.0,
        excludeHighImpact: false,
        hint: 'Фолікулярна фаза: можна поступово підвищувати інтенсивність.'
      };
    case PHASE.OVULATORY:
      return {
        setsMultiplier: 1.1,
        excludeHighImpact: false,
        hint: 'Овуляторне вікно: зазвичай краща переносимість навантажень.'
      };
    case PHASE.LUTEAL:
      return {
        setsMultiplier: 0.92,
        excludeHighImpact: false,
        hint: 'Лютеїнова фаза: трохи зменшуємо обʼєм, більше контролю пульсу та відновлення.'
      };
    case PHASE.PERI_SUPPORT:
      return {
        setsMultiplier: 0.88,
        excludeHighImpact: false,
        hint: 'Перименопауза: давно не було місячних у журналі — обережне навантаження; підтверди початок циклу в профілі для точнішої персоналізації.'
      };
    case PHASE.MENOPAUSE_LINEAR:
      return {
        setsMultiplier: 1.0,
        excludeHighImpact: false,
        hint: 'Постменопауза: лінійний план без циклу; пріоритет сили та здоровʼя кісток (за узгодженням з лікарем).'
      };
    default:
      return {
        setsMultiplier: 1.0,
        excludeHighImpact: false,
        hint: null
      };
  }
}

/**
 * settings: рядок з user_cycle_settings (camelCase) або null
 * logs: [{ eventType, eventDate }] останні period_start
 * now: Date
 */
function resolveTrainingContext(settings, logs, now = new Date()) {
  const g = (settings && settings.reproductiveStatus) || settings?.reproductive_status || STATUS.UNSPECIFIED;
  if (g === STATUS.MENOPAUSE || g === 'menopause') {
    const m = modifiersForPhase(PHASE.MENOPAUSE_LINEAR);
    return {
      phase: PHASE.MENOPAUSE_LINEAR,
      phaseLabelUa: PHASE_LABEL_UA.menopause_linear,
      reproductiveStatus: STATUS.MENOPAUSE,
      modifiers: m,
      dayInCycle: null
    };
  }

  const L = settings?.avgCycleLengthDays != null
    ? Number(settings.avgCycleLengthDays)
    : (settings?.avg_cycle_length_days != null ? Number(settings.avg_cycle_length_days) : DEFAULT_CYCLE_LEN);
  const B = settings?.avgBleedingDays != null
    ? Number(settings.avgBleedingDays)
    : (settings?.avg_bleeding_days != null ? Number(settings.avg_bleeding_days) : DEFAULT_BLEEDING);

  let lastStart = settings?.lastPeriodStart || settings?.last_period_start;
  if (!lastStart && Array.isArray(logs)) {
    const starts = logs.filter((x) => (x.eventType || x.event_type) === 'period_start');
    if (starts.length && starts[0].eventDate) lastStart = starts[0].eventDate;
  }

  const lastDate = parseDateFromSettings(lastStart);
  if (g === STATUS.PERIMENOPAUSE || g === 'perimenopause') {
    if (lastDate) {
      const gap = calendarDiffDays(lastDate, now);
      if (gap > PERI_GAP_DAYS) {
        const m = modifiersForPhase(PHASE.PERI_SUPPORT);
        return {
          phase: PHASE.PERI_SUPPORT,
          phaseLabelUa: PHASE_LABEL_UA.perimenopause_support,
          reproductiveStatus: STATUS.PERIMENOPAUSE,
          modifiers: m,
          dayInCycle: null
        };
      }
    }
  }

  if (g !== STATUS.REGULAR && g !== 'regular' && g !== STATUS.PERIMENOPAUSE && g !== 'perimenopause') {
    return {
      phase: PHASE.UNKNOWN,
      phaseLabelUa: PHASE_LABEL_UA.unknown,
      reproductiveStatus: g,
      modifiers: modifiersForPhase(PHASE.UNKNOWN),
      dayInCycle: null
    };
  }

  if (!lastDate) {
    return {
      phase: PHASE.UNKNOWN,
      phaseLabelUa: PHASE_LABEL_UA.unknown,
      reproductiveStatus: g,
      modifiers: modifiersForPhase(PHASE.UNKNOWN),
      dayInCycle: null
    };
  }

  const day = dayInCycle(lastDate, now, L);
  if (day == null) {
    return {
      phase: PHASE.UNKNOWN,
      phaseLabelUa: PHASE_LABEL_UA.unknown,
      reproductiveStatus: g,
      modifiers: modifiersForPhase(PHASE.UNKNOWN),
      dayInCycle: null
    };
  }

  const phase = classifyDay(day, L, B);
  return {
    phase,
    phaseLabelUa: PHASE_LABEL_UA[phase] || phase,
    reproductiveStatus: g,
    modifiers: modifiersForPhase(phase),
    dayInCycle: day,
    cycleLength: L,
    bleedingDays: B
  };
}

function applyToSetsReps(sr, modifiers) {
  if (!sr || !modifiers || modifiers.setsMultiplier == null) return sr;
  const sets = Math.max(1, Math.round(sr.sets * modifiers.setsMultiplier));
  return { ...sr, sets };
}

/** Розбір дати ДД.ММ.РРРР (Україна) */
function parseUaDateString(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const y = parseInt(m[3], 10);
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo, d);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

module.exports = {
  STATUS,
  PHASE,
  PHASE_LABEL_UA,
  DEFAULT_CYCLE_LEN,
  DEFAULT_BLEEDING,
  PERI_GAP_DAYS,
  resolveTrainingContext,
  applyToSetsReps,
  modifiersForPhase,
  parseDateFromSettings,
  parseUaDateString
};

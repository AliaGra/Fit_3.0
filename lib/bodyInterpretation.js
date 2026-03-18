/**
 * Deterministic interpretation for body type analytics (Option 5A).
 * Returns: { label, note, risk, priority_note, phaseEffective }
 */
const { getWHStatus, getBMIStatus } = require('./bodyMetrics');

const TYPE_LABELS = Object.freeze({
  apple: 'Яблуко',
  inverted_triangle: 'Перевернутий трикутник',
  pear: 'Груша',
  hourglass: 'Пісочний годинник',
  near_hourglass: 'Майже пісочний годинник',
  rectangle: 'Прямокутник',
  apple_m: 'Яблуко',
  v_shape: 'V-торс',
  athletic_m: 'Атлетичний',
  rectangle_m: 'Прямокутник'
});

const BUILD_LABELS = Object.freeze({
  asthenic: 'астенік',
  normosthenic: 'нормостенік',
  hypersthenic: 'гіперстенік'
});

const FEMALE_WAIST_APPLE_BY_BUILD = Object.freeze({ asthenic: 0.51, normosthenic: 0.53, hypersthenic: 0.55 });
const MALE_WAIST_APPLE_BY_BUILD = Object.freeze({ asthenic: 0.51, normosthenic: 0.53, hypersthenic: 0.55 });

function getWhApple(gender, bodyBuild) {
  const b = bodyBuild && String(bodyBuild) ? String(bodyBuild) : 'normosthenic';
  if (gender === 'female') return FEMALE_WAIST_APPLE_BY_BUILD[b] || 0.53;
  if (gender === 'male') return MALE_WAIST_APPLE_BY_BUILD[b] || 0.53;
  return 0.53;
}

function getWhZone(wh, whApple) {
  if (wh == null) return null;
  if (wh < 0.49) return 'normal';
  if (wh >= 0.49 && wh < whApple) return 'borderline';
  return 'high';
}

function buildTypeNote(bodyType) {
  const t = bodyType;
  if (t === 'apple' || t === 'apple_m') {
    return 'Основний акцент — зона талії: важливо зменшувати WH поступово та без різких стартів.';
  }
  if (t === 'inverted_triangle') {
    return 'Плечі відносно ширші за ягодиці: щоб збалансувати силует, пріоритет — низ тіла.';
  }
  if (t === 'pear') {
    return 'Ягодиці відносно ширші за плечі: для балансу силуету пріоритет — верх тіла.';
  }
  if (t === 'hourglass') {
    return 'Пропорції плечі/ягодиці збалансовані, талія виразна — задача підтримувати контраст і тонус.';
  }
  if (t === 'near_hourglass') {
    return 'Пропорції близькі до пісочного годинника — невеликі зміни дадуть чіткіший контраст.';
  }
  if (t === 'rectangle' || t === 'rectangle_m') {
    return 'Пропорції рівні — найкраще працює стратегія «додати контраст» через акценти в плані.';
  }
  if (t === 'v_shape') {
    return 'Є виражена V-форма: ключ — підтримувати талію в нормі та розумно дозувати масонабір.';
  }
  if (t === 'athletic_m') {
    return 'V-форма помірна: щоб підсилити силует, потрібні акценти на спину/дельти та контроль талії.';
  }
  return null;
}

function buildBuildNote(bodyBuild) {
  const b = bodyBuild && String(bodyBuild) ? String(bodyBuild) : 'normosthenic';
  if (b === 'asthenic') return 'Тілобудова астенік: кістяк тонший, тому пороги типу фігури оцінюються зі зниженою поправкою.';
  if (b === 'hypersthenic') return 'Тілобудова гіперстенік: кістяк ширший, тому пороги типу фігури оцінюються з підвищеною поправкою.';
  return 'Тілобудова нормостенік: оцінка пропорцій за базовими порогами.';
}

function phaseNote(phase) {
  const p = phase || null;
  if (p === 'deficit') return 'Рекомендована фаза: дефіцит калорій (зниження жиру).';
  if (p === 'maintenance') return 'Рекомендована фаза: підтримка (стабільне харчування + силові).';
  if (p === 'surplus') return 'Рекомендована фаза: профіцит калорій (набір м’язової маси).';
  if (p === 'recomposition') return 'Рекомендована фаза: рекомпозиція (зниження жиру без різких змін ваги).';
  return null;
}

function priorityBase(priority) {
  if (!priority) return 'Акцент: підтримка пропорцій.';
  if (priority.upper === 'grow' && priority.lower !== 'grow') return 'Акцент: верх тіла (плечі/спина/груди).';
  if (priority.lower === 'grow' && priority.upper !== 'grow') return 'Акцент: низ тіла (ноги/ягодиці).';
  return 'Акцент: підтримка пропорцій.';
}

/**
 * @param {Object} input
 * @param {'female'|'male'|'unknown'} input.gender
 * @param {string|null} input.bodyType
 * @param {string|null} input.bodyBuild
 * @param {number|null} input.fatPct
 * @param {string|null} input.fatStatus
 * @param {number|null} input.wh
 * @param {number|null} input.bmi
 * @param {number|null} input.age
 * @param {Object|null} input.priority
 * @param {string|null} input.phase
 * @param {boolean} input.hasWrist
 * @param {boolean} input.hasNeck
 */
function interpretBodyProfile(input) {
  const gender = input && input.gender ? input.gender : 'unknown';
  const bodyType = input && input.bodyType ? input.bodyType : null;
  const bodyBuild = input && input.bodyBuild ? input.bodyBuild : 'normosthenic';
  const fatPct = input && input.fatPct != null ? Number(input.fatPct) : null;
  const fatStatus = input && input.fatStatus ? input.fatStatus : null;
  const wh = input && input.wh != null ? Number(input.wh) : null;
  const age = input && input.age != null ? Number(input.age) : null;
  const priority = input && input.priority ? input.priority : null;
  const basePhase = input && input.phase ? input.phase : null;
  const hasWrist = input && input.hasWrist === true;
  const hasNeck = input && input.hasNeck === true;

  const label = bodyType && TYPE_LABELS[bodyType] ? TYPE_LABELS[bodyType] : (bodyType || null);

  const whApple = getWhApple(gender, bodyBuild);
  const whZone = getWhZone(wh, whApple);

  const risk = [];
  if (fatStatus === 'above_normal') risk.push('high_fat');
  if (whZone === 'borderline') risk.push('borderline_apple');
  if (age != null && age >= 45) risk.push('age_45_plus');
  if (!hasWrist) risk.push('missing_wrist');
  if (!hasNeck) risk.push('missing_neck');

  let phaseEffective = basePhase;
  if (bodyBuild === 'asthenic' && basePhase === 'deficit') {
    phaseEffective = 'maintenance';
    risk.push('asthenic_deficit_adjusted');
  }

  const noteParts = [];
  const tNote = buildTypeNote(bodyType);
  if (tNote) noteParts.push(tNote);
  noteParts.push(buildBuildNote(bodyBuild));

  if (fatPct != null && isFinite(fatPct)) {
    const status = fatStatus === 'above_normal' ? 'вище норми' : (fatStatus === 'normal' ? 'в межах норми' : '—');
    noteParts.push(`Оцінка % жиру: ${Math.round(fatPct * 10) / 10}% (статус: ${status}).`);
  } else if (whZone && whZone !== 'normal') {
    noteParts.push('WH індекс у граничній/підвищеній зоні — це ключовий маркер для вибору фази.');
  }

  const pNote = phaseNote(phaseEffective);
  if (pNote) noteParts.push(pNote);

  const priorityParts = [];
  priorityParts.push(priorityBase(priority));
  const shortPhase = phaseEffective === 'deficit'
    ? 'Фаза: дефіцит.'
    : (phaseEffective === 'maintenance'
      ? 'Фаза: підтримка.'
      : (phaseEffective === 'surplus'
        ? 'Фаза: профіцит.'
        : (phaseEffective === 'recomposition' ? 'Фаза: рекомпозиція.' : null)));
  if (shortPhase) priorityParts.push(shortPhase);
  if (bodyBuild === 'asthenic' && basePhase === 'deficit') {
    priorityParts.push('Для астеніка дефіцит — лише під контролем; старт краще з підтримки або дуже м’якого дефіциту.');
  }
  if (age != null && age >= 45 && bodyBuild === 'asthenic') {
    priorityParts.push('Силові критично важливі.');
  }

  return {
    label,
    note: noteParts.join(' '),
    risk,
    priority_note: priorityParts.filter(Boolean).join(' '),
    phaseEffective,
    meta: {
      buildLabel: BUILD_LABELS[bodyBuild] || bodyBuild,
      whApple,
      whZone
    }
  };
}

module.exports = {
  interpretBodyProfile,
  TYPE_LABELS,
  BUILD_LABELS,
  getWhZone,
  getWhApple
};


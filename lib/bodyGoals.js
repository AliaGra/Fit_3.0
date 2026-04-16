/**
 * Бажані параметри тіла — валідація, дельта, збереження, тексти для учня/тренера.
 */
const supabase = require('./supabase');
const User = require('./user');
const { getBMIStatus, getWHStatus, BMI_RANGES, DELTA_THRESHOLDS, getBMIMinForGoal } = require('./bodyMetrics');
const { classifyBodyType, calcBodyFatPctNavy, getBodyBuild } = require('./bodyType');
const { interpretBodyProfile } = require('./bodyInterpretation');
const goalsAI = require('./ai/goalsVsCurrent');

const CHANGE_RATE = Object.freeze({
  WAIST_CM_PER_MONTH: 1.5,
  HIPS_CM_PER_MONTH: 0.8,
  SHOULDERS_CM_PER_MONTH: 0.5,
  CHEST_CM_PER_MONTH: 0.5,
  ARM_CM_PER_MONTH: 0.4,
  WEIGHT_KG_PER_MONTH: 2.0
});

const AGE_BANDS = Object.freeze({
  YOUNG: '18_35',
  MID: '36_49',
  SENIOR: '50_plus'
});

const BMI_BY_AGE = Object.freeze({
  [AGE_BANDS.YOUNG]: Object.freeze({ min: 21.5, max: 23.0 }),
  [AGE_BANDS.MID]: Object.freeze({ min: 23.5, max: 24.5 }),
  [AGE_BANDS.SENIOR]: Object.freeze({ min: 24.5, max: 26.0 })
});

const ACTIVITY_K = Object.freeze({
  none: 1.2,
  low: 1.375,
  medium: 1.55,
  high: 1.725
});

const AGE_DELAY_K = Object.freeze({
  [AGE_BANDS.YOUNG]: 1.0,
  [AGE_BANDS.MID]: 1.4,
  [AGE_BANDS.SENIOR]: 1.8
});

function getAgeBand(age) {
  const a = age != null ? Number(age) : null;
  if (a == null || !isFinite(a) || a < 36) return AGE_BANDS.YOUNG;
  if (a < 50) return AGE_BANDS.MID;
  return AGE_BANDS.SENIOR;
}

function resolveActivityLevel(user = {}) {
  const job = String(user.jobType || '').trim();
  const transport = String(user.transportType || '').trim();
  const steps = String(user.stepsCategory || '').trim();
  const extra = String(user.extraActivity || '').trim();

  const scoreJob = job === 'physical' ? 3 : job === 'standing' ? 2 : job === 'office_mixed' ? 1 : 0;
  const scoreTransport = transport === 'walk_bike' ? 2 : transport === 'combined' ? 1 : 0;
  const scoreSteps = steps === 'over_15k' ? 3 : steps === '10k_15k' ? 2 : steps === '5k_10k' ? 1 : 0;
  const scoreExtra = extra === 'intense' ? 3 : extra === 'moderate' ? 2 : extra === 'light' ? 1 : 0;

  const total = scoreJob + scoreTransport + scoreSteps + scoreExtra;
  if (total <= 2) return { level: 'none', k: ACTIVITY_K.none, total, labelUa: 'Нульова' };
  if (total <= 5) return { level: 'low', k: ACTIVITY_K.low, total, labelUa: 'Низька' };
  if (total <= 8) return { level: 'medium', k: ACTIVITY_K.medium, total, labelUa: 'Середня' };
  return { level: 'high', k: ACTIVITY_K.high, total, labelUa: 'Висока' };
}

function calcMedicalWeightRange(heightCm, age, activityLevel) {
  if (!heightCm || !isFinite(Number(heightCm))) return null;
  const h = Number(heightCm) / 100;
  const band = getAgeBand(age);
  const bmi = BMI_BY_AGE[band];
  if (!bmi) return null;
  let minW = bmi.min * h * h;
  let maxW = bmi.max * h * h;
  if (activityLevel && activityLevel.level === 'high') {
    maxW = maxW * 1.075;
  }
  return {
    min: Math.round(minW),
    max: Math.round(maxW),
    bmiMin: bmi.min,
    bmiMax: bmi.max,
    ageBand: band
  };
}

function calcUnifiedIdealModel(user = {}) {
  const heightCm = user.height != null ? Number(user.height) : null;
  const gender = String(user.gender || '').trim().toLowerCase();
  const age = user.age != null ? Number(user.age) : null;
  if (!heightCm || !isFinite(heightCm) || !gender) return null;

  const wrist = user.wrist != null ? Number(user.wrist) : null;
  const bodyBuild = wrist && isFinite(wrist) ? getBodyBuild(wrist, gender) : 'normosthenic';
  const activity = resolveActivityLevel(user);
  const ageBand = getAgeBand(age);

  const aesthetic = calcIdealWeightAdjusted(heightCm, gender, bodyBuild, age, user.experienceStartDate || null);
  const medical = calcMedicalWeightRange(heightCm, age, activity);

  const waistMinK = age != null && age >= 45 ? 0.46 : 0.42;
  const waistMaxK = age != null && age >= 45 ? 0.48 : 0.45;
  const waist = {
    min: Math.round(heightCm * waistMinK),
    max: Math.round(heightCm * waistMaxK)
  };

  const hipsRatio = gender === 'female' ? 0.7 : 0.85;
  const hips = {
    min: Math.round(waist.min / hipsRatio),
    max: Math.round(waist.max / hipsRatio)
  };

  let chest = null;
  let shoulders = null;
  let biceps = null;
  if (wrist && isFinite(wrist) && wrist > 0) {
    const chestBase = wrist * 6.5;
    const shouldersK = gender === 'female' ? 1.12 : 1.33;
    const bicepsK = 0.36;
    chest = { min: Math.round(chestBase * 0.95), max: Math.round(chestBase * 1.05), base: Math.round(chestBase) };
    shoulders = {
      min: Math.round(chest.min * shouldersK),
      max: Math.round(chest.max * shouldersK),
      base: Math.round(chest.base * shouldersK)
    };
    biceps = {
      min: Math.round(chest.min * bicepsK),
      max: Math.round(chest.max * bicepsK),
      base: Math.round(chest.base * bicepsK)
    };
  }

  return {
    bodyBuild,
    ageBand,
    activity,
    weight: {
      medical,
      aesthetic: aesthetic
        ? { min: aesthetic.optMin, max: aesthetic.optMax, comfort: aesthetic.comfort, raw: aesthetic }
        : null
    },
    waist,
    hips,
    chest,
    shoulders,
    biceps
  };
}

function evaluateGoalRealism(goalField, goalValue, currentValue, user = {}, model = null) {
  const m = model || calcUnifiedIdealModel(user);
  if (!m) return null;

  const ageBand = m.ageBand || getAgeBand(user.age);
  const kAge = AGE_DELAY_K[ageBand] || 1.0;
  const kAct = m.activity && m.activity.k ? m.activity.k : ACTIVITY_K.low;
  const goal = Number(goalValue);
  const cur = currentValue != null ? Number(currentValue) : null;
  if (!isFinite(goal)) return null;

  let min = null;
  let max = null;
  if (goalField === 'goal_weight' && m.weight && m.weight.medical) {
    min = m.weight.medical.min;
    max = m.weight.medical.max;
  } else if (goalField === 'goal_waist' && m.waist) {
    min = m.waist.min; max = m.waist.max;
  } else if (goalField === 'goal_hips' && m.hips) {
    min = m.hips.min; max = m.hips.max;
  } else if (goalField === 'goal_shoulders' && m.shoulders) {
    min = m.shoulders.min; max = m.shoulders.max;
  } else if (goalField === 'goal_chest' && m.chest) {
    min = m.chest.min; max = m.chest.max;
  } else if (goalField === 'goal_arm' && m.biceps) {
    min = m.biceps.min; max = m.biceps.max;
  }
  const withinRange = min != null && max != null ? goal >= min && goal <= max : false;

  let months = null;
  let weeks = null;
  if (cur != null && isFinite(cur) && cur > 0) {
    const delta = Math.abs(goal - cur);
    if (goalField === 'goal_weight') {
      const weeklyLoss = cur * 0.007;
      if (weeklyLoss > 0) {
        weeks = (delta / weeklyLoss) * (kAge / kAct);
        months = weeks / 4.345;
      }
    } else {
      months = delta * 1.5 * (kAge / kAct);
    }
  }

  let verdict = 'Hard';
  const heightCm = user.height != null ? Number(user.height) : null;
  const wrist = user.wrist != null ? Number(user.wrist) : null;
  const extreme =
    (goalField === 'goal_shoulders' && wrist && isFinite(wrist) && goal > wrist * 9) ||
    (goalField === 'goal_waist' && heightCm && isFinite(heightCm) && goal < heightCm * 0.4);
  if (months != null && months > 24) verdict = 'Impossible';
  else if (extreme) verdict = 'Extreme';
  else if (withinRange && months != null && months < 3) verdict = 'Easy';
  else if (goalField === 'goal_weight' && cur != null && Math.abs(goal - cur) / cur > 0.15) verdict = 'Hard';
  else if (months != null && months >= 6 && months <= 12) verdict = 'Hard';

  return {
    verdict,
    withinRange,
    min,
    max,
    months: months != null ? Math.round(months * 10) / 10 : null,
    weeks: weeks != null ? Math.round(weeks * 10) / 10 : null,
    kAge,
    kAct,
    ageBand
  };
}

function validateGoalField(field, value, heightCm) {
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { valid: false, error: 'Введіть числове значення. Наприклад: 65.0' };
  }
  if (heightCm == null || heightCm <= 0) {
    return { valid: true, value: num };
  }
  const limits = {
    goal_weight: { min: Math.round(heightCm * 0.22), max: Math.round(heightCm * 0.55) },
    goal_waist: { min: Math.round(heightCm * 0.35), max: Math.round(heightCm * 0.65) },
    goal_hips: { min: Math.round(heightCm * 0.45), max: Math.round(heightCm * 0.80) },
    goal_shoulders: { min: Math.round(heightCm * 0.5), max: Math.round(heightCm * 0.85) },
    goal_chest: { min: Math.round(heightCm * 0.45), max: Math.round(heightCm * 0.75) },
    goal_arm: { min: Math.round(heightCm * 0.12), max: Math.round(heightCm * 0.30) }
  };
  const limit = limits[field];
  if (!limit) return { valid: true, value: num };
  if (num < limit.min || num > limit.max) {
    return {
      valid: false,
      error: 'Значення ' + num + ' виходить за межі для цього зросту. Допустимо: від ' + limit.min + ' до ' + limit.max
    };
  }
  return { valid: true, value: num };
}

const FIELDS_FOR_DELTA = [
  { key: 'weight', goalKey: 'goal_weight', label: 'Вага', unit: 'кг', rate: CHANGE_RATE.WEIGHT_KG_PER_MONTH },
  { key: 'waist', goalKey: 'goal_waist', label: 'Талія', unit: 'см', rate: CHANGE_RATE.WAIST_CM_PER_MONTH },
  { key: 'glutes', goalKey: 'goal_hips', label: 'Ягодиці', unit: 'см', rate: CHANGE_RATE.HIPS_CM_PER_MONTH },
  { key: 'shoulders', goalKey: 'goal_shoulders', label: 'Плечі', unit: 'см', rate: CHANGE_RATE.SHOULDERS_CM_PER_MONTH },
  { key: 'chest', goalKey: 'goal_chest', label: 'Груди', unit: 'см', rate: CHANGE_RATE.CHEST_CM_PER_MONTH },
  { key: 'arm', goalKey: 'goal_arm', label: 'Біцепс', unit: 'см', rate: CHANGE_RATE.ARM_CM_PER_MONTH }
];

function calcDeltaAndTimeline(current, goals) {
  const result = [];
  for (const f of FIELDS_FOR_DELTA) {
    const currentVal = current[f.key];
    const goalVal = goals[f.goalKey];
    if (currentVal == null || goalVal == null) continue;
    const delta = Math.abs(Math.round((goalVal - currentVal) * 10) / 10);
    const months = Math.ceil(delta / f.rate);
    const reached = delta < 0.5;
    const direction = f.key === 'weight'
      ? (goals.goal_weight < currentVal ? 'знизити' : 'набрати')
      : (goalVal > currentVal ? 'збільшити' : 'зменшити');
    result.push({
      field: f.key,
      label: f.label,
      current: currentVal,
      goal: goalVal,
      delta,
      direction,
      months,
      reached,
      unit: f.unit
    });
  }
  return result;
}

function calcBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

// Devine + deterministic adjustments (same factors as bodyAnalysis.js)
function calcIdealWeightAdjusted(heightCm, gender, bodyBuild, age, experienceStartDate) {
  if (!heightCm || !gender) return null;
  const base = gender === 'female' ? 45.5 : 50.0;
  const inches = Math.max(0, (heightCm - 152.4) / 2.54);
  const ideal = base + 2.3 * inches;
  const build = bodyBuild || 'normosthenic';
  const buildFactor = build === 'asthenic' ? 0.93 : (build === 'hypersthenic' ? 1.07 : 1.0);
  const ageNum = age != null ? Number(age) : null;
  let ageFactor = 1.0;
  if (ageNum != null && isFinite(ageNum)) {
    if (gender === 'female') {
      if (ageNum <= 17) ageFactor = 0.95;
      else if (ageNum <= 24) ageFactor = 1.00;
      else if (ageNum <= 34) ageFactor = 1.02;
      else if (ageNum <= 44) ageFactor = 1.04;
      else if (ageNum <= 54) ageFactor = 1.06;
      else ageFactor = 1.08;
    } else {
      if (ageNum <= 17) ageFactor = 0.94;
      else if (ageNum <= 24) ageFactor = 1.00;
      else if (ageNum <= 34) ageFactor = 1.03;
      else if (ageNum <= 44) ageFactor = 1.05;
      else if (ageNum <= 54) ageFactor = 1.07;
      else ageFactor = 1.09;
    }
  }
  let expDays = 0;
  if (experienceStartDate) {
    const d = experienceStartDate instanceof Date ? experienceStartDate : new Date(experienceStartDate);
    if (!isNaN(d.getTime())) expDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000)));
  }
  let expFactor;
  if (gender === 'female') {
    if (expDays > 730) expFactor = 1.090;
    else if (expDays >= 366) expFactor = 1.065;
    else if (expDays >= 90) expFactor = 1.040;
    else expFactor = 1.000;
    if (ageNum != null && ageNum <= 17) expFactor = Math.min(expFactor, 1.030);
  } else {
    if (expDays > 730) expFactor = 1.120;
    else if (expDays >= 366) expFactor = 1.090;
    else if (expDays >= 90) expFactor = 1.060;
    else expFactor = 1.000;
    if (ageNum != null && ageNum <= 17) expFactor = Math.min(expFactor, 1.040);
  }
  // П.3: Fallback floor при зрості < 152.4 см: мін. 43 кг (ж) / 47 кг (ч)
  const heightFloor = gender === 'female' ? 43.0 : 47.0;
  const adjIdeal = Math.max(ideal * buildFactor * ageFactor * expFactor, heightFloor);
  return {
    min: Math.round(adjIdeal * 0.95),
    comfort: Math.round(adjIdeal),
    athletic: Math.round(adjIdeal * 1.05),
    max: Math.round(adjIdeal * 1.10),
    optMin: Math.round(adjIdeal * 0.95),
    optMax: Math.round(adjIdeal * 1.05),
    meta: { build, expDays, age: ageNum }
  };
}

function isTeenRestricted(user) {
  const age = user && user.age != null ? user.age : null;
  if (age == null) return false;
  if (age < 16) return true;
  if (age >= 18) return false;
  const teenMode = user.teenMode;
  if (teenMode === false) return false;
  return true;
}

function analyzeGoalsVsCurrentState(goals, user, currentMeasurements, trigger = 'goals_save') {
  const result = {
    errors: [],
    warnings: [],
    hints: [],
    deltaItems: [],
    hasConflict: false,
    snapshot: {
      bodyType: null,
      bodyBuild: null,
      fatPct: null,
      fatStatus: null,
      label: null,
      note: null,
      risk: [],
      priority_note: null,
      currentBMI: null,
      currentWH: null,
      phase: null,
      priority: null,
      idealWeight: null
    },
    analyzedAt: new Date().toISOString(),
    triggeredBy: trigger
  };

  const heightCm = user && user.height != null ? user.height : null;
  const gender = user && user.gender ? user.gender : 'unknown';
  const wristForBuild = currentMeasurements && currentMeasurements.wrist != null
    ? currentMeasurements.wrist
    : (user && user.wrist != null ? user.wrist : null);
  const buildForIdeal = wristForBuild != null ? getBodyBuild(wristForBuild, gender) : 'normosthenic';
  if (heightCm && gender && gender !== 'unknown') {
    result.snapshot.idealWeight = calcIdealWeightAdjusted(
      heightCm,
      gender,
      buildForIdeal,
      user && user.age != null ? user.age : null,
      user && user.experienceStartDate ? user.experienceStartDate : null
    );
  }

  // ── ГРУПА 1: перевірки без поточних замірів ──
  if (goals.goal_waist != null && heightCm) {
    const goalWH = goals.goal_waist / heightCm;
    if (goalWH < 0.35) {
      result.errors.push({
        field: 'goal_waist',
        message: `Бажана талія ${goals.goal_waist} см — анатомічно неможливо для зросту ${heightCm} см.`
      });
    }
  }

  if (goals.goal_weight != null && heightCm) {
    const goalBMI = calcBMI(goals.goal_weight, heightCm);
    const isTeen = isTeenRestricted(user);
    const bmiMin = getBMIMinForGoal(gender, isTeen);
    if (goalBMI != null && goalBMI < bmiMin) {
      // П.1: мінімальний ІМТ залежить від статі та віку
      result.errors.push({
        field: 'goal_weight',
        message: isTeen
          ? `Бажана вага дає ІМТ ${goalBMI} — нижче мінімуму ${bmiMin} для підлітків. Така ціль небезпечна.`
          : `Бажана вага дає ІМТ ${goalBMI} — нижче мінімально допустимого ${bmiMin} для ${gender === 'male' ? 'чоловіків' : 'жінок'}. Така ціль небезпечна.`
      });
    } else if (goalBMI != null && goalBMI < 18.5) {
      result.warnings.push({
        type: 'low_goal_bmi',
        field: 'goal_weight',
        message: `Бажана вага дає ІМТ ${goalBMI} — нижче норми. Важливо контролювати стан і прогрес поступово.`
      });
    } else if (goalBMI != null && goalBMI > BMI_RANGES.goal_max) {
      // П.2: максимальна вага ≤ ІМТ 29.9
      result.errors.push({
        field: 'goal_weight',
        message: `Бажана вага дає ІМТ ${goalBMI} — вище допустимого максимуму ${BMI_RANGES.goal_max}. Для здорової цілі знизьте бажану вагу.`
      });
    }
  }

  if (goals.goal_waist != null && goals.goal_hips != null) {
    if (goals.goal_waist >= goals.goal_hips) {
      result.errors.push({
        field: 'goal_waist',
        message: `Талія (${goals.goal_waist} см) не може бути рівною або більшою за ягодиці (${goals.goal_hips} см).`
      });
    } else {
      const ratio = goals.goal_hips / goals.goal_waist;
      if (ratio < 1.10) {
        result.warnings.push({
          type: 'low_contrast',
          field: 'goal_hips',
          message: `Різниця між ягодицями і талією в цілях замала (співвідношення ${Math.round(ratio * 100) / 100}). Для вираженого силуету часто потрібен більший контраст.`
        });
      }
    }
  }

  if (goals.goal_shoulders != null && goals.goal_waist != null && goals.goal_shoulders < goals.goal_waist) {
    result.warnings.push({
      type: 'shoulders_below_waist',
      field: 'goal_shoulders',
      message: 'Бажані плечі менші за талію — перевірте, чи правильно введені значення.'
    });
  }

  if (isTeenRestricted(user) && goals.goal_weight != null && currentMeasurements && currentMeasurements.weight != null) {
    if (goals.goal_weight < currentMeasurements.weight * 0.95) {
      const age = user && user.age != null ? user.age : null;
      result.errors.push({
        field: 'goal_weight',
        message: age != null && age < 16
          ? 'Для учнів до 16 років ціль на зниження ваги недоступна незалежно від налаштувань.'
          : 'Для учнів 16–17 років ціль на зниження ваги потребує додаткового підтвердження. Уточніть з тренером.'
      });
    }
  }

  if (result.errors.length > 0) return result;

  // ── ГРУПА 2: потребує поточних замірів ──
  if (!currentMeasurements) return result;

  result.deltaItems = calcDeltaAndTimeline(currentMeasurements, goals);

  const warnIfDeltaPct = (key, goalKey, pctLimit, label) => {
    const cur = currentMeasurements[key];
    const goal = goals[goalKey];
    if (cur == null || goal == null) return;
    if (!cur) return;
    const pct = Math.abs((goal - cur) / cur);
    if (pct > pctLimit) {
      result.warnings.push({
        type: 'delta_too_large',
        field: goalKey,
        message: `${label}: ціль амбітна (зміна ~${Math.round(pct * 100)}% від поточного). Рекомендується проміжна ціль.`
      });
    }
  };
  warnIfDeltaPct('waist', 'goal_waist', DELTA_THRESHOLDS.waist_warning, 'Талія');
  warnIfDeltaPct('glutes', 'goal_hips', DELTA_THRESHOLDS.hips_warning, 'Ягодиці');
  warnIfDeltaPct('weight', 'goal_weight', DELTA_THRESHOLDS.weight_warning, 'Вага');

  if (heightCm) {
    const currentBMI = currentMeasurements.weight != null ? calcBMI(currentMeasurements.weight, heightCm) : null;
    const currentWH = currentMeasurements.waist != null ? Math.round((currentMeasurements.waist / heightCm) * 100) / 100 : null;
    result.snapshot.currentBMI = currentBMI;
    result.snapshot.currentWH = currentWH;
  }

  const typeInput = {
    height: heightCm,
    shoulders: currentMeasurements.shoulders,
    chest: currentMeasurements.chest,
    waist: currentMeasurements.waist,
    glutes: currentMeasurements.glutes,
    neck: currentMeasurements.neck,
    wrist: currentMeasurements.wrist
  };
  const build = currentMeasurements.wrist ? getBodyBuild(currentMeasurements.wrist, gender) : 'normosthenic';
  const manualFat = user && (user.fatPctManual != null ? user.fatPctManual : user.bodyFatPct) != null
    ? (user.fatPctManual != null ? user.fatPctManual : user.bodyFatPct)
    : null;
  const navyFat = currentMeasurements.neck
    ? calcBodyFatPctNavy(gender, heightCm, currentMeasurements.waist, currentMeasurements.glutes, currentMeasurements.neck)
    : null;
  const primaryFat = manualFat != null ? manualFat : navyFat;
  const bodyType = classifyBodyType({ ...typeInput, fatPct: primaryFat }, gender);
  if (bodyType && bodyType.type) {
    result.snapshot.bodyType = bodyType.type;
    result.snapshot.phase = bodyType.priority && bodyType.priority.phase ? bodyType.priority.phase : null;
    result.snapshot.priority = bodyType.priority || null;
    result.snapshot.bodyBuild = build;
    result.snapshot.fatPct = primaryFat != null ? primaryFat : null;
    result.snapshot.fatStatus = bodyType.fatStatus || null;
    const wh = result.snapshot.currentWH;
    const bmi = result.snapshot.currentBMI;
    const interp = interpretBodyProfile({
      gender,
      bodyType: bodyType.type,
      bodyBuild: build,
      fatPct: primaryFat,
      fatStatus: bodyType.fatStatus || null,
      wh,
      bmi,
      age: user && user.age != null ? user.age : null,
      priority: bodyType.priority || null,
      phase: bodyType.priority && bodyType.priority.phase ? bodyType.priority.phase : null,
      hasWrist: currentMeasurements.wrist != null,
      hasNeck: currentMeasurements.neck != null
    });
    if (interp) {
      result.snapshot.label = interp.label || null;
      result.snapshot.note = interp.note || null;
      result.snapshot.risk = interp.risk || [];
      result.snapshot.priority_note = interp.priority_note || null;
      // може змінювати effective phase (asthenic+deficit)
      if (interp.phaseEffective) result.snapshot.phase = interp.phaseEffective;
    }
    if (!result.snapshot.idealWeight) {
      result.snapshot.idealWeight = calcIdealWeightAdjusted(heightCm, gender, build, user && user.age != null ? user.age : null, user && user.experienceStartDate ? user.experienceStartDate : null);
    }

    // Підказка: бажана вага виходить за оптимальний діапазон
    if (goals.goal_weight != null && result.snapshot.idealWeight) {
      const iw = result.snapshot.idealWeight;
      if (iw.optMin != null && iw.optMax != null) {
        if (goals.goal_weight < iw.optMin) {
          result.hints.push({
            type: 'goal_weight_below_optimal',
            message: `Бажана вага ${goals.goal_weight} кг нижча за оптимальний діапазон для вашої тілобудови і віку (${iw.optMin}–${iw.optMax} кг).`
          });
        } else if (goals.goal_weight > iw.optMax) {
          result.hints.push({
            type: 'goal_weight_above_optimal',
            message: `Бажана вага ${goals.goal_weight} кг вища за оптимальний діапазон для вашої тілобудови і віку (${iw.optMin}–${iw.optMax} кг).`
          });
        }
      }
    }
  }

  result.whStatus = getWHStatus(currentMeasurements.waist, heightCm);
  result.bmiStatus = getBMIStatus(currentMeasurements.weight, heightCm);

  if (goals.goal_hips != null && currentMeasurements.waist != null && goals.goal_hips < currentMeasurements.waist) {
    result.errors.push({
      field: 'goal_hips',
      message: `Бажані ягодиці (${goals.goal_hips} см) менші за поточну талію (${currentMeasurements.waist} см) — анатомічно неможливо.`
    });
    return result;
  }

  if (goals.goal_weight != null && heightCm) {
    const goalBMI = calcBMI(goals.goal_weight, heightCm);
    const currentBMI = currentMeasurements.weight != null ? calcBMI(currentMeasurements.weight, heightCm) : null;
    if (goalBMI != null && goalBMI > 35) {
      if (currentBMI != null && currentBMI < 30) {
        result.errors.push({
          field: 'goal_weight',
          message: `Бажана вага дає ІМТ ${goalBMI} — зона ожиріння 2. Така ціль не узгоджується з поточним станом.`
        });
        return result;
      }
      result.warnings.push({
        type: 'high_goal_bmi',
        field: 'goal_weight',
        message: `Бажана вага дає ІМТ ${goalBMI} — зона ожиріння. Рекомендується проміжна ціль і поетапний підхід.`
      });
    }
  }

  const t = result.snapshot.bodyType;
  const cm = currentMeasurements;
  const g = goals;

  const addVectorWarning = (type, field, message) => {
    result.warnings.push({ type, field, message });
    result.hasConflict = true;
  };
  // Векторні протиріччя — це ПОПЕРЕДЖЕННЯ (не блокуємо), AI має озвучити.
  const addVectorConflict = (field, message) => {
    addVectorWarning('vector_conflict', field, message);
  };

  if (t === 'apple_m') {
    if (g.goal_weight != null && cm.weight != null && g.goal_weight >= cm.weight) {
      addVectorConflict('goal_weight', 'При типі фігури "яблуко" пріоритет — зниження ваги. Ціль набрати вагу суперечить вектору.');
    }
    if (g.goal_waist != null && cm.waist != null && g.goal_waist >= cm.waist) {
      addVectorConflict('goal_waist', 'При типі фігури "яблуко" пріоритет — зменшення талії. Ціль збільшити талію суперечить вектору.');
    }
  }

  if (t === 'apple' && gender === 'female') {
    if (g.goal_waist != null && cm.waist != null && g.goal_waist >= cm.waist) {
      addVectorConflict('goal_waist', 'Тип фігури "яблуко" передбачає зменшення талії. Ціль збільшити талію суперечить вектору.');
    }
    if (g.goal_weight != null && cm.weight != null && (user && user.age != null && user.age >= 45) && g.goal_weight > cm.weight) {
      addVectorWarning('apple_weight_gain_45plus', 'goal_weight', 'При типі "яблуко" і віці 45+ набір ваги може збільшити талію. Часто краще рекомпозиція.');
    }
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips <= cm.glutes) {
      addVectorWarning('apple_hips_reduction', 'goal_hips', 'Ягодиці вже компенсують широку талію. Зменшення ягодиць може погіршити пропорції.');
    }
  }

  if (t === 'v_shape') {
    if (g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders < cm.shoulders) {
      addVectorConflict('goal_shoulders', 'Плечі вже на рівні V-торсу. Зменшення плечей суперечить типу фігури.');
    }
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips > cm.glutes * 1.10) {
      addVectorWarning('vector_conflict', 'goal_hips', 'V-торс передбачає відносно вузькі стегна. Значне збільшення ягодиць може зменшити V-ефект.');
    }
  }

  if (t === 'athletic_m') {
    if (g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders < cm.shoulders) {
      addVectorConflict('goal_shoulders', 'Атлетичний тип потребує розвитку плечей. Ціль зменшити плечі суперечить вектору.');
    }
    if (g.goal_chest != null && cm.chest != null && g.goal_chest < cm.chest) {
      addVectorConflict('goal_chest', 'Для атлетичного типу груди — частина V-силуету. Ціль зменшити груди суперечить пріоритету.');
    }
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips > cm.glutes * 1.15) {
      addVectorWarning('vector_conflict', 'goal_hips', 'Для атлетичного типу стегна не є пріоритетом. Значне збільшення ягодиць варто уточнити з тренером.');
    }
  }

  if (t === 'rectangle_m') {
    if (g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders <= cm.shoulders) {
      addVectorConflict('goal_shoulders', 'Прямокутний тип потребує розвитку плечей для V-форми. Ціль не відповідає вектору.');
    }
    if (g.goal_chest != null && cm.chest != null && g.goal_chest < cm.chest) {
      addVectorConflict('goal_chest', 'Груди — частина V-торсу. Ціль зменшити груди суперечить пріоритету.');
    }
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips > cm.glutes * 1.10) {
      addVectorWarning('vector_conflict', 'goal_hips', 'Для прямокутного типу пріоритет — верх тіла, не низ. Уточніть ціль по ягодицях.');
    }
  }

  if (gender === 'female' && result.snapshot.priority) {
    const pr = result.snapshot.priority;
    if (pr.lower === 'grow' && g.goal_hips != null && cm.glutes != null && g.goal_hips < cm.glutes) {
      addVectorConflict('goal_hips', 'Ціль зменшити ягодиці суперечить вектору розвитку для цього типу фігури.');
    }
    if (pr.upper === 'grow' && g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders < cm.shoulders) {
      addVectorConflict('goal_shoulders', 'Ціль зменшити плечі суперечить вектору розвитку для цього типу фігури.');
    }
  }

  // ── Повна відповідність кейсам inverted_triangle / pear ──
  if (t === 'inverted_triangle') {
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips < cm.glutes) {
      addVectorConflict('goal_hips', 'Ціль зменшити ягодиці суперечить типу фігури (перевернутий трикутник → пріоритет низ тіла).');
    }
  }
  if (t === 'pear') {
    if (g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders < cm.shoulders) {
      addVectorConflict('goal_shoulders', 'Ціль зменшити плечі суперечить типу фігури (груша → пріоритет верх тіла).');
    }
  }

  // Підказка: амбітна але досяжна + орієнтовний термін
  const hasDeltaWarn = (result.warnings || []).some((w) => w && w.type === 'delta_too_large');
  if (!hasDeltaWarn && (result.deltaItems || []).length > 0) {
    const maxMonths = Math.max(...result.deltaItems.map((i) => i && i.months != null ? i.months : 0));
    if (maxMonths > 0) {
      result.hints.push({ type: 'timeline', message: `Ціль амбітна, але досяжна. Орієнтовний термін: ~${maxMonths} міс.` });
    }
  }

  return result;
}

function buildDeterministicGoalsBlock(analysisResult) {
  if (!analysisResult) return '';
  const lines = [];
  if (analysisResult.errors && analysisResult.errors.length) {
    lines.push('БЛОКУВАННЯ:');
    for (const e of analysisResult.errors) lines.push('- ' + (e.message || ''));
  }
  if (analysisResult.deltaItems && analysisResult.deltaItems.length) {
    lines.push('Дельта і терміни:');
    for (const item of analysisResult.deltaItems) {
      if (!item) continue;
      if (item.reached) {
        lines.push(`- ${item.label}: ціль досягнута ✅ (${item.current} ${item.unit})`);
      } else {
        const pct = item.current ? Math.round((item.delta / item.current) * 100) : null;
        lines.push(`- ${item.label}: ${item.current} → ${item.goal} ${item.unit} (${item.direction} ${item.delta} ${item.unit}${pct != null ? ', ~' + pct + '%' : ''} — ~${item.months} міс.)`);
      }
    }
  }
  if (analysisResult.warnings && analysisResult.warnings.length) {
    lines.push('ПОПЕРЕДЖЕННЯ:');
    for (const w of analysisResult.warnings) lines.push('- ' + (w.message || ''));
  }
  if (analysisResult.hints && analysisResult.hints.length) {
    lines.push('ПІДКАЗКА:');
    for (const h of analysisResult.hints) lines.push('- ' + (h.message || ''));
  }
  return lines.join('\n');
}

function shouldShowAIComment(analysisResult) {
  if (!analysisResult) return false;
  if (analysisResult.warnings && analysisResult.warnings.length > 0) return true;
  if (analysisResult.hasConflict) return true;
  const hasReached = (analysisResult.deltaItems || []).some((i) => i.reached);
  if (hasReached) return true;
  const hasLongTimeline = (analysisResult.deltaItems || []).some((i) => i.months > 6);
  if (hasLongTimeline) return true;
  return false;
}

function buildAIInputBlock(analysisResult, user) {
  const lines = [];
  const genderLabel = user && user.gender === 'female' ? 'жінка' : user && user.gender === 'male' ? 'чоловік' : 'не вказано';
  lines.push(`Стать: ${genderLabel}, вік: ${user && user.age != null ? user.age : '—'} р., зріст: ${user && user.height != null ? user.height : '—'} см`);

  if (analysisResult && analysisResult.snapshot) {
    if (analysisResult.snapshot.bodyType) lines.push(`Тип фігури: ${analysisResult.snapshot.bodyType}`);
    if (analysisResult.snapshot.currentWH != null) lines.push(`Поточний WH: ${analysisResult.snapshot.currentWH}`);
    if (analysisResult.snapshot.currentBMI != null) lines.push(`Поточний ІМТ: ${analysisResult.snapshot.currentBMI}`);
    if (analysisResult.snapshot.phase) lines.push(`Рекомендована фаза: ${analysisResult.snapshot.phase}`);
  }

  for (const item of analysisResult.deltaItems || []) {
    if (item.reached) {
      lines.push(`${item.label}: ціль вже досягнута (${item.current} ${item.unit})`);
      continue;
    }
    lines.push(`${item.label}: ${item.direction} на ${item.delta} ${item.unit} (з ${item.current} до ${item.goal}) — орієнтовно ${item.months} міс.`);
  }

  for (const w of analysisResult.warnings || []) {
    lines.push(`Увага: ${w.message}`);
  }

  return lines.join('\n');
}

function determineNotificationLevel(prevAnalysis, newAnalysis) {
  if (!prevAnalysis) return { level: 'cache_only', reason: 'first_analysis' };

  const prevErrors = Array.isArray(prevAnalysis.errors) ? prevAnalysis.errors : [];
  const nextErrors = Array.isArray(newAnalysis.errors) ? newAnalysis.errors : [];
  const prevWarnings = Array.isArray(prevAnalysis.warnings) ? prevAnalysis.warnings : [];
  const nextWarnings = Array.isArray(newAnalysis.warnings) ? newAnalysis.warnings : [];

  // Newly reached goals
  const prevDelta = Array.isArray(prevAnalysis.deltaItems) ? prevAnalysis.deltaItems : [];
  const nextDelta = Array.isArray(newAnalysis.deltaItems) ? newAnalysis.deltaItems : [];
  const newlyReached = nextDelta.filter((i) => i && i.reached && !prevDelta.find((p) => p && p.field === i.field && p.reached));
  if (newlyReached.length > 0) return { level: 'notify', reason: 'goal_reached', items: newlyReached };

  // New vector conflicts
  const prevConf = prevWarnings.filter((w) => w && w.type === 'vector_conflict').map((w) => w.field);
  const nextConf = nextWarnings.filter((w) => w && w.type === 'vector_conflict').map((w) => w.field);
  const addedConf = nextConf.filter((f) => f && !prevConf.includes(f));
  if (addedConf.length > 0) return { level: 'notify', reason: 'new_conflict', fields: addedConf };

  // New errors
  const prevErrFields = prevErrors.map((e) => e.field);
  const nextErrFields = nextErrors.map((e) => e.field);
  const addedErrors = nextErrFields.filter((f) => f && !prevErrFields.includes(f));
  if (addedErrors.length > 0) return { level: 'notify', reason: 'new_error', fields: addedErrors };

  // All issues resolved
  const hadIssues = prevErrors.length > 0 || prevWarnings.length > 0;
  const hasIssues = nextErrors.length > 0 || nextWarnings.length > 0;
  if (hadIssues && !hasIssues) return { level: 'notify', reason: 'all_resolved' };

  // Body type changed
  const prevType = prevAnalysis.snapshot && prevAnalysis.snapshot.bodyType ? prevAnalysis.snapshot.bodyType : null;
  const nextType = newAnalysis.snapshot && newAnalysis.snapshot.bodyType ? newAnalysis.snapshot.bodyType : null;
  if (prevType && nextType && prevType !== nextType) return { level: 'notify', reason: 'body_type_changed', from: prevType, to: nextType };

  // Phase changed
  const prevPhase = prevAnalysis.snapshot && prevAnalysis.snapshot.phase ? prevAnalysis.snapshot.phase : null;
  const nextPhase = newAnalysis.snapshot && newAnalysis.snapshot.phase ? newAnalysis.snapshot.phase : null;
  if (prevPhase && nextPhase && prevPhase !== nextPhase) return { level: 'notify', reason: 'phase_changed', from: prevPhase, to: nextPhase };

  // Timeline changed >= 2 months
  const timelineChanged = nextDelta.some((item) => {
    const prev = prevDelta.find((p) => p && p.field === item.field);
    if (!prev || prev.months == null || item.months == null) return false;
    return Math.abs(item.months - prev.months) >= 2;
  });
  if (timelineChanged) return { level: 'silent_update', reason: 'timeline_changed' };

  return { level: 'cache_only', reason: 'no_important_change' };
}

function buildCoachNotificationText(studentName, notification) {
  const name = studentName || 'учень';
  if (!notification || notification.level !== 'notify') return null;
  if (notification.reason === 'goal_reached') {
    const lines = (notification.items || []).map((i) => `${i.label}: ${i.goal} ${i.unit}`);
    return `✅ ${name} досяг цілі:\n` + lines.join('\n');
  }
  if (notification.reason === 'new_conflict') return `⚠️ Нові заміри ${name} виявили протиріччя в цілях. Рекомендується переглянути цілі.`;
  if (notification.reason === 'new_error') return `⚠️ Після нових замірів ${name} деякі цілі стали недосяжними/некоректними. Перевірте бажані параметри.`;
  if (notification.reason === 'all_resolved') return `✅ Цілі ${name} тепер без протиріч. Все в нормі.`;
  if (notification.reason === 'body_type_changed') return `ℹ️ Тип фігури ${name} змінився з "${notification.from}" на "${notification.to}". Рекомендується переглянути план/цілі.`;
  if (notification.reason === 'phase_changed') return `ℹ️ Рекомендована фаза для ${name} змінилась з "${notification.from}" на "${notification.to}".`;
  return null;
}

function formatGoalsSummaryForStudent(deltaItems) {
  if (!deltaItems || deltaItems.length === 0) {
    return 'Бажані параметри ще не встановлені тренером.';
  }
  const lines = ['Твої цілі:'];
  for (const item of deltaItems) {
    if (item.reached) {
      lines.push(item.label + ': ' + item.current + ' ' + item.unit + ' — ціль досягнута');
      continue;
    }
    lines.push(
      item.label + ': зараз ' + item.current + ' ' + item.unit + ' → ціль ' + item.goal + ' ' + item.unit +
      ' (' + item.direction + ' на ' + item.delta + ' ' + item.unit + ' — орієнтовно ' + item.months + ' міс.)'
    );
  }
  return lines.join('\n');
}

function formatGoalsSummaryForCoach(deltaItems, studentName) {
  if (!deltaItems || deltaItems.length === 0) {
    return 'Бажані параметри для ' + (studentName || 'учня') + ' не встановлені.';
  }
  const lines = ['Цілі учня ' + (studentName || '') + ':'];
  for (const item of deltaItems) {
    if (item.reached) {
      lines.push(item.label + ': ' + item.current + ' ' + item.unit + ' — ДОСЯГНУТО');
      continue;
    }
    const pct = Math.round((item.delta / item.current) * 100);
    lines.push(
      item.label + ': ' + item.current + ' → ' + item.goal + ' ' + item.unit +
      ' (' + item.direction + ' на ' + item.delta + ' ' + item.unit + ', ' + pct + '%, ~' + item.months + ' міс.)'
    );
  }
  return lines.join('\n');
}

async function saveBodyGoals(coachId, studentChatId, goals) {
  const student = await User.getByChatId(studentChatId);
  if (!student) {
    return { saved: false, error: 'Учня не знайдено.' };
  }
  if (!student.height) {
    return { saved: false, error: 'Спочатку вкажіть зріст учня.' };
  }
  for (const [field, value] of Object.entries(goals)) {
    if (value == null || value === '') continue;
    const check = validateGoalField(field, value, student.height);
    if (!check.valid) {
      return { saved: false, error: check.error };
    }
  }

  const current = await supabase.getLatestMeasurementsForGoals(studentChatId);
  const analysis = analyzeGoalsVsCurrentState(goals, student, current, 'goals_save');
  if (analysis.errors && analysis.errors.length > 0) {
    return { saved: false, error: analysis.errors[0].message, analysis };
  }

  const res = await supabase.upsertBodyGoals(coachId, studentChatId, goals, analysis);
  if (!res || !res.ok) {
    const errMsg = res && res.error ? res.error : 'Не вдалося зберегти.';
    const hint = /does not exist|relation.*not found/i.test(errMsg)
      ? ' Можливо, не виконано міграцію supabase_migration_user_body_goals.sql.'
      : '';
    return { saved: false, error: 'Не вдалося зберегти.' + hint };
  }
  const deltaItems = analysis.deltaItems || (current ? calcDeltaAndTimeline(current, goals) : []);
  const coachSummary = formatGoalsSummaryForCoach(deltaItems, student.firstName);
  return { saved: true, coachSummary, deltaItems, analysis };
}

async function showGoalsToStudent(chatId) {
  const goals = await supabase.getBodyGoals(chatId);
  if (!goals) return 'Тренер ще не встановив твої цілі.';
  const analysis = goals.goals_analysis || null;
  if (!analysis || !analysis.deltaItems || analysis.deltaItems.length === 0) {
    const current = await supabase.getLatestMeasurementsForGoals(chatId);
    if (!current) return 'Цілі встановлено. Як тільки будуть внесені поточні заміри — з’явиться прогрес і терміни.';
    const deltaItems = calcDeltaAndTimeline(current, goals);
    return formatGoalsSummaryForStudent(deltaItems);
  }
  let text = formatGoalsSummaryForStudent(analysis.deltaItems);
  if (shouldShowAIComment(analysis)) {
    const user = await User.getByChatId(chatId);
    if (user) {
      const block = buildAIInputBlock(analysis, user);
      const aiText = await goalsAI.generateText(block);
      if (aiText) {
        text += '\n\n' + aiText;
      }
    }
  }
  return text;
}

module.exports = {
  validateGoalField,
  getAgeBand,
  resolveActivityLevel,
  calcMedicalWeightRange,
  calcUnifiedIdealModel,
  evaluateGoalRealism,
  calcDeltaAndTimeline,
  formatGoalsSummaryForStudent,
  formatGoalsSummaryForCoach,
  analyzeGoalsVsCurrentState,
  shouldShowAIComment,
  buildAIInputBlock,
  buildDeterministicGoalsBlock,
  determineNotificationLevel,
  buildCoachNotificationText,
  saveBodyGoals,
  showGoalsToStudent,
  CHANGE_RATE,
  FIELDS_FOR_DELTA
};

/**
 * Бажані параметри тіла — валідація, дельта, збереження, тексти для учня/тренера.
 */
const supabase = require('./supabase');
const User = require('./user');
const { getBMIStatus, getWHStatus, BMI_RANGES, DELTA_THRESHOLDS } = require('./bodyMetrics');
const { classifyBodyType } = require('./bodyType');
const goalsAI = require('./ai/goalsVsCurrent');

const CHANGE_RATE = Object.freeze({
  WAIST_CM_PER_MONTH: 1.5,
  HIPS_CM_PER_MONTH: 0.8,
  SHOULDERS_CM_PER_MONTH: 0.5,
  CHEST_CM_PER_MONTH: 0.5,
  WEIGHT_KG_PER_MONTH: 2.0
});

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
    goal_chest: { min: Math.round(heightCm * 0.45), max: Math.round(heightCm * 0.75) }
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
  { key: 'chest', goalKey: 'goal_chest', label: 'Груди', unit: 'см', rate: CHANGE_RATE.CHEST_CM_PER_MONTH }
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
    deltaItems: [],
    hasConflict: false,
    snapshot: {
      bodyType: null,
      currentBMI: null,
      currentWH: null,
      phase: null,
      priority: null
    },
    analyzedAt: new Date().toISOString(),
    triggeredBy: trigger
  };

  const heightCm = user && user.height != null ? user.height : null;
  const gender = user && user.gender ? user.gender : 'unknown';

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
    if (goalBMI != null && goalBMI < BMI_RANGES.dangerous_low) {
      result.errors.push({
        field: 'goal_weight',
        message: `Бажана вага дає індекс маси тіла (ІМТ) ${goalBMI} — критично низький. Така ціль небезпечна.`
      });
    } else if (goalBMI != null && goalBMI < 18.5) {
      result.warnings.push({
        type: 'low_goal_bmi',
        field: 'goal_weight',
        message: `Бажана вага дає ІМТ ${goalBMI} — нижче норми. Важливо контролювати стан і прогрес поступово.`
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
    glutes: currentMeasurements.glutes
  };
  const bodyType = classifyBodyType(typeInput, gender);
  if (bodyType && bodyType.type) {
    result.snapshot.bodyType = bodyType.type;
    result.snapshot.phase = bodyType.priority && bodyType.priority.phase ? bodyType.priority.phase : null;
    result.snapshot.priority = bodyType.priority || null;
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
  const addVectorError = (field, message) => {
    result.errors.push({ field, message });
  };

  if (t === 'apple_m') {
    if (g.goal_weight != null && cm.weight != null && g.goal_weight >= cm.weight) {
      addVectorError('goal_weight', 'При типі фігури "яблуко" пріоритет — зниження ваги. Ціль набрати вагу суперечить вектору.');
    }
    if (g.goal_waist != null && cm.waist != null && g.goal_waist >= cm.waist) {
      addVectorError('goal_waist', 'При типі фігури "яблуко" пріоритет — зменшення талії. Ціль збільшити талію суперечить вектору.');
    }
  }

  if (t === 'apple' && gender === 'female') {
    if (g.goal_waist != null && cm.waist != null && g.goal_waist >= cm.waist) {
      addVectorError('goal_waist', 'Тип фігури "яблуко" передбачає зменшення талії. Ціль збільшити талію суперечить вектору.');
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
      addVectorWarning('vector_conflict', 'goal_shoulders', 'Плечі вже на рівні V-торсу. Зменшення плечей суперечить типу фігури.');
    }
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips > cm.glutes * 1.10) {
      addVectorWarning('vector_conflict', 'goal_hips', 'V-торс передбачає відносно вузькі стегна. Значне збільшення ягодиць може зменшити V-ефект.');
    }
  }

  if (t === 'athletic_m') {
    if (g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders < cm.shoulders) {
      addVectorWarning('vector_conflict', 'goal_shoulders', 'Атлетичний тип потребує розвитку плечей. Ціль зменшити плечі суперечить вектору.');
    }
    if (g.goal_chest != null && cm.chest != null && g.goal_chest < cm.chest) {
      addVectorWarning('vector_conflict', 'goal_chest', 'Для атлетичного типу груди — частина V-силуету. Ціль зменшити груди суперечить пріоритету.');
    }
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips > cm.glutes * 1.15) {
      addVectorWarning('vector_conflict', 'goal_hips', 'Для атлетичного типу стегна не є пріоритетом. Значне збільшення ягодиць варто уточнити з тренером.');
    }
  }

  if (t === 'rectangle_m') {
    if (g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders <= cm.shoulders) {
      addVectorWarning('vector_conflict', 'goal_shoulders', 'Прямокутний тип потребує розвитку плечей для V-форми. Ціль не відповідає вектору.');
    }
    if (g.goal_chest != null && cm.chest != null && g.goal_chest < cm.chest) {
      addVectorWarning('vector_conflict', 'goal_chest', 'Груди — частина V-торсу. Ціль зменшити груди суперечить пріоритету.');
    }
    if (g.goal_hips != null && cm.glutes != null && g.goal_hips > cm.glutes * 1.10) {
      addVectorWarning('vector_conflict', 'goal_hips', 'Для прямокутного типу пріоритет — верх тіла, не низ. Уточніть ціль по ягодицях.');
    }
  }

  if (gender === 'female' && result.snapshot.priority) {
    const pr = result.snapshot.priority;
    if (pr.lower === 'grow' && g.goal_hips != null && cm.glutes != null && g.goal_hips < cm.glutes) {
      addVectorWarning('vector_conflict', 'goal_hips', 'Ціль зменшити ягодиці суперечить вектору розвитку для цього типу фігури.');
    }
    if (pr.upper === 'grow' && g.goal_shoulders != null && cm.shoulders != null && g.goal_shoulders < cm.shoulders) {
      addVectorWarning('vector_conflict', 'goal_shoulders', 'Ціль зменшити плечі суперечить вектору розвитку для цього типу фігури.');
    }
  }

  return result;
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
  calcDeltaAndTimeline,
  formatGoalsSummaryForStudent,
  formatGoalsSummaryForCoach,
  analyzeGoalsVsCurrentState,
  shouldShowAIComment,
  buildAIInputBlock,
  determineNotificationLevel,
  buildCoachNotificationText,
  saveBodyGoals,
  showGoalsToStudent,
  CHANGE_RATE,
  FIELDS_FOR_DELTA
};

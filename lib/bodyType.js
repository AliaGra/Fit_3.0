/**
 * BodyType — класифікація типу фігури за замірами.
 */

function calcRatios(m) {
  return {
    wh: m.waist / m.height,
    shw: m.shoulders / m.waist,
    hw: m.glutes / m.waist,
    sh: m.shoulders / m.glutes,
    cw: m.chest / m.waist,
    cs: m.chest / m.shoulders,
    cg: m.chest / m.glutes
  };
}

function cmToIn(cm) {
  return cm != null ? (cm / 2.54) : null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function getBodyBuild(wristCm, gender) {
  const w = typeof wristCm === 'number' ? wristCm : parseFloat(String(wristCm).replace(',', '.'));
  if (!w || isNaN(w)) return 'normosthenic';
  if (gender === 'female') {
    if (w < 15) return 'asthenic';
    if (w <= 17) return 'normosthenic';
    return 'hypersthenic';
  }
  if (gender === 'male') {
    if (w < 18) return 'asthenic';
    if (w <= 20) return 'normosthenic';
    return 'hypersthenic';
  }
  return 'normosthenic';
}

const FEMALE_BUILD_ADJUSTMENTS = Object.freeze({
  asthenic: Object.freeze({ sh_threshold: -0.03, hw_threshold: -0.04, shw_threshold: -0.05, wh_apple: 0.51 }),
  normosthenic: Object.freeze({ sh_threshold: 0, hw_threshold: 0, shw_threshold: 0, wh_apple: 0.53 }),
  hypersthenic: Object.freeze({ sh_threshold: 0.03, hw_threshold: 0.04, shw_threshold: 0.05, wh_apple: 0.55 })
});

const MALE_BUILD_ADJUSTMENTS = Object.freeze({
  asthenic: Object.freeze({ sh_threshold: -0.04, shw_threshold: -0.06, wh_apple: 0.51 }),
  normosthenic: Object.freeze({ sh_threshold: 0, shw_threshold: 0, wh_apple: 0.53 }),
  hypersthenic: Object.freeze({ sh_threshold: 0.04, shw_threshold: 0.06, wh_apple: 0.55 })
});

function calcBodyFatPctNavy(gender, heightCm, waistCm, glutesCm, neckCm) {
  // US Navy method, input converted to inches.
  const h = cmToIn(heightCm);
  const w = cmToIn(waistCm);
  const n = cmToIn(neckCm);
  if (!h || !w || !n) return null;
  if (gender === 'male') {
    const x = w - n;
    if (x <= 0) return null;
    const bf = 86.010 * Math.log10(x) - 70.041 * Math.log10(h) + 36.76;
    return isFinite(bf) ? round1(bf) : null;
  }
  if (gender === 'female') {
    const hip = cmToIn(glutesCm);
    if (!hip) return null;
    const x = w + hip - n;
    if (x <= 0) return null;
    const bf = 163.205 * Math.log10(x) - 97.684 * Math.log10(h) - 78.387;
    return isFinite(bf) ? round1(bf) : null;
  }
  return null;
}

function getFatStatus(fatPct, gender) {
  if (fatPct == null) return null;
  if (gender === 'female') return fatPct >= 32 ? 'above_normal' : 'normal';
  if (gender === 'male') return fatPct >= 25 ? 'above_normal' : 'normal';
  return null;
}

// ── Жінки ──────────────────────────────────────────────

function classifyFemale(m, bodyBuild = 'normosthenic', fatPct = null) {
  if (!m.shoulders || !m.waist || !m.glutes || !m.height) {
    return { type: null, reason: 'insufficient_data' };
  }

  const adj = FEMALE_BUILD_ADJUSTMENTS[bodyBuild] || FEMALE_BUILD_ADJUSTMENTS.normosthenic;
  const r = calcRatios(m);

  // КРОК 1: Яблуко (поріг залежить від тілобудови)
  if (r.wh >= adj.wh_apple) {
    return {
      type: 'apple',
      label: 'Яблуко',
      wh: Math.round(r.wh * 100) / 100,
      description: 'Жир концентрується в зоні талії. Пріоритет — дефіцит калорій і кардіо.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'deficit' }
    };
  }
  // Уточнення по % жиру в сірій зоні WH 0.49–wh_apple
  if (r.wh >= 0.49 && r.wh < adj.wh_apple && fatPct != null && fatPct >= 32) {
    return {
      type: 'apple',
      label: 'Яблуко',
      wh: Math.round(r.wh * 100) / 100,
      description: 'WH в граничній зоні, але % жиру підвищений. Пріоритет — дефіцит калорій і кардіо.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'deficit' }
    };
  }

  // КРОК 2: Перевернутий трикутник
  if (r.sh > (1.10 + adj.sh_threshold) && r.shw > (1.45 + adj.shw_threshold)) {
    return {
      type: 'inverted_triangle',
      label: 'Перевернутий трикутник',
      sh: Math.round(r.sh * 100) / 100,
      description: 'Широкі плечі, вузькі стегна. Пріоритет — розвиток низу тіла.',
      priority: { upper: 'maintain', lower: 'grow', phase: 'surplus' }
    };
  }

  // КРОК 3: Груша
  if (r.sh < (0.88 + adj.sh_threshold) && r.hw >= (1.25 + adj.hw_threshold)) {
    return {
      type: 'pear',
      label: 'Груша',
      sh: Math.round(r.sh * 100) / 100,
      description: 'Широкі стегна, вузькі плечі. Пріоритет — розвиток верху тіла.',
      priority: { upper: 'grow', lower: 'maintain', phase: 'maintenance' }
    };
  }

  // КРОК 4: Пісочний годинник
  if (
    r.sh >= (0.93 + adj.sh_threshold) &&
    r.sh <= (1.03 + adj.sh_threshold) &&
    r.hw >= (1.30 + adj.hw_threshold) &&
    r.shw >= (1.35 + adj.shw_threshold)
  ) {
    return {
      type: 'hourglass',
      label: 'Пісочний годинник',
      sh: Math.round(r.sh * 100) / 100,
      hw: Math.round(r.hw * 100) / 100,
      description: 'Гармонійні пропорції. Підтримуючий або акцентний план залежно від цілі.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'maintenance' }
    };
  }

  // КРОК 5: Майже пісочний годинник
  if (
    r.sh >= (0.90 + adj.sh_threshold) &&
    r.sh <= (1.10 + adj.sh_threshold) &&
    r.hw >= (1.25 + adj.hw_threshold) &&
    r.hw < (1.30 + adj.hw_threshold)
  ) {
    return {
      type: 'near_hourglass',
      label: 'Майже пісочний годинник',
      sh: Math.round(r.sh * 100) / 100,
      hw: Math.round(r.hw * 100) / 100,
      description: 'Пропорції близькі до пісочного годинника. Пріоритет — підкреслити контраст.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'maintenance' }
    };
  }

  return {
    type: 'rectangle',
    label: 'Прямокутник',
    sh: Math.round(r.sh * 100) / 100,
    hw: Math.round(r.hw * 100) / 100,
    description: 'Рівні пропорції без вираженої талії. Пріоритет — створити контраст.',
    priority: { upper: 'grow', lower: 'grow', phase: 'maintenance' }
  };
}

function refineFemaleType(result, r) {
  if (!result || !result.type) return result;

  if (result.type === 'hourglass') {
    if (r.cg < 0.88) {
      result.chest_note = 'Верхній блок відносно вузький';
      result.priority.chest = 'optional_grow';
    }
  }

  if (result.type === 'rectangle') {
    if (r.cw < 1.15) {
      result.priority.chest = 'grow';
      result.description += ' Груди і плечі потребують розвитку.';
    } else if (r.cw >= 1.25) {
      result.priority.chest = 'maintain';
      result.description += ' Груди розвинені, акцент на плечі.';
    }
  }

  if (result.type === 'inverted_triangle') {
    if (r.cw > 1.3) {
      result.chest_note = 'Груди добре розвинені';
      result.priority.chest = 'maintain';
    }
  }

  return result;
}

// ── Чоловіки ───────────────────────────────────────────

function classifyMale(m, bodyBuild = 'normosthenic', fatPct = null) {
  if (!m.shoulders || !m.waist || !m.glutes || !m.height) {
    return { type: null, reason: 'insufficient_data' };
  }

  const adj = MALE_BUILD_ADJUSTMENTS[bodyBuild] || MALE_BUILD_ADJUSTMENTS.normosthenic;
  const r = calcRatios(m);

  // Яблуко (поріг залежить від тілобудови)
  if (r.wh >= adj.wh_apple) {
    return {
      type: 'apple_m',
      label: 'Яблуко',
      wh: Math.round(r.wh * 100) / 100,
      description: 'Жир в зоні живота. Пріоритет — дефіцит і базові вправи.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'deficit' }
    };
  }
  if (r.wh >= 0.49 && r.wh < adj.wh_apple && fatPct != null && fatPct >= 25) {
    return {
      type: 'apple_m',
      label: 'Яблуко',
      wh: Math.round(r.wh * 100) / 100,
      description: 'WH в граничній зоні, але % жиру підвищений. Пріоритет — дефіцит і базові вправи.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'deficit' }
    };
  }

  if (r.sh > 1.15 && r.shw > 1.5) {
    // (старі пороги лишаємо як safety net; нижче — уточнений V-торс по специфікації)
  }

  // V-торс (уточнені пороги)
  if (r.sh > (1.15 + adj.sh_threshold) && r.shw > (1.55 + adj.shw_threshold)) {
    return {
      type: 'v_shape',
      label: 'V-торс',
      sh: Math.round(r.sh * 100) / 100,
      shw: Math.round(r.shw * 100) / 100,
      description: 'Класичний атлетичний силует. Підтримуючий план з акцентом на рельєф.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'maintenance' }
    };
  }

  // Атлетичний
  if (
    r.sh >= (1.05 + adj.sh_threshold) &&
    r.sh <= (1.15 + adj.sh_threshold) &&
    r.shw >= (1.35 + adj.shw_threshold) &&
    r.shw <= (1.55 + adj.shw_threshold)
  ) {
    return {
      type: 'athletic_m',
      label: 'Атлетичний',
      sh: Math.round(r.sh * 100) / 100,
      description: 'Є V-форма, але помірна. Акцент на широкий м’яз спини і дельти.',
      priority: { upper: 'grow', lower: 'maintain', phase: 'surplus' }
    };
  }

  return {
    type: 'rectangle_m',
    label: 'Прямокутник',
    sh: Math.round(r.sh * 100) / 100,
    description: 'Плечі і стегна приблизно рівні. Пріоритет — розвиток верху для V-форми.',
    priority: { upper: 'grow', lower: 'maintain', phase: 'surplus' }
  };
}

function refineMaleType(result, r) {
  if (!result || !result.type) return result;

  if (result.type === 'v_shape') {
    if (r.cw < 1.25) {
      result.chest_note = 'Груди відстають від плечей';
      result.priority.chest = 'grow';
    } else {
      result.priority.chest = 'maintain';
    }
  }

  if (result.type === 'athletic_m') {
    if (r.cw < 1.2) {
      result.priority.chest = 'grow';
      result.description += ' Груди відстають — додати жимові вправи.';
    } else if (r.cw >= 1.3) {
      result.priority.chest = 'maintain';
    }
  }

  if (result.type === 'rectangle_m') {
    if (r.cw < 1.2 && r.shw < 1.35) {
      result.priority.chest = 'grow';
      result.priority.upper = 'grow';
      result.description += ' Весь верхній блок потребує розвитку.';
    } else if (r.cw >= 1.25 && r.shw < 1.35) {
      result.priority.chest = 'maintain';
      result.priority.shoulders = 'grow';
      result.description += ' Плечі відстають від грудей.';
    }
  }

  return result;
}

// ── Головна ────────────────────────────────────────────

function classifyBodyType(measurements, gender) {
  if (!measurements || !gender) return null;

  const required = ['shoulders', 'waist', 'glutes', 'height'];
  if (required.some((f) => !measurements[f])) {
    return { type: null, reason: 'insufficient_data' };
  }

  const bodyBuild = measurements.wrist ? getBodyBuild(measurements.wrist, gender) : 'normosthenic';
  const explicitFatPct = measurements.fatPct != null ? Number(measurements.fatPct) : null;
  const fatPct = isFinite(explicitFatPct)
    ? round1(explicitFatPct)
    : (measurements.neck
      ? calcBodyFatPctNavy(gender, measurements.height, measurements.waist, measurements.glutes, measurements.neck)
      : null);
  const fatStatus = fatPct != null ? getFatStatus(fatPct, gender) : null;

  const r = calcRatios(measurements);
  let result;

  if (gender === 'female') {
    result = classifyFemale(measurements, bodyBuild, fatPct);
    if (result && result.type) result = refineFemaleType(result, r);
  } else if (gender === 'male') {
    result = classifyMale(measurements, bodyBuild, fatPct);
    if (result && result.type) result = refineMaleType(result, r);
  } else {
    return null;
  }

  if (result) {
    result.ratios = r;
    result.bodyBuild = bodyBuild;
    result.fatPct = fatPct;
    result.fatStatus = fatStatus;
    if (!result.type) result.reason = result.reason || 'insufficient_data';
  }

  return result;
}

module.exports = {
  classifyBodyType,
  calcRatios,
  calcBodyFatPctNavy,
  getBodyBuild
};


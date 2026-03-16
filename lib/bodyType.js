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

// ── Жінки ──────────────────────────────────────────────

function classifyFemale(m) {
  if (!m.shoulders || !m.waist || !m.glutes || !m.height) {
    return { type: null, reason: 'insufficient_data' };
  }

  const r = calcRatios(m);

  if (r.wh >= 0.53) {
    return {
      type: 'apple',
      label: 'Яблуко',
      wh: Math.round(r.wh * 100) / 100,
      description: 'Жир концентрується в зоні талії. Пріоритет — дефіцит калорій і кардіо.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'deficit' }
    };
  }

  if (r.sh > 1.1 && r.shw > 1.4) {
    return {
      type: 'inverted_triangle',
      label: 'Перевернутий трикутник',
      sh: Math.round(r.sh * 100) / 100,
      description: 'Широкі плечі, вузькі стегна. Пріоритет — розвиток низу тіла.',
      priority: { upper: 'maintain', lower: 'grow', phase: 'surplus' }
    };
  }

  if (r.sh < 0.9 && r.hw > 1.3) {
    return {
      type: 'pear',
      label: 'Груша',
      sh: Math.round(r.sh * 100) / 100,
      description: 'Широкі стегна, вузькі плечі. Пріоритет — розвиток верху тіла.',
      priority: { upper: 'grow', lower: 'maintain', phase: 'maintenance' }
    };
  }

  if (r.sh >= 0.9 && r.sh <= 1.1 && r.hw >= 1.3 && r.shw >= 1.35) {
    return {
      type: 'hourglass',
      label: 'Пісочний годинник',
      sh: Math.round(r.sh * 100) / 100,
      hw: Math.round(r.hw * 100) / 100,
      description: 'Гармонійні пропорції. Підтримуючий або акцентний план залежно від цілі.',
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

function classifyMale(m) {
  if (!m.shoulders || !m.waist || !m.glutes || !m.height) {
    return { type: null, reason: 'insufficient_data' };
  }

  const r = calcRatios(m);

  if (r.wh >= 0.53) {
    return {
      type: 'apple_m',
      label: 'Яблуко',
      wh: Math.round(r.wh * 100) / 100,
      description: 'Жир в зоні живота. Пріоритет — дефіцит і базові вправи.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'deficit' }
    };
  }

  if (r.sh > 1.15 && r.shw > 1.5) {
    return {
      type: 'v_shape',
      label: 'V-торс',
      sh: Math.round(r.sh * 100) / 100,
      shw: Math.round(r.shw * 100) / 100,
      description: 'Класичний атлетичний силует. Підтримуючий план з акцентом на рельєф.',
      priority: { upper: 'maintain', lower: 'maintain', phase: 'maintenance' }
    };
  }

  if (r.sh >= 1.05 && r.sh <= 1.15) {
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

  const r = calcRatios(measurements);
  let result;

  if (gender === 'female') {
    result = classifyFemale(measurements);
    if (result && result.type) result = refineFemaleType(result, r);
  } else if (gender === 'male') {
    result = classifyMale(measurements);
    if (result && result.type) result = refineMaleType(result, r);
  } else {
    return null;
  }

  if (result) {
    result.ratios = r;
    if (!result.type) result.reason = result.reason || 'insufficient_data';
  }

  return result;
}

module.exports = {
  classifyBodyType,
  calcRatios
};


/**
 * Body metrics — константи та базові розрахунки (WH-індекс, ІМТ тощо).
 */

// Коефіцієнти талія/зріст
const WH_RANGES = {
  dangerous_low: 0.35,
  very_lean: 0.42,
  normal: 0.49,
  acceptable: 0.53,
  overweight: 0.58,
  obesity_1: 0.63,
  obesity_2: 0.7
};

// Коефіцієнти ваги — ІМТ межі
const BMI_RANGES = {
  dangerous_low: 17.5,
  low: 18.5,
  normal_low: 18.5,
  normal_high: 24.9,
  overweight: 25.0,
  obesity_1: 30.0,
  obesity_2: 35.0,
  obesity_3: 40.0,
  goal_max: 29.9
};

/**
 * Мінімальний допустимий ІМТ для цілі ваги залежно від статі та віку.
 * ТЗ: жінки 17.5, чоловіки 18.0, підлітки (≤17) 16.5
 */
function getBMIMinForGoal(gender, isTeen) {
  if (isTeen) return 16.5;
  if (gender === 'male') return 18.0;
  return 17.5;
}

// Коефіцієнти ягодиць від зросту
const HIPS_COEFFICIENTS = {
  min_from_waist: 1.1,
  max_from_height: 0.8
};

// Коефіцієнти плечей від зросту
const SHOULDERS_COEFFICIENTS = {
  min_from_height: 0.5,
  max_from_height: 0.85
};

// Допустима дельта від поточного (%)
const DELTA_THRESHOLDS = {
  waist_warning: 0.25,
  hips_warning: 0.15,
  weight_warning: 0.2
};

function getWHStatus(waistCm, heightCm) {
  if (!waistCm || !heightCm) return null;
  const wh = waistCm / heightCm;
  const rounded = Math.round(wh * 100) / 100;

  if (wh < WH_RANGES.dangerous_low) {
    return {
      level: 'dangerous_low',
      wh: rounded,
      blocked: true,
      message: 'Талія критично мала відносно зросту. Будь ласка, зверніться до лікаря.'
    };
  }
  if (wh < WH_RANGES.very_lean) {
    return {
      level: 'very_lean',
      wh: rounded,
      blocked: false,
      message: 'Дуже стрункий атлетичний тип. Рекомендується набір м’язової маси.'
    };
  }
  if (wh < WH_RANGES.normal) {
    return { level: 'normal', wh: rounded, blocked: false, message: null };
  }
  if (wh < WH_RANGES.acceptable) {
    return {
      level: 'acceptable',
      wh: rounded,
      blocked: false,
      message: 'Показник трохи вище норми — це легко коригується. Тренер врахує це при складанні плану.'
    };
  }
  if (wh < WH_RANGES.overweight) {
    return {
      level: 'overweight',
      wh: rounded,
      blocked: false,
      message: 'Є невеликий надлишок в зоні талії. Рекомендуємо почати з помірних навантажень і скоригувати харчування.'
    };
  }
  if (wh < WH_RANGES.obesity_1) {
    return {
      level: 'obesity_1',
      wh: rounded,
      blocked: false,
      notifyCoach: true,
      message:
        'Ожиріння 1 ступінь. Є підвищений ризик для серцево-судинної системи. Рекомендуємо проконсультуватись з лікарем перед початком тренувань. Починаємо поступово — це правильна стратегія.'
    };
  }
  if (wh < WH_RANGES.obesity_2) {
    return {
      level: 'obesity_2',
      wh: rounded,
      blocked: false,
      notifyCoach: true,
      message:
        'Ожиріння 2 ступінь. Важливо починати з помірних навантажень. Бот автоматично адаптує план. Консультація лікаря обов’язкова перед стартом.'
    };
  }

  return {
    level: 'obesity_3',
    wh: rounded,
    blocked: false,
    notifyCoach: true,
    requireDoctorConfirmation: true,
    message:
      'Ожиріння 3 ступінь. Тренування можливі і корисні, але виключно під медичним контролем. Будь ласка, проконсультуйся з лікарем перед початком програми. Тренер отримає сповіщення.'
  };
}

function getBMIStatus(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  const bmi = Math.round((weightKg / (h * h)) * 10) / 10;

  if (bmi < BMI_RANGES.dangerous_low) {
    return {
      bmi,
      blocked: true,
      message: `ІМТ ${bmi} — критично низький. Набір маси є пріоритетом. Зверніться до лікаря.`
    };
  }
  if (bmi < BMI_RANGES.normal_low) {
    return {
      bmi,
      blocked: false,
      warning: true,
      message: `ІМТ ${bmi} — нижче норми. Рекомендується програма на набір маси.`
    };
  }
  if (bmi <= BMI_RANGES.normal_high) {
    return { bmi, blocked: false, message: null };
  }
  if (bmi < BMI_RANGES.obesity_1) {
    return {
      bmi,
      blocked: false,
      message: `ІМТ ${bmi} — надлишкова вага. Рекомендується програма на зниження жирової маси.`
    };
  }
  if (bmi < BMI_RANGES.obesity_2) {
    return {
      bmi,
      blocked: false,
      notifyCoach: true,
      message: `ІМТ ${bmi} — ожиріння 1 ступінь. План буде адаптований під поточний стан.`
    };
  }
  if (bmi < BMI_RANGES.obesity_3) {
    return {
      bmi,
      blocked: false,
      notifyCoach: true,
      message: `ІМТ ${bmi} — ожиріння 2 ступінь. Рекомендується консультація лікаря.`
    };
  }

  return {
    bmi,
    blocked: true,
    notifyCoach: true,
    message:
      `ІМТ ${bmi} — ожиріння 3 ступінь. Тренування тільки під медичним наглядом. Збереження плану заблоковано до підтвердження тренером.`
  };
}

module.exports = {
  WH_RANGES,
  BMI_RANGES,
  HIPS_COEFFICIENTS,
  SHOULDERS_COEFFICIENTS,
  DELTA_THRESHOLDS,
  getWHStatus,
  getBMIStatus,
  getBMIMinForGoal
};


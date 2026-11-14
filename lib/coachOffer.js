/**
 * Типи тренувань і види послуг тренера (профіль / реєстрація).
 * coach_training_types: personal | split | trio | group (+ legacy individual)
 * coach_service_modes: offline | online | programs | nutrition
 */
const { CONSTANTS } = require('./constants');

const TRAINING_KEYS = Object.freeze({
  PERSONAL: 'personal',
  SPLIT: 'split',
  TRIO: 'trio',
  GROUP: 'group',
  /** Legacy: означає personal+split+trio */
  INDIVIDUAL: 'individual'
});

const TRAINING_LABELS = Object.freeze({
  personal: 'Індивідуальні',
  split: 'Спліт',
  trio: 'Тріо',
  group: 'Групові'
});

const SERVICE_LABELS = Object.freeze({
  offline: 'Офлайн',
  online: 'Онлайн',
  programs: 'Програми тренувань',
  nutrition: 'План харчування'
});

/** Порядок кнопок у «Змінити». */
const TRAINING_EDIT_ORDER = Object.freeze([
  TRAINING_KEYS.PERSONAL,
  TRAINING_KEYS.SPLIT,
  TRAINING_KEYS.TRIO,
  TRAINING_KEYS.GROUP
]);

const SERVICE_EDIT_ORDER = Object.freeze([
  CONSTANTS.COACH_SERVICE_MODES.ONLINE,
  CONSTANTS.COACH_SERVICE_MODES.OFFLINE,
  CONSTANTS.COACH_SERVICE_MODES.PROGRAMS,
  CONSTANTS.COACH_SERVICE_MODES.NUTRITION
]);

/**
 * Нормалізація: individual → personal+split+trio; прибирає дублікати.
 * @param {string[]} raw
 * @returns {string[]}
 */
function normalizeTrainingTypes(raw) {
  const set = new Set();
  const arr = Array.isArray(raw) ? raw : [];
  for (const x of arr) {
    const k = String(x || '').trim();
    if (!k) continue;
    if (k === TRAINING_KEYS.INDIVIDUAL) {
      set.add(TRAINING_KEYS.PERSONAL);
      set.add(TRAINING_KEYS.SPLIT);
      set.add(TRAINING_KEYS.TRIO);
      continue;
    }
    if (
      k === TRAINING_KEYS.PERSONAL ||
      k === TRAINING_KEYS.SPLIT ||
      k === TRAINING_KEYS.TRIO ||
      k === TRAINING_KEYS.GROUP
    ) {
      set.add(k);
    }
  }
  return Array.from(set);
}

function normalizeServiceModes(raw) {
  const M = CONSTANTS.COACH_SERVICE_MODES;
  const set = new Set();
  for (const x of Array.isArray(raw) ? raw : []) {
    const k = String(x || '').trim();
    if (k === M.OFFLINE || k === M.ONLINE || k === M.PROGRAMS || k === M.NUTRITION) set.add(k);
  }
  return Array.from(set);
}

function hasTrainingType(userOrTypes, key) {
  const arr = Array.isArray(userOrTypes)
    ? userOrTypes
    : userOrTypes && userOrTypes.coachTrainingTypes
      ? userOrTypes.coachTrainingTypes
      : [];
  return normalizeTrainingTypes(arr).includes(String(key));
}

function hasServiceMode(userOrModes, key) {
  const arr = Array.isArray(userOrModes)
    ? userOrModes
    : userOrModes && userOrModes.coachServiceModes
      ? userOrModes.coachServiceModes
      : [];
  return normalizeServiceModes(arr).includes(String(key));
}

/** Чи може тренер вести сесію PERSONAL / SPLIT / TRIO (TRAINING_TYPES). */
function canCoachSessionType(user, trainingTypeConst) {
  const t = String(trainingTypeConst || '').toUpperCase();
  if (t === 'PERSONAL') return hasTrainingType(user, TRAINING_KEYS.PERSONAL);
  if (t === 'SPLIT') return hasTrainingType(user, TRAINING_KEYS.SPLIT);
  if (t === 'TRIO') return hasTrainingType(user, TRAINING_KEYS.TRIO);
  return false;
}

function formatTrainingTypesLine(types) {
  const n = normalizeTrainingTypes(types);
  if (!n.length) return 'не вказано';
  return n.map((k) => TRAINING_LABELS[k] || k).join(', ');
}

function formatServiceModesLine(modes) {
  const n = normalizeServiceModes(modes);
  if (!n.length) return 'не вказано';
  return n.map((k) => SERVICE_LABELS[k] || k).join(', ');
}

/**
 * Слово «клуб» / «студія» / «заклад» за organization_type.
 * @returns {{ placePrep: string, placeNoun: string, placeNounPl: string }}
 */
function venuePlaceWords(organizationType) {
  const t = String(organizationType || '')
    .trim()
    .toLowerCase();
  if (t === 'studio' || t.endsWith('_studio') || t.includes('studio')) {
    return { placePrep: 'у студії', placeNoun: 'студія', placeNounPl: 'студіях' };
  }
  if (
    t === 'fitness_club' ||
    t === 'sport_club' ||
    t === 'gym' ||
    t.includes('club') ||
    t === 'sport_complex'
  ) {
    return { placePrep: 'у клубі', placeNoun: 'клуб', placeNounPl: 'клубах' };
  }
  return { placePrep: 'у закладі', placeNoun: 'заклад', placeNounPl: 'закладах' };
}

function coachDisplayName(user) {
  const first = user && user.firstName ? String(user.firstName).trim() : '';
  if (first) return first;
  const last = user && user.lastName ? String(user.lastName).trim() : '';
  return last || 'Тренер';
}

function formatIndividualBlock(types) {
  const hasP = types.includes(TRAINING_KEYS.PERSONAL);
  const hasS = types.includes(TRAINING_KEYS.SPLIT);
  const hasT = types.includes(TRAINING_KEYS.TRIO);
  if (!hasP && !hasS && !hasT) return null;
  if (hasP && hasS && hasT) return 'Індивідуальні тренування (також спліт та тріо)';
  if (hasP && hasS) return 'Індивідуальні тренування (також спліт)';
  if (hasP && hasT) return 'Індивідуальні тренування (також тріо)';
  if (hasP) return 'Індивідуальні тренування';
  const parts = [];
  if (hasS) parts.push('спліт');
  if (hasT) parts.push('тріо');
  return parts.length === 1
    ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    : parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(' та ');
}

function formatExtraServicesBlock(modes) {
  const M = CONSTANTS.COACH_SERVICE_MODES;
  const bits = [];
  if (modes.includes(M.ONLINE)) bits.push('тренуєте людей онлайн');
  if (modes.includes(M.PROGRAMS)) bits.push('складаєте план тренувань');
  if (modes.includes(M.NUTRITION)) bits.push('складаєте план харчування');
  if (!bits.length) return null;
  if (bits.length === 1) return 'Також ви ' + bits[0] + '.';
  if (bits.length === 2) return 'Також ви ' + bits[0] + ' та ' + bits[1] + '.';
  return (
    'Також ви ' + bits.slice(0, -1).join(', ') + ' та ' + bits[bits.length - 1] + '.'
  );
}

/**
 * Персоналізований текст хабу «Тип тренувань».
 * @param {object} user
 * @param {{ venues?: object[], groupClasses?: object[] }} [ctx]
 */
function buildHubSummaryText(user, ctx = {}) {
  const name = coachDisplayName(user);
  const types = normalizeTrainingTypes(user && user.coachTrainingTypes);
  const modes = normalizeServiceModes(user && user.coachServiceModes);
  const venues = Array.isArray(ctx.venues) ? ctx.venues : [];
  const groupClasses = Array.isArray(ctx.groupClasses) ? ctx.groupClasses : [];

  const lines = [];
  lines.push(name + ', на даний час ви надаєте наступні види послуг:');
  lines.push('');

  let n = 0;
  const pushItem = (text) => {
    n += 1;
    lines.push(n + '. ' + text);
  };

  const indiv = formatIndividualBlock(types);
  if (indiv) pushItem(indiv);

  if (types.includes(TRAINING_KEYS.GROUP)) {
    const activeGroups = groupClasses.filter((g) => g && !g.isArchived);
    const byVenue = new Map();
    for (const g of activeGroups) {
      const vid = String(g.venueId || '');
      if (!byVenue.has(vid)) byVenue.set(vid, []);
      byVenue.get(vid).push(g);
    }
    if (!byVenue.size) {
      pushItem('Ведете групові заняття (поки не обрано заняття по закладах).');
    } else {
      const block = ['Ведете групові заняття:'];
      for (const [vid, list] of byVenue) {
        const v = venues.find((x) => String(x.id) === vid);
        const vName = (v && v.nameUa) || 'Заклад';
        block.push('• ' + vName + ':');
        for (const g of list) {
          block.push('  — ' + (g.labelUa || g.groupClassCode || 'Групове'));
        }
      }
      pushItem(block.join('\n'));
    }
  }

  if (modes.includes(CONSTANTS.COACH_SERVICE_MODES.OFFLINE)) {
    if (!venues.length) {
      pushItem('Ви тренуєте офлайн (заклади ще не додано в «Де треную»).');
    } else if (venues.length === 1) {
      const v = venues[0];
      const w = venuePlaceWords(v.organizationType);
      const addr = v.address && String(v.address).trim() ? String(v.address).trim() : 'адресу не вказано';
      pushItem(
        'Ви тренуєте ' +
          w.placePrep +
          ' «' +
          (v.nameUa || 'Заклад') +
          '» за адресою: ' +
          addr +
          '.'
      );
    } else {
      const block = ['Ви тренуєте в кількох закладах:'];
      for (const v of venues) {
        const w = venuePlaceWords(v.organizationType);
        const addr = v.address && String(v.address).trim() ? String(v.address).trim() : 'адресу не вказано';
        block.push(
          '• ' + w.placePrep + ' «' + (v.nameUa || 'Заклад') + '» за адресою: ' + addr
        );
      }
      pushItem(block.join('\n'));
    }
  }

  const extra = formatExtraServicesBlock(modes);
  if (extra) pushItem(extra);

  if (n === 0) {
    lines.push('Поки не вказано жодного виду послуг. Натисніть «Змінити», щоб додати.');
  }

  lines.push('');
  lines.push(
    '➕ Створити своє групове заняття — якщо потрібного заняття немає на сторінці обраного клубу. ' +
      'Після створення: спочатку модерація адміном (підтвердження власника), потім розміщення на картці клубу.'
  );
  lines.push('');
  lines.push('Обери дію:');
  return lines.join('\n');
}

module.exports = {
  TRAINING_KEYS,
  TRAINING_LABELS,
  SERVICE_LABELS,
  TRAINING_EDIT_ORDER,
  SERVICE_EDIT_ORDER,
  normalizeTrainingTypes,
  normalizeServiceModes,
  hasTrainingType,
  hasServiceMode,
  canCoachSessionType,
  formatTrainingTypesLine,
  formatServiceModesLine,
  venuePlaceWords,
  buildHubSummaryText
};

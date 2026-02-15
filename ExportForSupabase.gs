/**
 * FIT 3.0 — експорт таблиць з Google Sheets у JSON для імпорту в Supabase.
 * ExerciseLibrary: нова структура (group_level1/2/3, name_ua, name_ru).
 *
 * Script Properties: SPREADSHEET_ID
 * Функції: runExportToDrive, runExportExerciseLibraryOnly
 */

var SHEET_EXERCISE_LIBRARY = 'ExerciseLibrary';
var COLS = {
  ID: 0,
  GROUP_LEVEL1: 1,
  GROUP_LEVEL2: 2,
  GROUP_LEVEL3: 3,
  NAME_UA: 4,
  NAME_RU: 5,
  EQUIPMENT: 6,
  ACTIVE: 7,
  VID: 8,          // I — вид: базова, изоляция, стабилизация, растяжка
  DIFFICULTY: 9,   // J — сложность: высокая, средняя, низкая
  FOCUS_POINT: 10,
  COMMON_MISTAKES: 11,
  PROPER_FEELING: 12,
  STATIC_HOLDS: 13,
  YOUTUBE_LINK: 14,
  MY_CHANNEL_LINK: 15
};

function getSpreadsheetId() {
  return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
}

function exportExerciseLibrary() {
  var ssId = getSpreadsheetId();
  if (!ssId) {
    throw new Error('SPREADSHEET_ID not set in Script Properties');
  }
  var ss = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(SHEET_EXERCISE_LIBRARY);
  if (!sheet) {
    throw new Error('Sheet "' + SHEET_EXERCISE_LIBRARY + '" not found');
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) {
    return [];
  }
  var data = sheet.getRange(3, 1, lastRow, 16).getValues();
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var idRaw = row[COLS.ID];
    if (!idRaw) continue;
    var idNum = parseInt(String(idRaw).replace(/\D/g, ''), 10);
    if (isNaN(idNum) || idNum <= 0) continue;
    result.push({
      id: idNum,
      group_level1: String(row[COLS.GROUP_LEVEL1] || '').trim(),
      group_level2: String(row[COLS.GROUP_LEVEL2] || '').trim(),
      group_level3: String(row[COLS.GROUP_LEVEL3] || '').trim(),
      name_ua: String(row[COLS.NAME_UA] || '').trim(),
      name_ru: String(row[COLS.NAME_RU] || '').trim(),
      equipment: String(row[COLS.EQUIPMENT] || '').trim(),
      active: String(row[COLS.ACTIVE] || 'YES').trim(),
      vid: String(row[COLS.VID] || '').trim(),
      difficulty: String(row[COLS.DIFFICULTY] || '').trim(),
      focus_point: String(row[COLS.FOCUS_POINT] || '').trim(),
      common_mistakes: String(row[COLS.COMMON_MISTAKES] || '').trim(),
      proper_feeling: String(row[COLS.PROPER_FEELING] || '').trim(),
      static_holds: String(row[COLS.STATIC_HOLDS] || '').trim(),
      youtube_link: String(row[COLS.YOUTUBE_LINK] || '').trim(),
      my_channel_link: String(row[COLS.MY_CHANNEL_LINK] || '').trim()
    });
  }
  return result;
}

function runExportExerciseLibraryOnly() {
  var data = exportExerciseLibrary();
  Logger.log(JSON.stringify({ exercise_library: data }, null, 2));
  return JSON.stringify({ exercise_library: data }, null, 2);
}

function runExportToDrive() {
  var ssId = getSpreadsheetId();
  if (!ssId) {
    throw new Error('SPREADSHEET_ID not set in Script Properties');
  }
  var now = new Date();
  var folderName = 'FIT_Export_' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm');
  var root = DriveApp.getRootFolder();
  var folder = root.createFolder(folderName);
  var exLib = exportExerciseLibrary();
  var exLibJson = JSON.stringify({ exercise_library: exLib }, null, 2);
  folder.createFile('exercise_library.json', exLibJson, MimeType.PLAIN_TEXT);
  Logger.log('Created folder: ' + folder.getUrl());
  return folder.getUrl();
}

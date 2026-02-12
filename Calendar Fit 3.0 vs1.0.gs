/**
 * Calendar.gs - Google Calendar Integration
 * Версія: 1.0
 * Дата: 05.02.2026
 *
 * ВІДПОВІДАЛЬНІСТЬ:
 * - Створення подій в Google Calendar
 * - Оновлення статусу подій
 * - Видалення подій
 * - Синхронізація слотів розкладу з календарем
 *
 * НЕ МІСТИТЬ:
 * - Бізнес-логіку
 * - Роботу з БД (тільки отримує дані через параметри)
 * - FSM логіку
 */

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Створити подію в календарі
 *
 * @param {string} calendarId - Email календаря (CalendarId тренера)
 * @param {Object} eventData - Дані події
 * @param {string} eventData.summary - Назва події
 * @param {Date} eventData.dateTime - Дата та час початку
 * @param {number} eventData.duration - Тривалість в хвилинах (за замовчуванням 60)
 * @param {string} eventData.studentName - Ім'я учня (опціонально)
 * @returns {string|null} - Event ID або null при помилці
 */
function createEvent(calendarId, eventData) {
  try {
    if (!calendarId || !eventData || !eventData.dateTime) {
      Logger.log('Calendar.createEvent: Invalid parameters');
      return null;
    }

    var calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) {
      Logger.log('Calendar not found: ' + calendarId);
      return null;
    }

    var title = eventData.summary || 'Тренування';
    var startTime = new Date(eventData.dateTime);
    var duration = eventData.duration != null ? eventData.duration : 60;
    var endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    var description = 'Тренування FIT 3.0';
    if (eventData.studentName) {
      description += '\nУчень: ' + eventData.studentName;
    }

    var event = calendar.createEvent(title, startTime, endTime, {
      description: description,
      location: ''
    });

    var eventId = event.getId();
    Logger.log('Event created: ' + eventId);
    return eventId;
  } catch (error) {
    Logger.log('Calendar.createEvent error: ' + error.message);
    return null;
  }
}

/**
 * Оновити статус події
 *
 * @param {string} eventId - ID події в календарі
 * @param {string} status - Новий статус (CONFIRMED, COMPLETED, CANCELLED)
 * @returns {boolean} - true якщо успішно
 */
function updateEventStatus(eventId, status) {
  try {
    if (!eventId) {
      Logger.log('Calendar.updateEventStatus: No eventId');
      return false;
    }

    var event = CalendarApp.getEventById(eventId);
    if (!event) {
      Logger.log('Event not found: ' + eventId);
      return false;
    }

    var description = event.getDescription() || '';
    description = description.replace(/\n\nСтатус:.*$/, '');

    if (status === 'CONFIRMED') {
      description += '\n\nСтатус: ✅ Підтверджено';
      event.setColor(CalendarApp.EventColor.GREEN);
    } else if (status === 'COMPLETED') {
      description += '\n\nСтатус: ✔️ Завершено';
      event.setColor(CalendarApp.EventColor.GRAY);
    } else if (status === 'CANCELLED') {
      description += '\n\nСтатус: ❌ Скасовано';
      event.setColor(CalendarApp.EventColor.RED);
    }

    event.setDescription(description);
    Logger.log('Event updated: ' + eventId + ' → ' + status);
    return true;
  } catch (error) {
    Logger.log('Calendar.updateEventStatus error: ' + error.message);
    return false;
  }
}

/**
 * Видалити подію
 *
 * @param {string} eventId - ID події
 * @returns {boolean}
 */
function deleteEvent(eventId) {
  try {
    if (!eventId) {
      Logger.log('Calendar.deleteEvent: No eventId');
      return false;
    }

    var event = CalendarApp.getEventById(eventId);
    if (!event) {
      Logger.log('Event not found: ' + eventId);
      return false;
    }

    event.deleteEvent();
    Logger.log('Event deleted: ' + eventId);
    return true;
  } catch (error) {
    Logger.log('Calendar.deleteEvent error: ' + error.message);
    return false;
  }
}

/**
 * Оновити час події
 *
 * @param {string} eventId - ID події
 * @param {Date} newDateTime - Нова дата та час
 * @returns {boolean}
 */
function updateEventTime(eventId, newDateTime) {
  try {
    if (!eventId || !newDateTime) {
      Logger.log('Calendar.updateEventTime: Invalid parameters');
      return false;
    }

    var event = CalendarApp.getEventById(eventId);
    if (!event) {
      Logger.log('Event not found: ' + eventId);
      return false;
    }

    var oldStart = event.getStartTime();
    var oldEnd = event.getEndTime();
    var duration = oldEnd.getTime() - oldStart.getTime();

    var newStart = new Date(newDateTime);
    var newEnd = new Date(newStart.getTime() + duration);

    event.setTime(newStart, newEnd);
    Logger.log('Event time updated: ' + eventId);
    return true;
  } catch (error) {
    Logger.log('Calendar.updateEventTime error: ' + error.message);
    return false;
  }
}

/**
 * Синхронізувати слот розкладу з календарем
 * Викликається з Schedule.gs (передається calendarId, щоб Calendar не викликав User/Sheets)
 *
 * @param {string} calendarId - Email календаря тренера
 * @param {Object} slot - Об'єкт слоту (id, coachId, studentId, date, time, status, calEventId)
 * @param {string} status - Статус слоту (BOOKED, REQUESTED, COMPLETED, CANCELED, AVAILABLE)
 * @param {string} studentName - Ім'я учня (опціонально, для опису події)
 * @returns {string|null} - Новий eventId якщо подію створено, інакше null
 */
function syncSlot(calendarId, slot, status, studentName) {
  try {
    if (!calendarId) {
      Logger.log('Calendar.syncSlot: No calendarId');
      return null;
    }
    if (!slot) {
      Logger.log('Calendar.syncSlot: No slot');
      return null;
    }

    var eventId = slot.calEventId || '';
    var hasEvent = eventId && String(eventId).length > 0;

    if (status === 'CANCELED') {
      if (hasEvent) {
        deleteEvent(eventId);
      }
      return null;
    }

    if (status === 'COMPLETED') {
      if (hasEvent) {
        updateEventStatus(eventId, 'COMPLETED');
      }
      return null;
    }

    if (status === 'BOOKED' || status === 'REQUESTED') {
      if (hasEvent) {
        updateEventStatus(eventId, 'CONFIRMED');
        return null;
      }
      var startTime = slotToStartTime_(slot);
      if (!startTime) {
        Logger.log('Calendar.syncSlot: Invalid slot date/time');
        return null;
      }
      var eventData = {
        summary: 'Тренування',
        dateTime: startTime,
        duration: 60,
        studentName: studentName || ''
      };
      var newEventId = createEvent(calendarId, eventData);
      return newEventId;
    }

    return null;
  } catch (error) {
    Logger.log('Calendar.syncSlot error: ' + error.message);
    return null;
  }
}

/**
 * Отримати події за період
 *
 * @param {string} calendarId - Email календаря
 * @param {Date} startDate - Початок періоду
 * @param {Date} endDate - Кінець періоду
 * @returns {Array<Object>} - Масив подій
 */
function getEvents(calendarId, startDate, endDate) {
  try {
    if (!calendarId || !startDate || !endDate) {
      Logger.log('Calendar.getEvents: Invalid parameters');
      return [];
    }

    var calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) {
      Logger.log('Calendar not found: ' + calendarId);
      return [];
    }

    var events = calendar.getEvents(startDate, endDate);
    var result = [];
    var i;
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      result.push({
        id: ev.getId(),
        title: ev.getTitle(),
        startTime: ev.getStartTime(),
        endTime: ev.getEndTime(),
        description: ev.getDescription()
      });
    }
    return result;
  } catch (error) {
    Logger.log('Calendar.getEvents error: ' + error.message);
    return [];
  }
}

/**
 * Перевірити чи календар доступний
 *
 * @param {string} calendarId - Email календаря
 * @returns {boolean}
 */
function isCalendarAccessible(calendarId) {
  try {
    if (!calendarId) {
      return false;
    }
    var calendar = CalendarApp.getCalendarById(calendarId);
    return calendar !== null;
  } catch (error) {
    Logger.log('Calendar.isCalendarAccessible error: ' + error.message);
    return false;
  }
}

/**
 * Перевірити конфлікт слоту
 *
 * @param {string} calendarId - Email календаря
 * @param {Date} slotDateTime - Час слоту
 * @param {number} duration - Тривалість в хвилинах
 * @returns {boolean} - true якщо є конфлікт
 */
function hasConflict(calendarId, slotDateTime, duration) {
  try {
    duration = duration != null ? duration : 60;

    var startTime = new Date(slotDateTime);
    var endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    var events = getEvents(calendarId, startTime, endTime);
    return events.length > 0;
  } catch (error) {
    Logger.log('Calendar.hasConflict error: ' + error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Зібрати Date з полів слоту (date + time)
 * @private
 * @param {Object} slot
 * @returns {Date|null}
 */
function slotToStartTime_(slot) {
  if (!slot) return null;
  var d = slot.date instanceof Date ? slot.date : new Date(slot.date);
  var parts = (slot.time || '0:0').split(':');
  d.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
  return d;
}

// Експорт для Schedule та Main.checkModules (GAS один глобальний namespace)
var Calendar = {
  createEvent: createEvent,
  updateEventStatus: updateEventStatus,
  deleteEvent: deleteEvent,
  updateEventTime: updateEventTime,
  syncSlot: syncSlot,
  getEvents: getEvents,
  isCalendarAccessible: isCalendarAccessible,
  hasConflict: hasConflict
};

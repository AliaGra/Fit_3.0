ТЗ: Модуль "Session Tags" (Телеметрия тренировок и питания)
Контекст: Разработка микросервиса для сбора, валидации и обработки тегов после завершения тренировочной или пищевой сессии.Цель: Автоматическая адаптация тренировочного объема, интенсивности и списка упражнений на основе физиологического отклика пользователя (RPE, болевые синдромы, ЦНС).Стек: TypeScript, Node.js / Google Apps Script, Supabase (PostgreSQL).1. Обновление схемы БД (Supabase)Необходимо добавить хранение тегов в таблицу завершенных сессий. Используем массив строк для простоты индексации.SQL-миграция:SQL-- Добавляем колонку для хранения тегов в таблицу сессий
ALTER TABLE user_sessions 
ADD COLUMN IF NOT EXISTS session_tags text[] DEFAULT '{}';

-- Создаем индекс для быстрого поиска сессий с критическими тегами
CREATE INDEX IF NOT EXISTS idx_user_sessions_tags ON user_sessions USING GIN (session_tags);
2. Словарь тегов (TypeScript Enums)Внедрить строгую типизацию. Система должна принимать только разрешенные значения, чтобы избежать мусора в аналитике.Файл: types/tags.tsTypeScriptexport enum BiomechanicsTag {
  PAIN_LUMBAR = 'pain_lumbar', // Острая боль в пояснице
  PAIN_KNEE = 'pain_knee',     // Боль в коленном суставе
  PAIN_SHOULDER = 'pain_shoulder', // Импинджмент / боль в плече
}

export enum PerformanceTag {
  RPE_LOW = 'rpe_low',       // Слишком легко (RPE < 7)
  RPE_TARGET = 'rpe_target', // Оптимально (RPE 7-8)
  RPE_HIGH = 'rpe_high',     // Отказ / тяжело (RPE 9-10)
  CNS_FATIGUE = 'cns_fatigue', // Истощение ЦНС, тремор
}

export enum NutritionTag {
  PROTEIN_DEFICIT = 'protein_deficit', // Недобор белка
  CARB_OVERLOAD = 'carb_overload',     // Профицит быстрых углеводов
}

export type SessionTag = BiomechanicsTag | PerformanceTag | NutritionTag;
3. Матрица реакций системы (Бизнес-логика)Каждый тег должен вызывать конкретную мутацию в профиле пользователя или плане.КатегорияТегСистемное действие (Side Effect)БиомеханикаPAIN_LUMBARБлокировка осевой нагрузки (axial_load: false). Исключение приседов/тяг.БиомеханикаPAIN_KNEEБлокировка упражнений с высоким сдвигающим усилием (knee_shear_force: false).БиомеханикаPAIN_SHOULDERОграничение жимов над головой. Замена на фронтальные подъемы.НагрузкаRPE_LOWУвеличение тренировочного объема на следующую сессию (тоннаж +5%).НагрузкаRPE_HIGHВключение режима Deload (разгрузка). Снижение рабочих весов на 15%.НагрузкаCNS_FATIGUEПринудительный день отдыха. Блокировка тренировки на 48 часов.4. Архитектура обработчика (Backend Engine)Создать класс-обработчик, который запускается асинхронно после сохранения сессии.Файл: services/TagProcessor.tsTypeScriptimport { SessionTag, BiomechanicsTag, PerformanceTag } from '../types/tags';

export class TagProcessor {
  /**
   * Главный метод обработки тегов после сессии
   */
  static async process(userId: string, tags: SessionTag[]): Promise<void> {
    if (!tags || tags.length === 0) return;

    // 1. Обработка красных флагов (Безопасность суставов)
    const hasLumbarPain = tags.includes(BiomechanicsTag.PAIN_LUMBAR);
    if (hasLumbarPain) {
      await UserService.updateMedicalRestriction(userId, 'exclude_axial_load', true);
      await WorkoutEngine.rebuildRoutine(userId);
      await NotificationService.alert(userId, "Зафиксирована боль в спине. Осевая нагрузка отключена.");
    }

    // 2. Адаптация нагрузки (Прогрессия/Регрессия)
    if (tags.includes(PerformanceTag.CNS_FATIGUE) || tags.includes(PerformanceTag.RPE_HIGH)) {
      await ProgressionService.scheduleDeload(userId);
    } else if (tags.includes(PerformanceTag.RPE_LOW)) {
      await ProgressionService.increaseIntensity(userId, 1.05);
    }
  }
}
5. UI/UX: Тексты для Telegram-ботаДобавить триггер в конце тренировки. Формат общения — прямой, экспертный.Сообщение от бота (копирайтинг):Тренировка закрыта. Теперь честный отчет.Твоя задача — объективно оценить нагрузку. От этого зависит, что система выдаст тебе на следующей сессии. Перегрузишь ЦНС — пойдешь на спад. Игнорируешь боль — заработаешь травму. Выбирай теги:Кнопки (Inline Keyboard):[Легкотня (RPE <7)][В самый раз (RPE 7-8)][На пределе (RPE 9-10)][Резкая боль в пояснице][Боль в колене]
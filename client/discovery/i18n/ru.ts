import type { EnCatalog } from './en';

/** Russian UI overlay. Falls back to English for missing keys. */
export const ru: DeepPartial<EnCatalog> = {
    calendar: {
        page: { tvDescription: 'Премьеры сериалов, загрузки и активность во всей медиасистеме.', movieDescription: 'Премьеры фильмов, загрузки и активность во всей медиасистеме.' },
        actions: { refresh: 'Обновить', configureInSettings: 'Настроить в параметрах →' },
        sections: { upcomingReleases: 'Ближайшие релизы', downloads: 'Загрузки: {name}', history: 'История: {name}', status: 'Статус: {name}' },
        relative: { today: 'Сегодня', tomorrow: 'Завтра', atTime: ' в {time}', nextMonthNotice: 'Показан следующий месяц с релизами {type} ({month}).', noNextReleases: 'В ближайшие 6 месяцев релизы {type} не найдены.' },
        status: { unconfigured: 'Не настроено', online: 'В сети', ready: 'Готово', monitored: 'Отслеживается', freeStorage: 'Свободное место', freeGb: 'Свободно: {value} ГБ', usedPercent: 'Использовано: {value}%', totalGb: 'Всего: {value} ГБ' },
        labels: { requestedNotAired: 'Запрошено — ещё не вышло в эфир', requestedNotReleased: 'Запрошено — ещё не выпущено', unableToFetch: 'Не удалось получить данные от {name}. Проверьте URL, API-ключ и доступность локальной сети.', subtitleAutomation: 'Управление субтитрами и автоматизация', musicAutomation: 'Автоматизация музыкальной библиотеки', active: 'Активно: {count}' },
        empty: { notConfigured: '{name} ещё не настроен.', configurationHint: 'Добавьте URL и API-ключ в разделе «Параметры → Интеграции».', noUpcoming: 'В этом месяце нет ближайших релизов {type}', noPoster: 'Нет постера', noActiveDownloads: 'Нет активных загрузок {type}', noRecentHistory: 'Нет недавней истории {type}', unknownTime: 'Время неизвестно' },
        fallback: { unknownSeries: 'Неизвестный сериал', unknownTvShow: 'Неизвестное телешоу', unknownMovie: 'Неизвестный фильм', movieRelease: 'Релиз фильма' },
        events: { grabbed: 'Получено', imported: 'Импортировано', failed: 'Ошибка', deleted: 'Удалено' },
        errors: { loadFailed: 'Не удалось загрузить данные медиасистемы.' },
    },
};

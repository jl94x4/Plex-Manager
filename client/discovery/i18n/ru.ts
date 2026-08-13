import type { EnCatalog } from './en';

/** Russian UI overlay. Falls back to English for missing keys. */
export const ru: DeepPartial<EnCatalog> = {
    downloads: { page: { eyebrow: 'Загрузки', title: 'Состояние загрузок', description: 'Все настроенные клиенты загрузки, сгруппированные по Sonarr, Radarr и Lidarr.' }, actions: { refresh: 'Обновить', clearClientFilter: 'Сбросить фильтр клиента', pause: 'Приостановить', resume: 'Возобновить', remove: 'Удалить' }, filters: { client: 'Клиент', show: 'Показать', activeOnly: 'Только активные', all: 'Все', allClients: 'Все клиенты', other: 'Другое', shown: 'Показано: {count}', hidingCompleted: 'завершённые/раздаваемые скрыты' }, labels: { clients: 'Клиенты', downloadClient: 'Клиент загрузки', downloadCount: 'Загрузка: {count}', downloadCount_plural: 'Загрузки: {count}', downSpeed: 'Загрузка {value}/с', upSpeed: 'Отдача {value}/с', matchedFromArrQueue: 'Найдено в очереди Arr' }, status: { activeDownloads: 'Активные загрузки', downloads: 'Загрузки', unknown: 'Неизвестно' }, empty: { noClients: 'В параметрах не настроены клиенты загрузки.', noFilterResults: 'Нет загрузок для этого фильтра.' }, upload: { title: 'Добавить торрент', subtitle: 'Отправить URL, magnet-ссылку или файл настроенному клиенту', client: 'Клиент', category: 'Категория', torrentUrl: 'URL торрента или Magnet', torrentFile: 'Файл торрента', noCategory: 'Без категории', sending: 'Отправка…', add: 'Добавить торрент' }, errors: { loadFailed: 'Не удалось загрузить список загрузок', actionFailed: 'Не удалось выполнить действие «{action}» для загрузки', chooseClient: 'Сначала выберите клиент загрузки.', missingSource: 'Добавьте URL торрента, magnet-ссылку или файл торрента.', addFailed: 'Не удалось добавить торрент' }, confirm: { remove: 'Удалить «{name}» из {client}? Загруженные файлы останутся на месте, если клиент это поддерживает.' } },
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

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

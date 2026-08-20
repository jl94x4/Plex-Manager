import type { EnCatalog } from './en';

/** Russian UI overlay. Falls back to English for missing keys. */
export const ru: DeepPartial<EnCatalog> = {
    downloads: { page: { eyebrow: 'Загрузки', title: 'Состояние загрузок', description: 'Все настроенные клиенты загрузки, сгруппированные по Sonarr, Radarr и Lidarr.' }, actions: { refresh: 'Обновить', clearClientFilter: 'Сбросить фильтр клиента', pause: 'Приостановить', resume: 'Возобновить', remove: 'Удалить' }, filters: { client: 'Клиент', show: 'Показать', activeOnly: 'Только активные', all: 'Все', allClients: 'Все клиенты', other: 'Другое', shown: 'Показано: {count}', hidingCompleted: 'завершённые/раздаваемые скрыты' }, labels: { clients: 'Клиенты', downloadClient: 'Клиент загрузки', downloadCount: 'Загрузка: {count}', downloadCount_plural: 'Загрузки: {count}', downSpeed: 'Загрузка {value}/с', upSpeed: 'Отдача {value}/с', matchedFromArrQueue: 'Найдено в очереди Arr' }, status: { activeDownloads: 'Активные загрузки', downloads: 'Загрузки', unknown: 'Неизвестно' }, empty: { noClients: 'В параметрах не настроены клиенты загрузки.', noFilterResults: 'Нет загрузок для этого фильтра.' }, upload: { title: 'Добавить торрент', subtitle: 'Отправить URL, magnet-ссылку или торрент-файлы настроенному клиенту', client: 'Клиент', category: 'Категория', torrentUrl: 'URL торрента или Magnet', torrentFile: 'Торрент-файлы', torrentFileHint: 'Выберите или перетащите один или несколько файлов .torrent', dropHint: 'Перетащите торрент-файлы сюда', selectedCount: 'Выбран {count} торрент', selectedCount_plural: 'Выбрано {count} торрентов', clearFiles: 'Очистить файлы', removeFile: 'Удалить {name}', noCategory: 'Без категории', sending: 'Отправка…', add: 'Добавить торрент', addCount: 'Добавить {count} торрентов' }, errors: { loadFailed: 'Не удалось загрузить список загрузок', actionFailed: 'Не удалось выполнить действие «{action}» для загрузки', chooseClient: 'Сначала выберите клиент загрузки.', missingSource: 'Добавьте URL торрента, magnet-ссылку или файл торрента.', addFailed: 'Не удалось добавить торрент', addPartial: 'Добавлено {added} из {total} торрентов. Ошибки: {failed}', invalidTorrent: 'Можно добавлять только файлы .torrent.' }, confirm: { remove: 'Удалить «{name}» из {client}? Загруженные файлы останутся на месте, если клиент это поддерживает.' } },
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

Object.assign(ru, { statusPage: { page: { eyebrow: 'Состояние системы', title: 'Состояние сервера', description: 'Следите за доступностью и производительностью сервисов.' }, actions: { back: 'Назад', refresh: 'Обновить' }, tabs: { overview: 'Обзор', history: 'История', analytics: 'Аналитика' }, summary: { online: 'Онлайн: {online} из {total}', offline: 'Офлайн: {count}', fleetUptime: 'Доступность за {period}: {value}%' }, labels: { section: 'Состояние', services: 'Сервисы', ungrouped: 'Без группы', periodUptime: 'Доступность за {period}', groupSummary: 'Сервисов: {count} · доступность за {period}', uptimeValue: 'Доступность за {period}: {value}%', latencyValue: 'Задержка: {value}', average: '(ср. {value})', adminOnly: 'Только для администраторов', adminOnlyHint: 'Видно только администраторам' }, status: { online: 'Онлайн', degraded: 'Снижено', offline: 'Офлайн', unknown: 'Неизвестно', healthy: 'Работает', outage: 'Сбой' }, empty: { noServicesTitle: 'Сервисы состояния не настроены', noServicesSubtitle: 'Сервисы состояния ещё не настроены.', blank: 'Состояние появится после настройки сервисов.', adminHint: 'Администраторы могут настроить их в параметрах монитора состояния.', memberHint: 'Попросите администратора настроить сервисы состояния.', noHistory: 'Исторические данные недоступны.', noIncidents: 'За этот период сбоев нет.', noData: 'Нет данных', latencyHistory: 'История задержки недоступна.' }, relative: { hoursAgo: '{count} ч. назад', daysAgo: '{count} дн. назад', periodAgo: '{period} назад', now: 'Сейчас' }, history: { subtitle: 'История и сбои за последние {period}', hourUtc: 'Час (UTC)', date: 'Дата', uptimePercent: 'Доступность', checks: 'Проверки', averageLatency: 'Ср. задержка', status: 'Состояние' }, incidents: { title: 'Сбои · {period}', started: 'Начало', ended: 'Конец', duration: 'Длительность', severity: 'Серьёзность', ongoing: 'Текущий' }, analytics: { uptime: 'Доступность', checks: 'Проверки', averageLatency: 'Средняя задержка', p95Latency: 'Задержка P95', incidents: 'Сбои', longestOutage: 'Самый долгий сбой', healthyStreak: 'Серия без сбоев', worstDay: 'Худший день', uptimeTrend: 'Доступность · {name}', rollingUptime: 'Скользящая доступность за {period}', latencyTitle: 'Задержка · {name}', averageResponseTime: 'Среднее время ответа за {period}', best: 'Лучший день: {value} · {pct}%', worst: 'Худший день: {value} · {pct}%' }, errors: { loadFailed: 'Не удалось загрузить данные о состоянии.' }, speedTest: { title: 'Тест соединения', description: 'Измерьте задержку и пропускную способность между браузером и порталом.', run: 'Запустить тест', runAgain: 'Повторить тест', measuringLatency: 'Измерение задержки…', testingDownload: 'Проверка загрузки…', testingUpload: 'Проверка выгрузки…', ready: 'Готово', complete: 'Тест завершён', failed: 'Тест не пройден', error: 'Не удалось выполнить тест соединения', latency: 'Задержка', download: 'Загрузка', upload: 'Выгрузка', roundTrip: 'Время туда и обратно', downloadHint: 'Расчётная скорость загрузки', uploadHint: 'Расчётная скорость выгрузки', highLatencyHint: 'Высокая задержка может указывать на перегрузку сети или большое расстояние.', steadyStateHint: 'Результаты отражают текущее соединение и могут меняться.', progress: 'выполняется…' } } });

Object.assign(ru, { support: { page: { adminTitle: 'Входящие поддержки', memberTitle: 'Связаться с администратором', adminDescription: 'Отвечайте на обращения пользователей, не покидая портал.', memberDescription: 'Напишите администратору сервера напрямую — без Discord или электронной почты.' }, filters: { open: 'Открытые', resolved: 'Решённые', closed: 'Закрытые', all: 'Все' }, actions: { newTicket: 'Новое обращение', resolve: 'Решить', reopen: 'Открыть снова', send: 'Отправить' }, labels: { messages: '{count} сообщение', messages_plural: '{count} сообщений', admin: 'Администратор' }, empty: { noTickets: 'В этом представлении нет обращений.', selectTicket: 'Выберите обращение, чтобы прочитать переписку.' }, loading: { tickets: 'Загрузка обращений…' }, errors: { loadFailed: 'Не удалось загрузить обращения', openFailed: 'Не удалось открыть обращение', sendFailed: 'Не удалось отправить обращение', replyFailed: 'Не удалось ответить', statusFailed: 'Не удалось обновить состояние', deleteFailed: 'Не удалось удалить' }, toasts: { sent: 'Обращение отправлено', deleted: 'Обращение удалено' }, compose: { title: 'Новое обращение в поддержку', category: 'Категория', subject: 'Тема', subjectPlaceholder: 'Краткое описание', message: 'Сообщение', messagePlaceholder: 'Какая помощь вам нужна?', sending: 'Отправка…' }, reply: { placeholder: 'Введите ответ…' }, status: { open: 'Открыто', resolved: 'Решено', closed: 'Закрыто' }, categories: { media: 'Запрос или проблема с медиа', account: 'Аккаунт / доступ', server: 'Сервер / сервис', general: 'Общий вопрос', other: 'Другое' } } });

Object.assign(ru, { maintenance: { rules: { title: 'Правила обслуживания библиотеки', description: 'Сохранённые фильтры перечислены ниже. Нажмите, чтобы изменить, просмотреть или запустить их.', savedFilters: 'Сохранённые фильтры', noFilters: 'Фильтров пока нет. Нажмите «Добавить фильтр».', unsaved: 'Есть несохранённые изменения. Сохраните фильтр перед просмотром или запуском.' }, actions: { rebuildIndex: 'Перестроить индекс', addFilter: 'Добавить фильтр', edit: 'Изменить', refresh: 'Обновить', reset: 'Сбросить', delete: 'Удалить', closeEditor: 'Закрыть редактор', deleteFilter: 'Удалить фильтр', addCondition: 'Добавить условие', saveFilter: 'Сохранить фильтр', previewMatches: 'Предпросмотр совпадений', runDry: 'Запустить пробный режим', runDestructive: 'Запустить удаление' }, labels: { true: 'Да', false: 'Нет', minMax: 'мин,макс', values: 'v1,v2', value: 'значение', enabled: 'Включено', disabled: 'Отключено', matches: 'Совпадения', grace: 'Льготный период', graceDays: 'Дни льготного периода', maxActions: 'Максимум действий', collectionName: 'Название коллекции', matchLogic: 'Логика совпадений', filterName: 'Имя фильтра', matchedTitles: 'Совпавшие названия', noPoster: 'Нет постера', eligible: 'Подходит', unmapped: 'Не сопоставлено', ambiguous: 'Неоднозначно' }, statuses: { saving: 'Сохранение…', resetting: 'Сброс…', refreshingPreview: 'Обновление предпросмотра…', running: 'Выполняется…', executing: 'Выполнение…' }, options: { createCollection: 'Создать / синхронизировать коллекцию Plex', deleteViaArr: 'Удалить через Sonarr/Radarr', deleteFiles: 'Удалить файлы с диска', pinCollection: 'При удалении создать и закрепить коллекцию на главной для всех пользователей' }, toasts: { filterDeleted: 'Фильтр удалён', rulesSaved: 'Правила обслуживания сохранены.', indexRebuilt: 'Индекс обслуживания перестроен.', filterEnabled: 'Фильтр включён', filterDisabled: 'Фильтр отключён' }, errors: { load: 'Не удалось загрузить модуль обслуживания', deleteFilter: 'Не удалось удалить фильтр', saveRules: 'Не удалось сохранить правила обслуживания', rebuildIndex: 'Не удалось перестроить индекс', preview: 'Не удалось создать предпросмотр', unsavedBeforeRun: 'Сохраните изменения фильтра перед запуском.', run: 'Не удалось выполнить правило', preflight: 'Предварительная проверка не пройдена.', resetGrace: 'Не удалось сбросить льготный период', toggleFilter: 'Не удалось обновить состояние фильтра' }, confirmations: { deleteFilter: 'Удалить фильтр', destructive: 'Запустить разрушительное обслуживание сейчас? Совпавшие элементы будут удалены через Sonarr/Radarr с использованием сохранённого фильтра.', destructiveWithCollection: 'Запустить разрушительное обслуживание сейчас? Элементы будут удалены через Sonarr/Radarr, а коллекция Plex будет создана и закреплена для всех пользователей.' }, summaries: { matched: 'Совпадений: {count}', deleted: 'Удалено: {count}', skipped: 'Пропущено: {count}', failed: 'Ошибок: {count}', dayLeft: 'Осталось дней: {count}', from: 'с', fromCreation: 'с момента создания', conditions: 'Условий: {count}' } } });


Object.assign(ru, { maintenance: { ...ru.maintenance, rules: { ...ru.maintenance?.rules, selectFilter: 'Выберите сохранённый фильтр для предпросмотра совпадений.' }, labels: { ...ru.maintenance?.labels, mapped: 'сопоставлено', instanceMappingHint: 'Неоднозначное сопоставление экземпляра', index: 'Индекс', mediaItems: 'медиаэлементов', lastBuild: 'Последняя сборка', requestRecords: 'Записи запросов' }, status: { dryRunCompleted: 'Пробный запуск завершён', destructiveWithCollection: 'Удаление завершено с закреплением коллекции', destructiveCompleted: 'Удаление завершено', executionWithCollection: 'Выполнение правила завершено с закреплением коллекции', executionCompleted: 'Выполнение правила завершено' }, summaries: { ...ru.maintenance?.summaries, allInGrace: 'Все элементы в льготном периоде (осталось дней: {count})', upToPerRun: 'до {count} за запуск', previewAllInGrace: 'Предпросмотр: совпадений {matches}, все в льготном периоде (осталось дней: {days}).', previewSummary: 'Предпросмотр: совпадений {matches}, подходят {eligible}, сопоставлено в Sonarr/Radarr: {mapped}{inGrace}.', inGraceSuffix: ', в льготном периоде: {count}', warnings: 'Предупреждения:', wouldProcess: 'Будет обработано до {count} элементов: сопоставлено в Sonarr/Radarr: {mapped}, не сопоставлено: {unmapped}.', stillInGrace: 'Ещё в льготном периоде: {count} (осталось дней: {days}).', graceTimerReset: 'Таймер льготного периода сброшен' } } });


Object.assign(ru, { maintenance: { ...ru.maintenance, sections: { overview: 'Обзор', exclusions: 'Исключения', rules: 'Правила', collections: 'Коллекции', candidates: 'Кандидаты', calendar: 'Календарь', storage: 'Метрики хранилища', library: 'Библиотека правил', settings: 'Настройки очистки', logs: 'Журналы' }, labels: { noData: 'Нет данных', unknownLibrary: 'Неизвестная библиотека', unnamedRule: 'Правило без названия', noPoster: 'Нет постера', library: 'Библиотека', before: 'До', reclaim: 'Освобождение', after: 'После', matched: 'Совпадений', previous: 'Назад', next: 'Далее', close: 'Закрыть' }, overview: { reclaimImpact: 'Обзор освобождения и влияния', rulesWithMatches: 'Правила с совпадениями', totalRuns: 'Всего запусков', totalMatched: 'Всего совпадений', uniqueCandidates: 'Уникальные названия-кандидаты', estimatedReclaim: 'Оценка освобождения', topLibraries: 'Библиотеки по освобождению', topRules: 'Правила по освобождению' }, candidates: { title: 'Кандидаты', searchPlaceholder: 'Поиск названий...', noResults: 'Совпадающие кандидаты не найдены.', loading: 'Загрузка кандидатов...' }, storage: { title: 'Метрики хранилища', refreshSummary: 'Обновить сводку', projectedReclaim: 'Ожидаемое освобождение', ruleScope: 'Область правила:', noSummary: 'Сводки хранилища пока нет.', loading: 'Загрузка сводки хранилища...', matchedItems: 'Совпавшие элементы-кандидаты' }, library: { title: 'Библиотека правил', export: 'Экспорт правил JSON', import: 'Импорт правил JSON', placeholder: 'Вставьте сюда JSON правил.' }, exclusions: { title: 'Исключения', allLibraries: 'Все библиотеки', searchPlaceholder: 'Поиск названия...', refresh: 'Обновить', selectPage: 'Выбрать страницу', excludeSelected: 'Исключить выбранные ({count})', clearSelection: 'Очистить выбор', removeSelected: 'Удалить выбранные исключения', loading: 'Загрузка постеров...', excluded: 'Исключено', exclude: 'Исключить', unexclude: 'Отменить исключение', noTitles: 'Названия не найдены.', saved: 'Исключения сохранены.' }, settings: { save: 'Сохранить настройки очистки', saved: 'Настройки обслуживания сохранены.' }, calendar: { currentRule: 'Текущее правило:', graceDays: 'Льготные дни', ruleAge: 'Возраст правила', eligibleNow: 'Доступно сейчас', laterReclaim: 'Позднее освобождение', daysUntilEligible: 'дн. до доступности', titleCount: 'назв.', laterDetail: 'Эти названия ждут окончания льготного периода.', dateTitleCount: 'Число названий, доступных в эту дату.', delayedReclaimTooltip: 'Оценка освобождения от отложенных совпадений.', eligibilityDetailTooltip: 'Сведения о доступности, используемые сервером.', ago: 'дн. назад', notAvailable: 'н/д' } } });

Object.assign(ru, { maintenance: { ...ru.maintenance,
    ...ru.maintenance,
    page: { title: 'Очистка', disabledTitle: 'Очистка отключена', disabledDescription: 'Экспериментальный режим очистки сейчас ВЫКЛ.', disabledHint: 'Включите его в `Настройки` → `Система` в разделе `Экспериментальный режим очистки`, затем нажмите «Сохранить настройки».', controlCenter: 'Центр управления очисткой', controlCenterDescription: 'Специализированный модуль для автоматизации обслуживания библиотек: правила, коллекции, кандидаты, журнал запусков, календарь, хранилище и управление.' },
    labels: { ...ru.maintenance.labels, modulePage: 'Страница модуля', modulePages: 'Страницы модулей', indexedMedia: 'Проиндексированные медиафайлы', requestRecords: 'Записи запросов', topImpactLibrary: 'Библиотека с наибольшим влиянием', unknownTitle: 'Неизвестное название', mapped: 'сопоставлено', eligible: 'Доступно', unmapped: 'Не сопоставлено', ambiguous: 'Неоднозначно' },
    collections: { title: 'Коллекции', description: 'Управляйте поведением коллекций для каждого правила. Изменения сохраняются непосредственно в каждом наборе правил.', enabled: 'Включено', templateSaved: 'Шаблон коллекции сохранён.', settingsUpdated: 'Настройки коллекции обновлены.' },
    candidates: { ...ru.maintenance.candidates, noRules: 'Сохранённые правила не найдены. Сначала создайте правило в разделе `Правила`.', showing: 'Показаны кандидаты только для {name}.' },
    runs: { title: 'Журналы', dryRun: 'Тестовый запуск', destructive: 'Разрушающий', summary: 'Совпало: {matched} · Обработано: {processed} · Удалено: {deleted} · Пропущено: {skipped} · Ошибок: {failed}', noRuns: 'Запусков пока нет.' },
    calendar: { ...ru.maintenance.calendar, title: 'Календарь', description: 'Расписание доступности на основе правил. Льготные дни отсчитываются от даты создания правила.', eligibleLaterDays: 'Дни до доступности', laterTitles: 'Поздние названия', eligibleLaterByDate: 'Доступность по датам', noDelayedDates: 'Отложенных дат нет. Текущие совпадения уже доступны.', reclaimNow: '{value} можно освободить сейчас', eligibilityNowTooltip: 'Названия, соответствующие этому правилу и уже прошедшие льготный период.', notEligibleYet: 'Пока недоступно. До окончания льготного периода осталось дней: {count}.', lastWatched: 'Последний просмотр: {count} дн. назад.', addedDaysAgo: 'Добавлено {count} дн. назад.', futureDatesTooltip: 'Количество будущих дат с отложенной доступностью во время действия льготного периода.', waitingTooltip: 'Названия, соответствующие этому правилу, но ожидающие окончания льготного периода.', datesTooltip: 'Даты, когда совпавшие названия станут доступными после окончания льготного периода.', nowDetail: 'Эти названия соответствуют правилу и уже доступны.', lastWatch: 'Последний просмотр:', added: 'Добавлено:' },
    storage: { ...ru.maintenance.storage, description: 'Подробный прогноз хранилища для каждой библиотеки на основе индексированного размера и текущих совпадений правил.', refreshing: 'Обновление...', librarySizeBefore: 'Размер библиотеки до', projectedSizeAfter: 'Расчётный размер после', reclaimPercent: 'Процент освобождения', rulesIncluded: 'Включено правил' },
    library: { ...ru.maintenance.library, exportDownloaded: 'Экспорт правил скачан.', importSaved: 'Импортированные правила сохранены.', invalidJson: 'Недопустимый импорт JSON.', arrayRequired: 'JSON должен быть массивом правил.' },
    exclusions: { ...ru.maintenance.exclusions, description: 'Нажимайте на постеры, чтобы выбрать их для массовых действий. На выбранных элементах отображается отметка. Для разовых изменений используйте ссылку «Исключить» под названием.', excludedSelected: 'Исключено выбранных названий: {count}.', removedSelected: 'Снято исключений с выбранных элементов: {count}.', showing: 'Показано {shown} из {total} названий · страница {page}', selectToExclude: 'Сначала выберите постеры для исключения.', selectToUnexclude: 'Сначала выберите постеры, для которых нужно снять исключение.', removed: 'Исключение для {title} снято.', excludedTitle: 'Исключено: {title}.', currentResolved: 'Текущие исключения (обработанные)', ratingKeyTitles: 'Исключённые названия по RatingKey', titleTerms: 'Исключённые части названий', libraries: 'Исключённые библиотеки', noRatingKeys: 'Исключения по RatingKey не заданы.', noTitleTerms: 'Исключения названий не заданы.', noLibraries: 'Исключения библиотек не заданы.', advancedTitle: 'Исключения названий (расширенные, по одному в строке)', advancedLibrary: 'Исключения библиотек (расширенные, по одному в строке)', advancedRating: 'Исключения RatingKey (расширенные, по одному в строке)' },
    settings: { ...ru.maintenance.settings, title: 'Настройки очистки', defaultDryRun: 'Тестовый запуск по умолчанию', enableByDefault: 'Включать по умолчанию', maxActions: 'Максимум действий за запуск', requireConfirm: 'Требовать токен подтверждения', required: 'Требуется для разрушающих запусков' },
    errors: { loadOverview: 'Не удалось загрузить обзор очистки', loadCandidates: 'Не удалось загрузить кандидатов', loadExclusions: 'Не удалось загрузить сводку исключений.', loadLibrary: 'Не удалось загрузить постеры библиотеки.', loadStorage: 'Не удалось загрузить сводку хранилища.' }
} });

Object.assign(ru, { quickActions: { menuLabel: 'Быстрые действия' } });

Object.assign(ru, { homeDashboard: { ...ru.homeDashboard, opsSnapshot: {
    title: 'Оперативная сводка',
    loading: 'Загрузка оперативной сводки…',
    errors: { loadFailed: 'Не удалось загрузить оперативную сводку' },
    metrics: {
        unhealthy: 'Службы с проблемами: {count}', unhealthy_plural: 'Службы с проблемами: {count}', allHealthy: 'Все службы работают нормально',
        fleetUptime24h: 'Доступность всей системы (24 ч)', requestAppConnected: 'Приложение запросов подключено', requestAppOffline: 'Приложение запросов не в сети',
        unreadNotifications: 'Непрочитанные уведомления', stored: 'Сохраненные уведомления: {count}', stored_plural: 'Сохраненные уведомления: {count}',
        jobAlerts: 'Предупреждения задач', running: 'Активные задачи: {count}', running_plural: 'Активные задачи: {count}',
        lastCheck: 'Последняя проверка', seconds: '{count} с',
    },
    empty: { noIncidents: 'Нет инцидентов', unavailable: 'Оперативная сводка недоступна.' },
} } });

Object.assign(ru, { settings: { ...ru.settings, streamKillRules: {
    title: 'Правила остановки потоков',
    description: { beforeInterval: 'Настройте правила, которые автоматически останавливают потоки Plex. Правила проверяются каждые ', interval: '15 секунд', afterInterval: '. Объединяйте условия с помощью ', andAllMatch: ' (должны совпасть все) или ', orAnyMatch: ' (достаточно совпадения любого). ', afterLogic: 'Сообщение об остановке появится в клиенте Plex пользователя.' },
    fields: { isTranscoding: 'Выполняется транскодирование', videoResolution: 'Разрешение видео', transcodeVideoDecision: 'Решение о транскодировании', mediaType: 'Тип медиа', state: 'Состояние воспроизведения', sessionLocation: 'Расположение подключения', videoCodec: 'Видеокодек', audioCodec: 'Аудиокодек', bandwidth: 'Пропускная способность (Mbps)', user: 'Имя пользователя', playerProduct: 'Приложение проигрывателя', playerTitle: 'Имя проигрывателя/устройства' },
    operators: { equals: 'равно', not_equals: 'не равно', contains: 'содержит', not_contains: 'не содержит', greater_than: 'больше', less_than: 'меньше', is: 'является' },
    boolean: { yesTrue: 'Да / Истина', noFalse: 'Нет / Ложь' },
    options: { transcode: 'Транскодирование', copy: 'Копирование', directplay: 'Прямое воспроизведение', movie: 'Фильм', episode: 'Эпизод', track: 'Трек', playing: 'Воспроизводится', paused: 'Приостановлено', buffering: 'Буферизация', cellular: 'Мобильная сеть' },
    placeholders: { numberExample: 'например, 20', playerExample: 'например, Plex Web', ruleName: 'Название правила...' },
    empty: { title: 'Правила не настроены', description: 'Добавьте правило ниже, чтобы автоматически защищать сервер.' },
    rule: { conditionCount: '{count} условие', conditionCount_plural: 'Количество условий: {count}', logic: 'Логика:' },
    status: { active: 'Активно', disabled: 'Отключено' },
    logic: { and: 'И', or: 'ИЛИ' },
    match: { title: 'Сопоставить', followingConditions: 'со следующими условиями' },
    actions: { remove: 'Удалить', delete: 'Удалить', addCondition: 'Добавить условие', addRule: 'Добавить новое правило', saveRules: 'Сохранить правила' },
    editor: { killMessage: 'Сообщение об остановке', killMessageHint: '(отображается в клиенте Plex пользователя)', killMessagePlaceholder: 'Ваш поток остановлен администратором сервера.' },
    toasts: { loadFailed: 'Не удалось загрузить правила', saved: 'Правила потоков сохранены!', saveFailed: 'Не удалось сохранить правила' },
    defaults: { newRuleName: 'Новое правило', killMessage: 'Ваш поток остановлен администратором сервера.' },
} } });

Object.assign(ru, { homeDashboard: { ...ru.homeDashboard, nowPlayingCompanion: {
    ...ru.homeDashboard.nowPlayingCompanion,
    timeline: { release: 'Премьера', runtime: 'Длительность', episodeRuntime: 'Длительность эпизода', genres: 'Жанры', tmdbScore: 'Оценка TMDB', status: 'Статус', currentEpisode: 'Текущий эпизод', episodeAirDate: 'Дата выхода эпизода' },
    loading: { context: 'Загрузка данных помощника...', facts: 'Загрузка подробных фактов из источников...' },
    errors: { noTmdbContext: 'Контекст TMDB недоступен для этого активного сеанса.', detailsUnavailable: 'Сведения помощника пока недоступны.', loadFailed: 'Не удалось загрузить данные помощника.', providerLinkUnavailable: 'Ссылка на библиотеку недоступна', providerOpenFailed: 'Не удалось открыть ссылку поставщика.' },
    toasts: { watchlistRemoved: 'Удалено из быстрого списка.', watchlistSaved: 'Сохранено в быстром списке на этом устройстве.', openedDiscoverContext: 'Контекст открыт в сведениях Discover.', summaryCopied: 'Сводка комнаты просмотра скопирована.', clipboardUnavailable: 'Буфер обмена недоступен в этом клиенте.' },
    fallbacks: { nowPlaying: 'Воспроизводится' },
    sections: { nextBestAction: 'Лучшее следующее действие', castIntelligence: 'Сведения об актёрах', crewIntelligence: 'Сведения о съёмочной группе', soundtrackCues: 'Подсказки по саундтреку', ratingsAndLinks: 'Оценки и ссылки', factOverload: 'Избыток фактов', episodeContext: 'Контекст эпизода', similarPicks: 'Похожие варианты', liveTriviaTimeline: 'Хронология фактов', productionFacts: 'Сведения о производстве', actorGraph: 'Связи актёров', subtitleQuoteContext: 'Контекст цитат из субтитров', sharedReactions: 'Общие реакции', quickPoll: 'Быстрый опрос' },
    empty: { noKnownFor: 'Нет доступных ссылок на известные работы.', noCastData: 'Для этого названия не получены данные об актёрах.', noCrewHighlights: 'Нет доступных ключевых участников съёмочной группы для этого названия.', noSoundtrackCredits: 'Для этого элемента не найдены сведения о саундтреке.', factsUnavailable: 'Дополнительные факты для этого названия сейчас недоступны.', noTimelineFacts: 'Пока нет фактов для хронологии.', noProductionFacts: 'Для этого названия не получены сведения о производстве.', noLinkedCredits: 'Нет связанных сведений', noContextualLines: 'Нет доступных контекстных строк.', notAvailable: 'Н/Д', unknownYear: 'Неизвестный год' },
    cast: { popularity: 'Популярность {value}' }, episode: { previous: 'Предыдущий: {name}', current: 'Текущий: {name}', next: 'Следующий: {name}' },
    nextAction: { continueTitle: 'Продолжить со следующим эпизодом', continueHintWithName: 'Сразу перейти к S{season}E{episode} - {name}.', continueHint: 'Сразу перейти к S{season}E{episode}.', queueSimilarTitle: 'Запросить похожее название сейчас', queueSimilarHint: 'Запросить {title} ({year}) одним нажатием.', exploreActorTitle: 'Далее изучить главного актёра', exploreActorHint: 'Открыть фильмографию и связанные названия для {name}.', saveForLaterTitle: 'Сохранить этот сеанс на потом', saveForLaterHint: 'Оставить это название закреплённым в быстром списке просмотра на этом устройстве.', diveDetailsTitle: 'Перейти к полным сведениям', diveDetailsHint: 'Открыть сведения Discover для более полной метаинформации и управления запросами.' },
    factOverload: { live: 'В ЭФИРЕ', total: 'Всего {total}', spotlight: 'В центре внимания' },
    reactions: { like: 'Нравится', fire: 'Огонь', laugh: 'Смех', wow: 'Вау' },
    poll: { bestPacing: 'Лучший темп', strongActing: 'Сильная актёрская игра', visualHighlight: 'Визуальный акцент', greatSoundtrack: 'Отличный саундтрек', totalVotes: 'Всего голосов: {total}', summaryHint: 'Скопируйте краткую сводку комнаты просмотра, чтобы поделиться контекстом с друзьями.' },
    facts: { communityScore: 'Оценка сообщества TMDB — {score}/10 по {votes} голосам.', popularity: 'Текущий индекс популярности в трендах TMDB составляет {value}.', movieRuntime: 'Продолжительность составляет около {value} минут.', episodeRuntime: 'Обычная продолжительность эпизода — около {value} минут.', seriesSummary: 'В этом сериале сейчас {seasons} сезонов и {episodes} эпизодов.', multipleEpisodes: 'несколько', originCountry: 'Страна происхождения: {countries}.', producedBy: 'Произведено {studios}{count}.', budget: 'Заявленный бюджет составляет около ${value}.', revenue: 'Заявленные кассовые сборы составляют примерно ${value}.', returnOnBudget: 'Оценочная отдача составляет около {ratio}× производственного бюджета.', topBilled: 'В главных ролях: {names}.', currentEpisodeAired: 'Текущий эпизод впервые вышел в эфир {date}.' },
    header: { title: 'Помощник второго экрана', subtitle: 'Информация в реальном времени для {title}, только на главной странице.', subtitleWithYear: 'Информация в реальном времени для {title} ({year}), только на главной странице.' },
    tabs: { companion: 'Помощник', deepDive: 'Подробности', watchRoom: 'Комната просмотра' },
    actions: { enableCompanion: 'Включить помощник второго экрана', collapse: 'Свернуть', expand: 'Развернуть', savedToWatchlist: 'Сохранено в списке', saveToWatchlist: 'Сохранить в списке', openingProvider: 'Открытие в {provider}...', openInProvider: 'Открыть в {provider}', requestTitle: 'Запросить {title}', noSimilarTitles: 'Нет похожих названий для запроса', openNextEpisode: 'Открыть следующий эпизод', requestSimilar: 'Запросить похожее', openActorProfile: 'Открыть профиль актёра', openDetails: 'Открыть сведения', copySummary: 'Копировать сводку' },
    telemetry: { state: 'Состояние', progress: 'Прогресс', mediaType: 'Тип медиа', episode: 'Эпизод', playing: 'Воспроизводится' },
} } });

Object.assign(ru, { settings: { ...ru.settings, homeLayout: {
    sectionShown: 'Раздел отображается на главной странице', sectionHidden: 'Раздел скрыт на главной странице', shown: 'Показан', hidden: 'Скрыт', livePreview: 'Предпросмотр в реальном времени', leftColumn: 'Левая колонка', heroFixed: 'Главный баннер остаётся сверху и не настраивается.',
    title: 'Макет главной страницы', description: 'Перетаскивайте разделы, чтобы изменить порядок главной страницы для всех. Можно показывать или скрывать целые разделы. Основная сетка панели сохраняет фиксированный макет слева/справа, чтобы высота карточек оставалась сбалансированной.', resetDefault: 'Восстановить по умолчанию', pageSections: 'Разделы страницы', reorderHint: 'Перетащите маркер, чтобы изменить порядок. Используйте Показан/Скрыт для переключения каждого раздела; по умолчанию все разделы видимы.', saveHintBefore: 'Нажмите ', saveAction: 'Сохранить настройки', saveHintAfter: ' внизу страницы, чтобы применить изменения макета для всех.', tipLabel: 'Совет:', tipBody: 'Редактор портала также позволяет перемещать, скрывать и снова добавлять отдельные виджеты прямо с главной страницы. Эта страница остаётся редактором макета разделов для администраторов.', watchHistory: 'Настройка истории просмотров', recentlyWatchedRows: 'Строки недавно просмотренного', mostWatchedRows: 'Строки самого просматриваемого', rowsPerPage: 'Количество строк на странице.', row: 'строка', rows: 'строки',
    sections: { wrapUp: { label: 'Личная сводка', description: 'Карточки личной статистики' }, mainGrid: { label: 'Основная сетка панели', description: 'Администрирование/действия слева; статистика библиотеки справа' }, pendingRequests: { label: 'Ожидающие запросы', description: 'Одобряйте запросы на медиа с главной страницы (администратор)' }, watchRow: { label: 'История просмотров', description: 'Недавно просмотренное и самое просматриваемое' }, scanner: { description: 'Полноширинный статус обновления библиотеки' }, mediaAutomation: { description: 'Встроенная очередь обработки и состояние worker' }, recentlyAdded: { label: 'Недавно добавленное', description: 'Строки фильмов, сериалов и музыки' }, bazarrTools: { label: 'Инструменты субтитров Bazarr', description: 'Виджет автоматизации субтитров' } },
} } });

Object.assign(ru, { scanner: {
    dashboard: { eyebrow: 'Сканер библиотеки', title: 'Точное обновление', description: 'Добавьте папку в очередь для частичного обновления библиотеки Plex, Jellyfin или Emby. Webhook-и ARR автоматически поступают сюда как импорты, обновления, удаления и переименования.' },
    manual: { title: 'Ручной путь', hiddenHint: 'Скрыто — нажмите, чтобы вручную добавить папку в очередь.', visibleHint: 'Добавьте папку сейчас — она будет обработана после минимального времени ожидания.', placeholder: 'Путь для сканирования, например /mnt/unionfs/Media/Movies/Movie Name (year)', submitHint: 'Отправка добавляет путь в очередь сканирования', waitsBeforeTargets: ' · ожидает ', beforeTargetsAreCalled: ' перед вызовом целей' },
    actions: { refresh: 'Обновить', submit: 'Отправить', copy: 'Копировать' },
    stats: { queued: 'В очереди', queuedHint: 'Ожидание минимального времени', processed: 'Обработано', processedHint: 'Успешные обновления', targets: 'Цели', targetsHint: 'Plex / JF / Emby', minAge: 'Минимальное время', minAgeHint: 'Задержка перед сканированием' },
    webhooks: { title: 'Webhook-и ARR', instructions: 'В Sonarr / Radarr / Lidarr: Настройки → Connect → Webhook → On Import + On Upgrade (а также удаление/переименование, если они тоже нужны). Используйте Basic Auth из Настройки → Scanner.' },
    queue: { title: 'Очередь', subtitle: 'Пути, ожидающие минимального времени.', pending: 'Ожидают: {count}', empty: 'Очередь пуста — ожидание следующего webhook или ручного пути.' },
    filters: { allConfiguredApps: 'Все настроенные приложения', allEvents: 'Все события', imports: 'Импорты', upgrades: 'Обновления', deleted: 'Удалённые', renames: 'Переименования', manual: 'Вручную', refresh: 'Обновить', other: 'Другое' },
    activity: { title: 'Недавняя активность', subtitle: 'Последние {total} событий · {perPage} на страницу.', eventCount: 'Событий: {count}', noScansProcessed: 'Сканирования ещё не обработаны.', noEventsForSource: 'Нет событий {filter} для {source}.', noEvents: 'Нет событий {filter}.', noSourceActivity: 'Активность {source} не найдена.', ok: 'OK', error: 'Ошибка', targetSkipped: '{target}: пропущено', targetRefreshed: '{target}: обновлено', showing: 'Показано {from}–{to} из {total}', actions: { import: 'Импорт', upgrade: 'Обновление', fileDeleted: 'Файл удалён', seriesDeleted: 'Сериал удалён', movieDeleted: 'Фильм удалён', artistDeleted: 'Исполнитель удалён', rename: 'Переименовать', manual: 'Вручную', refresh: 'Обновить', other: 'Другое' } },
    pagination: { previous: 'Назад', next: 'Далее' },
    errors: { load: 'Не удалось загрузить Scanner', queuePath: 'Не удалось поставить путь в очередь' },
    toasts: { queued: 'Добавлено в очередь: {path}', copied: 'Скопировано в буфер обмена' },
} });

Object.assign(ru, { scanner: { ...ru.scanner, settings: {
    general: {
        description: 'Обновления библиотек в стиле Autoscan для Sonarr, Radarr и Lidarr. При включении в навигации появится страница Scanner только для администраторов с ручными путями и состоянием очереди.',
        title: 'Общие', enableTitle: 'Включить Scanner', enableHint: 'Включает webhook-и /triggers/* и страницу Scanner для администраторов.', currentStatus: 'Текущее состояние', on: 'ВКЛ.', off: 'ВЫКЛ.',
        homeWidgetTitle: 'Показывать виджет на главной', homeWidgetHint: 'Добавляет полноширинную панель Scanner над «Недавно добавлено» на главной странице (для администраторов). Порядок можно изменить через Главная → Изменить макет.',
        webhooksVisibleTitle: 'Показывать webhook-и ARR на странице Scanner', webhooksVisibleHint: 'При отключении блок URL webhook-ов ARR скрывается на странице Scanner. Триггеры продолжают работать; скрывается только раздел справки.',
        manualPathVisibleTitle: 'Показывать ручной путь на странице Scanner', manualPathVisibleHint: 'При отключении поле ручного пути скрывается на странице Scanner. При включении пользователи всё равно могут свернуть его; этот выбор запоминается.',
        minimumAge: 'Минимальный срок', minimumAgeHint: 'Примеры: 30s, 1m, 5m. Scanner ждёт это время перед вызовом целей.',
    },
    webhook: { title: 'Аутентификация webhook', description: 'Webhook-и Connect в Sonarr, Radarr и Lidarr должны использовать это имя пользователя и пароль (HTTP Basic Auth).' },
    credentials: { username: 'Имя пользователя', password: 'Пароль', hidePassword: 'Скрыть пароль', showPassword: 'Показать пароль' },
    triggers: {
        targetCheck: '{target}: {status}', targetFallback: 'цель', reachable: 'Доступна', failed: 'Сбой', noEnabledTargets: 'Нет включённых целей', passed: 'Успешно', parserPassedTargetFailed: 'Разбор выполнен успешно, но проверка цели завершилась с ошибкой',
        testPassedToast: 'Проверка триггера {name} выполнена успешно', testTargetFailedToast: 'Разбор для {name} выполнен успешно, но одна из проверок цели завершилась с ошибкой', testFailed: 'Проверка триггера не удалась', title: 'Триггер {name}', webhookPath: 'Путь webhook: {path} (или пользовательское имя ниже).',
        name: 'Имя триггера', urlBecomes: 'URL будет {path}', priority: 'Приоритет', testHint: 'Безопасная синтетическая проверка. Проверяет разбор, сохранённые преобразования и доступность целей без постановки сканирования в очередь.', testAction: 'Проверить триггер',
    },
} } });

Object.assign(ru, { scanner: { ...ru.scanner, settings: { ...ru.scanner.settings,
    pathRewrites: {
        title: 'Преобразования путей', add: 'Добавить преобразование', empty: 'Правил преобразования нет. Пути будут использоваться точно в том виде, в каком получены от триггера.', sourcePath: 'Исходный путь', destinationPath: 'Целевой путь', sourcePathFor: 'Путь {name}', scannerPath: 'Путь Scanner', targetPath: 'Путь {name}',
        mediaAutomationTitle: 'Преобразования Media Automation', mediaAutomationDescription: 'Применяется, когда Media Automation завершает Copy/Replace и ставит в очередь немедленное обновление Scanner. Как «источник → назначение» в Sonarr, сопоставьте путь Automation/контейнера с путём, ожидаемым Plex (или Scanner).', label: 'Метка', mediaAutomationLabelHint: 'Это не URL webhook. Он используется только для отображения источника в очереди Scanner.', automationPath: 'Путь Automation', scannerOrPlexPath: 'Путь Scanner / Plex', mediaAutomationExamplePrefix: 'Пример:', mediaAutomationExampleSuffix: 'Требуются Media Automation → «Queue Scanner refresh after library writes» и включённый Scanner.',
    },
    targets: {
        title: 'Цели {name}', plexDescription: 'Использует токен Plex и URL сервера из Настройки → Plex. Добавляйте преобразования только если пути монтирования различаются.', optionalDescription: 'Необязательная цель для обновления библиотеки {name}.', enable: 'Включить {name}', usePortalCredentials: 'Использовать учётные данные портала', usePortalCredentialsHint: 'При включении используются URL медиасервера и ключ API из Настроек. При отключении переопределите их ниже.', url: 'URL', apiKey: 'Ключ API', saveHint: 'После изменения этих параметров нажмите «Сохранить настройки» внизу страницы.',
    },
} } });

Object.assign(ru, { scanner: { ...ru.scanner, settings: { ...ru.scanner.settings,
    autoscan: {
        title: 'Импорт из Autoscan', description: 'Загрузите или вставьте config.yml Autoscan, чтобы заполнить минимальный срок, аутентификацию webhook, триггеры и преобразования. URL и токен Plex по-прежнему берутся из Настройки → Plex.', uploadConfig: 'Загрузить config.yml', previewPastedYaml: 'Предпросмотр вставленного YAML', applyImport: 'Применить импорт',
        placeholder: '# Paste Autoscan config.yml here\nminimum-age: 1m\nauthentication:\n  username: admin\n  ...', previewNotApplied: 'Предпросмотр (ещё не применён)', applied: 'Применено', importedToast: 'Конфигурация Autoscan импортирована — проверьте ниже, затем сохраните настройки', pasteOrUploadFirst: 'Сначала вставьте или загрузите config.yml Autoscan', yamlParsedToast: 'YAML разобран — проверьте предпросмотр, затем примените импорт', previewFailed: 'Не удалось создать предпросмотр', previewFirst: 'Сначала просмотрите YAML', readFileFailed: 'Не удалось прочитать этот файл', summaryMinimumAge: 'Минимальный срок {value}', summaryAuth: 'Аутентификация @{username}', summaryRewrites: '{name}: преобразований {count}',
    },
    live: {
        title: 'Активность в реальном времени', description: 'Очередь webhook и последние результаты сканирования. Обновляется каждые несколько секунд, пока эта страница открыта.', status: { paused: 'ПРИОСТАНОВЛЕНО', live: 'В РЕАЛЬНОМ ВРЕМЕНИ' }, disabledHint: 'Scanner выключен — включите и сохраните его, чтобы обрабатывать новые webhook-и', summary: 'Очередь {queue} · Обработано {processed}', updated: 'Обновлено {time}', copyTitle: 'Копировать журнал активности в буфер обмена', exportTitle: 'Экспортировать журнал активности как .txt', export: 'Экспортировать', resume: 'Возобновить', pause: 'Приостановить', loading: 'Загрузка активности…', empty: 'Активности Scanner пока нет. Запустите webhook Sonarr/Radarr/Lidarr или отправьте путь на странице Scanner.', targetSkipped: '{target}: пропущено ({reason})', targetFallback: 'цель', noLibrary: 'нет библиотеки', targetScanned: '{target}: сканирование выполнено',
        errors: { load: 'Не удалось загрузить журналы Scanner', copyFailed: 'Не удалось скопировать в буфер обмена' }, toasts: { copied: 'Активность скопирована в буфер обмена', exported: 'Активность экспортирована' },
    },
} } });

Object.assign(ru, { settings: { ...ru.settings, logs: {
    actions: { refresh: 'Обновить', refreshing: 'Обновление...', exportAll: 'Экспортировать всё', exporting: 'Экспорт…', unblock: 'Разблокировать' },
    audit: { viewerTitle: 'Просмотр журнала аудита', empty: 'События аудита не найдены.', target: 'Цель', system: 'Система', actor: 'Исполнитель', field: 'Поле', before: 'До', after: 'После', value: 'Значение', unknownEvent: 'Событие' },
    blocklist: { title: 'Список блокировки удалённых пользователей', empty: 'Сейчас нет заблокированных удалённых пользователей.', unknownUser: 'Неизвестный пользователь', noIdentifier: 'Нет идентификатора', deletedBy: 'Удалено {date} пользователем {actor}', defaultActor: 'администратор' },
    email: { title: 'Журнал электронной почты', empty: 'Системные письма ещё не зарегистрированы.', systemEmail: 'Системное письмо', to: 'Кому' },
    pagination: { previous: 'Назад', next: 'Далее', pageOf: 'Страница {page} из {total}' }, dialogs: { unblockUser: 'Разрешить {name} снова использовать портал? Приглашение не будет отправлено автоматически.' }, fallbacks: { thisUser: 'этот пользователь', notAvailable: 'Н/Д' },
    errors: { loadAuditLog: 'Не удалось загрузить журнал аудита', exportAuditLog: 'Не удалось экспортировать журнал аудита', loadDeletedUsers: 'Не удалось загрузить журнал удалённых пользователей', unblockUser: 'Не удалось разблокировать пользователя.' }, toasts: { auditExported: 'Журнал аудита экспортирован (портал + Poster Sets + Upgrader).', userUnblocked: 'Удалённый пользователь разблокирован.' },
} } });

Object.assign(ru, { maintenance: {
    ...ru.maintenance,
    labels: { ...ru.maintenance.labels, true: 'Да', false: 'Нет', minMax: 'мин,макс', values: 'v1,v2', value: 'значение', enabled: 'Включено', disabled: 'Отключено', matches: 'Совпадения', grace: 'Льготный период', graceDays: 'Дни льготного периода', maxActions: 'Максимум действий', collectionName: 'Название коллекции', matchLogic: 'Логика совпадений', filterName: 'Имя фильтра', matchedTitles: 'Совпавшие названия', noPoster: 'Нет постера', eligible: 'Подходит', unmapped: 'Не сопоставлено', ambiguous: 'Неоднозначно', ...ru.maintenance?.labels, mapped: 'сопоставлено', instanceMappingHint: 'Неоднозначное сопоставление экземпляра', index: 'Индекс', mediaItems: 'медиаэлементов', lastBuild: 'Последняя сборка', requestRecords: 'Записи запросов',...ru.maintenance?.labels, matchLogicHint: 'Как объединяются условия правила.', graceHint: 'Общий льготный период для этого набора правил.', resetGraceHint: 'Сбросить льготный период этого правила сейчас.' },
    errors: { ...ru.maintenance.errors, load: 'Не удалось загрузить модуль обслуживания', deleteFilter: 'Не удалось удалить фильтр', saveRules: 'Не удалось сохранить правила обслуживания', rebuildIndex: 'Не удалось перестроить индекс', preview: 'Не удалось создать предпросмотр', unsavedBeforeRun: 'Сохраните изменения фильтра перед запуском.', run: 'Не удалось выполнить правило', preflight: 'Предварительная проверка не пройдена.', resetGrace: 'Не удалось сбросить льготный период', toggleFilter: 'Не удалось обновить состояние фильтра' }
} });

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

Object.assign(ru, { about: {
    eyebrow: 'О проекте',
    description: 'Server Portal Manager — центр управления мультимедиа для самостоятельно размещенного медиасервера: единое место для доступа пользователей, запросов, активности в реальном времени, аналитики, панелей мониторинга и обслуживания с Plex, Emby и Jellyfin.',
    currentMode: 'Текущий режим', version: 'Версия', development: 'Разработка', centralPlace: 'Единый центр управления',
    features: {
        access: { title: 'Доступ и пользователи', description: 'Управляйте приглашениями, сроками действия, отзывом доступа, профилями и входом от имени администратора без переключения между серверными инструментами.' },
        stats: { title: 'Статистика и аналитика', description: 'Соберите рейтинги по серверу, личные итоги, историю просмотров, часы пик, библиотеки и тенденции воспроизведения на одной панели мониторинга.' },
        monitoring: { title: 'Мониторинг в реальном времени', description: 'Сразу просматривайте активные потоки, статус прямого воспроизведения или транскодирования, сведения о плеере, пропускную способность и текущую медиaактивность.' },
        requests: { title: 'Запросы и проверка', description: 'Проверяйте запросы Seerr, Jellyseerr и Ombi там же, где панели мониторинга, статистика пользователей и операции с медиа.' },
        mediaStack: { title: 'Медиастек', description: 'Отображайте в портале календари, очереди, историю и состояние подключенных сервисов Sonarr и Radarr.' },
        maintenance: { title: 'Обслуживание', description: 'Запускайте очистку библиотеки, мониторинг состояния, процессы Upgrader, журналы, аудиты и операционные проверки из единой консоли.' },
    },
    ecosystem: { title: 'Поддерживаемая экосистема', downloadClients: 'Клиенты загрузки' },
    contributors: {
        title: 'Участники',
        primary: { role: 'Сторона Plex', note: 'Первоначальный сопровождающий проекта и руководитель процесса Plex.' },
        integration: { role: 'Сторона Jellyfin / Emby', note: 'Участник, специализирующийся на Jellyfin, Emby и интеграции.' },
    },
    links: { title: 'Ссылки проекта', documentation: 'Документация', githubRepository: 'Репозиторий GitHub', featureOverview: 'Обзор возможностей', gettingStarted: 'Начало работы' },
} });

Object.assign(ru, { settings: { ...ru.settings, notifications: {
    common: { never: 'Никогда', unknownDate: 'Неизвестно', unknownUser: 'Неизвестный пользователь', unread: 'не прочитано', all: 'Все', loading: 'Загрузка...', ready: 'Готово', needsSetup: 'Нужна настройка', email: 'E-mail', inAppBell: 'Колокольчик в приложении', browserPush: 'Push браузера', webPush: 'Web Push', ntfy: 'ntfy', webhook: 'Webhook' },
    page: { title: 'Уведомления', description: 'Центр уведомлений о доступности запросов, push браузера, Discord, истории колокольчика в приложении и тестов самому себе. Административные уведомления SMTP и Gotify находятся на этой же странице.' },
    actions: { refreshStatus: 'Обновить состояние', openSmtpSettings: 'Открыть настройки SMTP', openGotifySettings: 'Открыть настройки Gotify' },
    history: { noFilterResults: 'Для этого фильтра уведомлений нет.', title: 'История уведомлений', description: 'Общее хранилище уведомлений в приложении для участников. Фильтруйте по типу, чтобы диагностировать проблемы сопоставления или отправки.', empty: 'Уведомления в приложении пока не сохранены.' },
    events: { available: 'Доступно', approved: 'Одобрено', declined: 'Отклонено', season: 'Сезон', episode: 'Новый эпизод', admin_pending: 'Ожидает администратора', collexions_failed: 'Сбой ColleXions', scanner_failed: 'Сбой Scanner', scanner_deleted: 'Scanner deleted', scanner_upgrade: 'Scanner upgrade', scanner_import: 'Scanner import', status_down: 'Статус недоступен', status_up: 'Статус восстановлен', media_job_failed: 'Задание Media Automation завершилось ошибкой', media_job_completed: 'Задание Media Automation завершено' },
    health: { title: 'Состояние', loadFailed: 'Не удалось загрузить состояние уведомлений', requestAvailableLabel: 'Запрос доступен', requestAvailableDetail: 'Движок: {engine}. Хранилище в приложении: всего {total} / не прочитано {unread}.', emailSmtpLabel: 'E-mail (SMTP)', smtpConfigured: 'SMTP, похоже, настроен.', smtpConfigure: 'Настройте SMTP выше.', webPushDetail: 'Устройства: {devices}; пользователи: {users}.', discordWebhookSaved: 'Webhook сохранен.', discordAddWebhook: 'Добавьте URL webhook Discord ниже.', gotifyReady: 'Административные уведомления Gotify готовы.', gotifyConfigure: 'Необязательно - настройте Gotify ниже.', ntfyReady: 'Тема ntfy готова.', ntfyConfigure: 'Необязательно - настройте ntfy ниже.', webhookReady: 'Общий webhook готов.', webhookConfigure: 'Необязательно - настройте webhook ниже.', seerrNotifyJob: 'Задание уведомлений Seerr', portalStatusSync: 'Синхронизация статуса портала', jobDetail: 'Последний запуск: {lastRun}.', jobDetailWithError: 'Последний запуск: {lastRun}. Ошибка: {error}', seerrSnapshot: 'Снимок Seerr отслеживает запросы: {count}', seerrSnapshotUpdated: 'обновлено {date}' },
    requestAvailable: { title: 'Запрос доступен', description: 'Когда запрос заканчивает загрузку и становится доступен, отправьте уведомление пользователю, который его создал. Эти же настройки отображаются в Request Discovery.', enableTitle: 'Включить уведомления', enableDescription: 'Главный переключатель уведомлений о доступности (портал или движок Seerr).', emailDescription: 'SMTP e-mail пользователю, создавшему запрос. Требуется SMTP.', inAppDescription: 'Непрочитанный элемент в колокольчике уведомлений портала.', browserPushDescription: 'Web Push для подписанных браузеров/устройств.', discordWebhookTitle: 'Webhook Discord', discordWebhookDescription: 'Публиковать в Discord, когда любой запрос становится доступен.', discordWebhookUrl: 'URL webhook Discord', discordWebhookSavedHint: 'Оставьте точки при изменении других настроек, чтобы сохранить записанный webhook.', webPushGlobalTitle: 'Включить Web Push (глобально)', webPushGlobalDescription: 'Позволяет участникам подписывать свой браузер. Требуется для канала push браузера выше.' },
    notReleased: { title: 'Еще не выпущено', description: 'Когда кто-то запрашивает фильм или сериал, который еще не вышел, сообщайте ожидаемую дату (по умолчанию цифровой релиз). Такие названия также появляются в календаре Media Stack, если дата попадает в просматриваемый месяц.', enableTitle: 'Включить уведомления о невыпущенных названиях', enableDescription: 'Уведомлять пользователя при создании запроса, если предпочитаемая дата релиза еще в будущем.', preferredReleaseDate: 'Предпочитаемая дата релиза', options: { digital: 'Цифровой релиз (предпочтительно)', theatrical: 'Кинотеатр', physical: 'Физический носитель', tmdb: 'Основная дата релиза TMDB' } },
    scannerActivity: { title: 'Scanner', description: 'Optional admin alerts when Sonarr, Radarr, or Lidarr send Scanner a delete, upgrade, or import. Off by default so they do not get noisy.', deletedTitle: 'Deleted', deletedDescription: 'Notify when a file or title is deleted.', upgradeTitle: 'Upgrade', upgradeDescription: 'Notify when a quality upgrade is imported.', importTitle: 'Import', importDescription: 'Notify when a new title is imported. This can fire often.' },
    ntfy: { description: 'Отправлять push в тему ntfy для жизненного цикла запросов и ожидающих действий администратора (self-hosted или ntfy.sh).', enableTitle: 'Включить ntfy', enableDescription: 'Отправлять выбранные события в вашу тему ntfy.', serverUrl: 'URL сервера', topic: 'Тема', accessTokenOptional: 'Токен доступа (необязательно)', priority: 'Приоритет (1-5)' },
    webhook: { title: 'Общий webhook', description: 'Отправляет JSON методом POST на любой HTTPS endpoint. Необязательный шаблон тела находится в Шаблонах уведомлений (должен быть корректным JSON).', enableTitle: 'Включить webhook', enableDescription: 'Отправлять выбранные события как POST-запросы JSON.', url: 'URL webhook', extraHeadersJson: 'Дополнительные заголовки (объект JSON, необязательно)', defaultsHint: 'По умолчанию: событие «Доступно» включено, остальные события выключены. Используйте шаблоны -> JSON-тело webhook, чтобы настроить payload.' },
    test: { title: 'Отправить тест себе', description: 'Отправляет тест только на вашу учетную запись администратора. Используйте это, чтобы проверить путь колокольчика в приложении перед поиском проблем сопоставления Seerr.', pickChannelError: 'Выберите хотя бы один тестовый канал.', results: { inApp: 'in-app', webPush: 'web push', email: 'e-mail', discord: 'discord', ok: 'ok' }, successToast: 'Тест отправлен ({channels}). Проверьте колокольчик.', noChannelSucceeded: 'Ни один канал не сработал', failed: 'Тест не выполнен', sending: 'Отправка...', send: 'Отправить тест' },
    saveReminder: { title: 'Не забудьте сохранить настройки', hint: 'Сохраните через кнопку внизу страницы, чтобы применить переключатели каналов и webhook Discord.' },
    templates: { title: 'Шаблоны уведомлений', hint: 'Настройте текст для каждого события. Оставьте поле со значением по умолчанию (или очистите его), чтобы использовать встроенный текст.', variablesLabel: 'Переменные:', resetEvent: 'Сбросить событие к значениям по умолчанию', customBadge: 'изменено', events: { available: 'Запрос доступен', approved: 'Запрос одобрен', declined: 'Запрос отклонен', season: 'Сезон доступен', episode: 'Новый эпизод', admin_pending: 'Админ - новый ожидающий запрос', not_released: 'Еще не выпущено', collexions_failed: 'Админ - сбой ColleXions', scanner_failed: 'Админ - сбой Scanner', scanner_deleted: 'Scanner deleted', scanner_upgrade: 'Scanner upgrade', scanner_import: 'Scanner import', status_down: 'Админ - проверка статуса недоступна', status_up: 'Админ - проверка статуса восстановлена', media_job_failed: 'Админ - задание Media Automation завершилось ошибкой', media_job_completed: 'Админ - задание Media Automation завершено' }, fields: { emailSubject: 'Тема e-mail', emailHeadline: 'Заголовок e-mail', emailBody: 'Текст e-mail', pushTitle: 'Заголовок push / in-app', pushBody: 'Текст push / in-app', discordContent: 'Сообщение Discord', discordEmbedTitle: 'Заголовок embed Discord', discordEmbedDescription: 'Описание embed Discord', gotifyTitle: 'Заголовок Gotify', gotifyBody: 'Текст Gotify', ntfyTitle: 'Заголовок ntfy', ntfyBody: 'Текст ntfy', webhookBody: 'JSON-тело Webhook (необязательный шаблон)' } },
} } });
Object.assign(ru, { settings: { ...ru.settings, arrIntegrations: {
    actions: { addInstance: 'Добавить инстанс', defaultInstance: 'Инстанс по умолчанию', setAsDefault: 'Сделать по умолчанию', removeInstance: 'Удалить инстанс', testConnection: 'Проверить соединение' },
    status: { default: 'По умолчанию' },
    empty: { noInstances: 'Инстансы {appName} не настроены.' },
    labels: { instance: 'Инстанс {index}', displayName: 'Отображаемое имя', ultraHdInstance: 'Инстанс 4K / UHD', url: 'URL', externalUrl: 'Внешний URL', apiKey: 'API-ключ', plexLibraries: 'Библиотеки Plex' },
    hints: { ultraHdRouting: 'Окно запроса направляет запросы Ultra HD в этот инстанс (HD + UHD можно выбрать вместе).', externalUrlOptional: 'Необязательно, для ссылок UI', libraryMapping: 'Сопоставьте библиотеки с этим инстансом для маршрутизации обслуживания. Несопоставленные библиотеки используют инстанс по умолчанию.' },
    placeholders: { apiKey: 'API-ключ' },
    library: { assignedToAnotherInstance: 'Назначено другому инстансу' },
    test: { connectionSuccessful: 'Соединение успешно', connectionFailed: 'Сбой соединения' },
    titles: { sonarrInstances: 'Инстансы Sonarr', radarrInstances: 'Инстансы Radarr', lidarrInstances: 'Инстансы Lidarr', bazarrInstances: 'Инстансы Bazarr' },
    subtitles: { sonarr: 'Автоматизация сериалов', radarr: 'Автоматизация фильмов', lidarr: 'Автоматизация музыки', bazarr: 'Автоматизация субтитров' },
} } });


Object.assign(ru, {
    support: {
        ...ru.support,
        actions: { ...ru.support?.actions, ...{
            edit: "Изменить",
            react: "Отреагировать",
            save: "Сохранить"
        } },
        errors: { ...ru.support?.errors, ...{
            editFailed: "Не удалось сохранить изменение",
            reactFailed: "Не удалось сохранить реакцию"
        } },
        labels: { ...ru.support?.labels, ...{
            edited: "изменено",
            mediaIssue: "Проблема с медиа",
            noMatch: "Совпадений нет",
            searchPlaceholder: "Поиск обращений...",
            ticketId: "Обращение #{id}",
            viewMedia: "Открыть медиа",
            you: "Вы"
        } },
        reply: { ...ru.support?.reply, ...{
            closedHint: "Это обращение закрыто. Откройте его снова, чтобы ответить."
        } },
        toasts: { ...ru.support?.toasts, ...{
            edited: "Ответ сохранён"
        } },
    },
    settings: {
        ...ru.settings,
        navigation: {
            category: "Категория",
            groups: {
                automation: "Автоматизация",
                comms: "Связь",
                mediaStack: "Media Stack",
                portal: "Портал"
            },
            noSections: "В этой категории нет разделов.",
            order: {
                adminOnlyLabel: "{label} (только админ)",
                admins: "Администраторы",
                adminsSubtitle: "Навигация для администраторов.",
                allFit: "Все пункты помещаются на мобильной панели.",
                alwaysVisible: "Всегда видно",
                audienceHint: "Для администраторов и участников можно задать разный порядок.",
                cannotHide: "{label} нельзя скрыть",
                description: "Выберите разделы для боковой панели и мобильной навигации.",
                downloadsForcedOff: "Downloads отключён для участников переключателем выше.",
                downloadsHint: "Если отключено, Downloads остаётся доступен только в режиме администратора.",
                dragToReorder: "Перетащите {label}, чтобы изменить порядок",
                featureOff: "{section} отключён",
                hidden: "Скрыто",
                hideFromNavigation: "Скрыть из навигации",
                hideItem: "Скрыть {label}",
                itemsInMore: "Оставшиеся пункты появятся в меню Ещё.",
                members: "Участники",
                membersCanSeeDownloads: "Участники видят Downloads.",
                membersDownloadsHidden: "Downloads скрыт от участников.",
                membersSubtitle: "Навигация для участников.",
                mobileBar: "Мобильная панель",
                mobileMoreMenu: "Мобильное меню Ещё",
                mobileSlots: "Мобильная панель показывает до {count} основных пунктов.",
                more: "Ещё",
                moveDown: "Переместить {label} вниз",
                moveUp: "Переместить {label} вверх",
                notInMobileBar: "Не на мобильной панели",
                showDownloads: "Показывать Downloads участникам",
                showInNavigation: "Показать в навигации",
                showItem: "Показать {label}",
                title: "Порядок навигации"
            },
            tabs: {
                achievements: "Достижения",
                analytics: "Аналитика",
                branding: "Бренд",
                broadcast: "Объявления",
                cleanup: "Cleaner",
                collexions: "ColleXions",
                contact: "Контакты",
                editions: "Editions",
                invites: "Приглашения",
                layout: "Макет",
                logs: "Журналы и аудит",
                mediaAutomation: "Media Automation",
                mediastack: "Media Stack",
                newsletter: "Рассылка",
                notifications: "Уведомления",
                overlays: "Overlays",
                plex: "Plex",
                posterSets: "Poster Sets",
                request: "Request Discovery",
                scanner: "Scanner",
                status: "Статус",
                streamRules: "Правила потоков",
                system: "Система",
                tasks: "Задачи",
                upgrader: "Upgrader"
            }
        },
        statusMonitor: {
            addGroup: "Добавить группу",
            addService: "Добавить сервис",
            criticalLabel: "Критичный",
            groupLabel: "Группа",
            groupNamePlaceholder: "Название группы",
            hidden: "Скрытый",
            hiddenTooltip: "Скрыто от пользователей",
            loadConfigFailed: "Не удалось загрузить конфигурацию монитора состояния",
            monitoredServices: "Отслеживаемые сервисы",
            no: "Нет",
            noGroups: "Групп пока нет.",
            noServices: "Сервисов пока нет.",
            none: "Нет",
            notifyDownAfterHint: "Задержка перед отправкой уведомления о сбое сервиса.",
            notifyDownAfterMinutes: "Уведомлять после минут недоступности",
            removeGroupConfirm: "Удалить группу \"{groupName}\"?",
            removeServiceConfirm: "Удалить сервис \"{id}\"?",
            resetConfirm: "Сбросить данные доступности для всех сервисов статуса?",
            resetDescription: "Удаляет сохранённые данные доступности и инцидентов.",
            resetFailed: "Не удалось сбросить",
            resetStatistics: "Сбросить статистику",
            resetSuccess: "Данные доступности сброшены.",
            resetUptimeData: "Сбросить данные доступности",
            serviceGroups: "Группы сервисов",
            serviceName: "Название сервиса",
            serviceUrl: "URL сервиса",
            serviceUrlPlaceholder: "https://example.com/health",
            thisGroup: "эта группа",
            title: "Монитор состояния",
            usersLabel: "Пользователи",
            usersVisibleHidden: "видимые пользователям",
            visibilityHintAfter: "отображаются на публичной странице статуса.",
            visibilityHintBefore: "Сервисы, отмеченные как",
            visible: "Видимый",
            visibleTooltip: "Видно пользователям",
            yes: "Да"
        },
        invites: {
            actions: "Действия",
            allLibraries: "Все библиотеки",
            claimedBy: "Использовано {date} пользователем {email}",
            copyLink: "Копировать ссылку",
            copySuccess: "Ссылка приглашения скопирована",
            createFailed: "Не удалось создать ссылку приглашения",
            createNewInviteLink: "Создать новую ссылку приглашения",
            createSuccess: "Ссылка приглашения создана",
            created: "Создано",
            deleteConfirm: "Отозвать эту ссылку приглашения?",
            deleteFailed: "Не удалось отозвать приглашение",
            deleteSuccess: "Приглашение отозвано",
            directEmailInvite: "Прямое приглашение по e-mail",
            directEmailInviteDescription: "Отправьте ссылку приглашения напрямую на e-mail адрес.",
            duration: "Срок",
            durationDays: "Срок (дни)",
            durationDaysValue: "{count} дн.",
            emailAddress: "E-mail адрес",
            emailFailed: "Не удалось отправить приглашение",
            emailRequired: "Требуется e-mail адрес",
            emailSent: "Приглашение отправлено",
            empty: "Ссылок приглашений пока нет.",
            enableReferrals: "Включить рефералы",
            enableReferralsHint: "Участники могут делиться кодами приглашений и получать бонусное время.",
            generateLink: "Создать ссылку",
            inviteLink: "Ссылка приглашения",
            inviteLinksDescription: "Создавайте ссылки, которыми смогут воспользоваться новые пользователи.",
            inviteLinksTitle: "Ссылки приглашений",
            libraries: "Библиотеки",
            librariesToShare: "Библиотеки для доступа",
            loadFailed: "Не удалось загрузить приглашения",
            loading: "Загрузка приглашений...",
            maxUses: "Максимум использований",
            publicBaseUrlBrowserOrigin: "Текущий origin браузера используется как публичный базовый URL.",
            publicBaseUrlConfigured: "Публичный базовый URL: {url}",
            referralDescription: "Вознаграждайте участников, которые приглашают новых пользователей.",
            referralTitle: "Рефералы",
            referredUserTemporaryAccessDays: "Временный доступ приглашённого пользователя (дни)",
            referrerRewardDays: "Дни награды пригласившему",
            revoke: "Отозвать",
            selectedCount: "Выбрано: {count}",
            sendEmailInvite: "Отправить приглашение по e-mail",
            sending: "Отправка...",
            sentTo: "Отправлено на {email}",
            unlimited: "Без ограничений",
            uses: "Использования"
        },
    },
});
Object.assign(ru, { profilePage: {
    eyebrow: 'Профиль участника',
    member: 'Участник',
    you: 'Вы',
    subtitle: 'Ваша учётная запись {provider} на этом сервере.',
    loading: 'Загрузка профиля…',
    loadFailed: 'Не удалось загрузить этот профиль.',
    level: 'Ур. {level}',
    climbed: 'Поднялся на {n}',
    dropped: 'Опустился на {n}',
    steady: 'Место без изменений',
    xpProgress: 'XP до следующего уровня',
    watchStory: 'История просмотров',
    watchStoryHint: 'Лучшие показатели за последние 365 дней на этом сервере.',
    trophyCase: 'Витрина трофеев',
    trophyHint: 'Сначала закреплённые значки, затем самые редкие.',
    pinned: 'Закреплено',
    openAchievements: 'Открыть достижения',
    arena: 'Арена',
    arenaHint: 'Соперники, микс редкости и фирменный стиль.',
    account: 'Аккаунт',
    accountHint: 'Видно только вам и администраторам.',
    joined: 'Присоединился',
    memberSince: 'Участник с',
    onThisServer: '{relative} на этом сервере',
    access: 'Доступ',
    unlimited: 'Без ограничений',
    noExpiry: 'Без срока',
    expiresOn: 'Истекает {date}',
    daysLeft: 'Остался {count} день',
    daysLeft_plural: 'Осталось {count} дн.',
    trial: 'Пробный',
    admin: 'Админ',
    lastLogin: 'Последний вход',
    today: 'Сегодня',
    yesterday: 'Вчера',
    daysAgo: '{count} день назад',
    daysAgo_plural: '{count} дн. назад',
    weeksAgo: '{count} нед. назад',
    weeksAgo_plural: '{count} нед. назад',
    monthsAgo: '{count} мес. назад',
    monthsAgo_plural: '{count} мес. назад',
    yearsAgo: '{count} год назад',
    yearsAgo_plural: '{count} лет назад',
    never: 'Никогда',
    email: 'Эл. почта',
    copyEmail: 'Копировать почту',
    copied: 'Скопировано',
    unknown: 'Неизвестно',
    requests: 'Запросы',
    requestsHint: '{total} всего · {pending} в ожидании',
    openRequests: 'Мои запросы',
    noRequests: 'Запросов пока нет.',
    copyLink: 'Копировать ссылку',
    linkCopied: 'Ссылка скопирована',
    shareWrapUp: 'Поделиться итогами',
} });

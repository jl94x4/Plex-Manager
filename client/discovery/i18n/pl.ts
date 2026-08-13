import type { EnCatalog } from './en';

/** Polish UI overlay. Falls back to English for missing keys. */
export const pl: DeepPartial<EnCatalog> = {
    calendar: {
        page: { tvDescription: 'Premiery seriali, pobieranie i aktywność w całym stosie multimediów.', movieDescription: 'Premiery filmów, pobieranie i aktywność w całym stosie multimediów.' },
        actions: { refresh: 'Odśwież', configureInSettings: 'Skonfiguruj w Ustawieniach →' },
        sections: { upcomingReleases: 'Nadchodzące premiery', downloads: 'Pobieranie: {name}', history: 'Historia: {name}', status: 'Status: {name}' },
        relative: { today: 'Dzisiaj', tomorrow: 'Jutro', atTime: ' o {time}', nextMonthNotice: 'Wyświetlany jest kolejny miesiąc z premierami {type} ({month}).', noNextReleases: 'W ciągu najbliższych 6 miesięcy nie znaleziono premier {type}.' },
        status: { unconfigured: 'Nie skonfigurowano', online: 'Online', ready: 'Gotowe', monitored: 'Monitorowane', freeStorage: 'Wolne miejsce', freeGb: '{value} GB wolne', usedPercent: 'Wykorzystano {value}%', totalGb: 'Łącznie {value} GB' },
        labels: { requestedNotAired: 'Zażądano — jeszcze nie wyemitowano', requestedNotReleased: 'Zażądano — jeszcze nie wydano', unableToFetch: 'Nie można pobrać danych z {name}. Sprawdź URL, klucz API i dostępność sieci lokalnej.', subtitleAutomation: 'Zarządzanie napisami i automatyzacja', musicAutomation: 'Automatyzacja biblioteki muzycznej', active: 'Aktywne: {count}' },
        empty: { notConfigured: '{name} nie jest jeszcze skonfigurowany.', configurationHint: 'Dodaj URL i klucz API w Ustawieniach → Integracje.', noUpcoming: 'Brak premier {type} w tym miesiącu', noPoster: 'Brak plakatu', noActiveDownloads: 'Brak aktywnych pobrań {type}', noRecentHistory: 'Brak niedawnej historii {type}', unknownTime: 'Nieznany czas' },
        fallback: { unknownSeries: 'Nieznany serial', unknownTvShow: 'Nieznany program TV', unknownMovie: 'Nieznany film', movieRelease: 'Premiera filmu' },
        events: { grabbed: 'Pobrano', imported: 'Zaimportowano', failed: 'Niepowodzenie', deleted: 'Usunięto' },
        errors: { loadFailed: 'Nie udało się wczytać danych stosu multimediów.' },
    },
};

import type { EnCatalog } from './en';

/** Dutch UI overlay. Falls back to English for missing keys. */
export const nl: DeepPartial<EnCatalog> = {
    calendar: {
        page: { tvDescription: 'TV-seriepremières, downloads en activiteit in je medias stack.', movieDescription: 'Filmpremières, downloads en activiteit in je medias stack.' },
        actions: { refresh: 'Vernieuwen', configureInSettings: 'Configureren in Instellingen →' },
        sections: { upcomingReleases: 'Aankomende releases', downloads: 'Downloads van {name}', history: 'Geschiedenis van {name}', status: 'Status van {name}' },
        relative: { today: 'Vandaag', tomorrow: 'Morgen', atTime: ' om {time}', nextMonthNotice: 'De volgende maand met {type}-releases wordt weergegeven ({month}).', noNextReleases: 'Geen {type}-releases gevonden in de komende 6 maanden.' },
        status: { unconfigured: 'Niet geconfigureerd', online: 'Online', ready: 'Gereed', monitored: 'Bewaakt', freeStorage: 'Vrije opslag', freeGb: '{value} GB vrij', usedPercent: '{value}% gebruikt', totalGb: '{value} GB totaal' },
        labels: { requestedNotAired: 'Aangevraagd — nog niet uitgezonden', requestedNotReleased: 'Aangevraagd — nog niet uitgebracht', unableToFetch: 'Kan geen gegevens ophalen van {name}. Controleer de URL, API-sleutel en lokale netwerkverbinding.', subtitleAutomation: 'Ondertitelbeheer en automatisering', musicAutomation: 'Automatisering van muziekbibliotheek', active: '{count} actief' },
        empty: { notConfigured: '{name} is nog niet geconfigureerd.', configurationHint: 'Voeg de URL en API-sleutel toe via Instellingen → Integraties.', noUpcoming: 'Geen {type}-releases voor deze maand', noPoster: 'Geen poster', noActiveDownloads: 'Geen actieve {type}-downloads', noRecentHistory: 'Geen recente {type}-geschiedenis', unknownTime: 'Onbekende tijd' },
        fallback: { unknownSeries: 'Onbekende serie', unknownTvShow: 'Onbekende tv-serie', unknownMovie: 'Onbekende film', movieRelease: 'Filmrelease' },
        events: { grabbed: 'Opgehaald', imported: 'Geïmporteerd', failed: 'Mislukt', deleted: 'Verwijderd' },
        errors: { loadFailed: 'Media-Stack-gegevens konden niet worden geladen.' },
    },
};

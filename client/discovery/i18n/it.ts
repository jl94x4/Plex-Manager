import type { EnCatalog } from './en';

/** Italian UI overlay. Falls back to English for missing keys. */
export const it: DeepPartial<EnCatalog> = {
    calendar: {
        page: { tvDescription: 'Uscite di serie TV, download e attività nel tuo media stack.', movieDescription: 'Uscite di film, download e attività nel tuo media stack.' },
        actions: { refresh: 'Aggiorna', configureInSettings: 'Configura nelle impostazioni →' },
        sections: { upcomingReleases: 'Prossime uscite', downloads: 'Download di {name}', history: 'Cronologia di {name}', status: 'Stato di {name}' },
        relative: { today: 'Oggi', tomorrow: 'Domani', atTime: ' alle {time}', nextMonthNotice: 'Visualizzazione del mese successivo con le uscite {type} ({month}).', noNextReleases: 'Nessuna uscita {type} trovata nei prossimi 6 mesi.' },
        status: { unconfigured: 'Non configurato', online: 'Online', ready: 'Pronto', monitored: 'Monitorato', freeStorage: 'Spazio libero', freeGb: '{value} GB liberi', usedPercent: '{value}% utilizzato', totalGb: '{value} GB totali' },
        labels: { requestedNotAired: 'Richiesto — non ancora trasmesso', requestedNotReleased: 'Richiesto — non ancora uscito', unableToFetch: 'Impossibile recuperare i dati da {name}. Controlla URL, chiave API e raggiungibilità della rete locale.', subtitleAutomation: 'Gestione e automazione dei sottotitoli', musicAutomation: 'Automazione della libreria musicale', active: '{count} attivi' },
        empty: { notConfigured: '{name} non è ancora configurato.', configurationHint: 'Aggiungi URL e chiave API in Impostazioni → Integrazioni.', noUpcoming: 'Nessuna uscita {type} per questo mese', noPoster: 'Nessun poster', noActiveDownloads: 'Nessun download {type} attivo', noRecentHistory: 'Nessuna cronologia {type} recente', unknownTime: 'Orario sconosciuto' },
        fallback: { unknownSeries: 'Serie sconosciuta', unknownTvShow: 'Serie TV sconosciuta', unknownMovie: 'Film sconosciuto', movieRelease: 'Uscita del film' },
        events: { grabbed: 'Acquisito', imported: 'Importato', failed: 'Non riuscito', deleted: 'Eliminato' },
        errors: { loadFailed: 'Impossibile caricare i dati del media stack.' },
    },
};

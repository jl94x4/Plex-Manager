import type { EnCatalog } from './en';

/** Italian UI overlay. Falls back to English for missing keys. */
export const it: DeepPartial<EnCatalog> = {
    downloads: { page: { eyebrow: 'Download', title: 'Stato dei download', description: 'Tutti i client di download configurati, raggruppati per Sonarr, Radarr e Lidarr.' }, actions: { refresh: 'Aggiorna', clearClientFilter: 'Cancella filtro client', pause: 'Metti in pausa', resume: 'Riprendi', remove: 'Rimuovi' }, filters: { client: 'Client', show: 'Mostra', activeOnly: 'Solo attivi', all: 'Tutti', allClients: 'Tutti i client', other: 'Altro', shown: '{count} visualizzati', hidingCompleted: 'completati/in condivisione nascosti' }, labels: { clients: 'Client', downloadClient: 'Client di download', downloadCount: '{count} download', downloadCount_plural: '{count} download', downSpeed: 'Download {value}/s', upSpeed: 'Upload {value}/s', matchedFromArrQueue: 'Corrisponde alla coda Arr' }, status: { activeDownloads: 'Download attivi', downloads: 'Download', unknown: 'Sconosciuto' }, empty: { noClients: 'Nessun client di download configurato nelle Impostazioni.', noFilterResults: 'Nessun download per questo filtro.' }, upload: { title: 'Aggiungi torrent', subtitle: 'Invia URL, magnet o file a un client configurato', client: 'Client', category: 'Categoria', torrentUrl: 'URL torrent o Magnet', torrentFile: 'File torrent', noCategory: 'Nessuna categoria', sending: 'Invio…', add: 'Aggiungi torrent' }, errors: { loadFailed: 'Impossibile caricare i download', actionFailed: 'Impossibile {action} il download', chooseClient: 'Scegli prima un client di download.', missingSource: 'Aggiungi un URL torrent, un link magnet o un file torrent.', addFailed: 'Impossibile aggiungere il torrent' }, confirm: { remove: 'Rimuovere “{name}” da {client}? I file scaricati resteranno al loro posto se il client lo supporta.' } },
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

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

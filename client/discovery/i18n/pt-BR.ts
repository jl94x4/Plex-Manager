import type { EnCatalog } from './en';

/** Brazilian Portuguese UI overlay. Falls back to English for missing keys. */
export const ptBR: DeepPartial<EnCatalog> = {
    calendar: {
        page: { tvDescription: 'Lançamentos de séries, downloads e atividade em seu ecossistema de mídia.', movieDescription: 'Lançamentos de filmes, downloads e atividade em seu ecossistema de mídia.' },
        actions: { refresh: 'Atualizar', configureInSettings: 'Configurar em Configurações →' },
        sections: { upcomingReleases: 'Próximos lançamentos', downloads: 'Downloads de {name}', history: 'Histórico de {name}', status: 'Status de {name}' },
        relative: { today: 'Hoje', tomorrow: 'Amanhã', atTime: ' às {time}', nextMonthNotice: 'Exibindo o próximo mês com lançamentos de {type} ({month}).', noNextReleases: 'Nenhum lançamento de {type} encontrado nos próximos 6 meses.' },
        status: { unconfigured: 'Não configurado', online: 'Online', ready: 'Pronto', monitored: 'Monitorado', freeStorage: 'Armazenamento livre', freeGb: '{value} GB livres', usedPercent: '{value}% usado', totalGb: '{value} GB no total' },
        labels: { requestedNotAired: 'Solicitado — ainda não exibido', requestedNotReleased: 'Solicitado — ainda não lançado', unableToFetch: 'Não foi possível obter dados de {name}. Verifique a URL, a chave de API e o acesso à rede local.', subtitleAutomation: 'Gerenciamento e automação de legendas', musicAutomation: 'Automação da biblioteca de música', active: '{count} ativos' },
        empty: { notConfigured: '{name} ainda não está configurado.', configurationHint: 'Adicione a URL e a chave de API em Configurações → Integrações.', noUpcoming: 'Nenhum lançamento de {type} neste mês', noPoster: 'Sem pôster', noActiveDownloads: 'Nenhum download ativo de {type}', noRecentHistory: 'Nenhum histórico recente de {type}', unknownTime: 'Horário desconhecido' },
        fallback: { unknownSeries: 'Série desconhecida', unknownTvShow: 'Série de TV desconhecida', unknownMovie: 'Filme desconhecido', movieRelease: 'Lançamento de filme' },
        events: { grabbed: 'Obtido', imported: 'Importado', failed: 'Falhou', deleted: 'Excluído' },
        errors: { loadFailed: 'Não foi possível carregar os dados do Media Stack.' },
    },
};

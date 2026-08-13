import type { EnCatalog } from './en';

/** Japanese UI overlay. Falls back to English for missing keys. */
export const ja: DeepPartial<EnCatalog> = { downloads: { page: { eyebrow: 'ダウンロード', title: 'ダウンロード状況', description: 'Sonarr、Radarr、Lidarrごとに設定されたダウンロードクライアントを表示します。' }, actions: { refresh: '更新', clearClientFilter: 'クライアントのフィルターを解除', pause: '一時停止', resume: '再開', remove: '削除' }, filters: { client: 'クライアント', show: '表示', activeOnly: 'アクティブのみ', all: 'すべて', allClients: 'すべてのクライアント', other: 'その他', shown: '{count}件を表示', hidingCompleted: '完了済み/シード中を非表示' }, labels: { clients: 'クライアント', downloadClient: 'ダウンロードクライアント', downloadCount: '{count}件のダウンロード', downloadCount_plural: '{count}件のダウンロード', downSpeed: '下り {value}/s', upSpeed: '上り {value}/s', matchedFromArrQueue: 'Arrキューに一致' }, status: { activeDownloads: 'アクティブなダウンロード', downloads: 'ダウンロード', unknown: '不明' }, empty: { noClients: '設定にダウンロードクライアントがありません。', noFilterResults: 'このフィルターに該当するダウンロードはありません。' }, upload: { title: 'Torrentを追加', subtitle: '設定済みクライアントにURL、マグネット、ファイルを送信', client: 'クライアント', category: 'カテゴリ', torrentUrl: 'Torrent URLまたはマグネット', torrentFile: 'Torrentファイル', noCategory: 'カテゴリなし', sending: '送信中…', add: 'Torrentを追加' }, errors: { loadFailed: 'ダウンロードを読み込めませんでした', actionFailed: 'ダウンロードを{action}できませんでした', chooseClient: '先にダウンロードクライアントを選択してください。', missingSource: 'Torrent URL、マグネットリンク、またはTorrentファイルを追加してください。', addFailed: 'Torrentを追加できませんでした' }, confirm: { remove: '「{name}」を{client}から削除しますか？クライアントが対応している場合、ダウンロード済みファイルは残ります。' } } };
Object.assign(ja, {
    calendar: {
        page: { tvDescription: 'メディアスタック全体のTVシリーズの配信、ダウンロード、アクティビティ。', movieDescription: 'メディアスタック全体の映画の配信、ダウンロード、アクティビティ。' },
        actions: { refresh: '更新', configureInSettings: '設定で構成 →' },
        sections: { upcomingReleases: '近日公開', downloads: '{name}のダウンロード', history: '{name}の履歴', status: '{name}のステータス' },
        relative: { today: '今日', tomorrow: '明日', atTime: ' {time}', nextMonthNotice: '{type}の公開がある次の月を表示しています（{month}）。', noNextReleases: '今後6か月間に{type}の公開はありません。' },
        status: { unconfigured: '未設定', online: 'オンライン', ready: '準備完了', monitored: '監視中', freeStorage: '空き容量', freeGb: '{value} GB 空き', usedPercent: '{value}% 使用済み', totalGb: '合計 {value} GB' },
        labels: { requestedNotAired: 'リクエスト済み — まだ放送されていません', requestedNotReleased: 'リクエスト済み — まだ公開されていません', unableToFetch: '{name}からデータを取得できません。URL、APIキー、ローカルネットワークを確認してください。', subtitleAutomation: '字幕の管理と自動化', musicAutomation: '音楽ライブラリの自動化', active: '{count}件がアクティブ' },
        empty: { notConfigured: '{name}はまだ設定されていません。', configurationHint: '設定 → インテグレーションでURLとAPIキーを追加してください。', noUpcoming: '今月公開予定の{type}はありません', noPoster: 'ポスターなし', noActiveDownloads: 'アクティブな{type}のダウンロードはありません', noRecentHistory: '最近の{type}の履歴はありません', unknownTime: '時刻不明' },
        fallback: { unknownSeries: '不明なシリーズ', unknownTvShow: '不明なTV番組', unknownMovie: '不明な映画', movieRelease: '映画公開' },
        events: { grabbed: '取得済み', imported: 'インポート済み', failed: '失敗', deleted: '削除済み' },
        errors: { loadFailed: 'メディアスタックのデータを読み込めませんでした。' },
    },
});

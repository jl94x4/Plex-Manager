import type { EnCatalog } from './en';

/** Japanese UI overlay. Falls back to English for missing keys. */
export const ja: DeepPartial<EnCatalog> = {
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
};

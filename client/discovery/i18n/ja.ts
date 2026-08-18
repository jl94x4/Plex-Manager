import type { EnCatalog } from './en';

/** Japanese UI overlay. Falls back to English for missing keys. */
export const ja: DeepPartial<EnCatalog> = {
    downloads: { page: { eyebrow: 'ダウンロード', title: 'ダウンロード状況', description: 'Sonarr、Radarr、Lidarrごとに設定されたダウンロードクライアントを表示します。' }, actions: { refresh: '更新', clearClientFilter: 'クライアントのフィルターを解除', pause: '一時停止', resume: '再開', remove: '削除' }, filters: { client: 'クライアント', show: '表示', activeOnly: 'アクティブのみ', all: 'すべて', allClients: 'すべてのクライアント', other: 'その他', shown: '{count}件を表示', hidingCompleted: '完了済み/シード中を非表示' }, labels: { clients: 'クライアント', downloadClient: 'ダウンロードクライアント', downloadCount: '{count}件のダウンロード', downloadCount_plural: '{count}件のダウンロード', downSpeed: '下り {value}/s', upSpeed: '上り {value}/s', matchedFromArrQueue: 'Arrキューに一致' }, status: { activeDownloads: 'アクティブなダウンロード', downloads: 'ダウンロード', unknown: '不明' }, empty: { noClients: '設定にダウンロードクライアントがありません。', noFilterResults: 'このフィルターに該当するダウンロードはありません。' }, upload: { title: 'Torrentを追加', subtitle: '設定済みクライアントにURL、マグネット、Torrentファイルを送信', client: 'クライアント', category: 'カテゴリ', torrentUrl: 'Torrent URLまたはマグネット', torrentFile: 'Torrentファイル', torrentFileHint: '.torrentファイルを選択またはドロップ', dropHint: 'Torrentファイルをここにドロップ', selectedCount: '{count}件のTorrentを選択中', selectedCount_plural: '{count}件のTorrentを選択中', clearFiles: 'ファイルをクリア', removeFile: '{name}を削除', noCategory: 'カテゴリなし', sending: '送信中…', add: 'Torrentを追加', addCount: '{count}件のTorrentを追加' }, errors: { loadFailed: 'ダウンロードを読み込めませんでした', actionFailed: 'ダウンロードを{action}できませんでした', chooseClient: '先にダウンロードクライアントを選択してください。', missingSource: 'Torrent URL、マグネットリンク、またはTorrentファイルを追加してください。', addFailed: 'Torrentを追加できませんでした', addPartial: '{total}件中{added}件を追加しました。失敗: {failed}', invalidTorrent: '.torrentファイルのみ追加できます。' }, confirm: { remove: '「{name}」を{client}から削除しますか？クライアントが対応している場合、ダウンロード済みファイルは残ります。' } },
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

Object.assign(ja, { statusPage: { page: { eyebrow: 'システムステータス', title: 'サーバーステータス', description: 'サービスの可用性とパフォーマンスを監視します。' }, actions: { back: '戻る', refresh: '更新' }, tabs: { overview: '概要', history: '履歴', analytics: '分析' }, summary: { online: '{total} 件中 {online} 件がオンライン', offline: '{count} 件がオフライン', fleetUptime: '{period} の稼働率: {value}%' }, labels: { section: 'ステータス', services: 'サービス', ungrouped: '未分類', periodUptime: '{period} の稼働率', groupSummary: '{count} サービス · {period} の稼働率', uptimeValue: '{period} の稼働率: {value}%', latencyValue: 'レイテンシ: {value}', average: '(平均 {value})', adminOnly: '管理者のみ', adminOnlyHint: '管理者にのみ表示' }, status: { online: 'オンライン', degraded: '低下', offline: 'オフライン', unknown: '不明', healthy: '正常', outage: '停止' }, empty: { noServicesTitle: 'ステータスサービスが設定されていません', noServicesSubtitle: 'ステータスサービスはまだ設定されていません。', blank: 'サービスを設定するとステータスが表示されます。', adminHint: '管理者はステータスモニター設定から設定できます。', memberHint: '管理者にステータスサービスの設定を依頼してください。', noHistory: '履歴データはありません。', noIncidents: 'この期間にインシデントはありません。', noData: 'データなし', latencyHistory: 'レイテンシ履歴データはありません。' }, relative: { hoursAgo: '{count} 時間前', daysAgo: '{count} 日前', periodAgo: '{period} 前', now: '現在' }, history: { subtitle: '過去 {period} の履歴とインシデント', hourUtc: '時刻 (UTC)', date: '日付', uptimePercent: '稼働率', checks: 'チェック', averageLatency: '平均レイテンシ', status: 'ステータス' }, incidents: { title: 'インシデント · {period}', started: '開始', ended: '終了', duration: '期間', severity: '重大度', ongoing: '進行中' }, analytics: { uptime: '稼働率', checks: 'チェック', averageLatency: '平均レイテンシ', p95Latency: 'P95 レイテンシ', incidents: 'インシデント', longestOutage: '最長停止', healthyStreak: '正常継続', worstDay: '最悪の日', uptimeTrend: '稼働率 · {name}', rollingUptime: '{period} の推移', latencyTitle: 'レイテンシ · {name}', averageResponseTime: '{period} の平均応答時間', best: '最良の日: {value} · {pct}%', worst: '最悪の日: {value} · {pct}%' }, errors: { loadFailed: 'ステータスデータを読み込めませんでした。' }, speedTest: { title: '接続テスト', description: 'ブラウザとポータル間のレイテンシと帯域幅を測定します。', run: 'テストを実行', runAgain: '再テスト', measuringLatency: 'レイテンシを測定中…', testingDownload: 'ダウンロードをテスト中…', testingUpload: 'アップロードをテスト中…', ready: '準備完了', complete: 'テスト完了', failed: 'テスト失敗', error: '接続テストに失敗しました', latency: 'レイテンシ', download: 'ダウンロード', upload: 'アップロード', roundTrip: '往復時間', downloadHint: '推定ダウンロード速度', uploadHint: '推定アップロード速度', highLatencyHint: '高いレイテンシはネットワークの混雑や距離が原因の可能性があります。', steadyStateHint: '結果は現在の接続を反映し、変動する場合があります。', progress: '実行中…' } } });

Object.assign(ja, { support: { page: { adminTitle: 'サポート受信箱', memberTitle: '管理者に連絡', adminDescription: 'ポータルを離れずにメンバーのチケットへ返信します。', memberDescription: 'Discord やメールを使わず、サーバー管理者に直接メッセージを送ります。' }, filters: { open: 'オープン', resolved: '解決済み', closed: '終了', all: 'すべて' }, actions: { newTicket: '新しいチケット', resolve: '解決', reopen: '再開', send: '送信' }, labels: { messages: '{count} 件のメッセージ', messages_plural: '{count} 件のメッセージ', admin: '管理者' }, empty: { noTickets: 'この表示にはチケットがありません。', selectTicket: 'チケットを選択して会話を読みます。' }, loading: { tickets: 'チケットを読み込み中…' }, errors: { loadFailed: 'チケットを読み込めませんでした', openFailed: 'チケットを開けませんでした', sendFailed: 'チケットを送信できませんでした', replyFailed: '返信に失敗しました', statusFailed: 'ステータスを更新できませんでした', deleteFailed: '削除に失敗しました' }, toasts: { sent: 'チケットを送信しました', deleted: 'チケットを削除しました' }, compose: { title: '新しいサポートチケット', category: 'カテゴリ', subject: '件名', subjectPlaceholder: '簡単な概要', message: 'メッセージ', messagePlaceholder: 'どのようなサポートが必要ですか？', sending: '送信中…' }, reply: { placeholder: '返信を入力…' }, status: { open: 'オープン', resolved: '解決済み', closed: '終了' }, categories: { media: 'メディアのリクエスト / 問題', account: 'アカウント / アクセス', server: 'サーバー / サービス', general: '一般的な質問', other: 'その他' } } });

Object.assign(ja, { maintenance: { rules: { title: 'ライブラリメンテナンスルール', description: '保存したフィルターを編集、プレビュー、実行できます。', savedFilters: '保存済みフィルター', noFilters: 'フィルターはありません。「フィルターを追加」をクリックしてください。', unsaved: '未保存の変更があります。プレビューまたは実行する前に保存してください。' }, actions: { rebuildIndex: 'インデックスを再構築', addFilter: 'フィルターを追加', edit: '編集', refresh: '更新', reset: 'リセット', delete: '削除', closeEditor: 'エディターを閉じる', deleteFilter: 'フィルターを削除', addCondition: '条件を追加', saveFilter: 'フィルターを保存', previewMatches: '一致をプレビュー', runDry: 'ドライランを実行', runDestructive: '削除を実行' }, labels: { true: '真', false: '偽', minMax: '最小,最大', values: 'v1,v2', value: '値', enabled: '有効', disabled: '無効', matches: '一致', grace: '猶予期間', graceDays: '猶予日数', maxActions: '最大アクション数', collectionName: 'コレクション名', matchLogic: '一致条件', filterName: 'フィルター名', matchedTitles: '一致したタイトル', noPoster: 'ポスターなし', eligible: '対象', unmapped: '未マッピング', ambiguous: '不明確' }, statuses: { saving: '保存中…', resetting: 'リセット中…', refreshingPreview: 'プレビュー更新中…', running: '実行中…', executing: '処理中…' }, options: { createCollection: 'Plexコレクションを作成 / 同期', deleteViaArr: 'Sonarr/Radarr経由で削除', deleteFiles: 'ディスク上のファイルを削除', pinCollection: '削除実行時にコレクションを作成し、全ユーザーのホームに固定' }, toasts: { filterDeleted: 'フィルターを削除しました', rulesSaved: 'メンテナンスルールを保存しました。', indexRebuilt: 'メンテナンスインデックスを再構築しました。', filterEnabled: 'フィルターを有効化しました', filterDisabled: 'フィルターを無効化しました' }, errors: { load: 'メンテナンスモジュールを読み込めませんでした', deleteFilter: 'フィルターを削除できませんでした', saveRules: 'メンテナンスルールを保存できませんでした', rebuildIndex: 'インデックスを再構築できませんでした', preview: 'プレビューを生成できませんでした', unsavedBeforeRun: '実行する前にフィルターの変更を保存してください。', run: 'ルールの実行に失敗しました', preflight: '事前チェックに失敗しました。', resetGrace: '猶予期間をリセットできませんでした', toggleFilter: 'フィルターの状態を更新できませんでした' }, confirmations: { deleteFilter: 'フィルターを削除', destructive: '破壊的なメンテナンスを実行しますか？保存済みフィルターに一致する項目をSonarr/Radarr経由で削除します。', destructiveWithCollection: '破壊的なメンテナンスを実行しますか？項目をSonarr/Radarr経由で削除し、全ユーザー用のPlexコレクションを作成して固定します。' }, summaries: { matched: '{count} 件一致', deleted: '{count} 件削除', skipped: '{count} 件スキップ', failed: '{count} 件失敗', dayLeft: '残り {count} 日', from: '作成から', fromCreation: '作成時から', conditions: '{count} 条件' } } });


Object.assign(ja, { maintenance: { ...ja.maintenance, rules: { ...ja.maintenance?.rules, selectFilter: '一致をプレビューする保存済みフィルターを選択してください。' }, labels: { ...ja.maintenance?.labels, mapped: 'マッピング済み', instanceMappingHint: 'インスタンスのマッピングが不明確です', index: 'インデックス', mediaItems: 'メディア項目', lastBuild: '最終構築', requestRecords: 'リクエスト記録' }, status: { dryRunCompleted: 'ドライランが完了しました', destructiveWithCollection: 'コレクションの固定を含む削除が完了しました', destructiveCompleted: '削除が完了しました', executionWithCollection: 'コレクションの固定を含むルール実行が完了しました', executionCompleted: 'ルールの実行が完了しました' }, summaries: { ...ja.maintenance?.summaries, allInGrace: 'すべて猶予期間中（残り{count}日）', upToPerRun: '1回あたり最大{count}件', previewAllInGrace: 'プレビュー: {matches}件一致、すべて猶予期間中（残り{days}日）。', previewSummary: 'プレビュー: {matches}件一致、対象{eligible}件、Sonarr/Radarrにマッピング済み{mapped}件{inGrace}。', inGraceSuffix: '、猶予期間中{count}件', warnings: '警告:', wouldProcess: '最大{count}件を処理します: Sonarr/Radarrにマッピング済み{mapped}件、未マッピング{unmapped}件。', stillInGrace: '猶予期間中: {count}件（残り{days}日）。', graceTimerReset: '猶予タイマーをリセットしました' } } });


Object.assign(ja, { maintenance: { ...ja.maintenance, sections: { overview: '概要', exclusions: '除外', rules: 'ルール', collections: 'コレクション', candidates: '候補', calendar: 'カレンダー', storage: 'ストレージ指標', library: 'ルールライブラリ', settings: 'クリーナー設定', logs: 'ログ' }, labels: { noData: 'データなし', unknownLibrary: '不明なライブラリ', unnamedRule: '名前なしルール', noPoster: 'ポスターなし', library: 'ライブラリ', before: '前', reclaim: '回収', after: '後', matched: '一致', previous: '前へ', next: '次へ', close: '閉じる' }, overview: { reclaimImpact: '回収と影響の概要', rulesWithMatches: '一致するルール', totalRuns: '実行総数', totalMatched: '一致総数', uniqueCandidates: '一意の候補タイトル', estimatedReclaim: '回収見込み', topLibraries: '回収量の多いライブラリ', topRules: '回収量の多いルール' }, candidates: { title: '候補', searchPlaceholder: 'タイトルを検索...', noResults: '一致する候補はありません。', loading: '候補を読み込み中...' }, storage: { title: 'ストレージ指標', refreshSummary: '概要を更新', projectedReclaim: '回収見込み', ruleScope: 'ルール範囲:', noSummary: 'ストレージ概要はありません。', loading: 'ストレージ概要を読み込み中...', matchedItems: '一致する候補項目' }, library: { title: 'ルールライブラリ', export: 'ルールJSONをエクスポート', import: 'ルールJSONをインポート', placeholder: 'ルールJSONをここに貼り付けます。' }, exclusions: { title: '除外', allLibraries: 'すべてのライブラリ', searchPlaceholder: 'タイトルを検索...', refresh: '更新', selectPage: 'ページを選択', excludeSelected: '選択項目を除外 ({count})', clearSelection: '選択を解除', removeSelected: '選択した除外を削除', loading: 'ポスターを読み込み中...', excluded: '除外済み', exclude: '除外', unexclude: '除外を解除', noTitles: 'タイトルがありません。', saved: '除外を保存しました。' }, settings: { save: 'クリーナー設定を保存', saved: 'メンテナンス設定を保存しました。' }, calendar: { currentRule: '現在のルール:', graceDays: '猶予日数', ruleAge: 'ルール経過日数', eligibleNow: '今すぐ対象', laterReclaim: '後で回収', daysUntilEligible: '対象までの日数', titleCount: 'タイトル', laterDetail: 'これらのタイトルは猶予期間の終了を待っています。', dateTitleCount: 'この日に対象になるタイトル数。', delayedReclaimTooltip: '遅延した一致項目の回収見込み。', eligibilityDetailTooltip: 'バックエンドが使用する対象詳細。', ago: '日前', notAvailable: '該当なし' } } });

Object.assign(ja, { maintenance: { ...ja.maintenance,
    ...ja.maintenance,
    page: { title: 'クリーナー', disabledTitle: 'クリーナー無効', disabledDescription: '実験的クリーナーモードは現在オフです。', disabledHint: '`設定` → `システム` の `実験的クリーナーモード` で有効にして、設定を保存してください。', controlCenter: 'クリーナーコントロールセンター', controlCenterDescription: 'ライブラリ保守を自動化するモジュール：ルール、コレクション、候補、実行履歴、カレンダー、ストレージ、管理。' },
    labels: { ...ja.maintenance.labels, modulePage: 'モジュールページ', modulePages: 'モジュールページ', indexedMedia: 'インデックス済みメディア', requestRecords: 'リクエスト記録', topImpactLibrary: '影響の大きいライブラリ', unknownTitle: '不明なタイトル', mapped: 'マッピング済み', eligible: '対象', unmapped: '未マッピング', ambiguous: '曖昧' },
    collections: { title: 'コレクション', description: 'ルールごとのコレクション動作を管理します。変更は各ルールセットに直接保存されます。', enabled: '有効', templateSaved: 'コレクションテンプレートを保存しました。', settingsUpdated: 'コレクション設定を更新しました。' },
    candidates: { ...ja.maintenance.candidates, noRules: '保存されたルールがありません。まず `ルール` で作成してください。', showing: '{name} の候補のみ表示しています。' },
    runs: { title: 'ログ', dryRun: 'ドライラン', destructive: '破壊的', summary: '一致 {matched} · 処理済み {processed} · 削除 {deleted} · スキップ {skipped} · 失敗 {failed}', noRuns: '記録された実行はありません。' },
    calendar: { ...ja.maintenance.calendar, title: 'カレンダー', description: 'ルールに基づく対象スケジュール。このルールの作成日から猶予日数を適用します。', eligibleLaterDays: '後で対象の日数', laterTitles: '後で対象のタイトル', eligibleLaterByDate: '日付別の後続対象', noDelayedDates: '遅延日はありません。現在の一致項目は今すぐ対象です。', reclaimNow: '{value} 今すぐ回収', eligibilityNowTooltip: 'このルールに一致し、猶予期間が終了したタイトル。', notEligibleYet: 'まだ対象外です。残り猶予日数は {count} 日です。', lastWatched: '{count} 日前に最後に視聴しました。', addedDaysAgo: '{count} 日前に追加されました。', futureDatesTooltip: 'ルールの猶予期間中に対象となる将来の日付の数。', waitingTooltip: '現在ルールに一致していますが、猶予期間の終了を待っているタイトル。', datesTooltip: 'ルールの猶予期間終了後に一致タイトルが対象となる日付。', nowDetail: 'これらのタイトルは現在このルールに一致し、今すぐ対象です。', lastWatch: '最後の視聴:', added: '追加:' },
    storage: { ...ja.maintenance.storage, description: 'インデックス済みサイズと現在のルール一致に基づくライブラリ別ストレージ予測。', refreshing: '更新中...', librarySizeBefore: '変更前のライブラリサイズ', projectedSizeAfter: '変更後の予測サイズ', reclaimPercent: '回収率', rulesIncluded: '含まれるルール' },
    library: { ...ja.maintenance.library, exportDownloaded: 'ルールのエクスポートをダウンロードしました。', importSaved: 'インポートしたルールを保存しました。', invalidJson: '無効なJSONインポートです。', arrayRequired: 'JSONはルールの配列である必要があります。' },
    exclusions: { ...ja.maintenance.exclusions, description: '一括操作するポスターをクリックして選択します。選択項目にはチェックが表示されます。個別変更には各タイトル下の除外リンクを使います。', excludedSelected: '{count} 件の選択タイトルを除外しました。', removedSelected: '{count} 件の選択した除外を削除しました。', showing: '{total} 件中 {shown} 件 · ページ {page}', selectToExclude: 'まず除外するポスターを選択してください。', selectToUnexclude: 'まず除外解除するポスターを選択してください。', removed: '{title} の除外を解除しました。', excludedTitle: '{title} を除外しました。', currentResolved: '現在の除外（解決済み）', ratingKeyTitles: 'RatingKey別の除外タイトル', titleTerms: '除外タイトル語', libraries: '除外ライブラリ', noRatingKeys: 'RatingKey除外はありません。', noTitleTerms: 'タイトル除外はありません。', noLibraries: 'ライブラリ除外はありません。', advancedTitle: 'タイトル除外（詳細、1行に1件）', advancedLibrary: 'ライブラリ除外（詳細、1行に1件）', advancedRating: 'RatingKey除外（詳細、1行に1件）' },
    settings: { ...ja.maintenance.settings, title: 'クリーナー設定', defaultDryRun: 'デフォルトのドライラン', enableByDefault: 'デフォルトで有効化', maxActions: '実行あたりの最大アクション数', requireConfirm: '確認トークンが必要', required: '破壊的実行に必要' },
    errors: { loadOverview: 'クリーナー概要を読み込めませんでした', loadCandidates: '候補を読み込めませんでした', loadExclusions: '除外の概要を読み込めませんでした。', loadLibrary: 'ライブラリのポスターを読み込めませんでした。', loadStorage: 'ストレージ概要を読み込めませんでした。' }
} });

Object.assign(ja, { quickActions: { menuLabel: 'クイックアクション' } });

Object.assign(ja, { homeDashboard: { ...ja.homeDashboard, opsSnapshot: {
    title: '運用スナップショット',
    loading: '運用スナップショットを読み込み中…',
    errors: { loadFailed: '運用スナップショットを読み込めませんでした' },
    metrics: {
        unhealthy: '異常なサービス: {count}', unhealthy_plural: '異常なサービス: {count}', allHealthy: 'すべてのサービスは正常です',
        fleetUptime24h: '全体の稼働率 (24時間)', requestAppConnected: 'リクエストアプリは接続済みです', requestAppOffline: 'リクエストアプリはオフラインです',
        unreadNotifications: '未読の通知', stored: '保存済み: {count}', stored_plural: '保存済み: {count}',
        jobAlerts: 'ジョブアラート', running: '実行中: {count}', running_plural: '実行中: {count}',
        lastCheck: '最終確認', seconds: '{count}秒',
    },
    empty: { noIncidents: 'インシデントはありません', unavailable: '運用スナップショットは利用できません。' },
} } });

Object.assign(ja, { settings: { ...ja.settings, streamKillRules: {
    title: 'ストリーム停止ルール',
    description: { beforeInterval: 'Plexストリームを自動停止するルールを定義します。ルールは', interval: '15秒', afterInterval: 'ごとに評価されます。条件は「', andAllMatch: '」（すべて一致）か、「', orAnyMatch: '」（いずれかが一致）で組み合わせます。', afterLogic: '停止メッセージはユーザーのPlexクライアント画面に表示されます。' },
    fields: { isTranscoding: 'トランスコード中', videoResolution: '映像解像度', transcodeVideoDecision: '映像トランスコードの判定', mediaType: 'メディア種別', state: '再生状態', sessionLocation: '接続場所', videoCodec: '映像コーデック', audioCodec: '音声コーデック', bandwidth: '帯域幅 (Mbps)', user: 'ユーザー名', playerProduct: 'プレーヤーアプリ', playerTitle: 'プレーヤー/デバイス名' },
    operators: { equals: '次と等しい', not_equals: '次と等しくない', contains: '次を含む', not_contains: '次を含まない', greater_than: '次より大きい', less_than: '次より小さい', is: '次である' },
    boolean: { yesTrue: 'はい / 真', noFalse: 'いいえ / 偽' },
    options: { transcode: 'トランスコード', copy: 'コピー', directplay: '直接再生', movie: '映画', episode: 'エピソード', track: 'トラック', playing: '再生中', paused: '一時停止中', buffering: 'バッファリング中', cellular: 'モバイル通信' },
    placeholders: { numberExample: '例: 20', playerExample: '例: Plex Web', ruleName: 'ルール名...' },
    empty: { title: '設定済みのルールはありません', description: '以下にルールを追加して、サーバーの自動保護を開始してください。' },
    rule: { conditionCount: '{count} 件の条件', conditionCount_plural: '{count} 件の条件', logic: 'ロジック:' },
    status: { active: '有効', disabled: '無効' },
    logic: { and: 'かつ', or: 'または' },
    match: { title: '一致', followingConditions: '以下の条件' },
    actions: { remove: '削除', delete: '削除', addCondition: '条件を追加', addRule: '新しいルールを追加', saveRules: 'ルールを保存' },
    editor: { killMessage: '停止メッセージ', killMessageHint: '(ユーザーのPlexクライアントに表示)', killMessagePlaceholder: 'ストリームはサーバー管理者によって停止されました。' },
    toasts: { loadFailed: 'ルールを読み込めませんでした', saved: 'ストリームルールを保存しました。', saveFailed: 'ルールを保存できませんでした' },
    defaults: { newRuleName: '新しいルール', killMessage: 'ストリームはサーバー管理者によって停止されました。' },
} } });

Object.assign(ja, { homeDashboard: { ...ja.homeDashboard, nowPlayingCompanion: {
    ...ja.homeDashboard.nowPlayingCompanion,
    timeline: { release: '公開日', runtime: '上映時間', episodeRuntime: 'エピソード時間', genres: 'ジャンル', tmdbScore: 'TMDBスコア', status: '状態', currentEpisode: '現在のエピソード', episodeAirDate: 'エピソードの放送日' },
    loading: { context: 'コンパニオン情報を読み込んでいます...', facts: '情報源から詳細なトリビアを読み込んでいます...' },
    errors: { noTmdbContext: 'このアクティブなセッションではTMDB情報を利用できません。', detailsUnavailable: 'コンパニオンの詳細はまだ利用できません。', loadFailed: 'コンパニオンのデータを読み込めませんでした。', providerLinkUnavailable: 'ライブラリへのリンクを利用できません', providerOpenFailed: 'プロバイダーのリンクを開けませんでした。' },
    toasts: { watchlistRemoved: 'クイックリストから削除しました。', watchlistSaved: 'この端末のクイックリストに保存しました。', openedDiscoverContext: 'Discoverの詳細でコンテキストを開きました。', summaryCopied: '視聴ルームの概要をコピーしました。', clipboardUnavailable: 'このクライアントではクリップボードを利用できません。' },
    fallbacks: { nowPlaying: '再生中' },
    sections: { nextBestAction: '次のおすすめ操作', castIntelligence: '出演者情報', crewIntelligence: 'スタッフ情報', soundtrackCues: 'サウンドトラック情報', ratingsAndLinks: '評価とリンク', factOverload: 'トリビア', episodeContext: 'エピソード情報', similarPicks: '類似作品', liveTriviaTimeline: 'トリビアの時系列', productionFacts: '制作情報', actorGraph: '俳優の関連作品', subtitleQuoteContext: '字幕の引用コンテキスト', sharedReactions: '共有リアクション', quickPoll: '簡単な投票' },
    empty: { noKnownFor: '代表作へのリンクはありません。', noCastData: 'この作品の出演者データはありません。', noCrewHighlights: 'この作品の注目スタッフはありません。', noSoundtrackCredits: 'この項目のサウンドトラックのクレジットはありません。', factsUnavailable: '現在、この作品の追加情報は利用できません。', noTimelineFacts: '時系列のトリビアはまだありません。', noProductionFacts: 'この作品の制作情報はありません。', noLinkedCredits: '関連クレジットはありません', noContextualLines: 'コンテキスト行はありません。', notAvailable: '該当なし', unknownYear: '年不明' },
    cast: { popularity: '人気度 {value}' }, episode: { previous: '前: {name}', current: '現在: {name}', next: '次: {name}' },
    nextAction: { continueTitle: '次のエピソードを続けて見る', continueHintWithName: 'S{season}E{episode} - {name}へ直接移動します。', continueHint: 'S{season}E{episode}へ直接移動します。', queueSimilarTitle: '今すぐ類似作品をリクエスト', queueSimilarHint: '{title}（{year}）をワンタップでリクエストします。', exploreActorTitle: '次に主演俳優を探す', exploreActorHint: '{name}の出演作品と関連作品を開きます。', saveForLaterTitle: 'このセッションを後で見るために保存', saveForLaterHint: 'この作品をこのデバイスのクイック視聴リストに固定したままにします。', diveDetailsTitle: '詳細を確認', diveDetailsHint: 'より詳しいメタデータとリクエスト操作のためにDiscoverの詳細を開きます。' },
    factOverload: { live: 'ライブ', total: '合計 {total}', spotlight: '注目' },
    reactions: { like: 'いいね', fire: '炎', laugh: '笑い', wow: 'すごい' },
    poll: { bestPacing: 'テンポが良い', strongActing: '演技が素晴らしい', visualHighlight: '映像が印象的', greatSoundtrack: 'サウンドトラックが素晴らしい', totalVotes: '投票総数: {total}', summaryHint: '友だちとコンテキストを共有するために、視聴ルームの簡単な概要をコピーします。' },
    facts: { communityScore: 'TMDBコミュニティスコアは{score}/10（{votes}票）です。', popularity: '現在の人気指数はTMDBトレンドで{value}です。', movieRuntime: '上映時間は約{value}分です。', episodeRuntime: '一般的なエピソードの長さは約{value}分です。', seriesSummary: 'このシリーズは現在{seasons}シーズン、{episodes}エピソードです。', multipleEpisodes: '複数', originCountry: '制作国: {countries}。', producedBy: '制作: {studios}{count}。', budget: '報告された予算は約${value}です。', revenue: '報告された興行収入は約${value}です。', returnOnBudget: '推定収益率は制作予算の約{ratio}倍です。', topBilled: '主要出演: {names}。', currentEpisodeAired: '現在のエピソードは{date}に初回放送されました。' },
    header: { title: 'セカンドスクリーン コンパニオン', subtitle: '{title}のライブ情報（ホーム画面のみ）', subtitleWithYear: '{title}（{year}）のライブ情報（ホーム画面のみ）' },
    tabs: { companion: 'コンパニオン', deepDive: '詳細', watchRoom: '視聴ルーム' },
    actions: { enableCompanion: 'セカンドスクリーン コンパニオンを有効化', collapse: '折りたたむ', expand: '展開', savedToWatchlist: 'リストに保存済み', saveToWatchlist: 'リストに保存', openingProvider: '{provider}を開いています...', openInProvider: '{provider}で開く', requestTitle: '{title}をリクエスト', noSimilarTitles: 'リクエストできる類似作品はありません', openNextEpisode: '次のエピソードを開く', requestSimilar: '類似作品をリクエスト', openActorProfile: '俳優プロフィールを開く', openDetails: '詳細を開く', copySummary: '概要をコピー' },
    telemetry: { state: '状態', progress: '進行状況', mediaType: 'メディア種別', episode: 'エピソード', playing: '再生中' },
} } });

Object.assign(ja, { settings: { ...ja.settings, homeLayout: {
    sectionShown: 'ホームページに表示中のセクション', sectionHidden: 'ホームページで非表示のセクション', shown: '表示', hidden: '非表示', livePreview: 'ライブプレビュー', leftColumn: '左列', heroFixed: 'ヒーローバナーは上部に固定され、設定できません。',
    title: 'ホームページのレイアウト', description: 'セクションをドラッグして、全員のホームページの順序を変更します。セクション全体を表示または非表示にできます。メインダッシュボードのグリッドは、カードの高さを整えるため左右の固定レイアウトを維持します。', resetDefault: 'デフォルトに戻す', pageSections: 'ページセクション', reorderHint: 'ハンドルをドラッグして並べ替えます。表示/非表示で各セクションを切り替えます。すべてのセクションは初期状態で表示されています。', saveHintBefore: 'このページの下部にある', saveAction: '「設定を保存」', saveHintAfter: 'をクリックすると、レイアウトの変更が全員に適用されます。', tipLabel: 'ヒント:', tipBody: 'ライブポータルエディターでは、ホームページから直接個別のウィジェットを移動、非表示、再追加することもできます。このページは管理者向けのセクションレイアウトエディターです。', watchHistory: '視聴履歴の設定', recentlyWatchedRows: '最近視聴した行数', mostWatchedRows: '最も視聴された行数', rowsPerPage: 'ページごとに表示する行数。', row: '行', rows: '行',
    sections: { wrapUp: { label: '個人のまとめ', description: '個人統計カード' }, mainGrid: { label: 'メインダッシュボードグリッド', description: '左に管理/操作、右にライブラリ統計' }, pendingRequests: { label: '保留中のリクエスト', description: 'ホームからメディアリクエストを承認（管理者）' }, watchRow: { label: '視聴履歴', description: '最近視聴した項目と最も視聴された項目' }, scanner: { description: '全幅のライブラリ更新ステータス' }, mediaAutomation: { description: 'ネイティブ処理キューとワーカーの状態' }, recentlyAdded: { label: '最近追加された項目', description: '映画、シリーズ、音楽の行' }, bazarrTools: { label: 'Bazarr 字幕ツール', description: '字幕自動化ウィジェット' } },
} } });

Object.assign(ja, { scanner: {
    dashboard: { eyebrow: 'ライブラリスキャナー', title: '正確に更新', description: 'Plex、Jellyfin、Emby のライブラリを部分更新するためにフォルダーをキューへ追加します。ARR の Webhook は、インポート、アップグレード、削除、名前変更として自動的にここへ届きます。' },
    manual: { title: '手動パス', hiddenHint: '非表示です — クリックしてフォルダーを手動でキューに追加します。', visibleHint: '今すぐフォルダーを追加できます — 最低経過時間後に処理されます。', placeholder: 'スキャンするパス（例: /mnt/unionfs/Media/Movies/Movie Name (year)）', submitHint: '送信するとパスがスキャンキューに追加されます', waitsBeforeTargets: ' · ', beforeTargetsAreCalled: '待機してからターゲットを呼び出します' },
    actions: { refresh: '更新', submit: '送信', copy: 'コピー' },
    stats: { queued: 'キュー済み', queuedHint: '最低経過時間を待機中', processed: '処理済み', processedHint: '更新成功数', targets: 'ターゲット', targetsHint: 'Plex / JF / Emby', minAge: '最低経過時間', minAgeHint: 'スキャン前の待機時間' },
    webhooks: { title: 'ARR Webhook', instructions: 'Sonarr / Radarr / Lidarr で: Settings → Connect → Webhook → On Import + On Upgrade（削除/名前変更も必要なら有効化）。Settings → Scanner の Basic Auth を使用します。' },
    queue: { title: 'キュー', subtitle: '最低経過時間を待っているパス。', pending: '{count} 件保留中', empty: 'キューは空です — 次の Webhook または手動パスを待っています。' },
    filters: { allConfiguredApps: '設定済みのすべてのアプリ', allEvents: 'すべてのイベント', imports: 'インポート', upgrades: 'アップグレード', deleted: '削除済み', renames: '名前変更', manual: '手動', refresh: '更新', other: 'その他' },
    activity: { title: '最近のアクティビティ', subtitle: '最新 {total} 件のイベント · 1 ページあたり {perPage} 件。', eventCount: '{count} 件のイベント', noScansProcessed: 'まだ処理されたスキャンはありません。', noEventsForSource: '{source} の {filter} イベントはありません。', noEvents: '{filter} イベントはありません。', noSourceActivity: '{source} のアクティビティは見つかりませんでした。', ok: 'OK', error: 'エラー', targetSkipped: '{target}: スキップ', targetRefreshed: '{target}: 更新済み', showing: '{total} 件中 {from}～{to} 件を表示', actions: { import: 'インポート', upgrade: 'アップグレード', fileDeleted: 'ファイルを削除', seriesDeleted: 'シリーズを削除', movieDeleted: '映画を削除', artistDeleted: 'アーティストを削除', rename: '名前変更', manual: '手動', refresh: '更新', other: 'その他' } },
    pagination: { previous: '前へ', next: '次へ' },
    errors: { load: 'Scanner を読み込めませんでした', queuePath: 'パスをキューに追加できませんでした' },
    toasts: { queued: 'キューに追加しました: {path}', copied: 'クリップボードにコピーしました' },
} });

Object.assign(ja, { scanner: { ...ja.scanner, settings: {
    general: {
        description: 'Sonarr、Radarr、Lidarr 向けの Autoscan 形式ライブラリ更新です。有効にすると、手動パスとキューの状態を扱う管理者専用 Scanner ページがナビゲーションに表示されます。',
        title: '一般', enableTitle: 'Scanner を有効にする', enableHint: '/triggers/* Webhook と管理者用 Scanner ページを有効にします。', currentStatus: '現在の状態', on: 'オン', off: 'オフ',
        homeWidgetTitle: 'ホームウィジェットを表示', homeWidgetHint: 'ホームの「最近追加」の上に、幅いっぱいの Scanner ストリップを追加します（管理者）。ホーム → レイアウトを編集 で並べ替えられます。',
        webhooksVisibleTitle: 'Scanner ページに ARR Webhook を表示', webhooksVisibleHint: 'オフにすると、Scanner ページの ARR Webhook URL ブロックを非表示にします。トリガーは引き続き動作し、ヘルプセクションだけが非表示になります。',
        manualPathVisibleTitle: 'Scanner ページに手動パスを表示', manualPathVisibleHint: 'オフにすると、Scanner ページの手動パス欄を非表示にします。オンの場合もユーザーは折りたたむことができ、その設定は記憶されます。',
        minimumAge: '最小経過時間', minimumAgeHint: '例: 30s、1m、5m。スキャンはこの時間待ってから対象を呼び出します。',
    },
    webhook: { title: 'Webhook 認証', description: 'Sonarr、Radarr、Lidarr の Connect Webhook は、このユーザー名とパスワードを使用する必要があります（HTTP Basic Auth）。' },
    credentials: { username: 'ユーザー名', password: 'パスワード', hidePassword: 'パスワードを隠す', showPassword: 'パスワードを表示' },
    triggers: {
        targetCheck: '{target}: {status}', targetFallback: '対象', reachable: '到達可能', failed: '失敗', noEnabledTargets: '有効な対象はありません', passed: '成功', parserPassedTargetFailed: '解析は成功しましたが、対象の確認に失敗しました',
        testPassedToast: '{name} トリガーテストに成功しました', testTargetFailedToast: '{name} の解析は成功しましたが、対象の一つに失敗しました', testFailed: 'トリガーテストに失敗しました', title: '{name} のトリガー', webhookPath: 'Webhook パス: {path}（または下のカスタム名）。',
        name: 'トリガー名', urlBecomes: 'URL は {path} になります', priority: '優先度', testHint: '安全な合成テストです。スキャンをキューに入れずに、解析、保存済みの書き換え、対象への到達可能性を検証します。', testAction: 'トリガーをテスト',
    },
} } });

Object.assign(ja, { scanner: { ...ja.scanner, settings: { ...ja.scanner.settings,
    pathRewrites: {
        title: 'パスの書き換え', add: '書き換えを追加', empty: '書き換えルールはありません。パスはトリガーから受け取ったまま使用されます。', sourcePath: '変換元パス', destinationPath: '変換先パス', sourcePathFor: '{name} のパス', scannerPath: 'Scanner パス', targetPath: '{name} のパス',
        mediaAutomationTitle: 'Media Automation の書き換え', mediaAutomationDescription: 'Media Automation が Copy/Replace を完了して即時 Scanner 更新をキューに入れるときに適用されます。Sonarr の「変換元 → 変換先」と同様に、Automation/コンテナのパスを Plex（または Scanner）が期待するパスへ対応付けます。', label: 'ラベル', mediaAutomationLabelHint: 'Webhook URL ではありません。Scanner キュー内のソース表示にのみ使用されます。', automationPath: 'Automation パス', scannerOrPlexPath: 'Scanner / Plex パス', mediaAutomationExamplePrefix: '例:', mediaAutomationExampleSuffix: 'Media Automation → 「Queue Scanner refresh after library writes」と Scanner の有効化が必要です。',
    },
    targets: {
        title: '{name} の対象', plexDescription: '設定 → Plex の Plex トークンとサーバー URL を使用します。マウントパスが異なる場合にのみ書き換えを追加してください。', optionalDescription: '{name} ライブラリを更新するための任意の対象です。', enable: '{name} を有効にする', usePortalCredentials: 'ポータルの認証情報を使用', usePortalCredentialsHint: 'オンにすると、設定のメディアサーバー URL と API キーを使用します。オフの場合は以下で上書きします。', url: 'URL', apiKey: 'API キー', saveHint: 'これらのオプションを変更した後、ページ下部の「設定を保存」をクリックしてください。',
    },
} } });

Object.assign(ja, { scanner: { ...ja.scanner, settings: { ...ja.scanner.settings,
    autoscan: {
        title: 'Autoscan からインポート', description: 'Autoscan の config.yml をアップロードまたは貼り付けて、最小経過時間、Webhook 認証、トリガー、書き換えを設定します。Plex URL とトークンは引き続き 設定 → Plex から取得されます。', uploadConfig: 'config.yml をアップロード', previewPastedYaml: '貼り付けた YAML をプレビュー', applyImport: 'インポートを適用',
        placeholder: '# Paste Autoscan config.yml here\nminimum-age: 1m\nauthentication:\n  username: admin\n  ...', previewNotApplied: 'プレビュー（まだ適用されていません）', applied: '適用済み', importedToast: 'Autoscan 設定をインポートしました。以下を確認してから「設定を保存」を実行してください', pasteOrUploadFirst: '先に Autoscan の config.yml を貼り付けるかアップロードしてください', yamlParsedToast: 'YAML を解析しました。プレビューを確認してからインポートを適用してください', previewFailed: 'プレビューに失敗しました', previewFirst: '先に YAML をプレビューしてください', readFileFailed: 'そのファイルを読み取れませんでした', summaryMinimumAge: '最小経過時間 {value}', summaryAuth: '認証 @{username}', summaryRewrites: '{name} の書き換え {count} 件',
    },
    live: {
        title: 'ライブアクティビティ', description: 'Webhook キューと最近のスキャン結果です。このページを開いている間は数秒ごとに更新されます。', status: { paused: '一時停止中', live: 'ライブ' }, disabledHint: 'Scanner はオフです。新しい Webhook を処理するには有効化して保存してください', summary: 'キュー {queue} ・ 処理済み {processed}', updated: '更新: {time}', copyTitle: 'ライブログをクリップボードにコピー', exportTitle: 'ライブログを .txt としてエクスポート', export: 'エクスポート', resume: '再開', pause: '一時停止', loading: 'アクティビティを読み込み中…', empty: 'Scanner のアクティビティはまだありません。Sonarr/Radarr/Lidarr の Webhook をトリガーするか、Scanner ページからパスを送信してください。', targetSkipped: '{target} をスキップしました（{reason}）', targetFallback: '対象', noLibrary: 'ライブラリなし', targetScanned: '{target} をスキャンしました',
        errors: { load: 'Scanner ログの読み込みに失敗しました', copyFailed: 'クリップボードにコピーできませんでした' }, toasts: { copied: 'ライブアクティビティをクリップボードにコピーしました', exported: 'ライブアクティビティをエクスポートしました' },
    },
} } });

Object.assign(ja, { settings: { ...ja.settings, logs: {
    actions: { refresh: '更新', refreshing: '更新中...', exportAll: 'すべてエクスポート', exporting: 'エクスポート中…', unblock: 'ブロック解除' },
    audit: { viewerTitle: '監査ログビューアー', empty: '監査イベントが見つかりません。', target: '対象', system: 'システム', actor: '実行者', field: '項目', before: '変更前', after: '変更後', value: '値', unknownEvent: 'イベント' },
    blocklist: { title: '削除済みユーザーのブロックリスト', empty: '現在ブロックされている削除済みユーザーはいません。', unknownUser: '不明なユーザー', noIdentifier: '識別子なし', deletedBy: '{actor} が {date} に削除', defaultActor: '管理者' },
    email: { title: 'メールログ', empty: 'システムメールはまだ記録されていません。', systemEmail: 'システムメール', to: '宛先' },
    pagination: { previous: '前へ', next: '次へ', pageOf: '{total} ページ中 {page} ページ' }, dialogs: { unblockUser: '{name} が再びポータルを使用できるようにしますか？自動的に招待されることはありません。' }, fallbacks: { thisUser: 'このユーザー', notAvailable: '該当なし' },
    errors: { loadAuditLog: '監査ログを読み込めませんでした', exportAuditLog: '監査ログをエクスポートできませんでした', loadDeletedUsers: '削除済みユーザーのログを読み込めませんでした', unblockUser: 'ユーザーのブロックを解除できませんでした。' }, toasts: { auditExported: '監査ログをエクスポートしました（ポータル + Poster Sets + Upgrader）。', userUnblocked: '削除済みユーザーのブロックを解除しました。' },
} } });

Object.assign(ja, { maintenance: {
    ...ja.maintenance,
    labels: { ...ja.maintenance.labels, true: '真', false: '偽', minMax: '最小,最大', values: 'v1,v2', value: '値', enabled: '有効', disabled: '無効', matches: '一致', grace: '猶予期間', graceDays: '猶予日数', maxActions: '最大アクション数', collectionName: 'コレクション名', matchLogic: '一致条件', filterName: 'フィルター名', matchedTitles: '一致したタイトル', noPoster: 'ポスターなし', eligible: '対象', unmapped: '未マッピング', ambiguous: '不明確', ...ja.maintenance?.labels, mapped: 'マッピング済み', instanceMappingHint: 'インスタンスのマッピングが不明確です', index: 'インデックス', mediaItems: 'メディア項目', lastBuild: '最終構築', requestRecords: 'リクエスト記録',...ja.maintenance?.labels, matchLogicHint: 'ルール条件の組み合わせ方。', graceHint: 'このルールセットの全体猶予期間。', resetGraceHint: 'このルールの猶予タイマーを今すぐリセットします。' },
    errors: { ...ja.maintenance.errors, load: 'メンテナンスモジュールを読み込めませんでした', deleteFilter: 'フィルターを削除できませんでした', saveRules: 'メンテナンスルールを保存できませんでした', rebuildIndex: 'インデックスを再構築できませんでした', preview: 'プレビューを生成できませんでした', unsavedBeforeRun: '実行する前にフィルターの変更を保存してください。', run: 'ルールの実行に失敗しました', preflight: '事前チェックに失敗しました。', resetGrace: '猶予期間をリセットできませんでした', toggleFilter: 'フィルターの状態を更新できませんでした' }
} });

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

Object.assign(ja, { about: {
    eyebrow: 'プロジェクトについて',
    description: 'Server Portal Manager は、セルフホスト型メディアサーバーのためのメディア管理センターです。Plex、Emby、Jellyfin とともに、ユーザーアクセス、リクエスト、ライブアクティビティ、分析、ダッシュボード、メンテナンスを一元管理できます。',
    currentMode: '現在のモード', version: 'バージョン', development: '開発版', centralPlace: 'ひとつの管理場所',
    features: {
        access: { title: 'アクセスとユーザー', description: 'サーバーツールを切り替えることなく、招待、有効期限、取り消し、プロフィール、管理者のなりすましを管理できます。' },
        stats: { title: '統計と分析', description: 'サーバー全体のランキング、個人のまとめ、視聴履歴、ピーク時間、ライブラリ、再生傾向をひとつのダッシュボードに集約します。' },
        monitoring: { title: 'ライブ監視', description: 'アクティブなストリーム、直接再生やトランスコードの状態、プレーヤー詳細、帯域幅、現在のメディアアクティビティをひと目で確認できます。' },
        requests: { title: 'リクエストと確認', description: 'Seerr、Jellyseerr、Ombi のリクエストを、ダッシュボード、ユーザー統計、メディア操作と同じ場所で確認できます。' },
        mediaStack: { title: 'メディアスタック', description: 'Sonarr と Radarr のカレンダー、キュー、履歴、接続済みサービスの状態をポータル内に表示します。' },
        maintenance: { title: 'メンテナンス', description: 'ライブラリのクリーンアップ、状態監視、Upgrader ワークフロー、ログ、監査、運用チェックをひとつのコンソールから実行します。' },
    },
    ecosystem: { title: '対応エコシステム', downloadClients: 'ダウンロードクライアント' },
    contributors: {
        title: '貢献者',
        primary: { role: 'Plex 担当', note: 'プロジェクトの初代メンテナーであり、Plex ワークフローの責任者です。' },
        integration: { role: 'Jellyfin / Emby 担当', note: 'Jellyfin、Emby、およびその統合を担当する貢献者です。' },
    },
    links: { title: 'プロジェクトリンク', documentation: 'ドキュメント', githubRepository: 'GitHub リポジトリ', featureOverview: '機能概要', gettingStarted: 'はじめに' },
} });

Object.assign(ja, { settings: { ...ja.settings, notifications: {
    common: { never: 'なし', unknownDate: '不明', unknownUser: '不明なユーザー', unread: '未読', all: 'すべて', loading: '読み込み中...', ready: '準備完了', needsSetup: '設定が必要', email: 'メール', inAppBell: 'アプリ内ベル', browserPush: 'ブラウザプッシュ', webPush: 'Web Push', ntfy: 'ntfy', webhook: 'Webhook' },
    page: { title: '通知', description: 'リクエストが利用可能になった時の通知、ブラウザプッシュ、Discord、アプリ内ベルの履歴、自分宛てのテスト送信をまとめて管理します。SMTP と Gotify の管理者向け通知もこのページで扱います。' },
    actions: { refreshStatus: '状態を更新', openSmtpSettings: 'SMTP 設定を開く', openGotifySettings: 'Gotify 設定を開く' },
    history: { noFilterResults: 'このフィルターに一致する通知はありません。', title: '通知履歴', description: 'メンバー間で共有されるアプリ内通知ストアです。種類で絞り込み、マッピングや通知送信の問題を確認できます。', empty: '保存済みのアプリ内通知はまだありません。' },
    events: { available: '利用可能', approved: '承認済み', declined: '却下済み', season: 'シーズン', episode: '新しいエピソード', admin_pending: '管理者承認待ち', collexions_failed: 'ColleXions 失敗', scanner_failed: 'Scanner 失敗', status_down: 'ステータス停止', status_up: 'ステータス復旧', media_job_failed: 'Media Automation ジョブ失敗', media_job_completed: 'Media Automation ジョブ完了' },
    health: { title: '状態', loadFailed: '通知ステータスを読み込めませんでした', requestAvailableLabel: 'リクエスト利用可能', requestAvailableDetail: 'エンジン: {engine}。アプリ内ストア: 合計 {total} / 未読 {unread}。', emailSmtpLabel: 'メール (SMTP)', smtpConfigured: 'SMTP は設定済みのようです。', smtpConfigure: '上の SMTP で設定してください。', webPushDetail: 'デバイス {devices} 件、ユーザー {users} 件。', discordWebhookSaved: 'Webhook は保存済みです。', discordAddWebhook: '下に Discord webhook URL を追加してください。', gotifyReady: 'Gotify の管理者通知は準備完了です。', gotifyConfigure: '任意 - 下で Gotify を設定してください。', ntfyReady: 'ntfy トピックは準備完了です。', ntfyConfigure: '任意 - 下で ntfy を設定してください。', webhookReady: '汎用 Webhook は準備完了です。', webhookConfigure: '任意 - 下で Webhook を設定してください。', seerrNotifyJob: 'Seerr 通知ジョブ', portalStatusSync: 'ポータル状態同期', jobDetail: '最終実行: {lastRun}。', jobDetailWithError: '最終実行: {lastRun}。エラー: {error}', seerrSnapshot: 'Seerr スナップショットの追跡リクエスト数: {count}', seerrSnapshotUpdated: '{date} 更新' },
    requestAvailable: { title: 'リクエスト利用可能', description: 'リクエストのダウンロードが完了して利用可能になったら、リクエストしたユーザーに通知します。同じ設定は Request Discovery にも表示されます。', enableTitle: '通知を有効化', enableDescription: 'リクエスト利用可能通知の主スイッチです (ポータルまたは Seerr エンジン)。', emailDescription: 'リクエストしたユーザーへ SMTP メールを送信します。SMTP が必要です。', inAppDescription: 'ポータルの通知ベルに未読項目を表示します。', browserPushDescription: '購読済みのブラウザ/デバイスへ Web Push を送信します。', discordWebhookTitle: 'Discord Webhook', discordWebhookDescription: 'リクエストが利用可能になったら Discord に投稿します。', discordWebhookUrl: 'Discord webhook URL', discordWebhookSavedHint: '保存済みの webhook を保持するには、他の設定を編集するときもドット表示のままにしてください。', webPushGlobalTitle: 'Web Push を有効化 (全体)', webPushGlobalDescription: 'メンバーがブラウザを購読できるようにします。上のブラウザプッシュチャンネルに必要です。' },
    notReleased: { title: 'まだ公開前', description: 'まだ公開されていない映画や番組がリクエストされた場合、予定日を知らせます (既定はデジタル配信日)。その日付が表示中の月に含まれる場合、Media Stack カレンダーにも表示されます。', enableTitle: '公開前通知を有効化', enableDescription: '優先する公開日がまだ未来の場合、作成時にリクエストしたユーザーへ通知します。', preferredReleaseDate: '優先する公開日', options: { digital: 'デジタル (優先)', theatrical: '劇場公開', physical: '物理メディア', tmdb: 'TMDB の主要公開日' } },
    ntfy: { description: 'リクエストのライフサイクルと管理者承認待ちを、ntfy トピックへ push します (セルフホストまたは ntfy.sh)。', enableTitle: 'ntfy を有効化', enableDescription: '選択したイベントを ntfy トピックへ送信します。', serverUrl: 'サーバー URL', topic: 'トピック', accessTokenOptional: 'アクセストークン (任意)', priority: '優先度 (1-5)' },
    webhook: { title: '汎用 Webhook', description: '任意の HTTPS エンドポイントへ JSON を POST します。通知テンプレートで任意の本文テンプレートを設定できます (有効な JSON が必要です)。', enableTitle: 'Webhook を有効化', enableDescription: '選択したイベントを JSON POST リクエストとして送信します。', url: 'Webhook URL', extraHeadersJson: '追加ヘッダー (JSON オブジェクト、任意)', defaultsHint: '既定: 利用可能イベントはオン、その他のイベントはオフ。payload を調整するには、テンプレート -> webhook JSON 本文を使用してください。' },
    test: { title: '自分にテスト送信', description: '管理者アカウントのみにテストを送信します。Seerr のマッピング問題を追う前に、アプリ内ベルの経路を確認できます。', pickChannelError: 'テストチャンネルを 1 つ以上選択してください。', results: { inApp: 'in-app', webPush: 'web push', email: 'メール', discord: 'discord', ok: 'ok' }, successToast: 'テストを送信しました ({channels})。ベルを確認してください。', noChannelSucceeded: '成功したチャンネルはありません', failed: 'テストに失敗しました', sending: '送信中...', send: 'テスト送信' },
    saveReminder: { title: '設定の保存を忘れずに', hint: 'チャンネル切り替えと Discord webhook を保持するには、フッターのボタンで保存してください。' },
    templates: { title: '通知テンプレート', hint: 'イベントごとに文面をカスタマイズできます。組み込み文面を使うには、フィールドを既定値のままにするか空にしてください。', variablesLabel: '変数:', resetEvent: 'イベントを既定値に戻す', customBadge: 'カスタム', events: { available: 'リクエスト利用可能', approved: 'リクエスト承認済み', declined: 'リクエスト却下済み', season: 'シーズン利用可能', episode: '新しいエピソード', admin_pending: '管理者 - 新しい承認待ちリクエスト', not_released: 'まだ公開前', collexions_failed: '管理者 - ColleXions 失敗', scanner_failed: '管理者 - Scanner 失敗', status_down: '管理者 - 状態チェック停止', status_up: '管理者 - 状態チェック復旧', media_job_failed: '管理者 - Media Automation ジョブ失敗', media_job_completed: '管理者 - Media Automation ジョブ完了' }, fields: { emailSubject: 'メール件名', emailHeadline: 'メール見出し', emailBody: 'メール本文', pushTitle: 'Push / in-app タイトル', pushBody: 'Push / in-app 本文', discordContent: 'Discord メッセージ', discordEmbedTitle: 'Discord 埋め込みタイトル', discordEmbedDescription: 'Discord 埋め込み説明', gotifyTitle: 'Gotify タイトル', gotifyBody: 'Gotify 本文', ntfyTitle: 'ntfy タイトル', ntfyBody: 'ntfy 本文', webhookBody: 'Webhook JSON 本文 (任意テンプレート)' } },
} } });
Object.assign(ja, { settings: { ...ja.settings, arrIntegrations: {
    actions: { addInstance: 'インスタンスを追加', defaultInstance: 'デフォルトインスタンス', setAsDefault: 'デフォルトに設定', removeInstance: 'インスタンスを削除', testConnection: '接続をテスト' },
    status: { default: 'デフォルト' },
    empty: { noInstances: '{appName} インスタンスは設定されていません。' },
    labels: { instance: 'インスタンス {index}', displayName: '表示名', ultraHdInstance: '4K / UHD インスタンス', url: 'URL', externalUrl: '外部 URL', apiKey: 'API キー', plexLibraries: 'Plex ライブラリ' },
    hints: { ultraHdRouting: 'リクエストモーダルは Ultra HD リクエストをこのインスタンスへルーティングします (HD + UHD を同時に選択できます)。', externalUrlOptional: '任意、UI リンク用', libraryMapping: 'メンテナンスのルーティング用にライブラリをこのインスタンスへ割り当てます。未割り当てのライブラリはデフォルトインスタンスを使用します。' },
    placeholders: { apiKey: 'API キー' },
    library: { assignedToAnotherInstance: '別のインスタンスに割り当て済み' },
    test: { connectionSuccessful: '接続に成功しました', connectionFailed: '接続に失敗しました' },
    titles: { sonarrInstances: 'Sonarr インスタンス', radarrInstances: 'Radarr インスタンス', lidarrInstances: 'Lidarr インスタンス', bazarrInstances: 'Bazarr インスタンス' },
    subtitles: { sonarr: 'TV シリーズの自動化', radarr: '映画の自動化', lidarr: '音楽の自動化', bazarr: '字幕の自動化' },
} } });

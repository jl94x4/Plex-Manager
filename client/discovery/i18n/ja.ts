import type { EnCatalog } from './en';

/** Japanese UI overlay. Falls back to English for missing keys. */
export const ja: DeepPartial<EnCatalog> = {
    downloads: { page: { eyebrow: 'ダウンロード', title: 'ダウンロード状況', description: 'Sonarr、Radarr、Lidarrごとに設定されたダウンロードクライアントを表示します。' }, actions: { refresh: '更新', clearClientFilter: 'クライアントのフィルターを解除', pause: '一時停止', resume: '再開', remove: '削除' }, filters: { client: 'クライアント', show: '表示', activeOnly: 'アクティブのみ', all: 'すべて', allClients: 'すべてのクライアント', other: 'その他', shown: '{count}件を表示', hidingCompleted: '完了済み/シード中を非表示' }, labels: { clients: 'クライアント', downloadClient: 'ダウンロードクライアント', downloadCount: '{count}件のダウンロード', downloadCount_plural: '{count}件のダウンロード', downSpeed: '下り {value}/s', upSpeed: '上り {value}/s', matchedFromArrQueue: 'Arrキューに一致' }, status: { activeDownloads: 'アクティブなダウンロード', downloads: 'ダウンロード', unknown: '不明' }, empty: { noClients: '設定にダウンロードクライアントがありません。', noFilterResults: 'このフィルターに該当するダウンロードはありません。' }, upload: { title: 'Torrentを追加', subtitle: '設定済みクライアントにURL、マグネット、ファイルを送信', client: 'クライアント', category: 'カテゴリ', torrentUrl: 'Torrent URLまたはマグネット', torrentFile: 'Torrentファイル', noCategory: 'カテゴリなし', sending: '送信中…', add: 'Torrentを追加' }, errors: { loadFailed: 'ダウンロードを読み込めませんでした', actionFailed: 'ダウンロードを{action}できませんでした', chooseClient: '先にダウンロードクライアントを選択してください。', missingSource: 'Torrent URL、マグネットリンク、またはTorrentファイルを追加してください。', addFailed: 'Torrentを追加できませんでした' }, confirm: { remove: '「{name}」を{client}から削除しますか？クライアントが対応している場合、ダウンロード済みファイルは残ります。' } },
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

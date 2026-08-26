import React, { useCallback, useState } from 'react';
import {
    ClipboardPaste,
    ExternalLink,
    Image as ImageIcon,
    Loader2,
    Save,
    Sparkles,
} from 'lucide-react';
import { posterSetsApi } from '../api';
import { SetInspector, SetInspectorThumbStrip } from '../SetInspector';
import { inferPreviewMediaType } from '../posterSetsDashboardUtils';
import {
    BrowseSetCard,
    PreviewAssetGallery,
    RelatedSetsRail,
    buttonClass,
    fieldClass,
    isTitleCardSet,
    primaryButtonClass,
    sectionBodyClass,
    sectionTitleClass,
} from '../shared';
import { usePosterSetsDashboard } from '../PosterSetsDashboardContext';

const isTpdbPostersUrl = (value: string) => /theposterdb\.com\/posters\//i.test(value);

export const PosterSetsPasteView: React.FC = () => {
    const {
        toast,
        tab,
        setTab,
        busy,
        url,
        setUrl,
        findProvider,
        setFindProvider,
        findId,
        setFindId,
        bulkText,
        setBulkText,
        configDraft,
        useFindId,
        runBulk,
        runPreview,
        pushPosterLocation,
        setSelectedSearchSet,
        setShowInspectorAssets,
        setSearchSets,
        setSearchContext,
        setSearchSetsPage,
        searchSets,
        selectedSearchSet,
        inspectorOpen,
        preview,
        previewHeaderLabel,
        readyToApply,
        matchedAssetCount,
        selectedAssetIds,
        titleCardsOnly,
        showInspectorAssets,
        applyMatched,
        runApply,
        queueEntireWithConfirm,
        applyUnmatched,
        applyNewSinceWatch,
        selectPreviewAssets,
        collapseSetInspector,
        matchedThumbStrip,
        previewSections,
        toggleAsset,
        relatedSets,
        relatedSetsLoading,
        expandSetInline,
        openCreatorCatalog,
        previewPanelRef,
    } = usePosterSetsDashboard();

    const [titlePageLoading, setTitlePageLoading] = useState(false);

    const stayOnPaste = useCallback((setUrlValue: string) => {
        setTab('paste');
        pushPosterLocation({
            tab: 'paste',
            rail: null,
            setUrl: setUrlValue,
            creator: null,
            titleCardsOnly: false,
        }, 'push');
    }, [pushPosterLocation, setTab]);

    const loadUrl = useCallback(async () => {
        const target = String(url || '').trim();
        if (!target) {
            toast('Paste a set URL first.', 'error');
            return;
        }

        if (isTpdbPostersUrl(target)) {
            setTitlePageLoading(true);
            setShowInspectorAssets(false);
            setSelectedSearchSet(null);
            stayOnPaste(target);
            try {
                const response = await posterSetsApi.search({
                    provider: 'posterdb',
                    titleUrl: target,
                    limit: 500,
                });
                const sets = response.sets || [];
                setSearchSets(sets);
                setSearchSetsPage(1);
                setSearchContext(response.title || 'ThePosterDB title page');
                if (!sets.length) {
                    toast(response.partialErrors?.[0] || 'No sets on that ThePosterDB title page.', 'error');
                } else {
                    toast(`Found ${sets.length} set${sets.length === 1 ? '' : 's'} on that title page.`);
                }
            } catch (error) {
                toast(error instanceof Error ? error.message : 'Failed to load title page', 'error');
            } finally {
                setTitlePageLoading(false);
            }
            return;
        }

        setSelectedSearchSet({
            setId: '',
            title: target,
            url: target,
        });
        setShowInspectorAssets(false);
        setSearchSets([]);
        stayOnPaste(target);
        void runPreview(target, { titleCardsOnly: false, keepSearch: true });
    }, [
        url,
        toast,
        stayOnPaste,
        setShowInspectorAssets,
        setSelectedSearchSet,
        setSearchSets,
        setSearchSetsPage,
        setSearchContext,
        runPreview,
    ]);

    const loadSetId = useCallback(async () => {
        await useFindId(true, { locationTab: 'paste' });
    }, [useFindId]);

    if (tab !== 'paste') return null;

    return (
        <div className="min-w-0 space-y-4">
            <section className="min-w-0 space-y-5 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 max-w-3xl">
                        <div className="flex items-center gap-2 text-plex">
                            <ClipboardPaste className="h-4 w-4" />
                            <span className="text-xs font-bold uppercase tracking-wide">Paste / Import</span>
                        </div>
                        <h2 className={`mt-1 ${sectionTitleClass}`}>Load a set by URL or ID</h2>
                        <p className={sectionBodyClass}>
                            Most reliable for ThePosterDB — paste a <code className="text-text">/set/…</code> or{' '}
                            <code className="text-text">/posters/…</code> URL from the site when library matching misses.
                        </p>
                    </div>
                    <a
                        href={findProvider === 'posterdb' ? 'https://theposterdb.com/' : 'https://mediux.pro/'}
                        target="_blank"
                        rel="noreferrer"
                        className={`${buttonClass} no-underline shrink-0`}
                    >
                        <ExternalLink className="h-4 w-4" />
                        Open {findProvider === 'posterdb' ? 'ThePosterDB' : 'MediUX'}
                    </a>
                </div>

                <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">Provider</p>
                    <div className="flex flex-wrap gap-2">
                        {([
                            ['mediux', 'MediUX'],
                            ['posterdb', 'ThePosterDB'],
                        ] as const).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                className={`${buttonClass} !py-1.5 text-xs ${findProvider === id ? 'border-plex/40 bg-plex/15 text-plex' : ''}`}
                                onClick={() => setFindProvider(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">Set / poster ID</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            className={fieldClass}
                            value={findId}
                            onChange={(event) => setFindId(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void loadSetId();
                                }
                            }}
                            placeholder={findProvider === 'mediux' ? 'Set ID e.g. 24522' : 'Set/poster ID e.g. 362735 or username'}
                        />
                        <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void loadSetId()}>
                            {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                            Load set
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">Full URL</p>
                    <input
                        className={fieldClass}
                        placeholder="https://mediux.pro/sets/… · https://theposterdb.com/set/… · /poster/… · /posters/…"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void loadUrl();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className={primaryButtonClass}
                        disabled={busy !== null || titlePageLoading}
                        onClick={() => void loadUrl()}
                    >
                        {(busy === 'preview' || titlePageLoading)
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <ClipboardPaste className="h-4 w-4" />}
                        Load URL
                    </button>
                </div>

                {searchSets.length > 0 && !inspectorOpen ? (
                    <div className="space-y-3 border-t border-white/10 pt-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-sm font-bold text-text">Sets from title page</h3>
                            <span className="text-[11px] text-muted">{searchSets.length} found</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {searchSets.map((set) => (
                                <BrowseSetCard
                                    key={`${set.provider}-${set.setId}-${set.url}`}
                                    set={set}
                                    disabled={busy !== null}
                                    onOpen={(item) => {
                                        const target = String(item.url || '').trim();
                                        if (!target) return;
                                        setSelectedSearchSet(item);
                                        setUrl(target);
                                        stayOnPaste(target);
                                        void runPreview(target, { titleCardsOnly: false, keepSearch: true });
                                    }}
                                    onOpenCreator={openCreatorCatalog}
                                />
                            ))}
                        </div>
                    </div>
                ) : null}

                {inspectorOpen ? (
                    <div className="border-t border-white/10 pt-4">
                        <SetInspector
                            panelRef={previewPanelRef}
                            set={selectedSearchSet}
                            headerLabel={previewHeaderLabel}
                            loading={busy === 'preview'}
                            ready={readyToApply}
                            matchedCount={matchedAssetCount}
                            unmatchedCount={preview?.unmatched ?? 0}
                            totalCount={preview?.total || 0}
                            selectedCount={selectedAssetIds.length}
                            titleCardsOnly={titleCardsOnly}
                            showAssets={showInspectorAssets}
                            busy={busy}
                            onToggleShowAssets={() => setShowInspectorAssets((value: boolean) => !value)}
                            onQueueMatched={() => void applyMatched()}
                            onQueueSelected={() => void runApply(true)}
                            onQueueEntire={() => void queueEntireWithConfirm()}
                            onQueueUnmatched={() => void applyUnmatched()}
                            onQueueNewSinceWatch={() => void applyNewSinceWatch()}
                            onSelectMatched={() => selectPreviewAssets('matched')}
                            onSelectAll={() => selectPreviewAssets('all')}
                            onClearSelection={() => selectPreviewAssets('none')}
                            onClose={() => collapseSetInspector({ scrollToSets: false })}
                            thumbStrip={(
                                <SetInspectorThumbStrip
                                    thumbs={matchedThumbStrip}
                                    layout={titleCardsOnly || isTitleCardSet(selectedSearchSet) ? 'landscape' : 'poster'}
                                    setUrl={selectedSearchSet?.url}
                                    provider={selectedSearchSet?.provider}
                                />
                            )}
                            gallery={(
                                <PreviewAssetGallery
                                    sections={previewSections}
                                    selectedAssetIds={selectedAssetIds}
                                    onToggle={toggleAsset}
                                />
                            )}
                            relatedRail={(
                                <RelatedSetsRail
                                    sets={relatedSets}
                                    loading={relatedSetsLoading}
                                    mediaLabel={inferPreviewMediaType(preview) === 'show' ? 'show' : 'movie'}
                                    disabled={busy !== null}
                                    onOpen={(item) => void expandSetInline(item, { stayOnTab: true, toggle: false })}
                                    onOpenCreator={openCreatorCatalog}
                                />
                            )}
                        />
                    </div>
                ) : null}

                <div className="space-y-3 border-t border-white/10 pt-4">
                    <div>
                        <h3 className="text-sm font-bold text-text">Bulk import</h3>
                        <p className="mt-1 text-sm text-muted">One URL per line. Lines starting with # or // are ignored.</p>
                    </div>
                    <textarea
                        className={`appearance-none text-[16px] leading-5 ${fieldClass} min-h-36 font-mono text-[16px]`}
                        value={bulkText}
                        onChange={(event) => setBulkText(event.target.value)}
                        placeholder={'https://mediux.pro/sets/123\nhttps://theposterdb.com/set/456\nhttps://theposterdb.com/posters/789'}
                    />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={primaryButtonClass} disabled={busy !== null || !bulkText.trim()} onClick={() => void runBulk(false)}>
                            {busy === 'bulk' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Apply bulk list
                        </button>
                        <button type="button" className={buttonClass} disabled={busy !== null} onClick={() => void runBulk(true)}>
                            {busy === 'bulk-file' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Apply from {configDraft.bulk_txt || 'bulk_import.txt'}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
};

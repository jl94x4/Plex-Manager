import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { usePoll } from '../shared/usePoll';
import { useDiscoverI18n } from './i18n';

type FactResponse = {
    facts?: string[];
    fact?: string | null;
    sources?: { wikipedia?: number; tmdb?: number };
};

/**
 * Strip MediaWiki markup so raw API text renders as clean readable prose.
 * Handles: == headings ==, [[links|labels]], {{templates}}, '''bold''',
 * ''italic'', <ref>...</ref>, HTML tags, and excess whitespace.
 */
function cleanWikiText(raw: string): string {
    let text = raw;

    // Remove <ref> blocks (citations)
    text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
    text = text.replace(/<ref[^/]*\/>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Strip == Section headings == (any level: ==, ===, ====)
    text = text.replace(/={2,}\s*[^=\n]+?\s*={2,}/g, '');

    // Unwrap [[File:...]] and [[Image:...]] / [[Category:...]] (no useful text)
    text = text.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '');

    // Unwrap [[link|label]] → label, [[link]] → link
    text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
    text = text.replace(/\[\[([^\]]+)\]\]/g, '$1');

    // Strip {{template}} blocks (iterate to handle nesting)
    for (let i = 0; i < 4; i++) {
        text = text.replace(/\{\{[^{}]*\}\}/g, '');
    }

    // Strip remaining stray { } [ ] brackets
    text = text.replace(/[{}[\]]/g, '');

    // Strip bold/italic wiki markers (''' and '')
    text = text.replace(/'{2,3}/g, '');

    // Collapse bullet/list markers at line starts
    text = text.replace(/^\s*[*#:;]+\s*/gm, '');

    // Collapse multiple spaces / newlines into a single space
    text = text.replace(/\s+/g, ' ').trim();

    // Fall back to raw if cleaning left nothing useful
    if (text.length < 10) return raw;

    return text;
}

export const DiscoveryFactWidget: React.FC<{
    mediaType: 'movie' | 'tv';
    mediaId: number;
}> = ({ mediaType, mediaId }) => {
    const { t } = useDiscoverI18n();
    const [facts, setFacts] = useState<string[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    const advanceFact = useCallback(() => {
        if (facts.length <= 1) return;
        setIndex((prev) => (prev + 1) % facts.length);
    }, [facts.length]);

    usePoll(advanceFact, facts.length > 1 ? 10_000 : null, { immediate: false });

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const res: FactResponse = await apiFetch(
                    `/api/discovery/fact?mediaType=${encodeURIComponent(mediaType)}&mediaId=${mediaId}`,
                );
                if (cancelled) return;
                const pool = Array.isArray(res?.facts) && res.facts.length
                    ? res.facts
                    : (res?.fact ? [res.fact] : []);
                setFacts(pool);
                setIndex(pool.length ? Math.floor(Math.random() * pool.length) : 0);
            } catch {
                if (!cancelled) setFacts([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [mediaType, mediaId]);

    const showAnother = useCallback(() => {
        if (facts.length <= 1) return;
        setIndex((prev) => {
            if (facts.length === 2) return prev === 0 ? 1 : 0;
            let next = prev;
            while (next === prev) {
                next = Math.floor(Math.random() * facts.length);
            }
            return next;
        });
    }, [facts.length]);

    if (loading) {
        return (
            <div className="rounded-xl border border-plex/20 bg-plex/5 p-4 flex items-center gap-3 animate-pulse min-h-[7.25rem]">
                <div className="w-9 h-9 rounded-lg bg-plex/10 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 bg-white/10 rounded" />
                    <div className="h-3 w-full bg-white/5 rounded" />
                </div>
            </div>
        );
    }

    if (!facts.length) return null;

    const current = facts[index] || facts[0];

    return (
        <div className="rounded-xl border border-plex/25 bg-gradient-to-br from-plex/10 via-plex/5 to-transparent p-4 flex gap-3 min-h-[7.25rem]">
            <div className="w-9 h-9 rounded-lg bg-plex/15 border border-plex/20 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-4 h-4 text-plex" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-plex">{t('facts.didYouKnow')}</span>
                    {facts.length > 1 && (
                        <button
                            type="button"
                            onClick={showAnother}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-muted hover:text-plex transition-colors"
                        >
                            <RefreshCw className="w-3 h-3" />
                            {t('facts.another')}
                        </button>
                    )}
                </div>
                <p className="text-sm text-text/80 leading-relaxed min-h-[4.75rem] sm:min-h-[3.75rem]">
                    {cleanWikiText(current)}
                </p>
            </div>
        </div>
    );
};

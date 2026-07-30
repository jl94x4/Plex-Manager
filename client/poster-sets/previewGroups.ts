import type { PosterSetsPreviewAsset } from './types';

export type PreviewAssetKind = 'show_cover' | 'season_cover' | 'background' | 'title_card' | 'poster';

export type PreviewTitleCardSeason = {
    key: string;
    season: number | string;
    label: string;
    assets: PosterSetsPreviewAsset[];
};

export type PreviewAssetSections = {
    covers: PosterSetsPreviewAsset[];
    backgrounds: PosterSetsPreviewAsset[];
    titleCardSeasons: PreviewTitleCardSeason[];
    posters: PosterSetsPreviewAsset[];
    other: PosterSetsPreviewAsset[];
};

const asSeasonNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value ?? '').trim();
    if (!text || text === 'Cover' || text === 'Backdrop') return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
};

export const classifyPreviewAsset = (asset: PosterSetsPreviewAsset): PreviewAssetKind => {
    const explicit = String(asset.fileType || '').trim();
    if (explicit === 'show_cover' || explicit === 'season_cover' || explicit === 'background' || explicit === 'title_card') {
        return explicit;
    }
    if (asset.kind === 'movie' || asset.kind === 'collection') return 'poster';

    const season = asset.season;
    const episode = asset.episode;
    if (season === 'Cover') return 'show_cover';
    if (season === 'Backdrop') return 'background';
    if (episode === 'Cover' || episode == null || episode === '') return 'season_cover';
    return 'title_card';
};

const seasonSortValue = (season: number | string) => {
    if (typeof season === 'number') return season === 0 ? 9990 : season;
    const n = asSeasonNumber(season);
    if (n === 0) return 9990;
    if (n != null) return n;
    return 9999;
};

const seasonSectionLabel = (season: number | string) => {
    if (season === 0 || season === '0') return 'Specials';
    if (typeof season === 'number') return `Season ${season}`;
    const n = asSeasonNumber(season);
    if (n === 0) return 'Specials';
    if (n != null) return `Season ${n}`;
    return String(season || 'Season');
};

const titleCardSort = (a: PosterSetsPreviewAsset, b: PosterSetsPreviewAsset) => {
    const ae = Number(a.episode);
    const be = Number(b.episode);
    if (Number.isFinite(ae) && Number.isFinite(be) && ae !== be) return ae - be;
    return String(a.label || a.title || '').localeCompare(String(b.label || b.title || ''));
};

const coverSort = (a: PosterSetsPreviewAsset, b: PosterSetsPreviewAsset) => {
    const ak = classifyPreviewAsset(a);
    const bk = classifyPreviewAsset(b);
    if (ak === 'show_cover' && bk !== 'show_cover') return -1;
    if (bk === 'show_cover' && ak !== 'show_cover') return 1;
    const as = seasonSortValue(a.season ?? 9999);
    const bs = seasonSortValue(b.season ?? 9999);
    if (as !== bs) return as - bs;
    return String(a.label || '').localeCompare(String(b.label || ''));
};

/** Split preview assets into gallery sections (covers, backgrounds, title cards by season). */
export const groupPreviewAssets = (assets: PosterSetsPreviewAsset[] = []): PreviewAssetSections => {
    const covers: PosterSetsPreviewAsset[] = [];
    const backgrounds: PosterSetsPreviewAsset[] = [];
    const posters: PosterSetsPreviewAsset[] = [];
    const other: PosterSetsPreviewAsset[] = [];
    const titleBySeason = new Map<string, PreviewTitleCardSeason>();

    for (const asset of assets) {
        const kind = classifyPreviewAsset(asset);
        if (kind === 'show_cover' || kind === 'season_cover') {
            covers.push(asset);
            continue;
        }
        if (kind === 'background') {
            backgrounds.push(asset);
            continue;
        }
        if (kind === 'poster') {
            posters.push(asset);
            continue;
        }
        if (kind === 'title_card') {
            const seasonNum = asSeasonNumber(asset.season);
            const seasonKey = seasonNum != null ? String(seasonNum) : String(asset.season ?? 'other');
            const seasonValue: number | string = seasonNum != null ? seasonNum : (asset.season ?? 'other');
            if (!titleBySeason.has(seasonKey)) {
                titleBySeason.set(seasonKey, {
                    key: seasonKey,
                    season: seasonValue,
                    label: seasonSectionLabel(seasonValue),
                    assets: [],
                });
            }
            titleBySeason.get(seasonKey)!.assets.push(asset);
            continue;
        }
        other.push(asset);
    }

    const titleCardSeasons = [...titleBySeason.values()]
        .map((section) => ({
            ...section,
            assets: [...section.assets].sort(titleCardSort),
        }))
        .sort((a, b) => seasonSortValue(a.season) - seasonSortValue(b.season));

    return {
        covers: [...covers].sort(coverSort),
        backgrounds,
        titleCardSeasons,
        posters,
        other,
    };
};

export const previewAssetEpisodeLabel = (asset: PosterSetsPreviewAsset) => {
    const episode = Number(asset.episode);
    if (Number.isFinite(episode)) {
        const season = asSeasonNumber(asset.season);
        if (season != null && season > 0) return `S${season}E${String(episode).padStart(2, '0')}`;
        if (season === 0) return `Specials E${episode}`;
        return `E${episode}`;
    }
    return String(asset.label || asset.title || 'Title card');
};

/**
 * Normalize portal watch history into achievement stats.
 * Works with Plex-like history items and simple analytics aggregates.
 */

import {
    emptyGenreStatFields,
    extractCanonicalGenreIds,
    GENRE_CATALOG,
    genreMovieMetric,
    genreShowMetric,
} from './genres.js';

const dayKeyFromUnix = (unixSeconds) => {
    const ms = (Number(unixSeconds) || 0) * 1000;
    if (!ms) return null;
    return new Date(ms).toISOString().slice(0, 10);
};

const computeStreaks = (dayKeysSorted) => {
    if (!dayKeysSorted.length) return { longestStreak: 0, currentStreak: 0 };
    let longest = 1;
    let run = 1;
    for (let i = 1; i < dayKeysSorted.length; i += 1) {
        const prev = new Date(`${dayKeysSorted[i - 1]}T00:00:00Z`).getTime();
        const cur = new Date(`${dayKeysSorted[i]}T00:00:00Z`).getTime();
        if (cur - prev === 86400000) {
            run += 1;
            longest = Math.max(longest, run);
        } else {
            run = 1;
        }
    }

    // Current streak only counts if the latest active day is today or yesterday (UTC).
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const last = dayKeysSorted[dayKeysSorted.length - 1];
    let current = 0;
    if (last === today || last === yesterdayDate) {
        current = 1;
        for (let i = dayKeysSorted.length - 1; i > 0; i -= 1) {
            const prev = new Date(`${dayKeysSorted[i - 1]}T00:00:00Z`).getTime();
            const cur = new Date(`${dayKeysSorted[i]}T00:00:00Z`).getTime();
            if (cur - prev === 86400000) current += 1;
            else break;
        }
    }
    return { longestStreak: longest, currentStreak: current };
};

/**
 * @param {Array<{ type?: string, viewedAt?: number, duration?: number, grandparentKey?: string, parentKey?: string, ratingKey?: string, key?: string, librarySectionID?: string|number, Genre?: any, genres?: any }>} historyItems
 */
export const buildStatsFromHistoryItems = (historyItems = []) => {
    const items = Array.isArray(historyItems) ? historyItems : [];
    const uniqueMovies = new Set();
    const uniqueShows = new Set();
    const uniqueMusic = new Set();
    const libraries = new Set();
    const showPlayCounts = new Map();
    const dayPlays = new Map();
    const activeDays = new Set();
    const genreMovieSets = Object.fromEntries(GENRE_CATALOG.map((g) => [g.id, new Set()]));
    const genreShowSets = Object.fromEntries(GENRE_CATALOG.map((g) => [g.id, new Set()]));
    const genreTagsSeen = new Set();

    let totalPlays = 0;
    let moviePlays = 0;
    let episodePlays = 0;
    let trackPlays = 0;
    let weekendPlays = 0;
    let weekdayPlays = 0;
    let lateNightPlays = 0;
    let earlyMorningPlays = 0;
    let durationSeconds = 0;

    for (const item of items) {
        const type = String(item?.type || '').toLowerCase();
        const viewedAt = Number(item?.viewedAt) || 0;
        if (!viewedAt && !type) continue;
        totalPlays += 1;

        const duration = Number(item?.duration) || Number(item?.viewOffset) || 0;
        // Plex duration is often ms; treat large values as ms.
        if (duration > 0) {
            durationSeconds += duration > 100000 ? duration / 1000 : duration;
        }

        if (item?.librarySectionID != null) libraries.add(String(item.librarySectionID));

        const genreIds = extractCanonicalGenreIds(item);
        for (const gid of genreIds) genreTagsSeen.add(gid);

        if (type === 'movie') {
            moviePlays += 1;
            const key = String(item.ratingKey || item.key || item.title || '').trim();
            if (key) {
                uniqueMovies.add(key);
                for (const gid of genreIds) genreMovieSets[gid]?.add(key);
            }
        } else if (type === 'episode') {
            episodePlays += 1;
            const showKey = String(item.grandparentKey || item.grandparentRatingKey || item.grandparentTitle || '').trim();
            if (showKey) {
                uniqueShows.add(showKey);
                showPlayCounts.set(showKey, (showPlayCounts.get(showKey) || 0) + 1);
                for (const gid of genreIds) genreShowSets[gid]?.add(showKey);
            }
        } else if (type === 'track') {
            trackPlays += 1;
            const albumKey = String(item.parentKey || item.grandparentKey || item.parentTitle || '').trim();
            if (albumKey) uniqueMusic.add(albumKey);
        }

        if (viewedAt > 0) {
            const date = new Date(viewedAt * 1000);
            const day = dayKeyFromUnix(viewedAt);
            if (day) {
                activeDays.add(day);
                dayPlays.set(day, (dayPlays.get(day) || 0) + 1);
            }
            const weekday = date.getUTCDay();
            if (weekday === 0 || weekday === 6) weekendPlays += 1;
            else weekdayPlays += 1;
            const hour = date.getUTCHours();
            if (hour < 5) lateNightPlays += 1;
            if (hour >= 5 && hour < 9) earlyMorningPlays += 1;
        }
    }

    // If no duration metadata, estimate ~40 min per movie / 24 min per ep / 3.5 min per track.
    if (durationSeconds <= 0) {
        durationSeconds = (moviePlays * 40 + episodePlays * 24 + trackPlays * 3.5) * 60;
    }

    const sortedDays = [...activeDays].sort();
    const { longestStreak, currentStreak } = computeStreaks(sortedDays);
    let bingeMax = 0;
    for (const count of showPlayCounts.values()) bingeMax = Math.max(bingeMax, count);
    let maxDayPlays = 0;
    for (const count of dayPlays.values()) maxDayPlays = Math.max(maxDayPlays, count);

    const hoursWatched = Math.round((durationSeconds / 3600) * 10) / 10;
    const uniqueTitles = uniqueMovies.size + uniqueShows.size + uniqueMusic.size;

    const genreFields = emptyGenreStatFields();
    genreFields.genreTagsSeen = genreTagsSeen.size;
    for (const g of GENRE_CATALOG) {
        genreFields[genreMovieMetric(g.id)] = genreMovieSets[g.id].size;
        genreFields[genreShowMetric(g.id)] = genreShowSets[g.id].size;
    }

    return {
        totalPlays,
        moviePlays,
        episodePlays,
        trackPlays,
        uniqueMovies: uniqueMovies.size,
        uniqueShows: uniqueShows.size,
        uniqueMusic: uniqueMusic.size,
        uniqueTitles,
        activeDays: activeDays.size,
        longestStreak,
        currentStreak,
        weekendPlays,
        weekdayPlays,
        bingeMax,
        maxDayPlays,
        libraryDiversity: libraries.size,
        hoursWatched,
        lateNightPlays,
        earlyMorningPlays,
        balancedMedia: moviePlays >= 10 && episodePlays >= 10 ? 1 : 0,
        musicAndMovies: moviePlays >= 1 && trackPlays >= 1 ? 1 : 0,
        threeMediaTypes: moviePlays >= 1 && episodePlays >= 1 && trackPlays >= 1 ? 1 : 0,
        ...genreFields,
        // filled after XP/level
        level: 1,
    };
};

/** Merge partial analytics payload when full history is unavailable. */
export const buildStatsFromAnalyticsPayload = (analytics = {}) => {
    const moviePlays = Number(analytics.moviesCount) || 0;
    const episodePlays = Number(analytics.showsCount) || 0;
    const trackPlays = Number(analytics.musicCount) || 0;
    const totalPlays = Number(analytics.totalPlays) || moviePlays + episodePlays + trackPlays;
    const uniqueTitles = Number(analytics.uniqueTitles) || 0;
    const heatmap = analytics.heatmapData && typeof analytics.heatmapData === 'object'
        ? analytics.heatmapData
        : {};
    const activeDays = Object.keys(heatmap).length;
    const dayValues = Object.values(heatmap).map((v) => Number(v) || 0);
    const maxDayPlays = dayValues.length ? Math.max(...dayValues) : 0;
    const sortedDays = Object.keys(heatmap).sort();
    const { longestStreak, currentStreak } = computeStreaks(sortedDays);

    // Prefer unique counts when present; else approximate from play buckets.
    const uniqueMovies = Number(analytics.uniqueMovies) || Math.min(moviePlays, uniqueTitles || moviePlays);
    const uniqueShows = Number(analytics.uniqueShows)
        || Math.min(
            Array.isArray(analytics.topShows) ? analytics.topShows.length : episodePlays,
            uniqueTitles || episodePlays,
        );
    const uniqueMusic = Number(analytics.uniqueMusic)
        || Math.min(
            Array.isArray(analytics.topMusic) ? analytics.topMusic.length : trackPlays,
            uniqueTitles || trackPlays,
        );

    const hoursWatched = Number(analytics.hoursWatched)
        || Math.round(((moviePlays * 40 + episodePlays * 24 + trackPlays * 3.5) / 60) * 10) / 10;

    return {
        totalPlays,
        moviePlays,
        episodePlays,
        trackPlays,
        uniqueMovies,
        uniqueShows,
        uniqueMusic,
        uniqueTitles: uniqueTitles || uniqueMovies + uniqueShows + uniqueMusic,
        activeDays,
        longestStreak,
        currentStreak,
        weekendPlays: Number(analytics.weekendPlays) || 0,
        weekdayPlays: Number(analytics.weekdayPlays) || 0,
        bingeMax: Number(analytics.topBinge?.plays) || 0,
        maxDayPlays,
        libraryDiversity: Array.isArray(analytics.topLibraries) ? analytics.topLibraries.length : 0,
        hoursWatched,
        lateNightPlays: 0,
        earlyMorningPlays: 0,
        balancedMedia: moviePlays >= 10 && episodePlays >= 10 ? 1 : 0,
        musicAndMovies: moviePlays >= 1 && trackPlays >= 1 ? 1 : 0,
        threeMediaTypes: moviePlays >= 1 && episodePlays >= 1 && trackPlays >= 1 ? 1 : 0,
        ...emptyGenreStatFields(),
        level: 1,
    };
};

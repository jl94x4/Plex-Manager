/** XP and level math for the achievements system. */

export const DEFAULT_XP_WEIGHTS = Object.freeze({
    uniqueMovies: 20,
    uniqueShows: 15,
    uniqueMusic: 10,
    moviePlays: 8,
    episodePlays: 3,
    trackPlays: 1,
    // Disabled by default — totalPlays double-counts movie/episode/track plays.
    totalPlays: 0,
    activeDays: 8,
    longestStreak: 12,
    weekendPlays: 2,
    // Watch time is awarded as 1 XP per minute. Hours stays 0 so it does not double-count.
    minutesWatched: 1,
    hoursWatched: 0,
});

export const XP_WEIGHT_LABELS = Object.freeze({
    uniqueMovies: 'Unique movies',
    uniqueShows: 'Unique shows',
    uniqueMusic: 'Unique music',
    moviePlays: 'Movie plays',
    episodePlays: 'Episode plays',
    trackPlays: 'Track plays',
    totalPlays: 'Total plays (avoid — double-counts)',
    activeDays: 'Active days',
    longestStreak: 'Longest streak',
    weekendPlays: 'Weekend plays',
    minutesWatched: 'Minutes watched (1 XP / min)',
    hoursWatched: 'Hours watched (avoid — use minutes)',
});

const OLD_DEFAULT_HOURS_WEIGHT = 6;

export const normalizeXpWeights = (raw = {}) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const hasMinutesKey = Object.prototype.hasOwnProperty.call(source, 'minutesWatched');
    const hoursRaw = Number(source.hoursWatched);
    const looksLikeStockHours = !hasMinutesKey
        && (source.hoursWatched == null || hoursRaw === OLD_DEFAULT_HOURS_WEIGHT);

    const next = { ...DEFAULT_XP_WEIGHTS };
    if (looksLikeStockHours) {
        next.minutesWatched = 1;
        next.hoursWatched = 0;
    }
    for (const key of Object.keys(DEFAULT_XP_WEIGHTS)) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) next[key] = value;
    }
    if (looksLikeStockHours) {
        next.minutesWatched = 1;
        next.hoursWatched = 0;
    }
    return next;
};

const minutesFromStats = (stats = {}) => {
    const explicit = Math.max(0, Number(stats?.minutesWatched) || 0);
    if (explicit > 0) return explicit;
    return Math.round(Math.max(0, Number(stats?.hoursWatched) || 0) * 60);
};

export const computeXpBreakdown = (stats = {}, weights = DEFAULT_XP_WEIGHTS) => {
    const w = normalizeXpWeights(weights);
    const n = (key) => Math.max(0, Number(stats?.[key]) || 0);
    const minutes = minutesFromStats(stats);
    const parts = {
        uniqueMovies: Math.round(n('uniqueMovies') * w.uniqueMovies),
        uniqueShows: Math.round(n('uniqueShows') * w.uniqueShows),
        uniqueMusic: Math.round(n('uniqueMusic') * w.uniqueMusic),
        moviePlays: Math.round(n('moviePlays') * w.moviePlays),
        episodePlays: Math.round(n('episodePlays') * w.episodePlays),
        trackPlays: Math.round(n('trackPlays') * w.trackPlays),
        totalPlays: Math.round(n('totalPlays') * w.totalPlays),
        activeDays: Math.round(n('activeDays') * w.activeDays),
        longestStreak: Math.round(n('longestStreak') * w.longestStreak),
        weekendPlays: Math.round(n('weekendPlays') * w.weekendPlays),
        minutesWatched: Math.round(minutes * w.minutesWatched),
        hoursWatched: Math.round(n('hoursWatched') * w.hoursWatched),
    };
    const xp = Object.values(parts).reduce((sum, value) => sum + value, 0);
    return { xp, parts };
};

/**
 * XP floor for level L is ((L-1)^2) * K.
 * K=250 so 1 XP/minute does not skip early levels (a 2h title is 120 XP vs 250 to reach
 * level 2) and later rungs stay a long watch grind (level 30→31 is 14,750 XP ≈ 246 hours).
 */
export const XP_CURVE_K = 250;

export const levelFromXp = (xp) => {
    const value = Math.max(0, Number(xp) || 0);
    return Math.floor(Math.sqrt(value / XP_CURVE_K)) + 1;
};

export const xpForLevel = (level) => {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    return Math.round(((lvl - 1) ** 2) * XP_CURVE_K);
};

export const levelProgress = (xp) => {
    const level = levelFromXp(xp);
    const currentFloor = xpForLevel(level);
    const nextFloor = xpForLevel(level + 1);
    const span = Math.max(1, nextFloor - currentFloor);
    const into = Math.max(0, (Number(xp) || 0) - currentFloor);
    return {
        level,
        xpIntoLevel: into,
        xpForNextLevel: span,
        progressPct: Math.min(100, Math.round((into / span) * 100)),
        nextLevelXp: nextFloor,
    };
};

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
    hoursWatched: 6,
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
    hoursWatched: 'Hours watched',
});

export const normalizeXpWeights = (raw = {}) => {
    const next = { ...DEFAULT_XP_WEIGHTS };
    for (const key of Object.keys(DEFAULT_XP_WEIGHTS)) {
        const value = Number(raw?.[key]);
        if (Number.isFinite(value) && value >= 0 && value <= 100) next[key] = value;
    }
    return next;
};

export const computeXpBreakdown = (stats = {}, weights = DEFAULT_XP_WEIGHTS) => {
    const w = normalizeXpWeights(weights);
    const n = (key) => Math.max(0, Number(stats?.[key]) || 0);
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
        hoursWatched: Math.round(n('hoursWatched') * w.hoursWatched),
    };
    const xp = Object.values(parts).reduce((sum, value) => sum + value, 0);
    return { xp, parts };
};

/** Gentle curve so early levels come fast, later ones slow. */
export const levelFromXp = (xp) => {
    const value = Math.max(0, Number(xp) || 0);
    return Math.floor(Math.sqrt(value / 40)) + 1;
};

export const xpForLevel = (level) => {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    return Math.round(((lvl - 1) ** 2) * 40);
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

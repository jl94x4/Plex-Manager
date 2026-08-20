/**
 * Subject-scoped wrap-up for profile payloads.
 * Home's personal analytics builder fills titles/habits; this module merges
 * that with achievement snapshot counts and trims it for peer viewers.
 */

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const timeOfDayFromHour = (peakHour) => {
    if (peakHour >= 5 && peakHour < 12) return 'Early Bird';
    if (peakHour >= 12 && peakHour < 18) return 'Afternoon Watcher';
    if (peakHour >= 18) return 'Evening Streamer';
    return 'Night Owl';
};

const asNumber = (value) => Number(value) || 0;

const slimHistoryItem = (item = {}) => ({
    title: item.title || '',
    episodeTitle: item.episodeTitle || null,
    viewedAt: item.viewedAt || null,
    thumbUrl: item.thumbUrl || null,
    type: item.type || null,
});

const slimTitle = (item = null) => {
    if (!item || typeof item !== 'object') return null;
    return {
        title: item.title || '',
        type: item.type || null,
        plays: asNumber(item.plays),
        thumbUrl: item.thumbUrl || null,
        artUrl: item.artUrl || null,
        year: item.year || null,
        plexUrl: item.plexUrl || null,
    };
};

const slimNeighbour = (row = {}, obfuscate = false) => {
    const isMe = !!row.isMe;
    if (obfuscate && !isMe) {
        return {
            rank: row.rank,
            plays: row.plays,
            xp: row.xp,
            isMe: false,
            username: `Viewer ${row.rank}`,
        };
    }
    return {
        rank: row.rank,
        plays: row.plays,
        xp: row.xp,
        isMe,
        username: row.username,
        accountId: row.accountId,
    };
};

export const mergeProfileWrapUp = (snapshot = null, personal = null, identityXp) => {
    if (!snapshot && !personal) return null;
    if (!personal) return snapshot;
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
    return {
        ...snap,
        ...personal,
        totalPlays: Math.max(asNumber(snap.totalPlays), asNumber(personal.totalPlays)),
        hoursWatched: asNumber(snap.hoursWatched) || asNumber(personal.hoursWatched) || 0,
        uniqueTitles: asNumber(snap.uniqueTitles) || asNumber(personal.uniqueTitles) || 0,
        moviesCount: asNumber(snap.moviesCount) || asNumber(personal.moviesCount) || 0,
        showsCount: asNumber(snap.showsCount) || asNumber(personal.showsCount) || 0,
        musicCount: asNumber(snap.musicCount) || asNumber(personal.musicCount) || 0,
        leaderboardRank: snap.leaderboardRank ?? personal.leaderboardRank ?? null,
        totalActiveUsers: snap.totalActiveUsers || personal.totalActiveUsers || 0,
        leaderboardSource: snap.leaderboardSource || personal.leaderboardSource || 'achievements',
        leaderboardMetric: snap.leaderboardMetric || personal.leaderboardMetric || 'xp',
        myXp: identityXp ?? personal.myXp ?? snap.myXp,
        currentStreak: asNumber(snap.currentStreak) || asNumber(personal.currentStreak) || 0,
        longestStreak: asNumber(snap.longestStreak) || asNumber(personal.longestStreak) || 0,
        bingeMax: asNumber(snap.bingeMax) || asNumber(personal.bingeMax) || 0,
        activeDays: asNumber(snap.activeDays) || asNumber(personal.activeDays) || 0,
        period: personal.period || snap.period || 'last365',
    };
};

export const trimWrapUpForProfile = (payload, { isSelf = false, viewerIsAdmin = false, obfuscate = false } = {}) => {
    if (!payload || typeof payload !== 'object') return null;
    const includeFullHistory = !!(isSelf || viewerIsAdmin);
    const historyLimit = includeFullHistory ? 20 : 1;
    const listLimit = includeFullHistory ? 12 : 5;
    const recentHistory = Array.isArray(payload.recentHistory)
        ? payload.recentHistory.slice(0, historyLimit).map(slimHistoryItem)
        : [];
    const neighbourhood = Array.isArray(payload.leaderboardNeighbourhood)
        ? payload.leaderboardNeighbourhood.map((row) => slimNeighbour(row, obfuscate && !viewerIsAdmin))
        : [];
    return {
        totalPlays: asNumber(payload.totalPlays),
        hoursWatched: asNumber(payload.hoursWatched),
        moviesCount: asNumber(payload.moviesCount),
        showsCount: asNumber(payload.showsCount),
        musicCount: asNumber(payload.musicCount),
        uniqueTitles: asNumber(payload.uniqueTitles),
        weekdayPlays: asNumber(payload.weekdayPlays),
        weekendPlays: asNumber(payload.weekendPlays),
        peakHour: payload.peakHour ?? null,
        avgHour: payload.avgHour ?? null,
        timeOfDay: payload.timeOfDay || null,
        popularDay: payload.popularDay || null,
        favoriteLibrary: payload.favoriteLibrary || null,
        mediaPreference: payload.mediaPreference || null,
        watchStyle: payload.watchStyle || null,
        streamingHabit: payload.streamingHabit || null,
        topMovie: slimTitle(payload.topMovie),
        topBinge: slimTitle(payload.topBinge),
        topMovies: Array.isArray(payload.topMovies) ? payload.topMovies.slice(0, listLimit).map(slimTitle) : [],
        topShows: Array.isArray(payload.topShows) ? payload.topShows.slice(0, listLimit).map(slimTitle) : [],
        topWatched: Array.isArray(payload.topWatched) ? payload.topWatched.slice(0, listLimit).map(slimTitle) : [],
        topMusic: Array.isArray(payload.topMusic) ? payload.topMusic.slice(0, listLimit).map(slimTitle) : [],
        topLibraries: Array.isArray(payload.topLibraries)
            ? payload.topLibraries.slice(0, 5).map((row) => ({ title: row.title || '', plays: asNumber(row.plays) }))
            : [],
        dayOfWeekCounts: payload.dayOfWeekCounts || null,
        hourDistribution: Array.isArray(payload.hourDistribution) ? payload.hourDistribution.slice(0, 24) : null,
        heatmapData: includeFullHistory ? (payload.heatmapData || null) : null,
        recentHistory,
        leaderboardRank: payload.leaderboardRank ?? null,
        totalActiveUsers: asNumber(payload.totalActiveUsers),
        leaderboardSource: payload.leaderboardSource || null,
        leaderboardMetric: payload.leaderboardMetric || null,
        leaderboardNeighbourhood: neighbourhood,
        myXp: payload.myXp ?? null,
        myPlaysOnLeaderboard: payload.myPlaysOnLeaderboard ?? null,
        period: payload.period || 'last365',
        source: payload.source || null,
    };
};

export const wrapUpFromHistoryItems = (historyItems = []) => {
    const yearAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
    const items = (Array.isArray(historyItems) ? historyItems : [])
        .filter((item) => Number(item?.viewedAt) >= yearAgo)
        .sort((a, b) => (Number(b.viewedAt) || 0) - (Number(a.viewedAt) || 0));
    if (!items.length) {
        return {
            totalPlays: 0,
            topLibraries: [],
            topWatched: [],
            topMusic: [],
            recentHistory: [],
            period: 'last365',
        };
    }

    const hourDistribution = new Array(24).fill(0);
    const dayOfWeekCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const contentCounts = {};
    let moviesCount = 0;
    let showsCount = 0;
    let musicCount = 0;
    let hoursWatched = 0;

    const contentKeyOf = (item) => {
        if (item.type === 'episode') return String(item.grandparentKey || item.grandparentTitle || item.ratingKey || item.title);
        if (item.type === 'track') return String(item.parentKey || item.parentTitle || item.ratingKey || item.title);
        return String(item.ratingKey || item.key || item.title);
    };
    const contentTitleOf = (item) => {
        if (item.type === 'episode') return item.grandparentTitle || item.parentTitle || item.title;
        if (item.type === 'track') return item.parentTitle || item.grandparentTitle || item.title;
        return item.title;
    };
    const contentTypeOf = (item) => {
        if (item.type === 'episode') return 'show';
        if (item.type === 'track') return 'track';
        return item.type || 'movie';
    };

    for (const item of items) {
        const viewed = new Date((Number(item.viewedAt) || 0) * 1000);
        const hour = Number.isNaN(viewed.getTime()) ? 0 : viewed.getHours();
        const day = Number.isNaN(viewed.getTime()) ? 0 : viewed.getDay();
        hourDistribution[hour] += 1;
        dayOfWeekCounts[day] += 1;
        hoursWatched += (Number(item.duration) || 0) / 3600;
        if (item.type === 'movie') moviesCount += 1;
        else if (item.type === 'episode') showsCount += 1;
        else if (item.type === 'track') musicCount += 1;

        const key = contentKeyOf(item);
        if (!contentCounts[key]) {
            contentCounts[key] = {
                key,
                title: contentTitleOf(item),
                type: contentTypeOf(item),
                plays: 0,
                lastViewedAt: 0,
            };
        }
        contentCounts[key].plays += 1;
        if ((Number(item.viewedAt) || 0) >= contentCounts[key].lastViewedAt) {
            contentCounts[key].lastViewedAt = Number(item.viewedAt) || 0;
            contentCounts[key].title = contentTitleOf(item);
        }
    }

    const ranked = Object.values(contentCounts).sort((a, b) => b.plays - a.plays || b.lastViewedAt - a.lastViewedAt);
    const topMovies = ranked.filter((row) => row.type === 'movie').slice(0, 5);
    const topShows = ranked.filter((row) => row.type === 'show').slice(0, 5);
    const topMusic = ranked.filter((row) => row.type === 'track').slice(0, 5);
    const peakHour = hourDistribution.reduce((best, count, hour) => (
        count > hourDistribution[best] ? hour : best
    ), 0);
    const topDayEntry = Object.entries(dayOfWeekCounts)
        .map(([day, count]) => ({ day: Number(day), count: Number(count) || 0 }))
        .sort((a, b) => b.count - a.count)[0];
    const totalPlays = items.length;
    const weekendPlays = dayOfWeekCounts[0] + dayOfWeekCounts[6];
    const weekdayPlays = totalPlays - weekendPlays;
    let mediaPreference = 'Mixed Bag';
    if (totalPlays > 0) {
        if (moviesCount / totalPlays >= 0.6) mediaPreference = 'Movie Buff';
        else if (showsCount / totalPlays >= 0.6) mediaPreference = 'TV Show Binger';
        else if (musicCount / totalPlays >= 0.6) mediaPreference = 'Music Lover';
    }
    let watchStyle = 'Explorer';
    const uniqueTitles = ranked.length;
    if (totalPlays > 0 && uniqueTitles > 0) {
        if (totalPlays / uniqueTitles > 3) watchStyle = 'Comfort Binger';
        else if (totalPlays / uniqueTitles > 1.5) watchStyle = 'Loyal Fan';
    }
    let streamingHabit = 'Balanced Streamer';
    if (totalPlays > 0) {
        if (weekendPlays / totalPlays >= 0.5) streamingHabit = 'Weekend Warrior';
        else if (weekdayPlays / totalPlays >= 0.8) streamingHabit = 'Weekday Streamer';
    }

    const recentHistory = items.slice(0, 20).map((item) => ({
        title: contentTitleOf(item),
        episodeTitle: item.type === 'episode' || item.type === 'track' ? item.title : null,
        viewedAt: item.viewedAt,
        type: item.type,
        thumbUrl: null,
    }));

    return {
        totalPlays,
        hoursWatched,
        moviesCount,
        showsCount,
        musicCount,
        uniqueTitles,
        weekdayPlays,
        weekendPlays,
        peakHour,
        avgHour: peakHour,
        timeOfDay: timeOfDayFromHour(peakHour),
        popularDay: topDayEntry?.count > 0 ? DAYS_OF_WEEK[topDayEntry.day] : 'Unknown',
        favoriteLibrary: 'None',
        mediaPreference,
        watchStyle,
        streamingHabit,
        topMovie: topMovies[0] || null,
        topBinge: topShows[0] || null,
        topMovies,
        topShows,
        topWatched: ranked.filter((row) => row.type !== 'track').slice(0, 12),
        topMusic,
        topLibraries: [],
        dayOfWeekCounts,
        hourDistribution,
        recentHistory,
        period: 'last365',
        source: 'jellyfin',
    };
};

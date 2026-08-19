const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const timeOfDayFromHour = (peakHour: number) => {
    if (peakHour >= 5 && peakHour < 12) return 'Early Bird';
    if (peakHour >= 12 && peakHour < 18) return 'Afternoon Watcher';
    if (peakHour >= 18) return 'Evening Streamer';
    return 'Night Owl';
};

export const mapJellyfinHomeAnalytics = (data: any) => {
    const topMovies = Array.isArray(data?.topMovies) ? data.topMovies : [];
    const topShows = Array.isArray(data?.topShows) ? data.topShows : [];
    const topMusic = Array.isArray(data?.topMusic) ? data.topMusic : [];
    const topWatched = [...topShows, ...topMovies, ...topMusic].sort((a: any, b: any) => (b.plays || 0) - (a.plays || 0));
    const peakHours = Array.isArray(data?.peakHours) ? data.peakHours : [];
    const peakHour = peakHours.reduce((best: number, value: number, hour: number) => (
        value > (peakHours[best] || 0) ? hour : best
    ), 0);
    const dayOfWeekCounts = data?.dayOfWeekCounts && Object.keys(data.dayOfWeekCounts).length > 0
        ? data.dayOfWeekCounts
        : Object.entries(data?.heatmapData || {}).reduce((counts: Record<number, number>, [dateKey, count]) => {
            const date = new Date(`${dateKey}T00:00:00`);
            if (!Number.isNaN(date.getTime())) {
                const day = date.getDay();
                counts[day] = (counts[day] || 0) + (Number(count) || 0);
            }
            return counts;
        }, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 });
    const topDayEntry = Object.entries(dayOfWeekCounts)
        .map(([day, count]) => ({ day: Number(day), count: Number(count) || 0 }))
        .sort((a, b) => b.count - a.count)[0];
    const moviesCount = data?.jellystatInsights?.moviePlays || topMovies.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const showsCount = data?.jellystatInsights?.tvPlays || topShows.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const musicCount = data?.jellystatInsights?.musicPlays || topMusic.reduce((sum: number, item: any) => sum + (item.plays || 0), 0);
    const topMovie = topMovies[0] || null;
    const topBinge = topShows[0] || null;
    const topLibraries = Array.isArray(data?.topLibraries) ? data.topLibraries : [];

    return {
        totalPlays: data?.totalPlaybacks || data?.jellystatInsights?.totalPlays || 0,
        moviesCount,
        showsCount,
        musicCount,
        topWatched,
        recentHistory: [],
        topMovie: topMovie ? { ...topMovie, artUrl: topMovie.thumbUrl } : null,
        topBinge: topBinge ? { ...topBinge, artUrl: topBinge.thumbUrl } : null,
        peakHour,
        avgHour: peakHour,
        timeOfDay: timeOfDayFromHour(peakHour),
        popularDay: topDayEntry && topDayEntry.count > 0 ? DAYS_OF_WEEK[topDayEntry.day] : 'Recent Activity',
        dayOfWeekCounts,
        favoriteLibrary: topLibraries[0]?.title || 'None',
        topLibraries,
        mediaPreference: moviesCount > showsCount ? 'Movie Fan' : 'TV Binger',
        watchStyle: topWatched.length >= 10 ? 'Explorer' : 'Focused',
        uniqueTitles: topWatched.length,
        streamingHabit: 'Jellyfin Viewer',
        weekdayPlays: data?.totalPlaybacks || 0,
        weekendPlays: 0,
        leaderboardRank: data?.leaderboardRank || null,
        totalActiveUsers: data?.totalActiveUsers || 0,
        myPlaysOnLeaderboard: data?.myPlaysOnLeaderboard ?? null,
        myXp: data?.myXp ?? null,
        leaderboardNeighbourhood: data?.leaderboardNeighbourhood || [],
        leaderboardSource: data?.leaderboardSource || 'period_plays',
        leaderboardMetric: data?.leaderboardMetric || 'plays',
        heatmapData: data?.heatmapData || null,
    };
};

export const mergeProfileWrapUp = (snapshot: any, personal: any, identityXp?: number) => {
    if (!snapshot && !personal) return null;
    if (!personal) return snapshot;
    const snap = snapshot || {};
    return {
        ...snap,
        ...personal,
        totalPlays: Math.max(Number(snap.totalPlays) || 0, Number(personal.totalPlays) || 0),
        hoursWatched: Number(snap.hoursWatched) || Number(personal.hoursWatched) || 0,
        uniqueTitles: Number(snap.uniqueTitles) || Number(personal.uniqueTitles) || 0,
        moviesCount: Number(snap.moviesCount) || Number(personal.moviesCount) || 0,
        showsCount: Number(snap.showsCount) || Number(personal.showsCount) || 0,
        musicCount: Number(snap.musicCount) || Number(personal.musicCount) || 0,
        leaderboardRank: snap.leaderboardRank ?? personal.leaderboardRank ?? null,
        totalActiveUsers: snap.totalActiveUsers || personal.totalActiveUsers || 0,
        leaderboardSource: snap.leaderboardSource || personal.leaderboardSource || 'achievements',
        leaderboardMetric: snap.leaderboardMetric || personal.leaderboardMetric || 'xp',
        myXp: identityXp ?? personal.myXp,
        currentStreak: Number(snap.currentStreak) || Number(personal.currentStreak) || 0,
        longestStreak: Number(snap.longestStreak) || Number(personal.longestStreak) || 0,
        bingeMax: Number(snap.bingeMax) || Number(personal.bingeMax) || 0,
        activeDays: Number(snap.activeDays) || Number(personal.activeDays) || 0,
    };
};

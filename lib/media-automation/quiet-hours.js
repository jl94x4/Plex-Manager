/**
 * Quiet hours helper for Media Automation worker gating.
 * Start/end are "HH:MM" in 24h local time (or the host timezone).
 * When start > end, the window wraps midnight (e.g. 23:00 → 07:00).
 */

const parseHm = (value, fallbackMinutes) => {
    const raw = String(value || '').trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!match) return fallbackMinutes;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
        return fallbackMinutes;
    }
    return (hours * 60) + minutes;
};

export const minutesSinceMidnight = (date = new Date()) => (
    (date.getHours() * 60) + date.getMinutes()
);

export const isQuietHoursActive = (settings = {}, date = new Date()) => {
    if (settings.quietHoursEnabled !== true) return false;
    const start = parseHm(settings.quietHoursStart, 23 * 60);
    const end = parseHm(settings.quietHoursEnd, 7 * 60);
    const now = minutesSinceMidnight(date);
    if (start === end) return true; // full-day quiet when equal
    if (start < end) return now >= start && now < end;
    return now >= start || now < end;
};

export default isQuietHoursActive;

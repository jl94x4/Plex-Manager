export const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Never';
    return dateString.split('T')[0];
};

/** Parse ISO / date-only strings as local calendar days so UTC midnight cannot shift the date. */
export const parseLocalDate = (dateString: string | null | undefined): Date | null => {
    if (!dateString) return null;
    const datePart = String(dateString).split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    if (year && month && day) return new Date(year, month - 1, day);
    const parsed = new Date(dateString);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** UK display date, e.g. 15 Jul 2023. */
export const formatUkDate = (dateString: string | null | undefined): string => {
    const date = parseLocalDate(dateString);
    if (!date) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const daysSinceDate = (dateString: string | null | undefined): number | null => {
    const date = parseLocalDate(dateString);
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
};

export const getDaysUntilExpiry = (expiryDate: string | null): number | null => {
    if (!expiryDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const datePart = expiryDate.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    const expiry = new Date(year, month - 1, day);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

export const addMonths = (date: Date, months: number): Date => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
};

export const addYears = (date: Date, years: number): Date => {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + years);
    return d;
};

export const getAccessProgressPct = (
    expiryDate: string | null,
    joiningDate?: string | null,
): number => {
    const daysLeft = getDaysUntilExpiry(expiryDate);
    if (daysLeft === null) return 100;
    if (expiryDate && joiningDate) {
        const join = new Date(joiningDate);
        join.setHours(0, 0, 0, 0);
        const expiry = new Date(expiryDate.split('T')[0]);
        expiry.setHours(0, 0, 0, 0);
        const totalDays = Math.max(1, Math.round((expiry.getTime() - join.getTime()) / (1000 * 60 * 60 * 24)));
        return Math.min(100, Math.max(0, (daysLeft / totalDays) * 100));
    }
    return Math.min(100, Math.max(0, (daysLeft / 365) * 100));
};

/** Format a 0–23 hour for streaming stats (e.g. 22 → "10:00 PM"). */
export const formatStreamingHour = (hour24: number | null | undefined): string => {
    if (hour24 == null || Number.isNaN(hour24)) return 'Unknown';
    const hour = Math.max(0, Math.min(23, Math.round(hour24)));
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:00 ${period}`;
};

export const formatTime = (date: Date) => {
    try {
        const is24 = typeof window !== 'undefined' && (window as any).__USE_24_HOUR_CLOCK__ === true;
        const str = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !is24 });
        return is24 ? str : str.replace(/^0:/, '12:');
    } catch {
        return '--:--';
    }
};

export const formatEventName = (event: string): string => {
    return event.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export const formatDateTime = (dateString?: string): string => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const hexToRgb = (hex: string) => {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return `${r} ${g} ${b}`;
};

export const accentHoverRgb = (hex: string) => {
    const [r, g, b] = hexToRgb(hex).split(' ').map(Number);
    const lift = (value: number) => Math.min(255, Math.round(value + (255 - value) * 0.18));
    return `${lift(r)} ${lift(g)} ${lift(b)}`;
};

/** Round storage up to the nearest whole MB, GB, TB, or PB. */
export const formatSizeCeil = (bytes: number): string => {
    const safe = Math.max(0, Number(bytes) || 0);
    if (safe === 0) return '0 MB';
    const mb = safe / (1024 ** 2);
    const gb = safe / (1024 ** 3);
    const tb = safe / (1024 ** 4);
    const pb = safe / (1024 ** 5);
    if (pb >= 1) return `${Math.ceil(pb)} PB`;
    if (tb >= 1) return `${Math.ceil(tb)} TB`;
    if (gb >= 1) return `${Math.ceil(gb)} GB`;
    return `${Math.ceil(mb)} MB`;
};

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Home, Film, Activity, Sparkles, LogOut, Settings, FileText, BarChart3, Users, PlaySquare, TrendingUp, X, Star, Layers, HardDrive, Calendar, Tv, Clock, DownloadCloud, MonitorSmartphone, Copy, ChevronUp, ChevronDown, List, Palette, Music, Play, Pause, Upload, Shield, CheckCircle, AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Trophy, PlayCircle, Coffee, Compass, PieChart, Clapperboard, AlertTriangle, Check, Cpu, Monitor, LineChart as LucideLineChart, Share2, Search, BookOpen, Loader2, Eye, EyeOff, ClipboardList, ArrowUpCircle, MoreHorizontal, ExternalLink, Info, GitFork, MapPin, Radar } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

import { SettingsDashboard } from './settings/SettingsDashboard';
import { LibraryMaintenancePanel } from './maintenance/LibraryMaintenancePanel';
import { appConfirm } from './shared/confirm';
import { apiFetch } from './shared/api';
import { getPublicOrigin, logoUrl, portalUrl, resolvePortalAssetUrl, stripBasePath } from './shared/basePath';
import { formatDate, getDaysUntilExpiry, getAccessProgressPct, addMonths, addYears, formatTime, formatEventName, formatDateTime, hexToRgb, formatSizeCeil, formatStreamingHour } from './shared/format';
import { CustomSelect, ConfirmModal, StyledCheckbox, ScrollReveal } from './shared/ui';
import { PeriodDropdown } from './shared/PeriodDropdown';
import { ActivityHeatmap } from './shared/ActivityHeatmap';
import { Loader, Toast, ToastContainer, pushToast } from './shared/toast';
import { NoPosterPlaceholder } from './shared/NoPosterPlaceholder';
import {
    ActivityGridSkeleton,
    DiscoverPageSkeleton,
    HomeRecentlyAddedSkeleton,
    LibraryStatsSkeleton,
    TopWatchedGridSkeleton,
    TrendingSectionsSkeleton,
    WrapUpCardsSkeleton,
} from './shared/skeletons';
import type { User, PlexConfig, AppSettings, PlexServer, ToastMessage, DeletedUser, AuditEntry, UserStatus } from './shared/types';
import { ShareWrapUpModal } from './shared/ShareWrapUp';
import { WrapUpCardGrid } from './shared/WrapUpCards';
import { SetupWizard } from './setup/SetupWizard';
import { DiscoveryDashboard } from './discovery/DiscoveryDashboard';
import { AuthPageBackground, themeClasses, SlideshowBackground } from './shared/theme';
import { activityStreamColumnCount, activityStreamGridClass, upgraderPosterGridClass, upgraderPosterGridStyle, type UpgraderGridSize } from './shared/portalLayout';
import { DiscoverGridSizeSelect } from './discovery/DiscoverGridSizeSelect';
import { useDiscoverGridSize } from './discovery/useDiscoverGridSize';
import { DiscoverLocaleSelect } from './discovery/i18n/DiscoverLocaleSelect';
import { filterNavOrder, ensureCompleteNavOrder, MOBILE_NAV_PRIMARY_SLOTS, type NavFeatureFlags } from './shared/nav';
import { isFirefoxMobileClient, useFirefoxMobileNavShell } from './shared/useFirefoxMobileNavShell';
import {
    STATUS_PERIODS,
    barsForPeriod,
    fleetUptimeForPeriod,
    formatDurationShort,
    formatLatencyMs,
    historyRowsForPeriod,
    incidentsForPeriod,
    latencySeriesForPeriod,
    periodStats,
    statusToneFromPct,
    uptimeForPeriod,
    type StatusPeriod,
} from './shared/statusHealth';
import { StatusSpeedTest } from './shared/StatusSpeedTest';
import { ANALYTICS_PERIOD_OPTIONS, persistAnalyticsDays, readPersistedAnalyticsDays } from './shared/analyticsPeriodOptions';
import { UserDashboardLayout } from './home/UserDashboardLayout';
import { createBazarrToolsSectionRenderer, createMainGridWidgetRenderer, createMediaAutomationSectionRenderer, createPendingRequestsSectionRenderer, createRecentlyAddedWidgetRenderer, createScannerSectionRenderer } from './home/userDashboardWidgetRenderers';
import {
    DEFAULT_DASHBOARD_LAYOUT,
    DASHBOARD_SECTION_LABELS,
    MAIN_GRID_WIDGET_META,
    RECENTLY_ADDED_WIDGET_META,
    normalizeSectionLayout,
    type DashboardLayoutConfig,
    type DashboardSectionId,
    type DashboardWidgetId,
    type DashboardWidgetSize,
    type MainGridWidgetId,
    type RecentlyAddedWidgetId,
} from './shared/dashboardLayout';

const JELLYFIN_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/jellyfin.svg';
const STATUS_ICON_BASE = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg';
const SIMPLE_STATUS_ICON_BASE = 'https://cdn.simpleicons.org';
const STATUS_SERVICE_ICONS: Record<string, string> = {
    plex: `${STATUS_ICON_BASE}/plex.svg`,
    jellyfin: `${STATUS_ICON_BASE}/jellyfin.svg`,
    emby: `${STATUS_ICON_BASE}/emby.svg`,
    tautulli: `${STATUS_ICON_BASE}/tautulli.svg`,
    jellystat: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/jellystat.png',
    sonarr: `${STATUS_ICON_BASE}/sonarr.svg`,
    radarr: `${STATUS_ICON_BASE}/radarr.svg`,
    lidarr: `${STATUS_ICON_BASE}/lidarr.svg`,
    bazarr: `${STATUS_ICON_BASE}/bazarr.svg`,
    qbittorrent: `${STATUS_ICON_BASE}/qbittorrent.svg`,
    transmission: `${STATUS_ICON_BASE}/transmission.svg`,
    bittorrent: `${SIMPLE_STATUS_ICON_BASE}/bittorrent`,
    deluge: `${STATUS_ICON_BASE}/deluge.svg`,
    sabnzbd: `${STATUS_ICON_BASE}/sabnzbd.svg`,
    seerr: `${STATUS_ICON_BASE}/seerr.svg`,
    overseerr: `${STATUS_ICON_BASE}/seerr.svg`,
    jellyseerr: `${STATUS_ICON_BASE}/jellyseerr.svg`,
    ombi: `${STATUS_ICON_BASE}/ombi.svg`,
};

const getStatusServiceIconKey = (service: any) => {
    if (service?.clientType) return String(service.clientType).toLowerCase();
    const id = String(service?.id || '').toLowerCase();
    const name = String(service?.name || '').toLowerCase();
    for (const key of Object.keys(STATUS_SERVICE_ICONS)) {
        if (id.includes(key) || name.includes(key)) return key;
    }
    return '';
};

const StatusServiceIcon: React.FC<{ service: any }> = ({ service }) => {
    const key = getStatusServiceIconKey(service);
    const iconUrl = key ? STATUS_SERVICE_ICONS[key] : '';
    return (
        <span className="inline-flex w-10 h-10 rounded-lg bg-white/5 border border-white/10 items-center justify-center overflow-hidden flex-shrink-0">
            {iconUrl ? (
                <img src={iconUrl} alt="" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
                <Activity className="w-5 h-5 text-plex" />
            )}
        </span>
    );
};

const jellyfinQuickConnectUrl = (baseUrl: string) => {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    return base ? `${base}/web/#/quickconnect` : '';
};

const copyTextToClipboard = async (value: string) => {
    if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
};

declare global {
    interface Window {
        __USE_24_HOUR_CLOCK__?: boolean;
    }
}

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};


export const updateFavicon = (thumbUrl: string | null | undefined) => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.appendChild(link);
    }
    let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
    if (!appleLink) {
        appleLink = document.createElement('link');
        appleLink.rel = 'apple-touch-icon';
        appleLink.setAttribute('sizes', '180x180');
        document.head.appendChild(appleLink);
    }
    let href = logoUrl();
    if (thumbUrl) {
        if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://')) {
            href = thumbUrl;
        } else if (thumbUrl.startsWith('/api/') || thumbUrl.startsWith('/static/')) {
            href = resolvePortalAssetUrl(thumbUrl);
        } else {
            href = portalUrl(`/api/plex/image?path=${encodeURIComponent(thumbUrl)}&width=180&height=180`);
        }
    }
    link.href = href;
    appleLink.href = href;
};

// --- Components ---

const SettingsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.44,0.17-0.48,0.41L9.22,5.72C8.63,5.96,8.1,6.29,7.6,6.67L5.21,5.71C4.99,5.62,4.74,5.7,4.62,5.92L2.7,9.24 c-0.11,0.2-0.06,0.47,0.12,0.61L4.85,11c-0.04,0.3-0.06,0.61-0.06,0.94c0,0.32,0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.38,2.91 c0.04,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44,0.17,0.48,0.41l0.38-2.91c0.59-0.24,1.12-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
    </svg>
);

const UserCard: React.FC<{
    user: User;
    onEdit: () => void;
    onDelete: () => void;
    onRevoke: () => void;
    onViewAs?: () => void;
    isConfigured: boolean;
    isSelected: boolean;
    onSelect: (id: string) => void;
    providerLabel?: string;
}> = ({ user, onEdit, onDelete, onRevoke, onViewAs, isConfigured, isSelected, onSelect, providerLabel = 'Plex' }) => {
    const { status, statusText, daysRemainingText, pillClass, borderClass, glowClass } = useMemo(() => {
        const days = getDaysUntilExpiry(user.expiryDate);
        let status: UserStatus = 'active';
        let statusText = 'Active';
        let daysRemainingText = '';
        let pillClass = 'bg-green-500/10 text-green-400 border border-green-500/20';
        let borderClass = 'border-green-500/30';
        let glowClass = 'hover:border-green-500/50 hover:shadow-[0_0_15px_rgba(34,197,94,0.12)]';

        if (days === null) {
            status = 'active';
            statusText = 'Active';
            daysRemainingText = 'Access never expires.';
        } else if (days < 0) {
            status = 'expired';
            statusText = 'Expired';
            daysRemainingText = `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`;
            pillClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
            borderClass = 'border-red-500/30';
            glowClass = 'hover:border-red-500/50 hover:shadow-[0_0_15px_rgba(239,68,68,0.12)]';
        } else if (days <= 30) {
            status = 'expiring';
            statusText = 'Expiring Soon';
            daysRemainingText = days === 0 ? 'Expires today.' : `Expires in ${days} day${days === 1 ? '' : 's'}.`;
            pillClass = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
            borderClass = 'border-orange-500/30';
            glowClass = 'hover:border-orange-500/50 hover:shadow-[0_0_15px_rgba(249,115,22,0.12)]';
        } else {
            daysRemainingText = `Expires in ${days} day${days === 1 ? '' : 's'}.`;
        }

        return { status, statusText, daysRemainingText, pillClass, borderClass, glowClass };
    }, [user.expiryDate]);

    const handleCardClick = () => {
        onSelect(user.id);
    }

    return (
        <div className={`bg-card/45 backdrop-blur-md rounded-xl p-5 shadow-lg border border-white/5 border-l-4 ${borderClass} ${glowClass} hover:-translate-y-1 hover:scale-[1.01] transition-all duration-300 flex flex-col relative cursor-pointer ${isSelected ? 'border-plex/40 shadow-[0_0_15px_rgba(229,160,13,0.12)] bg-card/75' : ''}`} onClick={handleCardClick}>
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <input className="w-4 h-4 flex-shrink-0 appearance-none rounded-full border border-muted checked:bg-plex checked:border-plex transition-colors cursor-pointer relative checked:after:content-[''] checked:after:block checked:after:w-1.5 checked:after:h-1.5 checked:after:bg-background checked:after:rounded-full checked:after:absolute checked:after:top-1/2 checked:after:left-1/2 checked:after:-translate-x-1/2 checked:after:-translate-y-1/2"
                        type="checkbox"
                        checked={isSelected}
                        readOnly
                        style={{ borderRadius: '50%' }}
                    />
                    {user.thumb ? (
                        <img src={resolvePortalAssetUrl(user.thumb)} alt={user.username} className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center text-text font-bold text-xs uppercase flex-shrink-0">
                            {user.username.substring(0, 2)}
                        </div>
                    )}
                    <div className="flex flex-col min-w-0 pr-1">
                        <h3 className="text-sm font-bold truncate leading-tight" title={user.username}>{user.username}</h3>
                        {user.email && <span className="text-[10px] text-muted truncate mt-0.5" title={user.email}>{user.email}</span>}
                    </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${pillClass}`}>{statusText}</span>
            </div>
            <div className="flex flex-col gap-2 mt-3 flex-grow">
                <div className="flex justify-between items-center text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Joined</span>
                    <span className="text-text font-medium">{formatDate(user.joiningDate)}</span>
                </div>
                <div className="flex justify-between items-start text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0 gap-2">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold flex-shrink-0 pt-0.5">Expires</span>
                    <span className="text-text font-medium flex flex-col items-end text-right">
                        <span className="whitespace-nowrap font-bold">{formatDate(user.expiryDate)}</span> 
                        <span className="text-[9px] text-muted mt-0.5">{daysRemainingText}</span>
                    </span>
                </div>
                <div className="flex justify-between items-center text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold">{providerLabel}</span>
                    <span className="info-value plex-status flex items-center gap-1.5">
                        <span className={`plex-status-dot ${user.plexAccessStatus || 'unknown'}`}></span>
                        <span className="text-text font-medium text-xs">{(user.plexAccessStatus || 'unknown').charAt(0).toUpperCase() + (user.plexAccessStatus || 'unknown').slice(1)}</span>
                    </span>
                </div>
                <div className="flex justify-between items-center text-xs pb-1.5 border-b border-white/5 last:border-0 last:pb-0">
                    <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Last Login</span>
                    <span className="text-text font-medium">{user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</span>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-auto pt-4" onClick={e => e.stopPropagation()}>
                {onViewAs && (
                    <button className="px-3 py-1.5 bg-plex/15 text-plex border border-plex/30 rounded-md text-xs font-semibold hover:bg-plex/25 transition-colors flex items-center justify-center gap-1.5" onClick={onViewAs} title="View portal as this user">
                        <Eye className="w-3.5 h-3.5" />
                        View as
                    </button>
                )}
                <button className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80 transition-colors flex items-center justify-center gap-1.5" onClick={onEdit}>Edit</button>
                <button className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80 transition-colors flex items-center justify-center gap-1.5" onClick={onDelete}>Delete</button>
                {status === 'expired' && user.plexAccessStatus !== 'revoked' && (
                    <button className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80 transition-colors flex items-center justify-center gap-1.5" onClick={onRevoke} disabled={!isConfigured}>Revoke</button>
                )}
            </div>
        </div>
    );
};

const UserModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (user: User) => void; user: User | null }> = ({ isOpen, onClose, onSave, user }) => {
    const [username, setUsername] = useState('');
    const [joiningDate, setJoiningDate] = useState(formatDate(new Date().toISOString()));
    const [expiryDate, setExpiryDate] = useState<string | null>(formatDate(addMonths(new Date(), 1).toISOString()));
    const [exemptFromCleanup, setExemptFromCleanup] = useState(false);
    const [optOutNewsletter, setOptOutNewsletter] = useState(false);
    const [overrideMovieQuota, setOverrideMovieQuota] = useState(false);
    const [movieQuotaLimit, setMovieQuotaLimit] = useState(0);
    const [movieQuotaDays, setMovieQuotaDays] = useState(7);
    const [overrideTvQuota, setOverrideTvQuota] = useState(false);
    const [tvQuotaLimit, setTvQuotaLimit] = useState(0);
    const [tvQuotaDays, setTvQuotaDays] = useState(7);
    const [allowRequestMovies, setAllowRequestMovies] = useState<'default' | 'on' | 'off'>('default');
    const [allowRequestTv, setAllowRequestTv] = useState<'default' | 'on' | 'off'>('default');
    const [allowRequest4kMovies, setAllowRequest4kMovies] = useState<'default' | 'on' | 'off'>('default');
    const [allowRequest4kTv, setAllowRequest4kTv] = useState<'default' | 'on' | 'off'>('default');
    const [allowAdvancedRequests, setAllowAdvancedRequests] = useState<'default' | 'on' | 'off'>('default');

    const triFrom = (value: boolean | null | undefined): 'default' | 'on' | 'off' => {
        if (value === true) return 'on';
        if (value === false) return 'off';
        return 'default';
    };
    const triTo = (value: 'default' | 'on' | 'off'): boolean | null => {
        if (value === 'on') return true;
        if (value === 'off') return false;
        return null;
    };

    useEffect(() => {
        if (user) {
            setUsername(user.username);
            setJoiningDate(formatDate(user.joiningDate));
            setExpiryDate(user.expiryDate ? formatDate(user.expiryDate) : null);
            setExemptFromCleanup(!!user.exemptFromCleanup);
            setOptOutNewsletter(!!user.optOutNewsletter);
            const ov = user.requestOverrides || {};
            setOverrideMovieQuota(ov.movieQuotaLimit != null);
            setMovieQuotaLimit(Number(ov.movieQuotaLimit) || 0);
            setMovieQuotaDays(Number(ov.movieQuotaDays) || 7);
            setOverrideTvQuota(ov.tvQuotaLimit != null);
            setTvQuotaLimit(Number(ov.tvQuotaLimit) || 0);
            setTvQuotaDays(Number(ov.tvQuotaDays) || 7);
            setAllowRequestMovies(triFrom(ov.allowRequestMovies));
            setAllowRequestTv(triFrom(ov.allowRequestTv));
            setAllowRequest4kMovies(triFrom(ov.allowRequest4kMovies));
            setAllowRequest4kTv(triFrom(ov.allowRequest4kTv));
            setAllowAdvancedRequests(triFrom(ov.allowAdvancedRequests));
        } else {
            setUsername('');
            setJoiningDate(formatDate(new Date().toISOString()));
            setExpiryDate(formatDate(addMonths(new Date(), 1).toISOString()));
            setExemptFromCleanup(false);
            setOptOutNewsletter(false);
            setOverrideMovieQuota(false);
            setMovieQuotaLimit(0);
            setMovieQuotaDays(7);
            setOverrideTvQuota(false);
            setTvQuotaLimit(0);
            setTvQuotaDays(7);
            setAllowRequestMovies('default');
            setAllowRequestTv('default');
            setAllowRequest4kMovies('default');
            setAllowRequest4kTv('default');
            setAllowAdvancedRequests('default');
        }
    }, [user, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!user) return;
        const requestOverrides: User['requestOverrides'] = {
            movieQuotaLimit: overrideMovieQuota ? movieQuotaLimit : null,
            movieQuotaDays: overrideMovieQuota ? movieQuotaDays : null,
            tvQuotaLimit: overrideTvQuota ? tvQuotaLimit : null,
            tvQuotaDays: overrideTvQuota ? tvQuotaDays : null,
            fourKQuotaLimit: null,
            fourKQuotaDays: null,
            allowRequestMovies: triTo(allowRequestMovies),
            allowRequestTv: triTo(allowRequestTv),
            allowRequest4kMovies: triTo(allowRequest4kMovies),
            allowRequest4kTv: triTo(allowRequest4kTv),
            allowAdvancedRequests: triTo(allowAdvancedRequests),
        };
        const updatedUser: User = { ...user, expiryDate, exemptFromCleanup, optOutNewsletter, requestOverrides };
        onSave(updatedUser);
    };

    const handleQuickAction = (action: 'addMonth' | 'addYear' | 'unlimited') => {
        const baseDate = expiryDate ? new Date(expiryDate) : new Date();
        // Adjust for timezone when creating date from YYYY-MM-DD input
        if (expiryDate) baseDate.setMinutes(baseDate.getMinutes() + baseDate.getTimezoneOffset());

        switch (action) {
            case 'addMonth': setExpiryDate(formatDate(addMonths(baseDate, 1).toISOString())); break;
            case 'addYear': setExpiryDate(formatDate(addYears(baseDate, 1).toISOString())); break;
            case 'unlimited': setExpiryDate(null); break;
        }
    };

    const permSelect = (
        label: string,
        value: 'default' | 'on' | 'off',
        onChange: (v: 'default' | 'on' | 'off') => void,
    ) => (
        <div>
            <label className="text-xs font-semibold text-muted mb-1 block">{label}</label>
            <CustomSelect
                value={value}
                onChange={(val) => onChange((val as 'default' | 'on' | 'off') || 'default')}
                options={[
                    { value: 'default', label: 'Use global default' },
                    { value: 'on', label: 'Allow' },
                    { value: 'off', label: 'Deny' },
                ]}
            />
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[1000] p-3 sm:p-6" onClick={onClose}>
            <div className="bg-card p-4 md:p-6 lg:p-8 rounded-2xl w-full max-w-lg md:max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl border border-border" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-text mb-4">Edit User</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label>Plex Username</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" type="text" value={username} disabled />
                    </div>
                    <div>
                        <label>Joining Date</label>
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" type="date" value={joiningDate} disabled />
                    </div>
                </div>
                <div className="mb-4">
                    <label htmlFor="expiryDate">Expiry Date</label>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                        <input className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all" id="expiryDate" type="date" value={expiryDate ?? ''} onChange={(e) => setExpiryDate(e.target.value)} />
                        <div className="grid grid-cols-3 gap-2 md:w-[240px]">
                            <button type="button" className="w-full h-11 px-3 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center text-sm whitespace-nowrap" onClick={() => handleQuickAction('addMonth')}>+1M</button>
                            <button type="button" className="w-full h-11 px-3 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center text-sm whitespace-nowrap" onClick={() => handleQuickAction('addYear')}>+1Y</button>
                            <button type="button" className="w-full h-11 px-3 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center text-sm whitespace-nowrap" onClick={() => handleQuickAction('unlimited')}>Unlimited</button>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div className="flex items-center justify-between bg-black/10 p-4 rounded-lg border border-border gap-3">
                        <div className="min-w-0">
                            <label className="font-bold block mb-1">Exempt from Cleanup</label>
                            <span className="text-xs text-muted block">Prevent automated inactive user removal</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setExemptFromCleanup(!exemptFromCleanup)}
                            className={`relative inline-flex items-center h-6 rounded-full w-11 shrink-0 transition-colors ${exemptFromCleanup ? 'bg-plex' : 'bg-border'}`}
                        >
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${exemptFromCleanup ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <div className="flex items-center justify-between bg-black/10 p-4 rounded-lg border border-border gap-3">
                        <div className="min-w-0">
                            <label className="font-bold block mb-1">Disable Newsletter</label>
                            <span className="text-xs text-muted block">Stop automated emails for this user</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOptOutNewsletter(!optOutNewsletter)}
                            className={`relative inline-flex items-center h-6 rounded-full w-11 shrink-0 transition-colors ${optOutNewsletter ? 'bg-plex' : 'bg-border'}`}
                        >
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${optOutNewsletter ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </div>

                <div className="mt-2 pt-4 border-t border-border">
                    <h3 className="text-lg font-bold text-text mb-1">Requests</h3>
                    <p className="text-xs text-muted mb-4">Defaults come from Settings → Request Discovery. Override only what this user needs.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="p-3 rounded-lg border border-border bg-black/10 space-y-2">
                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                                <input type="checkbox" checked={overrideMovieQuota} onChange={(e) => setOverrideMovieQuota(e.target.checked)} />
                                Override movie quota
                            </label>
                            {overrideMovieQuota && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-muted">Limit (0 = unlimited)</label>
                                        <input type="number" min={0} className="w-full p-2 rounded-lg border border-border bg-background text-sm" value={movieQuotaLimit} onChange={(e) => setMovieQuotaLimit(Math.max(0, Number(e.target.value) || 0))} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted">Days</label>
                                        <input type="number" min={1} className="w-full p-2 rounded-lg border border-border bg-background text-sm" value={movieQuotaDays} onChange={(e) => setMovieQuotaDays(Math.max(1, Number(e.target.value) || 7))} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-3 rounded-lg border border-border bg-black/10 space-y-2">
                            <label className="inline-flex items-center gap-2 text-sm font-semibold">
                                <input type="checkbox" checked={overrideTvQuota} onChange={(e) => setOverrideTvQuota(e.target.checked)} />
                                Override series quota
                            </label>
                            {overrideTvQuota && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-muted">Limit (0 = unlimited)</label>
                                        <input type="number" min={0} className="w-full p-2 rounded-lg border border-border bg-background text-sm" value={tvQuotaLimit} onChange={(e) => setTvQuotaLimit(Math.max(0, Number(e.target.value) || 0))} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted">Days</label>
                                        <input type="number" min={1} className="w-full p-2 rounded-lg border border-border bg-background text-sm" value={tvQuotaDays} onChange={(e) => setTvQuotaDays(Math.max(1, Number(e.target.value) || 7))} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {permSelect('Request movies', allowRequestMovies, setAllowRequestMovies)}
                        {permSelect('Request series', allowRequestTv, setAllowRequestTv)}
                        {permSelect('Request 4K movies', allowRequest4kMovies, setAllowRequest4kMovies)}
                        {permSelect('Request 4K series', allowRequest4kTv, setAllowRequest4kTv)}
                        {permSelect('Advanced requests', allowAdvancedRequests, setAllowAdvancedRequests)}
                    </div>
                </div>

                <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-border">
                    <button type="button" className="px-6 py-3 bg-plex text-background rounded-md font-bold hover:bg-plex-hover transition-colors flex items-center justify-center gap-2" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
};






const UserAnalyticsModal: React.FC<{ userId: string, username: string, thumb: string | null, days: string, onClose: () => void }> = ({ userId, username, thumb, days, onClose }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'graphs'>('overview');

    const [historyPage, setHistoryPage] = useState(1);
    const [historySearch, setHistorySearch] = useState('');
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        apiFetch(`/api/plex/analytics/user/${userId}?days=${days}`)
            .then(res => { if (!cancelled) setData(res); })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [userId, days]);

    useEffect(() => {
        if (activeTab !== 'history') return;
        let cancelled = false;
        setHistoryLoading(true);
        apiFetch(`/api/plex/analytics/user/${userId}/history?page=${historyPage}&limit=15&search=${encodeURIComponent(historySearch)}`)
            .then(res => {
                if (!cancelled && res.data) {
                    setHistoryData(res.data);
                    setHistoryTotal(res.total);
                }
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setHistoryLoading(false); });
        return () => { cancelled = true; };
    }, [userId, activeTab, historyPage, historySearch]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setHistorySearch(e.target.value);
        setHistoryPage(1);
    };

    const formatHour = (h: number) => {
        if (h === 0) return '12 AM';
        if (h === 12) return '12 PM';
        return h > 12 ? `${h - 12} PM` : `${h} AM`;
    };

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-card/90 border border-border w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between bg-black/20 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-r from-plex to-[#e5a00d]">
                            <img src={thumb ? (thumb.startsWith('http') ? thumb : portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=128&height=128`)) : logoUrl()} alt={username} className="w-full h-full rounded-full object-cover bg-card" onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-text">{username}</h2>
                            <p className="text-muted text-sm">{loading ? 'Loading stats...' : `${data?.totalPlays || 0} total plays (${days === 'all' ? 'All Time' : `Last ${days} Days`})`}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-muted hover:text-white transition-colors bg-white/5 p-2 rounded-full"><X className="w-6 h-6" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border bg-black/40 px-6 gap-6">
                    {['overview', 'history', 'graphs'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} className={`py-3 px-2 font-bold text-sm uppercase tracking-wider transition-colors border-b-2 ${activeTab === tab ? 'border-plex text-text' : 'border-transparent text-muted hover:text-white'}`}>
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 min-h-0 flex flex-col gap-8 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center items-center h-40"><Loader isLoading={true} /></div>
                    ) : (error || !data) ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                            <p className="text-muted text-sm">Failed to load analytics for this user.</p>
                        </div>
                    ) : activeTab === 'overview' ? (
                        <>
                            {/* Top row */}
                            <div>
                                <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><PlaySquare className="text-plex w-4 h-4" /> Favorite Libraries</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                                    {(data.topLibraries ?? []).length === 0 ? <p className="text-muted text-sm col-span-full">No library data.</p> : data.topLibraries.map((lib: any, i: number) => (
                                        <div key={lib.id} className="flex justify-between items-center bg-black/20 p-2 rounded border border-white/5">
                                            <span className="font-bold text-sm text-text"><span className="text-muted mr-2">#{i + 1}</span>{lib.title}</span>
                                            <span className="text-plex text-xs font-mono">{lib.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {data.topMovies && data.topMovies.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><Film className="text-plex w-4 h-4" /> Top Watched Movies</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                                        {data.topMovies.slice(0, 15).map((c: any, i: number) => (
                                            <a key={c.key} href={c.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="w-8 h-12 bg-black/40 rounded overflow-hidden flex-shrink-0 relative">
                                                    {c.thumbUrl && <img src={resolvePortalAssetUrl(c.thumbUrl)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                                    <div className={`absolute inset-0 w-full h-full p-2 opacity-50 flex items-center justify-center ${c.thumbUrl ? 'hidden' : ''}`}>
                                                        <Film className="w-full h-full" />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col flex-grow overflow-hidden">
                                                    <span className="font-bold text-sm text-text truncate">{c.title}</span>
                                                    <span className="text-muted text-[10px] uppercase tracking-wider">{c.type}</span>
                                                </div>
                                                <span className="text-plex text-xs font-mono whitespace-nowrap">{c.plays} plays</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {data.topShows && data.topShows.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><TrendingUp className="text-plex w-4 h-4" /> Top Watched TV Shows</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                                        {data.topShows.slice(0, 15).map((c: any, i: number) => (
                                            <a key={c.key} href={c.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="w-8 h-12 bg-black/40 rounded overflow-hidden flex-shrink-0 relative">
                                                    {c.thumbUrl && <img src={resolvePortalAssetUrl(c.thumbUrl)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                                    <div className={`absolute inset-0 w-full h-full p-2 opacity-50 flex items-center justify-center ${c.thumbUrl ? 'hidden' : ''}`}>
                                                        <Film className="w-full h-full" />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col flex-grow overflow-hidden">
                                                    <span className="font-bold text-sm text-text truncate">{c.title}</span>
                                                    <span className="text-muted text-[10px] uppercase tracking-wider">{c.type}</span>
                                                </div>
                                                <span className="text-plex text-xs font-mono whitespace-nowrap">{c.plays} plays</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : activeTab === 'history' ? (
                        <div className="flex flex-col gap-4 h-full min-h-[400px]">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <h3 className="text-lg font-bold text-text uppercase tracking-wider flex items-center gap-2"><Activity className="text-plex w-4 h-4" /> Full Watch History</h3>
                                <div className="relative w-full sm:w-64">
                                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
                                    <input
                                        type="text"
                                        placeholder="Search history..."
                                        value={historySearch}
                                        onChange={handleSearch}
                                        className="w-full bg-black/40 border border-border text-white text-sm rounded-lg focus:ring-plex focus:border-plex block pl-10 p-2 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto bg-black/20 rounded-xl border border-white/5 p-2 custom-scrollbar">
                                {historyLoading ? (
                                    <div className="flex justify-center items-center h-40"><Loader isLoading={true} /></div>
                                ) : historyData.length === 0 ? (
                                    <div className="flex justify-center items-center h-40 text-muted">No history found.</div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {historyData.map((h: any, i: number) => (
                                            <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 p-2 rounded-lg hover:bg-white/10 transition-colors">
                                                <div className={`${h.type === 'track' ? 'w-12 h-12' : 'w-10 h-14'} bg-black/40 rounded overflow-hidden flex-shrink-0`}>
                                                    {h.thumbUrl && <img src={resolvePortalAssetUrl(h.thumbUrl)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                                    <div className={`w-full h-full p-2 opacity-50 flex items-center justify-center ${h.thumbUrl ? 'hidden' : ''}`}>
                                                        {h.type === 'track' ? <Music className="w-full h-full" /> : <Film className="w-full h-full" />}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col overflow-hidden w-full">
                                                    <span className="font-bold text-sm text-text truncate w-[95%]">{h.title}</span>
                                                    {h.parentTitle && h.type !== 'movie' && <span className="text-muted text-xs truncate w-[95%]">{h.parentTitle}</span>}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-plex font-mono text-[10px]">
                                                            {h.viewedAt ? (h.viewedAt > 9999999999 ? new Date(h.viewedAt).toLocaleString() : new Date(h.viewedAt * 1000).toLocaleString()) : 'Unknown Date'}
                                                        </span>
                                                        {h.percentComplete != null && h.percentComplete < 100 && (
                                                            <span className="text-yellow-500 font-mono text-[10px]">{h.percentComplete}%</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Pagination */}
                            {historyTotal > 15 && (
                                <div className="flex justify-between items-center pt-2 border-t border-border mt-2 flex-shrink-0">
                                    <span className="text-sm text-muted">Showing {Math.min((historyPage - 1) * 15 + 1, historyTotal)} to {Math.min(historyPage * 15, historyTotal)} of {historyTotal} plays</span>
                                    <div className="flex gap-2">
                                        <button type="button" disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)} className="bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm text-white font-bold transition-colors">Prev</button>
                                        <button type="button" disabled={historyPage * 15 >= historyTotal} onClick={() => setHistoryPage(p => p + 1)} className="bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm text-white font-bold transition-colors">Next</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'graphs' ? (
                        <div className="flex flex-col gap-6 h-full min-h-[400px]">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="glass-card-sm p-4 bg-black/20">
                                    <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Plays by Hour of Day</h3>
                                    <div className="h-64">
                                        {data.hourDistribution ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={data.hourDistribution.map((plays: number, i: number) => ({ hour: formatHour(i), plays }))}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                                    <XAxis dataKey="hour" stroke="rgba(255,255,255,0.3)" fontSize={11} tickMargin={10} minTickGap={20} />
                                                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} allowDecimals={false} />
                                                    <RechartsTooltip
                                                        contentStyle={{ backgroundColor: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                        itemStyle={{ color: '#E5A00D' }}
                                                    />
                                                    <Line type="monotone" dataKey="plays" name="Plays" stroke="#E5A00D" strokeWidth={3} dot={{ fill: '#E5A00D', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        ) : <p className="text-muted text-sm">No data.</p>}
                                    </div>
                                </div>

                                <div className="glass-card-sm p-4 bg-black/20">
                                    <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Plays by Day of Week</h3>
                                    <div className="h-64">
                                        {data.dayOfWeekCounts ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={Object.values(data.dayOfWeekCounts).map((plays: any, i: number) => ({ day: daysOfWeek[i].substring(0, 3), plays }))}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                                    <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={11} tickMargin={10} />
                                                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} allowDecimals={false} />
                                                    <RechartsTooltip
                                                        contentStyle={{ backgroundColor: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                        itemStyle={{ color: '#E5A00D' }}
                                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                    />
                                                    <Bar dataKey="plays" name="Plays" fill="#E5A00D" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <p className="text-muted text-sm">No data.</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                                <div className="glass-card-sm p-4 bg-black/20">
                                    <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Plays by Library</h3>
                                    <div className="h-64">
                                        {data.topLibraries && data.topLibraries.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RechartsPieChart>
                                                    <Pie
                                                        data={data.topLibraries}
                                                        dataKey="plays"
                                                        nameKey="title"
                                                        cx="50%"
                                                        cy="50%"
                                                        outerRadius={80}
                                                        innerRadius={40}
                                                        fill="#E5A00D"
                                                        label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                        labelLine={false}
                                                    >
                                                        {data.topLibraries.map((entry: any, index: number) => (
                                                            <Cell key={`cell-${index}`} fill={['#E5A00D', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899'][index % 6]} />
                                                        ))}
                                                    </Pie>
                                                    <RechartsTooltip
                                                        contentStyle={{ backgroundColor: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                        itemStyle={{ color: '#E5A00D' }}
                                                    />
                                                </RechartsPieChart>
                                            </ResponsiveContainer>
                                        ) : <p className="text-muted text-sm">No data.</p>}
                                    </div>
                                </div>

                                <div className="glass-card-sm p-4 bg-black/20">
                                    <h3 className="text-sm font-bold text-text mb-4 uppercase tracking-wider">Top Watched Shows</h3>
                                    <div className="h-64">
                                        {data.topShows && data.topShows.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={data.topShows.slice(0, 5)} layout="vertical" margin={{ left: 0, right: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" horizontal={true} vertical={false} />
                                                    <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={11} allowDecimals={false} />
                                                    <YAxis dataKey="title" type="category" stroke="rgba(255,255,255,0.3)" fontSize={10} width={90} tickFormatter={(val) => val.length > 13 ? val.substring(0, 13) + '...' : val} />
                                                    <RechartsTooltip
                                                        contentStyle={{ backgroundColor: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                        itemStyle={{ color: '#E5A00D' }}
                                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                    />
                                                    <Bar dataKey="plays" name="Plays" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : <p className="text-muted text-sm">No data.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

const CountUp: React.FC<{ end: number, duration?: number }> = ({ end, duration = 1500 }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime: number | null = null;
        let animationFrame: number;

        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percentage = Math.min(progress / duration, 1);

            // easeOutQuart easing
            const easeOut = 1 - Math.pow(1 - percentage, 4);

            setCount(Math.floor(end * easeOut));

            if (percentage < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                setCount(end);
            }
        };

        animationFrame = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationFrame);
    }, [end, duration]);

    return <span>{count.toLocaleString()}</span>;
};

const ReportIssueModal: React.FC<{ item: any, onClose: () => void }> = ({ item, onClose }) => {
    const [issue, setIssue] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('submitting');
        try {
            const res = await apiFetch('/api/plex/report-issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: item.title, key: item.key || item.ratingKey, issue })
            });
            if (res.success) {
                setStatus('success');
                setTimeout(() => onClose(), 2000);
            } else {
                setStatus('error');
            }
        } catch (e) {
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-plex" />
                        Report Issue
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-muted hover:text-text">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                {status === 'success' ? (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8 text-green-500" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Report Sent!</h3>
                        <p className="text-muted">The server admin has been notified.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <p className="text-sm text-muted mb-2">Reporting issue for:</p>
                            <div className="bg-black/20 border border-white/5 p-3 rounded-xl flex items-center gap-3">
                                {item.thumbUrl ? (
                                    <img src={resolvePortalAssetUrl(item.thumbUrl)} className="w-10 h-10 rounded-lg object-cover" />
                                ) : (
                                    <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center"><Film className="w-5 h-5 text-muted/50" /></div>
                                )}
                                <div>
                                    <p className="font-bold text-sm truncate">{item.title}</p>
                                    {item.episodeTitle && <p className="text-xs text-muted truncate">{item.episodeTitle}</p>}
                                </div>
                            </div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-muted mb-2 uppercase tracking-wider">What's wrong?</label>
                            <textarea
                                value={issue}
                                onChange={e => setIssue(e.target.value)}
                                placeholder="E.g., Audio is out of sync, subtitles are missing, buffering constantly..."
                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-plex/50 text-text resize-none h-32"
                                required
                            />
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 text-text font-bold hover:bg-white/5 transition-colors">Cancel</button>
                            <button type="submit" disabled={status === 'submitting' || !issue.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-plex text-black font-black hover:bg-plex/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {status === 'submitting' ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</> : 'Send Report'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// --- Analytics Dashboard Component ---
const PersonalAnalyticsDashboard: React.FC<{ username: string, thumb: string | null }> = ({ username, thumb }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [days, setDays] = useState<string>('30');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        apiFetch(`/api/plex/analytics/me?days=${days}`)
            .then(res => { if (!cancelled) setData(res); })
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [days]);

    return (
        <div className="w-full animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-text uppercase tracking-widest flex items-center gap-3">
                        <BarChart3 className="w-8 h-8 text-plex" />
                        Personal Analytics
                    </h1>
                    <p className="text-muted text-sm mt-1">Deep dive into your playback history</p>
                </div>
                <select
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="bg-card text-text border border-border rounded px-4 py-2 text-sm focus:outline-none focus:border-plex"
                >
                    <option value="30">Last 30 Days</option>
                    <option value="60">Last 60 Days</option>
                    <option value="365">Last 1 Year</option>
                    <option value="1825">Last 5 Years</option>
                    <option value="all">All Time</option>
                </select>
            </div>

            <div className="bg-card/90 border border-border w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div className="p-6 border-b border-border flex items-center justify-between bg-black/20 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-r from-plex to-[#e5a00d]">
                            <img src={thumb ? (thumb.startsWith('http') ? thumb : portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=128&height=128`)) : logoUrl()} alt={username} className="w-full h-full rounded-full object-cover bg-card" onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-text">{username}</h2>
                            <p className="text-muted text-sm">{loading ? 'Loading stats...' : `${data?.totalPlays || 0} total plays (${days === 'all' ? 'All Time' : `Last ${days} Days`})`}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 min-h-0 flex flex-col gap-8 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center items-center h-40"><Loader isLoading={true} /></div>
                    ) : (error || !data) ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                            <p className="text-muted text-sm">Failed to load your analytics. Please try again later.</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><PlaySquare className="text-plex w-4 h-4" /> Favorite Libraries</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                                    {(data.topLibraries ?? []).length === 0 ? <p className="text-muted text-sm col-span-full">No library data.</p> : data.topLibraries.map((lib: any, i: number) => (
                                        <div key={lib.id} className="flex justify-between items-center bg-black/20 p-2 rounded border border-white/5">
                                            <span className="font-bold text-sm text-text"><span className="text-muted mr-2">#{i + 1}</span>{lib.title}</span>
                                            <span className="text-plex text-xs font-mono">{lib.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {data.topMovies && data.topMovies.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><Film className="text-plex w-4 h-4" /> Top Watched Movies</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                        {data.topMovies.map((c: any, i: number) => (
                                            <a key={c.key} href={c.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="w-8 h-12 bg-black/40 rounded overflow-hidden flex-shrink-0 relative">
                                                    {c.thumbUrl && <img src={resolvePortalAssetUrl(c.thumbUrl)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                                    <div className={`absolute inset-0 w-full h-full p-2 opacity-50 flex items-center justify-center ${c.thumbUrl ? 'hidden' : ''}`}>
                                                        <Film className="w-full h-full" />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col flex-grow overflow-hidden">
                                                    <span className="font-bold text-sm text-text truncate">{c.title}</span>
                                                    <span className="text-muted text-[10px] uppercase tracking-wider">{c.type}</span>
                                                </div>
                                                <span className="text-plex text-xs font-mono whitespace-nowrap">{c.plays} plays</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {data.topShows && data.topShows.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><TrendingUp className="text-plex w-4 h-4" /> Top Watched TV Shows</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                        {data.topShows.map((c: any, i: number) => (
                                            <a key={c.key} href={c.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="w-8 h-12 bg-black/40 rounded overflow-hidden flex-shrink-0 relative">
                                                    {c.thumbUrl && <img src={resolvePortalAssetUrl(c.thumbUrl)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                                    <div className={`absolute inset-0 w-full h-full p-2 opacity-50 flex items-center justify-center ${c.thumbUrl ? 'hidden' : ''}`}>
                                                        <Film className="w-full h-full" />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col flex-grow overflow-hidden">
                                                    <span className="font-bold text-sm text-text truncate">{c.title}</span>
                                                    <span className="text-muted text-[10px] uppercase tracking-wider">{c.type}</span>
                                                </div>
                                                <span className="text-plex text-xs font-mono whitespace-nowrap">{c.plays} plays</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {data.topMusic && data.topMusic.length > 0 && (
                                <div>
                                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><Music className="text-plex w-4 h-4" /> Top Listened</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                        {data.topMusic.map((c: any, i: number) => (
                                            <a key={c.key} href={c.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/5 hover:bg-white/10 transition-colors">
                                                <div className="w-12 h-12 bg-black/40 rounded overflow-hidden flex-shrink-0 relative">
                                                    {c.thumbUrl && <img src={resolvePortalAssetUrl(c.thumbUrl)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                                    <div className={`absolute inset-0 w-full h-full p-2 opacity-50 flex items-center justify-center ${c.thumbUrl ? 'hidden' : ''}`}>
                                                        <Music className="w-full h-full" />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col flex-grow overflow-hidden">
                                                    <span className="font-bold text-sm text-text truncate">{c.title}</span>
                                                    <span className="text-muted text-[10px] uppercase tracking-wider">{c.type}</span>
                                                </div>
                                                <span className="text-plex text-xs font-mono whitespace-nowrap">{c.plays} plays</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>

                                <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><Activity className="text-plex w-4 h-4" /> Recent Watch History</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {data.recentHistory.length === 0 ? <p className="text-muted text-sm col-span-full">No recent history.</p> : data.recentHistory.map((h: any, i: number) => (
                                        <a key={i} href={h.plexUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-white/5 border border-white/5 p-2 rounded-lg hover:bg-white/10 transition-colors">
                                            <div className={`${h.type === 'track' ? 'w-12 h-12' : 'w-10 h-14'} bg-black/40 rounded overflow-hidden flex-shrink-0`}>
                                                {h.thumbUrl && <img src={resolvePortalAssetUrl(h.thumbUrl)} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />}
                                                <div className={`w-full h-full p-2 opacity-50 flex items-center justify-center ${h.thumbUrl ? 'hidden' : ''}`}>
                                                    {h.type === 'track' ? <Music className="w-full h-full" /> : <Film className="w-full h-full" />}
                                                </div>
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="font-bold text-sm text-text truncate">{h.title}</span>
                                                {h.episodeTitle && <span className="text-muted text-xs truncate">{h.episodeTitle}</span>}
                                                <span className="text-plex font-mono text-[10px] mt-1">{new Date(h.viewedAt * 1000).toLocaleString()}</span>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export const MediaStackDashboard: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const [detailsItem, setDetailsItem] = useState<any>(null);
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [monthOffset, setMonthOffset] = useState(0);
    const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
    const [activeCalendarItem, setActiveCalendarItem] = useState<any>(null);
    const [autoMonthNotice, setAutoMonthNotice] = useState('');

    const stackInstances = useMemo(() => {
        const fromApi = Array.isArray(data?.instances) ? data.instances : [];
        if (fromApi.length > 0) {
            return [...fromApi].sort((a: any, b: any) => {
                if (a.type !== b.type) return a.type === 'sonarr' ? -1 : 1;
                if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        }
        const fallback: any[] = [];
        if (data?.sonarr) {
            fallback.push({
                ...data.sonarr,
                id: 'sonarr-default',
                type: 'sonarr',
                name: data.sonarr.instanceName || 'Sonarr',
            });
        }
        if (data?.radarr) {
            fallback.push({
                ...data.radarr,
                id: 'radarr-default',
                type: 'radarr',
                name: data.radarr.instanceName || 'Radarr',
            });
        }
        return fallback;
    }, [data]);

    const switchInstance = (instanceId: string) => {
        if (instanceId === activeInstanceId) return;
        setActiveInstanceId(instanceId);
        setAutoMonthNotice('');
        setMonthOffset(0);
    };

    useEffect(() => {
        if (stackInstances.length === 0) {
            setActiveInstanceId(null);
            return;
        }
        if (activeInstanceId && stackInstances.some((entry: any) => entry.id === activeInstanceId)) return;
        const preferred = stackInstances.find((entry: any) => entry.isDefault) || stackInstances[0];
        setActiveInstanceId(preferred?.id || null);
    }, [stackInstances, activeInstanceId]);

    const activeInstanceData = useMemo(() => {
        if (!stackInstances.length) return null;
        return stackInstances.find((entry: any) => entry.id === activeInstanceId) || stackInstances[0];
    }, [stackInstances, activeInstanceId]);

    const activeInstanceType = activeInstanceData?.type === 'radarr' ? 'radarr' : 'sonarr';
    const isTvInstance = activeInstanceType === 'sonarr';

    const fetchData = useCallback(async () => {
        try {
            const res = await apiFetch('/api/media-stack/summary?monthOffset=' + monthOffset);
            if (res.error) throw new Error(res.error);
            setData(res);
        } catch (err: any) {
            setError(err.message || 'Failed to load Media Stack data.');
        } finally {
            setIsLoading(false);
        }
    }, [monthOffset]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const formatRelativeAirDate = (date: Date) => {
        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const isMidnight = date.getHours() === 0 && date.getMinutes() === 0;
        const timeStr = isMidnight ? '' : ` at ${formatTime(date)}`;

        const diffDays = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (date >= today && date < tomorrow) {
            return `Today${timeStr}`;
        }
        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
        if (date >= tomorrow && date < dayAfterTomorrow) {
            return `Tomorrow${timeStr}`;
        }
        if (diffDays > 1 && diffDays < 7) {
            const dayName = date.toLocaleDateString([], { weekday: 'long' });
            return `${dayName}${timeStr}`;
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + timeStr;
    };

    const formatBytes = (bytes: number) => {
        if (!bytes) return '0.0 GB';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return `${gb.toFixed(1)} GB`;
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(1)} MB`;
    };

    const calendarItems = useMemo(() => {
        if (!activeInstanceData?.calendar) return [];
        const items: any[] = [];
        if (isTvInstance) {
            activeInstanceData.calendar.forEach((ep: any) => {
                const poster = ep.series?.images?.find((img: any) => img.coverType === 'poster');
                items.push({
                    id: `${activeInstanceData.id}-sonarr-${ep.id || ep.airDateUtc || ep.airDate}-${ep.title}`,
                    type: 'tv',
                    service: activeInstanceData.name || 'Sonarr',
                    title: ep.series?.title || 'Unknown Series',
                    subtitle: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`,
                    date: new Date(ep.airDateUtc || ep.airDate),
                    hasFile: ep.hasFile,
                    monitored: ep.monitored,
                    imageUrl: poster ? (poster.remoteUrl || poster.url) : null,
                    network: ep.series?.network || ''
                });
            });
        } else {
            activeInstanceData.calendar.forEach((movie: any) => {
                const releaseDateStr = movie.digitalRelease || movie.physicalRelease || movie.inCinemas || movie.added;
                if (!releaseDateStr) return;
                const poster = movie.images?.find((img: any) => img.coverType === 'poster');
                items.push({
                    id: `${activeInstanceData.id}-radarr-${movie.id || releaseDateStr}-${movie.title}`,
                    type: 'movie',
                    service: activeInstanceData.name || 'Radarr',
                    title: movie.title,
                    subtitle: movie.studio || 'Movie Release',
                    date: new Date(releaseDateStr),
                    hasFile: movie.hasFile,
                    monitored: movie.monitored,
                    imageUrl: poster ? (poster.remoteUrl || poster.url) : null,
                    network: movie.studio || ''
                });
            });
        }
        return items.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [activeInstanceData, isTvInstance]);

    const filteredCalendar = calendarItems;

    const activeStackConfigured = !!activeInstanceData?.configured;

    const activeStackLabel = activeInstanceData?.name || activeInstanceData?.instanceName || (isTvInstance ? 'Sonarr' : 'Radarr');
    const stackTools = useMemo(() => (
        Array.isArray(data?.tools)
            ? data.tools.filter((tool: any) => tool?.type === 'lidarr' || tool?.type === 'bazarr')
            : []
    ), [data]);

    useEffect(() => {
        let cancelled = false;
        const maybeAutoSelectMonthWithReleases = async () => {
            if (!data || monthOffset !== 0 || filteredCalendar.length > 0) {
                if (!cancelled && monthOffset === 0) {
                    setAutoMonthNotice('');
                }
                return;
            }
            for (let offset = 1; offset <= 6; offset += 1) {
                try {
                    const res = await apiFetch(`/api/media-stack/summary?monthOffset=${offset}${activeInstanceId ? `&instanceId=${encodeURIComponent(activeInstanceId)}` : ''}`);
                    const activeSummary = activeInstanceId
                        ? res?.instances?.find((entry: any) => entry.id === activeInstanceId)
                        : res?.instances?.[0];
                    const count = Array.isArray(activeSummary?.calendar) ? activeSummary.calendar.length : 0;
                    if (count > 0) {
                        if (cancelled) return;
                        setData(res);
                        setMonthOffset(offset);
                        setAutoMonthNotice(`Showing the next month with ${isTvInstance ? 'TV' : 'movie'} releases (${new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() + offset, 1)).toLocaleDateString('default', { month: 'long', year: 'numeric' })}).`);
                        return;
                    }
                } catch {
                    // Keep trying next month; this is a best-effort UX fallback.
                }
            }
            if (!cancelled) {
                setAutoMonthNotice(`No ${isTvInstance ? 'TV' : 'movie'} releases found in the next 6 months.`);
            }
        };
        maybeAutoSelectMonthWithReleases();
        return () => {
            cancelled = true;
        };
    }, [isTvInstance, filteredCalendar.length, data, monthOffset, activeInstanceId]);

    const groupedCalendar = useMemo(() => {
        const groups: { [dateStr: string]: typeof filteredCalendar } = {};
        filteredCalendar.forEach(item => {
            const dateStr = item.date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(item);
        });
        return groups;
    }, [filteredCalendar]);

    useEffect(() => {
        if (filteredCalendar.length > 0) {
            setActiveCalendarItem((prev: any) => {
                if (prev && filteredCalendar.find(i => i.id === prev.id)) return prev;
                return filteredCalendar[0];
            });
        } else {
            setActiveCalendarItem(null);
        }
    }, [filteredCalendar]);

    const activeQueue = useMemo(() => {
        if (!activeInstanceData?.queue?.records) return [];
        return activeInstanceData.queue.records.map((item: any) => ({
            ...item,
            service: activeInstanceData.name || activeStackLabel,
        }));
    }, [activeInstanceData, activeStackLabel]);

    const activeHistory = useMemo(() => {
        if (!activeInstanceData?.history?.records) return [];
        const historyItems: any[] = [];
        if (isTvInstance) {
            activeInstanceData.history.records.forEach((item: any) => {
                let cleanTitle = '';
                if (item.series?.title) {
                    cleanTitle = item.series.title;
                    if (item.episode?.seasonNumber !== undefined && item.episode?.episodeNumber !== undefined) {
                        cleanTitle += ` - S${String(item.episode.seasonNumber).padStart(2, '0')}E${String(item.episode.episodeNumber).padStart(2, '0')}`;
                        if (item.episode.title) {
                            cleanTitle += ` - ${item.episode.title}`;
                        }
                    }
                } else {
                    cleanTitle = item.sourceTitle || 'Unknown TV Show';
                }
                historyItems.push({
                    id: `${activeInstanceData.id}-sonarr-hist-${item.id}`,
                    service: activeInstanceData.name || 'Sonarr',
                    title: cleanTitle,
                    date: new Date(item.date),
                    eventType: item.eventType
                });
            });
        } else {
            activeInstanceData.history.records.forEach((item: any) => {
                historyItems.push({
                    id: `${activeInstanceData.id}-radarr-hist-${item.id}`,
                    service: activeInstanceData.name || 'Radarr',
                    title: item.movie?.title || item.sourceTitle || 'Unknown Movie',
                    date: new Date(item.date),
                    eventType: item.eventType
                });
            });
        }
        return historyItems.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8);
    }, [activeInstanceData, isTvInstance]);

    if (isLoading) return <Loader isLoading={true} />;
    if (error) return <div className="text-center p-8 text-status-expiring">{error}</div>;
    if (!data) return null;

    const getHistoryColor = (type: string) => {
        if (!type) return 'bg-muted';
        switch (type.toLowerCase()) {
            case 'grabbed':
                return 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]';
            case 'downloadfolderimported':
            case 'moviefileimported':
            case 'imported':
                return 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]';
            case 'downloadfailed':
            case 'failed':
                return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]';
            case 'episodefiledeleted':
            case 'moviefiledeleted':
            case 'deleted':
                return 'bg-zinc-600 shadow-[0_0_6px_rgba(113,113,122,0.5)]';
            default:
                return 'bg-plex shadow-[0_0_6px_rgba(229,160,13,0.5)]';
        }
    };

    const formatEventType = (type: string) => {
        if (!type) return '';
        switch (type.toLowerCase()) {
            case 'grabbed':
                return 'Grabbed';
            case 'downloadfolderimported':
            case 'moviefileimported':
            case 'imported':
                return 'Imported';
            case 'downloadfailed':
            case 'failed':
                return 'Failed';
            case 'episodefiledeleted':
            case 'moviefiledeleted':
            case 'deleted':
                return 'Deleted';
            default:
                return type
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();
        }
    };

    const renderStatusCard = (name: string, info: any) => {
        if (!info || !info.configured) {
            return (
                <div className="bg-card border border-border/40 rounded-2xl p-4 md:p-6 shadow-xl flex flex-col justify-between h-44 relative overflow-hidden">
                    <div className="flex justify-between items-start">
                        <h3 className="text-lg font-bold text-text/80">{name}</h3>
                        <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-white/5 text-muted border border-white/5">Unconfigured</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed">Please set the URL and API key in Settings under the Media Stack tab to activate monitoring.</p>
                    <div className="text-right">
                        <span className="text-xs font-bold text-plex hover:underline cursor-pointer">Configure in Settings →</span>
                    </div>
                </div>
            );
        }

        const status = info.status;
        const disk = info.disk ? info.disk[0] : null;
        const freeGB = disk ? (disk.freeSpace / 1024 / 1024 / 1024) : 0;
        const totalGB = disk ? (disk.totalSpace / 1024 / 1024 / 1024) : 1;
        const freePercent = disk ? (freeGB / totalGB) * 100 : 0;
        const usedPercent = 100 - freePercent;
        const isReachable = !!status;

        return (
            <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative overflow-hidden backdrop-blur-sm group hover:border-white/10 transition-all duration-300">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-all duration-500">
                    <HardDrive className="w-24 h-24" />
                </div>

                <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-plex/10 flex items-center justify-center border border-plex/20">
                        {name === 'Sonarr' ? <Tv className="w-5 h-5 text-plex" /> : <Film className="w-5 h-5 text-plex" />}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-text tracking-wide">{name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={`w-2 h-2 rounded-full ${isReachable ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></span>
                            <span className={`text-[10px] font-bold tracking-wider uppercase ${isReachable ? 'text-green-500' : 'text-red-400'}`}>{isReachable ? 'Online' : 'Unavailable'}</span>
                            {status?.version && <span className="text-[10px] text-muted font-bold">v{status.version}</span>}
                        </div>
                    </div>
                </div>
                {!isReachable && (
                    <p className="text-[11px] text-red-300 mb-2">Unable to fetch data from {name}. Check URL/API key and local network reachability.</p>
                )}

                {disk && (
                    <div className="bg-background/40 rounded-xl p-3 border border-white/5 mt-2">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Free Storage</span>
                            <span className="text-xs font-bold text-text">{freeGB.toFixed(1)} GB free</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                            <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${usedPercent}%` }}></div>
                        </div>
                        <div className="flex justify-between text-[9px] text-muted/60 mt-1 font-medium">
                            <span>{usedPercent.toFixed(0)}% Used</span>
                            <span>{totalGB.toFixed(0)} GB Total</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderToolCard = (tool: any) => {
        const isBazarr = tool?.type === 'bazarr';
        const label = tool?.name || (isBazarr ? 'Bazarr' : 'Lidarr');
        const isOnline = !!tool?.status && !tool?.error;
        const href = tool?.externalUrl || tool?.url || '';
        return (
            <div key={tool.id || `${tool.type}-${label}`} className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    {isBazarr ? <FileText className="w-20 h-20" /> : <Music className="w-20 h-20" />}
                </div>
                <div className="flex items-center justify-between gap-3 relative">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-plex/10 flex items-center justify-center border border-plex/20 shrink-0">
                            {isBazarr ? <FileText className="w-5 h-5 text-plex" /> : <Music className="w-5 h-5 text-plex" />}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base font-bold text-text truncate">{label}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></span>
                                <span className={`text-[10px] font-bold tracking-wider uppercase ${isOnline ? 'text-green-500' : 'text-red-400'}`}>{isOnline ? 'Online' : 'Unavailable'}</span>
                                {tool?.version && <span className="text-[10px] text-muted font-bold">v{tool.version}</span>}
                            </div>
                        </div>
                    </div>
                    {href && (
                        <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-colors shrink-0"
                            title={`Open ${label}`}
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                </div>
                <p className="text-xs text-muted mt-4 relative">
                    {isBazarr ? 'Subtitle management and automation' : 'Music library automation'}
                    {tool?.error ? ` · ${tool.error}` : ''}
                </p>
            </div>
        );
    };

    return (
        <div className="w-full animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-text uppercase tracking-widest flex items-center gap-3">
                        {isTvInstance ? <Tv className="w-8 h-8 text-plex" /> : <Film className="w-8 h-8 text-plex" />}
                        {activeStackLabel}
                    </h1>
                    <p className="text-muted text-sm mt-1">
                        {isTvInstance ? 'TV series releases, downloads, and activity' : 'Movie releases, downloads, and activity'}
                    </p>
                </div>

                {stackInstances.length > 0 && (
                    <div className="flex bg-white/5 p-1 rounded-lg md:rounded-xl border border-white/10 w-full sm:w-auto max-w-full overflow-x-auto custom-scrollbar">
                        {stackInstances.map((instance: any) => (
                            <button
                                key={instance.id}
                                type="button"
                                onClick={() => switchInstance(instance.id)}
                                className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[11px] md:text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap shrink-0 ${activeInstanceId === instance.id ? 'bg-plex text-background shadow-lg shadow-plex/20' : 'text-muted hover:text-text hover:bg-white/5'}`}
                            >
                                {instance.type === 'sonarr' ? <Tv className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Film className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                                {instance.name || (instance.type === 'radarr' ? 'Radarr' : 'Sonarr')}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <button onClick={fetchData} className="px-3 py-1.5 bg-plex/10 hover:bg-plex/20 text-plex text-xs font-bold rounded-lg border border-plex/20 flex items-center gap-2 transition-all">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
            </button>

            <DetailsModal item={detailsItem} onClose={() => setDetailsItem(null)} />

            <div className="flex flex-col gap-8 w-full">
                {stackTools.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-7xl">
                        {stackTools.map(renderToolCard)}
                    </div>
                )}

                <div className="w-full">

                    <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative">
                        <div className="flex flex-row justify-between items-center mb-4 md:mb-6 border-b border-border/30 pb-3 md:pb-4 gap-2">
                            <h2 className="text-base sm:text-xl font-bold text-text flex items-center gap-1.5 md:gap-2 truncate">
                                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-plex flex-shrink-0" />
                                <span className="truncate">Upcoming Releases</span>
                            </h2>

                            <div className="flex bg-white/5 p-0.5 md:p-1 rounded-lg md:rounded-xl border border-white/10 w-fit flex-shrink-0 items-center gap-1 md:gap-2">
                                <button onClick={() => { setAutoMonthNotice(''); setMonthOffset(m => m - 1); }} className="p-1 md:p-1.5 hover:bg-white/10 rounded-md md:rounded-lg text-muted hover:text-text transition-colors">
                                    <ChevronLeft className="w-3 h-3 md:w-4 md:h-4" />
                                </button>
                                <span className="text-[10px] md:text-xs font-bold px-1 w-16 md:w-28 text-center text-text uppercase tracking-wider">
                                    {new Date(new Date().setFullYear(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1)).toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                                </span>
                                <button onClick={() => { setAutoMonthNotice(''); setMonthOffset(m => m + 1); }} className="p-1 md:p-1.5 hover:bg-white/10 rounded-md md:rounded-lg text-muted hover:text-text transition-colors">
                                    <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                                </button>
                            </div>
                        </div>
                        {autoMonthNotice && (
                            <p className="text-xs text-plex/90 mb-3">{autoMonthNotice}</p>
                        )}

                        {filteredCalendar.length === 0 ? (
                            <div className="text-center py-12 bg-background/30 rounded-xl border border-white/5 text-muted text-sm">
                                <Calendar className="w-12 h-12 text-muted/30 mx-auto mb-3" />
                                {!activeStackConfigured ? (
                                    <>
                                        <p>{activeStackLabel} is not configured yet.</p>
                                        <p className="text-xs mt-2">Add the URL and API key in Settings → Integrations.</p>
                                    </>
                                ) : (
                                    <p>No upcoming {isTvInstance ? 'TV' : 'movie'} releases for this month</p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 md:gap-5 xl:gap-6 w-full">
                                {/* Left Sticky Poster */}
                                <div className="sticky top-[64px] md:top-0 w-[100px] sm:w-[140px] md:w-[200px] xl:w-[240px] flex-shrink-0 hidden sm:block">
                                    <div className="flex flex-col gap-4 mt-8 md:mt-0">
                                        <div className="relative aspect-[2/3] rounded-lg md:rounded-2xl overflow-hidden shadow-2xl border border-white/10 group bg-card">
                                            {activeCalendarItem?.imageUrl ? (
                                                <img src={activeCalendarItem.imageUrl} alt={activeCalendarItem.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
                                                    {activeCalendarItem?.type === 'tv' ? <Tv className="w-10 h-10 md:w-20 md:h-20 mb-2 md:mb-4" /> : <Film className="w-10 h-10 md:w-20 md:h-20 mb-2 md:mb-4" />}
                                                    <span className="font-bold uppercase tracking-widest text-[8px] md:text-sm">No Poster</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-transparent flex flex-col justify-start p-2 md:p-4">
                                                {activeCalendarItem?.network && (
                                                    <span className="hidden md:block text-sm text-white/90 uppercase tracking-widest font-bold text-left drop-shadow-lg">{activeCalendarItem.network}</span>
                                                )}
                                            </div>
                                        </div>
                                        {activeCalendarItem?.title && (
                                            <div className="hidden md:block px-0.5">
                                                <p className="text-sm font-bold text-text leading-snug break-words">{activeCalendarItem.title}</p>
                                                {activeCalendarItem.subtitle && (
                                                    <p className="text-xs text-muted mt-1 break-words">{activeCalendarItem.subtitle}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Side: day columns */}
                                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 md:gap-5 pb-4">
                                    {Object.entries(groupedCalendar).map(([dateStr, items]: [string, typeof filteredCalendar]) => (
                                        <div key={dateStr} className="flex flex-col gap-2 md:gap-3 min-w-0">
                                            <div className="sticky top-[64px] md:top-0 bg-card z-20 py-1 md:py-3 border-b border-white/10 md:mb-2 -mx-4 px-4 md:mx-0 md:px-0 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)]">
                                                <h3 className="text-sm md:text-base xl:text-lg font-black text-plex md:text-text tracking-tight uppercase truncate" title={dateStr}>{dateStr}</h3>
                                            </div>
                                            {items.map(item => (
                                                <div
                                                    key={item.id}
                                                    onMouseEnter={() => setActiveCalendarItem(item)}
                                                    onClick={() => setActiveCalendarItem(item)}
                                                    className={`bg-background/40 hover:bg-background/80 transition-all duration-300 rounded-lg md:rounded-xl p-2.5 md:p-3 flex flex-col gap-1.5 shadow-md border-l-4 cursor-pointer group min-w-0 ${item.hasFile ? 'border-l-green-500/80' : item.monitored ? 'border-l-red-500/80' : 'border-l-blue-500/80'} ${activeCalendarItem?.id === item.id ? 'bg-white/10 border border-white/30 scale-[1.01]' : 'border border-white/5 hover:border-white/20'}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                                        <span className="text-[9px] md:text-[11px] text-plex flex items-center gap-1 md:gap-1.5 font-bold tracking-wide shrink-0">
                                                            <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                                            {formatTime(item.date).replace(/^0:/, '12:')}
                                                        </span>
                                                        {item.hasFile ? (
                                                            <span className="text-[8px] md:text-[10px] font-bold text-green-500 bg-green-500/10 border border-green-500/20 rounded md:rounded-md px-1.5 py-0.5 whitespace-nowrap shrink-0">
                                                                ✓ Ready
                                                            </span>
                                                        ) : (
                                                            item.monitored && (
                                                                <span className="text-[8px] md:text-[10px] font-bold text-plex bg-plex/10 border border-plex/20 rounded md:rounded-md px-1.5 py-0.5 flex items-center gap-1 whitespace-nowrap shrink-0">
                                                                    <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-plex animate-pulse"></span>
                                                                    Monitored
                                                                </span>
                                                            )
                                                        )}
                                                    </div>
                                                    <h4
                                                        className="font-bold text-xs sm:text-sm text-text leading-snug break-words group-hover:text-plex transition-colors"
                                                        title={item.title}
                                                    >
                                                        {item.title}
                                                    </h4>
                                                    <p
                                                        className="text-[10px] md:text-[12px] text-muted/80 leading-snug break-words font-medium"
                                                        title={item.subtitle}
                                                    >
                                                        {item.subtitle}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="flex flex-col gap-8">
                        <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative flex-grow flex flex-col">
                            <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-plex" />
                                {activeStackLabel} Downloads ({activeQueue.length})
                            </h2>

                            <div className="flex flex-col gap-3 flex-grow justify-start">
                                {!activeStackConfigured ? (
                                    <div className="text-center py-8 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                        <DownloadCloud className="w-10 h-10 text-muted/30 mx-auto mb-2" />
                                        <p>{activeStackLabel} is not configured.</p>
                                    </div>
                                ) : activeQueue.length === 0 ? (
                                    <div className="text-center py-8 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                        <DownloadCloud className="w-10 h-10 text-muted/30 mx-auto mb-2" />
                                        No active {isTvInstance ? 'TV' : 'movie'} downloads
                                    </div>
                                ) : (
                                    activeQueue.map((item: any) => {
                                        const downloaded = item.size - item.sizeleft;
                                        const progress = item.size > 0 ? (downloaded / item.size) * 100 : 0;

                                        return (
                                            <div key={item.id} className="bg-background/40 hover:bg-background/60 transition-all rounded-xl p-4 border border-white/5 flex flex-col gap-2">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div className="flex flex-col gap-1 min-w-0">
                                                        <span className="font-bold text-sm text-text line-clamp-1 leading-snug">{item.title}</span>
                                                        <span className="text-[10px] text-muted/60 font-semibold">{item.timeleft || 'Unknown time'} left</span>
                                                    </div>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-plex/10 text-plex rounded-md border border-plex/20 uppercase tracking-wider">{item.status}</span>
                                                </div>
                                                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden mt-1 relative">
                                                    <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                                </div>
                                                <div className="flex justify-between text-[10px] text-muted/60 mt-0.5 font-medium">
                                                    <span>{progress.toFixed(1)}%</span>
                                                    <span>{formatBytes(downloaded)} / {formatBytes(item.size)}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h2 className="text-xl font-bold text-text flex items-center gap-2 mb-1">
                            {isTvInstance ? <Tv className="w-5 h-5 text-plex" /> : <Film className="w-5 h-5 text-plex" />}
                            {activeStackLabel} Status
                        </h2>
                        {renderStatusCard(activeStackLabel, activeInstanceData)}
                    </div>

                    <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-4 md:p-6 relative flex-grow flex flex-col">
                        <h2 className="text-xl font-bold text-text mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-plex" />
                            {activeStackLabel} History
                        </h2>

                        <div className="flex flex-col gap-3 flex-grow justify-start">
                            {!activeStackConfigured ? (
                                <div className="text-center py-12 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                    <p>{activeStackLabel} is not configured.</p>
                                </div>
                            ) : activeHistory.length === 0 ? (
                                <div className="text-center py-12 bg-background/30 rounded-xl border border-white/5 text-muted text-sm flex-grow flex flex-col justify-center items-center">
                                    No recent {isTvInstance ? 'TV' : 'movie'} history
                                </div>
                            ) : (
                                activeHistory.map((item: any) => (
                                    <div key={item.id} className="flex items-center gap-3 bg-background/30 rounded-xl p-3 border border-white/5 hover:bg-background/50 transition-colors">
                                        <div className={`w-1 h-8 rounded-full flex-shrink-0 ${getHistoryColor(item.eventType)}`}></div>
                                        <div className="flex-grow min-w-0">
                                            <div className="font-bold text-xs text-text line-clamp-1 leading-snug">{item.title}</div>
                                            <div className="text-[10px] text-muted flex justify-between items-center mt-0.5">
                                                <span>{formatEventType(item.eventType)}</span>
                                                <span>{formatRelativeAirDate(item.date)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const DownloadStatusPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState<'all' | 'sonarr' | 'radarr' | 'lidarr' | 'unknown'>('all');
    const [clientFilter, setClientFilter] = useState<string>('all');
    const [busyAction, setBusyAction] = useState('');
    const [uploadClientId, setUploadClientId] = useState('');
    const [uploadCategory, setUploadCategory] = useState('');
    const [torrentUrl, setTorrentUrl] = useState('');
    const [torrentFile, setTorrentFile] = useState<File | null>(null);
    const [uploadBusy, setUploadBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch('/api/downloads/status');
            setData(res);
            setError('');
        } catch (e: any) {
            setError(e.message || 'Failed to load downloads');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, 15000);
        return () => clearInterval(interval);
    }, [load]);

    const downloads = useMemo(() => {
        const all = Array.isArray(data?.downloads) ? data.downloads : [];
        const bySource = filter === 'all' ? all : all.filter((item: any) => item.source === filter);
        return clientFilter === 'all' ? bySource : bySource.filter((item: any) => String(item.clientId) === clientFilter);
    }, [data, filter, clientFilter]);

    const torrentClients = useMemo(() => (
        (Array.isArray(data?.clients) ? data.clients : [])
            .filter((entry: any) => entry?.client?.type !== 'sabnzbd')
            .map((entry: any) => entry.client)
    ), [data]);

    useEffect(() => {
        if (!uploadClientId && torrentClients.length > 0) setUploadClientId(String(torrentClients[0].id));
        if (uploadClientId && !torrentClients.some((client: any) => String(client.id) === uploadClientId)) {
            setUploadClientId(torrentClients[0]?.id ? String(torrentClients[0].id) : '');
        }
    }, [torrentClients, uploadClientId]);

    const formatBytes = (bytes: number) => {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = Number(bytes) || 0;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
        return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
    };

    const sourceLabel = (source: string) => ({ sonarr: 'Sonarr', radarr: 'Radarr', lidarr: 'Lidarr', unknown: 'Other' }[source] || 'Other');
    const uploadCategoryOptions = useMemo(() => {
        const seen = new Set(['']);
        const arrOptions = (Array.isArray(data?.downloadCategoryOptions) ? data.downloadCategoryOptions : [])
            .map((option: any) => ({
                label: String(option?.label || option?.value || '').trim(),
                value: String(option?.value || '').trim(),
            }))
            .filter((option: any) => {
                if (!option.value || seen.has(option.value)) return false;
                seen.add(option.value);
                return true;
            });
        return [{ label: 'No category', value: '' }, ...arrOptions];
    }, [data]);
    useEffect(() => {
        if (uploadCategory && !uploadCategoryOptions.some((option) => String(option.value) === uploadCategory)) {
            setUploadCategory('');
        }
    }, [uploadCategory, uploadCategoryOptions]);
    const downloadClientLabel = (type: string) => ({
        qbittorrent: 'qBittorrent',
        transmission: 'Transmission',
        bittorrent: 'BitTorrent',
        deluge: 'Deluge',
        sabnzbd: 'SABnzbd',
    }[String(type || '').toLowerCase()] || 'Download Client');
    const downloadClientIcon = (type: string) => {
        const normalized = String(type || '').toLowerCase();
        if (normalized === 'bittorrent') return 'https://cdn.simpleicons.org/bittorrent';
        if (['qbittorrent', 'transmission', 'deluge', 'sabnzbd'].includes(normalized)) return `${STATUS_ICON_BASE}/${normalized}.svg`;
        return `${STATUS_ICON_BASE}/qbittorrent.svg`;
    };
    const isPausedDownload = (item: any) => {
        const state = String(item?.state || '').toLowerCase();
        return state.includes('pause') || state.includes('stop') || state === 'queued';
    };
    const sendDownloadControl = async (item: any, action: 'pause' | 'resume' | 'remove') => {
        const key = `${item.clientId}-${item.id}-${action}`;
        setBusyAction(key);
        try {
            await apiFetch('/api/downloads/control', {
                method: 'POST',
                body: JSON.stringify({
                    clientId: item.clientId,
                    downloadId: item.downloadId || item.hash || item.infoHash || item.id,
                    action,
                }),
            });
            await load();
        } catch (e: any) {
            setError(e.message || `Failed to ${action} download`);
        } finally {
            setBusyAction('');
        }
    };
    const controlDownload = (item: any, action: 'pause' | 'resume' | 'remove') => {
        if (action === 'remove') {
            appConfirm(
                `Remove "${item.name}" from ${item.clientName}? Downloaded files will be left in place where the client supports it.`,
                () => { sendDownloadControl(item, action); },
            );
            return;
        }
        sendDownloadControl(item, action);
    };
    const uploadTorrent = async () => {
        const targetClientId = String(uploadClientId || '').trim();
        if (!targetClientId) {
            setError('Choose a download client first.');
            return;
        }
        if (!torrentFile && !torrentUrl.trim()) {
            setError('Add a torrent URL, magnet link, or torrent file.');
            return;
        }
        setUploadBusy(true);
        const category = String(uploadCategory || '').trim();
        try {
            if (torrentFile) {
                const bytes = await torrentFile.arrayBuffer();
                const params = new URLSearchParams({
                    clientId: targetClientId,
                    filename: torrentFile.name || 'upload.torrent',
                });
                if (category) params.set('category', category);
                await apiFetch(`/api/downloads/add-file?${params.toString()}`, {
                    method: 'POST',
                    headers: { 'Content-Type': torrentFile.type || 'application/x-bittorrent' },
                    body: bytes,
                });
            } else {
                await apiFetch('/api/downloads/add-url', {
                    method: 'POST',
                    body: JSON.stringify({ clientId: targetClientId, url: torrentUrl.trim(), category }),
                });
            }
            setTorrentUrl('');
            setTorrentFile(null);
            setError('');
            await load();
        } catch (e: any) {
            setError(e.message || 'Failed to add torrent');
        } finally {
            setUploadBusy(false);
        }
    };

    if (loading) return <Loader isLoading={true} />;

    return (
        <div className="w-full animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-text uppercase tracking-widest flex items-center gap-3">
                        <DownloadCloud className="w-8 h-8 text-plex" />
                        Download Status
                    </h1>
                    <p className="text-muted text-sm mt-1">All configured download clients, grouped by Sonarr, Radarr, and Lidarr.</p>
                </div>
                <button type="button" onClick={load} className="px-4 py-2 rounded-lg border border-border text-sm font-bold text-text hover:bg-white/5">
                    Refresh
                </button>
            </div>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-sm">{error}</div>}

            {isAdmin && (
                <div className="bg-card border border-white/5 rounded-2xl p-4 shadow-xl">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                        <div className="lg:w-56">
                            <label className="text-[10px] uppercase tracking-widest font-bold text-muted mb-1.5 block">Client</label>
                            <CustomSelect
                                value={uploadClientId}
                                onChange={setUploadClientId}
                                options={torrentClients.map((client: any) => ({
                                    label: client.name || downloadClientLabel(client.type),
                                    value: String(client.id),
                                }))}
                            />
                        </div>
                        <div className="lg:w-48">
                            <label className="text-[10px] uppercase tracking-widest font-bold text-muted mb-1.5 block">Category</label>
                            <CustomSelect
                                value={uploadCategory}
                                onChange={setUploadCategory}
                                options={uploadCategoryOptions}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <label className="text-[10px] uppercase tracking-widest font-bold text-muted mb-1.5 block">Torrent URL or Magnet</label>
                            <input
                                value={torrentUrl}
                                onChange={(e) => { setTorrentUrl(e.target.value); if (e.target.value.trim()) setTorrentFile(null); }}
                                placeholder="magnet:?xt=... or https://example/torrent.torrent"
                                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all text-sm"
                            />
                        </div>
                        <label className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-border bg-white/[0.04] text-sm font-bold text-text hover:bg-white/10 cursor-pointer transition-colors">
                            <Upload className="w-4 h-4 text-plex" />
                            {torrentFile ? torrentFile.name : 'Torrent File'}
                            <input
                                type="file"
                                accept=".torrent,application/x-bittorrent"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    setTorrentFile(file);
                                    if (file) setTorrentUrl('');
                                }}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={uploadTorrent}
                            disabled={uploadBusy || !uploadClientId || (!torrentFile && !torrentUrl.trim())}
                            className="px-5 py-3 rounded-lg bg-plex text-background text-sm font-black hover:bg-plex-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {uploadBusy ? 'Sending...' : 'Add Torrent'}
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(['all', 'sonarr', 'radarr', 'lidarr', 'unknown'] as const).map((key) => (
                    <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-xl border p-4 text-left transition-colors ${filter === key ? 'border-plex bg-plex/10 text-plex' : 'border-white/5 bg-card text-text hover:bg-white/5'}`}>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted">{key === 'all' ? 'All' : sourceLabel(key)}</p>
                        <p className="text-2xl font-black mt-1">{key === 'all' ? data?.counts?.total || 0 : data?.counts?.[key] || 0}</p>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-card border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h2 className="text-xl font-bold text-text mb-4">Active Downloads</h2>
                    <div className="space-y-3">
                        {downloads.length === 0 ? (
                            <div className="text-center py-12 text-muted bg-background/30 rounded-xl border border-white/5">No downloads for this filter.</div>
                        ) : downloads.map((item: any) => {
                            const paused = isPausedDownload(item);
                            const actionKey = `${item.clientId}-${item.id}`;
                            return (
                            <div key={`${item.clientId}-${item.id}`} className="rounded-xl border border-white/5 bg-background/40 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 min-w-0 w-full">
                                            <p className="font-bold text-text truncate min-w-0">{item.name}</p>
                                            <img src={downloadClientIcon(item.clientType)} alt="" className="w-4 h-4 object-contain shrink-0 opacity-80 ml-auto" />
                                        </div>
                                        <p className="text-xs text-muted mt-1">
                                            {item.clientName} · {sourceLabel(item.source)}
                                            {item.arrInstanceName ? ` · ${item.arrInstanceName}` : ''}
                                            {' · '}
                                            {item.state || 'Unknown'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-sm font-black text-plex">{Math.round(item.progress || 0)}%</span>
                                        {isAdmin && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => controlDownload(item, paused ? 'resume' : 'pause')}
                                                    disabled={busyAction.startsWith(actionKey)}
                                                    title={paused ? 'Resume download' : 'Pause download'}
                                                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-text hover:border-plex/40 hover:text-plex disabled:opacity-50 transition-colors"
                                                >
                                                    {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => controlDownload(item, 'remove')}
                                                    disabled={busyAction.startsWith(actionKey)}
                                                    title="Remove download"
                                                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden mt-3">
                                    <div className="h-full bg-plex rounded-full" style={{ width: `${Math.max(0, Math.min(100, item.progress || 0))}%` }} />
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted mt-2">
                                    <span>{formatBytes(item.downloaded)} / {formatBytes(item.size)}</span>
                                    <span>Down {formatBytes(item.downloadSpeed)}/s</span>
                                    <span>Up {formatBytes(item.uploadSpeed)}/s</span>
                                    {item.category && <span>{item.category}</span>}
                                    {item.sourceReason === 'arr_queue' && <span>Matched from Arr queue</span>}
                                </div>
                            </div>
                        );})}
                    </div>
                </div>
                <div className="bg-card border border-white/5 rounded-2xl p-4 shadow-xl">
                    <h2 className="text-xl font-bold text-text mb-4">Clients</h2>
                    <div className="space-y-3">
                        {(data?.clients || []).length === 0 ? (
                            <p className="text-sm text-muted">No download clients configured in Settings.</p>
                        ) : data.clients.map((client: any) => {
                            const activeClientFilter = clientFilter === String(client.client.id);
                            return (
                            <button
                                key={client.client.id}
                                type="button"
                                onClick={() => setClientFilter(activeClientFilter ? 'all' : String(client.client.id))}
                                className={`w-full rounded-xl border p-3 text-left transition-colors ${activeClientFilter ? 'border-plex bg-plex/10' : 'border-white/5 bg-background/40 hover:bg-white/[0.06]'}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="inline-flex w-8 h-8 rounded-lg bg-white/5 border border-white/10 items-center justify-center overflow-hidden shrink-0">
                                            <img src={downloadClientIcon(client.client.type)} alt="" className="w-5 h-5 object-contain" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-text truncate">{client.client.name || downloadClientLabel(client.client.type)}</p>
                                            <p className="text-[11px] text-muted">{downloadClientLabel(client.client.type)} · {client.count} downloads</p>
                                        </div>
                                    </div>
                                    <span className={`w-2.5 h-2.5 rounded-full ${client.online ? 'bg-green-500' : 'bg-red-500'}`} />
                                </div>
                                {client.error && <p className="text-xs text-red-300 mt-2">{client.error}</p>}
                            </button>
                        );})}
                    </div>
                    {clientFilter !== 'all' && (
                        <button type="button" onClick={() => setClientFilter('all')} className="mt-3 text-xs font-bold text-plex hover:underline">
                            Clear client filter
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

const GRAPH_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#14b8a6', // teal
    '#f97316', // orange
    '#a855f7'  // violet
];

const TautulliGraphsTab: React.FC = () => {
    const [graphs, setGraphs] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [days, setDays] = useState('30');
    const [yAxis, setYAxis] = useState<'plays' | 'duration'>('plays');

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setError('');
        apiFetch(`/api/tautulli/graphs?days=${days}&y_axis=${yAxis}`)
            .then(data => {
                if (cancelled) return;
                setGraphs(data);
                setIsLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                setError(err.message || 'Failed to load graphs');
                setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [days, yAxis]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64 glass-card-sm mt-6">
                <RefreshCw className="w-8 h-8 text-plex animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-xl mt-6 flex items-center gap-3">
                <AlertCircle className="w-6 h-6" />
                <span>{error}</span>
            </div>
        );
    }

    if (!graphs || Object.keys(graphs).length === 0) {
        return null;
    }

    const {
        get_plays_by_date,
        get_plays_by_dayofweek,
        get_plays_by_hourofday,
        get_plays_by_stream_type,
        get_plays_by_stream_resolution,
        get_plays_by_top_10_platforms,
        get_concurrent_streams_by_stream_type,
        get_plays_by_source_resolution,
        get_plays_by_top_10_users
    } = graphs;

    const parseDateData = (data: any) => {
        if (!data || !data.categories || !data.series) return [];
        return data.categories.map((date: string, i: number) => {
            const obj: any = { date };
            data.series.forEach((s: any) => {
                let val = s.data[i] || 0;
                if (yAxis === 'duration') {
                    // Convert seconds to hours, rounded to 1 decimal place
                    val = parseFloat((val / 3600).toFixed(1));
                }
                obj[s.name] = val;
            });
            return obj;
        });
    };

    const parseConcurrentData = (data: any) => {
        if (!data || !data.categories || !data.series) return [];
        return data.categories.map((date: string, i: number) => {
            const obj: any = { date };
            data.series.forEach((s: any) => {
                obj[s.name] = s.data[i] || 0;
            });
            return obj;
        });
    };

    const getSeriesKeys = (data: any) => {
        if (!data || !data.series) return [];
        return data.series.map((s: any) => s.name);
    };

    const STREAM_COLORS: Record<string, string> = {
        'Direct Play': '#eab308',
        'Direct Stream': '#e2e8f0',
        'Transcode': '#ef4444'
    };

    const dailyData = parseDateData(get_plays_by_date);
    const dayOfWeekData = parseDateData(get_plays_by_dayofweek);
    const hourOfDayData = parseDateData(get_plays_by_hourofday);

    const streamTypeData = parseDateData(get_plays_by_stream_type);
    const streamTypeKeys = getSeriesKeys(get_plays_by_stream_type);

    const concurrentData = parseConcurrentData(get_concurrent_streams_by_stream_type);
    const concurrentKeys = getSeriesKeys(get_concurrent_streams_by_stream_type);

    const resolutionData = parseDateData(get_plays_by_stream_resolution);
    const resolutionKeys = getSeriesKeys(get_plays_by_stream_resolution);

    const platformData = parseDateData(get_plays_by_top_10_platforms);
    const platformKeys = getSeriesKeys(get_plays_by_top_10_platforms);

    const sourceResolutionData = parseDateData(get_plays_by_source_resolution);
    const sourceResolutionKeys = getSeriesKeys(get_plays_by_source_resolution);

    const topUsersData = parseDateData(get_plays_by_top_10_users);
    const topUsersKeys = getSeriesKeys(get_plays_by_top_10_users);

    return (
        <div className="space-y-6 mt-6 min-w-0">
            <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4">
                {/* Y-Axis Toggle */}
                <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 w-fit">
                    <button onClick={() => setYAxis('plays')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${yAxis === 'plays' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                        Play Count
                    </button>
                    <button onClick={() => setYAxis('duration')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors ${yAxis === 'duration' ? 'bg-plex text-white shadow-lg' : 'text-muted hover:text-white'}`}>
                        Watch Duration
                    </button>
                </div>
                {/* Timeframe selector */}
                <div className="w-48">
                    <CustomSelect
                        value={days}
                        onChange={setDays}
                        options={[
                            { label: 'Last 7 Days', value: '7' },
                            { label: 'Last 30 Days', value: '30' },
                            { label: 'Last 90 Days', value: '90' },
                            { label: 'Last 365 Days', value: '365' },
                            { label: 'All Time', value: '0' }
                        ]}
                    />
                </div>
            </div>

            {/* Daily Play Count by Media Type */}
            <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                    <LucideLineChart className="w-5 h-5 text-[#3b82f6]" /> {yAxis === 'plays' ? 'Daily Play Count by Media Type' : 'Daily Watch Duration by Media Type (Hours)'}
                </h3>
                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                            <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} tickMargin={10} minTickGap={20} />
                            <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                            <RechartsTooltip contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Line type="monotone" dataKey="TV" stroke="#eab308" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Movies" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Music" stroke="#ef4444" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="Total" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Play count by day of week */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-green-400" /> {yAxis === 'plays' ? 'Play Count by Day of Week' : 'Watch Duration by Day of Week (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dayOfWeekData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <RechartsTooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                <Legend />
                                <Bar dataKey="TV" stackId="a" fill="#eab308" />
                                <Bar dataKey="Movies" stackId="a" fill="#3b82f6" />
                                <Bar dataKey="Music" stackId="a" fill="#ef4444" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Play count by hour of day */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-5 h-5 text-orange-400" /> {yAxis === 'plays' ? 'Play Count by Hour of Day' : 'Watch Duration by Hour of Day (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hourOfDayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <RechartsTooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                <Legend />
                                <Bar dataKey="TV" stackId="a" fill="#eab308" />
                                <Bar dataKey="Movies" stackId="a" fill="#3b82f6" />
                                <Bar dataKey="Music" stackId="a" fill="#ef4444" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Play count by stream type */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-5 h-5 text-sky-400" /> {yAxis === 'plays' ? 'Daily Stream Type Breakdown' : 'Daily Stream Type Duration Breakdown (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={streamTypeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                <Legend />
                                {streamTypeKeys.map((key: string) => (
                                    <Line key={key} type="monotone" dataKey={key} stroke={STREAM_COLORS[key] || '#3b82f6'} strokeWidth={2} dot={false} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Concurrent streams by stream type */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-plex" /> Daily Concurrent Stream Count by Stream Type
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={concurrentData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <RechartsTooltip contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                <Legend />
                                {concurrentKeys.map((key: string) => (
                                    <Line key={key} type="monotone" dataKey={key} stroke={STREAM_COLORS[key] || '#3b82f6'} strokeWidth={2} dot={false} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Play count by stream resolution */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <MonitorSmartphone className="w-5 h-5 text-purple-400" /> {yAxis === 'plays' ? 'Stream Resolution Breakdown' : 'Stream Resolution Duration Breakdown (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={resolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <RechartsTooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                <Legend />
                                {resolutionKeys.map((key: string, idx: number) => (
                                    <Bar key={key} dataKey={key} stackId="a" fill={GRAPH_COLORS[idx % GRAPH_COLORS.length]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Play count by platform */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                            <Users className="w-5 h-5 text-teal-400" /> {yAxis === 'plays' ? 'Top 10 Streaming Platforms' : 'Top 10 Platforms by Watch Duration (Hours)'}
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={platformData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                    <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                    <RechartsTooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                    <Legend />
                                    {platformKeys.map((key: string, idx: number) => (
                                        <Bar key={key} dataKey={key} stackId="a" fill={GRAPH_COLORS[idx % GRAPH_COLORS.length]} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Play count by source resolution */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden">
                    <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-400" /> {yAxis === 'plays' ? 'Source File Resolution Breakdown' : 'Source File Resolution Duration Breakdown (Hours)'}
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sourceResolutionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                <RechartsTooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                <Legend />
                                {sourceResolutionKeys.map((key: string, idx: number) => (
                                    <Bar key={key} dataKey={key} stackId="a" fill={GRAPH_COLORS[idx % GRAPH_COLORS.length]} />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Play count by top 10 users */}
                <div className="glass-card-sm p-4 md:p-6 relative overflow-hidden flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-400" /> {yAxis === 'plays' ? 'Top 10 Active Users Breakdown' : 'Top 10 Users by Watch Duration (Hours)'}
                        </h3>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topUsersData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                    <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                    <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 12 }} />
                                    <RechartsTooltip cursor={{ fill: '#ffffff10' }} contentStyle={{ backgroundColor: '#1e2329', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                                    <Legend />
                                    {topUsersKeys.map((key: string, idx: number) => (
                                        <Bar key={key} dataKey={key} stackId="a" fill={GRAPH_COLORS[idx % GRAPH_COLORS.length]} />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ServerInsightsWidget: React.FC<{
    peakHours: number[],
    tautulliData: any,
    compare: any,
    analyticsSourceLabel: string,
    peakDate?: string,
    setPeakDate: (date: string) => void,
    peakDateData?: number[] | null,
    peakDateLoading?: boolean,
    isJellyfinPortal?: boolean,
    periodPlays?: number,
    uniqueViewers?: number,
}> = ({ peakHours, tautulliData, compare, analyticsSourceLabel, peakDate, setPeakDate, peakDateData, peakDateLoading, isJellyfinPortal = false, periodPlays = 0, uniqueViewers = 0 }) => {
    
    // Format chart data
    const activePeakHours = peakDateData || peakHours;
    const chartData = activePeakHours ? activePeakHours.map((count, hour) => {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h = hour % 12 || 12;
        return {
            time: `${h}${ampm}`,
            plays: count
        };
    }) : [];
    const statsAreJellystatTotals = isJellyfinPortal && tautulliData?.playbackMethodStatsAreTotals;
    const displayPeriodPlays = compare?.totalPlaybacks?.current ?? periodPlays ?? tautulliData?.totalPlays ?? 0;
    const displayUniqueViewers = compare?.uniqueViewers?.current ?? uniqueViewers ?? 0;
    const displayWatchTime = tautulliData?.totalTimeStr || (isJellyfinPortal ? 'Unavailable' : '0 mins');

    const formatChange = (data: any) => {
        if (!data || data.percent === null) return null;
        const isPos = data.percent > 0;
        const color = isPos ? 'text-green-500' : (data.percent < 0 ? 'text-red-500' : 'text-muted');
        const icon = isPos ? '↑' : (data.percent < 0 ? '↓' : '');
        return <span className={`text-xs font-bold ${color} ml-2`}>{icon}{Math.abs(data.percent)}%</span>;
    };

    return (
        <div className="w-full flex flex-col gap-6 lg:col-span-2">
            <h2 className="text-xl font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <Activity className="text-plex w-5 h-5" /> Server Insights & Load
            </h2>

            {/* Peak Hours Chart */}
            <div className="glass-card-sm p-4 md:p-6 w-full flex flex-col flex-1 relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Peak Playback Hours
                    </h3>
                    <div className="flex items-center gap-2 relative z-10">
                        {peakDate && (
                            <button onClick={() => setPeakDate('')} className="text-xs text-muted hover:text-white" title="Clear specific date view">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <input 
                            type="date" 
                            value={peakDate} 
                            onChange={(e) => setPeakDate(e.target.value)} 
                            max={new Date().toISOString().split('T')[0]}
                            className="bg-black/40 border border-white/5 rounded-md px-2 py-1 text-xs text-white outline-none focus:border-plex transition-colors"
                        />
                    </div>
                </div>
                <div className="w-full h-[250px] sm:h-[320px] relative">
                    {peakDateLoading && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                            <Loader2 className="w-8 h-8 text-plex animate-spin" />
                        </div>
                    )}
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorPlays" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#e5a00d" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#e5a00d" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                            <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickMargin={10} minTickGap={15} />
                            <YAxis stroke="#ffffff40" fontSize={10} tickFormatter={(val) => val} />
                            <RechartsTooltip 
                                contentStyle={{ backgroundColor: '#111315', borderColor: '#ffffff20', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                itemStyle={{ color: '#e5a00d' }}
                                formatter={(value: any) => [`${value} plays`, 'Activity']}
                            />
                            <Area type="monotone" dataKey="plays" stroke="#e5a00d" strokeWidth={3} fillOpacity={1} fill="url(#colorPlays)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Server Records Grid */}
            {tautulliData && (
                <div className="glass-card-sm p-4 md:p-6 w-full flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-5 pointer-events-none">
                        <Activity className="w-48 h-48 text-[#3b82f6]" />
                    </div>
                    <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2 relative z-10">
                        <Activity className="w-4 h-4 text-[#3b82f6]" /> {analyticsSourceLabel} Records & Period Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-3 relative z-10">
                        {!isJellyfinPortal ? (
                            <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                                <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Users className="w-3 h-3 text-[#3b82f6]"/> Peak Streams</span>
                                <p className="text-xl font-black text-[#3b82f6]">{tautulliData?.streamsRecord || 0} <span className="text-[9px] font-normal text-muted">concurrent</span></p>
                            </div>
                        ) : (
                            <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                                <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Users className="w-3 h-3 text-[#3b82f6]"/> Active Streams</span>
                                <p className="text-xl font-black text-[#3b82f6]">{tautulliData?.activeStreams || 0} <span className="text-[9px] font-normal text-muted">now</span></p>
                            </div>
                        )}
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Clock className="w-3 h-3 text-green-400"/> Watch Time</span>
                            <p className="text-base font-black text-green-400 leading-tight">{displayWatchTime}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-yellow-400"/> Period Plays</span>
                            <p className="text-xl font-black text-yellow-400 flex items-center">{displayPeriodPlays.toLocaleString()} {formatChange(compare?.totalPlaybacks)}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Users className="w-3 h-3 text-pink-400"/> Unique Viewers</span>
                            <p className="text-xl font-black text-pink-400 flex items-center">{displayUniqueViewers.toLocaleString()} {formatChange(compare?.uniqueViewers)}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Monitor className="w-3 h-3 text-cyan-400" /> {statsAreJellystatTotals ? 'Direct Plays' : 'Peak Direct Plays'}</span>
                            <p className="font-mono font-black text-cyan-400 text-xl">{tautulliData?.directPlayRecord || 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Activity className="w-3 h-3 text-orange-400" /> {statsAreJellystatTotals ? 'Direct Streams' : 'Peak Direct Streams'}</span>
                            <p className="font-mono font-black text-orange-400 text-xl">{tautulliData?.directStreamRecord || 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Settings className="w-3 h-3 text-rose-400" /> {statsAreJellystatTotals ? 'Transcodes' : 'Peak Transcodes'}</span>
                            <p className="font-mono font-black text-rose-400 text-xl">{tautulliData?.transcodeRecord || 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><PlaySquare className="w-3 h-3 text-purple-400" /> TV Shows Played</span>
                            <p className="font-mono font-black text-purple-400 text-xl">{tautulliData?.tvPlays ? tautulliData.tvPlays.toLocaleString() : 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Film className="w-3 h-3 text-red-400" /> Movies Played</span>
                            <p className="font-mono font-black text-red-400 text-xl">{tautulliData?.moviePlays ? tautulliData.moviePlays.toLocaleString() : 0}</p>
                        </div>
                        <div className="flex flex-col p-3 bg-black/20 rounded-lg border border-white/5 shadow-inner">
                            <span className="font-bold text-muted text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Music className="w-3 h-3 text-emerald-400" /> Music Played</span>
                            <p className="font-mono font-black text-emerald-400 text-xl">{tautulliData?.musicPlays ? tautulliData.musicPlays.toLocaleString() : 0}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const LibraryDeltaBadge: React.FC<{ value?: number }> = ({ value }) => {
    if (!value) return null;
    const isPos = value > 0;
    return (
        <span 
            className={`text-sm font-bold ml-2 ${isPos ? 'text-green-500' : 'text-red-500'} animate-[fade-in_0.5s_ease-out] cursor-help`}
            title="Added since the last daily library scan"
        >
            {isPos ? '+' : ''}{value.toLocaleString()}
        </span>
    );
};
const AnimatedLeaderboard: React.FC<{ users: any[], resolveAvatar: (thumb: string | null | undefined, w?: number, h?: number) => string, isAdmin: boolean, onUserClick: (u: any) => void }> = ({ users, resolveAvatar, isAdmin, onUserClick }) => {
    const prevUsersRef = useRef<any[]>([]);
    
    useEffect(() => {
        prevUsersRef.current = users;
    }, [users]);

    const prevUsers = prevUsersRef.current;
    
    if (!users || users.length === 0) return null;

    const maxPlays = Math.max(...users.map(u => u.plays || 0), 1);

    const top3 = users.slice(0, 3);
    const rest = users.slice(3, 10);

    const getRankDelta = (userId: string, currentRank: number) => {
        if (!prevUsers || prevUsers.length === 0) return null;
        const prevIdx = prevUsers.findIndex(u => u.id === userId);
        if (prevIdx === -1) return { type: 'new' };
        const diff = prevIdx - (currentRank - 1);
        if (diff > 0) return { type: 'up', val: diff };
        if (diff < 0) return { type: 'down', val: Math.abs(diff) };
        return null;
    };

    const renderPodiumCard = (user: any, rank: number) => {
        const delta = getRankDelta(user.id, rank);
        const isFirst = rank === 1;
        const heightClass = isFirst ? 'h-48' : 'h-40';
        const ringClass = isFirst ? 'ring-2 ring-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : rank === 2 ? 'ring-1 ring-slate-300' : 'ring-1 ring-amber-700';
        
        return (
            <div onClick={() => isAdmin && onUserClick(user)} className={`flex flex-col items-center justify-end bg-card/80 border border-border rounded-xl p-4 relative cursor-pointer hover:bg-white/5 transition-all group w-full ${heightClass} ${ringClass}`}>
                {isFirst && <div className="absolute -top-6 text-4xl animate-[crown-pulse_2s_ease-in-out_infinite]">👑</div>}
                {!isFirst && <div className="absolute -top-4 text-3xl">{rank === 2 ? '🥈' : '🥉'}</div>}
                
                <img src={resolveAvatar(user.thumb, 80, 80)} alt={user.username} onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }} className={`rounded-full object-cover mb-2 border-2 ${isFirst ? 'w-20 h-20 border-yellow-500' : 'w-16 h-16 border-border'} bg-card`} />
                <span className="font-bold text-text group-hover:text-plex transition-colors truncate w-full text-center">{user.username}</span>
                <span className="text-xs text-muted font-mono mt-1">{user.plays} plays</span>
                
                {delta && (
                    <div className="absolute -right-2 -top-2">
                        {delta.type === 'new' && <span className="bg-plex text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-[rank-up_0.3s_ease-out]">NEW</span>}
                        {delta.type === 'up' && <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center animate-[rank-up_0.3s_ease-out]">↑{delta.val}</span>}
                        {delta.type === 'down' && <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center animate-[rank-down_0.3s_ease-out]">↓{delta.val}</span>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full flex flex-col gap-4">
            <h2 className="text-xl font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <Trophy className="text-plex w-5 h-5" /> Hall of Fame
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Podium */}
                {top3.length > 0 && (
                    <div className="lg:col-span-1 flex flex-col justify-center h-full pt-8 lg:pt-0">
                        <div className="flex items-end justify-center gap-2 sm:gap-4">
                            {top3[1] && <div className="flex-1 max-w-[120px]">{renderPodiumCard(top3[1], 2)}</div>}
                            <div className="flex-1 max-w-[140px] z-10">{renderPodiumCard(top3[0], 1)}</div>
                            {top3[2] && <div className="flex-1 max-w-[120px]">{renderPodiumCard(top3[2], 3)}</div>}
                        </div>
                    </div>
                )}

                {/* List */}
                <div className="lg:col-span-2 flex flex-col gap-2 justify-center">
                    {rest.map((user, idx) => {
                        const rank = idx + 4;
                        const delta = getRankDelta(user.id, rank);
                        const pct = Math.max(2, (user.plays / maxPlays) * 100);
                        const hasFire = user.plays >= (maxPlays * 0.4) && user.plays > 0;

                        return (
                            <div key={user.id} onClick={() => isAdmin && onUserClick(user)} className="flex items-center gap-3 sm:gap-4 bg-black/20 p-2 sm:p-3 rounded-lg border border-border/50 cursor-pointer hover:bg-black/40 hover:border-plex/50 transition-colors group relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 bg-plex/10 animate-[bar-grow_1s_ease-out]" style={{ width: `${pct}%` }}></div>
                                
                                <div className="w-6 text-center font-bold text-muted group-hover:text-text z-10">#{rank}</div>
                                <img src={resolveAvatar(user.thumb, 40, 40)} onError={(e) => { (e.target as HTMLImageElement).src = logoUrl(); }} className="w-8 h-8 rounded-full border border-border z-10 bg-card flex-shrink-0" />
                                
                                <div className="flex-1 flex items-center gap-2 z-10 min-w-0">
                                    <span className="font-bold text-text truncate group-hover:text-plex transition-colors">{user.username}</span>
                                    {hasFire && <span className="text-sm" title="Hot Streak!">🔥</span>}
                                </div>

                                <div className="flex items-center gap-3 z-10 flex-shrink-0">
                                    {delta && (
                                        <div className="w-8 sm:w-10 text-right">
                                            {delta.type === 'new' && <span className="bg-plex/20 text-plex text-[9px] font-bold px-1.5 py-0.5 rounded animate-[rank-up_0.3s_ease-out]">NEW</span>}
                                            {delta.type === 'up' && <span className="text-green-400 text-xs font-bold animate-[rank-up_0.3s_ease-out]">↑{delta.val}</span>}
                                            {delta.type === 'down' && <span className="text-red-400 text-xs font-bold animate-[rank-down_0.3s_ease-out]">↓{delta.val}</span>}
                                        </div>
                                    )}
                                    <div className="w-16 sm:w-20 text-right font-mono text-xs sm:text-sm whitespace-nowrap">
                                        <CountUp end={user.plays} /> <span className="text-muted hidden sm:inline">plays</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
const DetailsModal: React.FC<{ item: any, onClose: () => void }> = ({ item, onClose }) => {
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        if (!item) return;
        const fetchDetails = async () => {
            try {
                // Robust ratingKey extraction
                let ratingKey = '';
                if (item.ratingKey) {
                    ratingKey = item.ratingKey;
                } else if (item.key) {
                    const m = String(item.key).match(/\/(\d+)$/);
                    if (m) ratingKey = m[1];
                } else if (item.plexUrl) {
                    const decoded = decodeURIComponent(item.plexUrl);
                    const match = decoded.match(/metadata\/(\d+)/);
                    if (match) ratingKey = match[1];
                }

                if (!ratingKey) {
                    console.warn('Could not extract ratingKey from item:', item);
                    setLoading(false);
                    return;
                }
                const res = await apiFetch('/api/plex/item/' + encodeURIComponent(ratingKey));
                if (res.ok) {
                    const data = await res.json();
                    if (!data.error) setDetails(data);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [item]);

    if (!item) return null;

    const formatDuration = (ms: number) => {
        if (!ms) return '0m';
        const mins = Math.floor(ms / 60000);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const hasProgress = details?.viewOffset > 0 && details?.duration > 0;
    const progressPct = hasProgress ? Math.min(100, Math.max(0, (details.viewOffset / details.duration) * 100)) : 0;
    const isCompleted = details?.viewCount > 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 animate-fade-in backdrop-blur-sm" onClick={onClose}>
            <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-slide-up overflow-hidden relative isolate" onClick={e => e.stopPropagation()}>
                {/* Header with Background */}
                <div className="relative h-48 sm:h-56 flex-shrink-0 bg-black/50 border-b border-white/5 rounded-t-2xl overflow-hidden">
                    {details?.art ? (
                        <img src={resolvePortalAssetUrl(details.art)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                    
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors text-white/70 hover:text-white z-10 border border-white/10">
                        <X className="w-5 h-5" />
                    </button>

                    <div className="absolute bottom-0 left-0 right-0 p-5 flex gap-4">
                        <div className={`w-16 sm:w-20 ${item.type === 'track' ? 'aspect-square' : 'aspect-[2/3]'} rounded-md overflow-hidden flex-shrink-0 shadow-lg border border-white/10 bg-black/50 z-10`}>
                            {details?.thumb || item.thumbUrl ? (
                                <img src={resolvePortalAssetUrl(details?.thumb || item.thumbUrl)} alt="" className="w-full h-full object-cover" />
                            ) : null}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-end pb-1 z-10">
                            <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight drop-shadow-md">
                                {details?.title || item.title}
                            </h2>
                            {(details?.year || details?.grandparentTitle) && (
                                <span className="text-sm text-white/70 font-semibold drop-shadow-sm mt-1">
                                    {details?.grandparentTitle ? `${details.grandparentTitle} • ` : ''}{details?.year || ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center items-center py-12"><span className="animate-pulse text-muted font-medium">Loading details...</span></div>
                    ) : details ? (
                        <div className="space-y-6">
                            {/* Watch Progress */}
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5 shadow-inner">
                                <div className="flex justify-between items-end mb-2.5">
                                    <div>
                                        <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Watch Status</h4>
                                        <p className="text-sm font-semibold text-text">
                                            {isCompleted ? 'Completed' : hasProgress ? `Watched ${formatDuration(details.viewOffset)} of ${formatDuration(details.duration)}` : `Duration: ${formatDuration(details.duration)}`}
                                        </p>
                                    </div>
                                    {isCompleted && <div className="text-plex drop-shadow-[0_0_8px_rgba(229,160,13,0.5)]"><CheckCircle className="w-5 h-5" /></div>}
                                </div>
                                {(hasProgress || isCompleted) && (
                                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                                        <div className="h-full bg-plex rounded-full transition-all duration-1000" style={{ width: isCompleted ? '100%' : `${progressPct}%` }} />
                                    </div>
                                )}
                            </div>

                            {/* Summary */}
                            {details.summary && (
                                <div>
                                    <h4 className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Overview</h4>
                                    <p className="text-sm text-text/80 leading-relaxed font-medium">{details.summary}</p>
                                </div>
                            )}
                            
                            <div className="pt-2">
                                <a href={item.plexUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold text-text transition-colors border border-white/5 hover:border-white/10">
                                    <PlaySquare className="w-4 h-4 text-plex" /> View on Plex
                                </a>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted font-medium">Details not available.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ItemViewersModal: React.FC<{ item: { title: string, viewers: Record<string, any> } | null, onClose: () => void, resolveAvatar: (t: string|null|undefined) => string }> = ({ item, onClose, resolveAvatar }) => {
    if (!item) return null;
    const viewersArray = item.viewers ? Object.values(item.viewers).sort((a: any, b: any) => b.plays - a.plays) : [];
    
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 animate-fade-in backdrop-blur-sm" onClick={onClose}>
            <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh] animate-slide-up overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-white/5 bg-black/20">
                    <h2 className="text-lg font-bold text-white pr-4 line-clamp-1 flex items-center gap-2"><PlaySquare className="w-5 h-5 text-plex" /> {item.title}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-muted hover:text-white flex-shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    {viewersArray.length === 0 ? (
                        <p className="p-4 text-center text-muted text-sm leading-relaxed">No specific viewer data available for this item yet. Viewer data will populate automatically as new views occur.</p>
                    ) : (
                        <div className="flex flex-col gap-1 p-2">
                            {viewersArray.map((v: any, i: number) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-background/50 hover:bg-white/5 rounded-xl transition-colors border border-transparent hover:border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shadow-inner flex-shrink-0">
                                            <img src={resolveAvatar(v.thumb)} alt={v.username} className="w-full h-full object-cover" />
                                        </div>
                                        <span className="font-bold text-text truncate max-w-[150px] sm:max-w-[200px]">{v.username}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-plex/10 text-plex px-3 py-1.5 rounded-lg text-sm font-mono font-bold shadow-sm">
                                        {v.plays} {v.plays === 1 ? 'play' : 'plays'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const AnalyticsDashboard: React.FC<{ isAdmin: boolean, sessionInfo: any }> = ({ isAdmin, sessionInfo }) => {
    const [analyticsData, setAnalyticsData] = useState<{
        topUsers: any[],
        topLibraries: any[],
        topMovies: any[],
        topShows: any[],
        topMusic: any[],
        topDevices: any[],
        peakHours: number[],
        totalPlaybacks: number,
        totalActiveUsers?: number,
        maxConcurrentStreams: number,
        maxDirectPlays: number,
        maxTranscodes: number,
        compare?: {
            previousPeriodDays: string,
            totalPlaybacks: { absolute: number, percent: number | null, previous?: number, current?: number },
            uniqueViewers: { absolute: number, percent: number | null, previous?: number, current?: number },
            libraryPlays: { absolute: number, percent: number | null, previous?: number, current?: number }
        } | null,
        libraryHealth?: {
            activeLibraries: number,
            concentrationPct: number,
            totalCatalogItems: number,
            totalCatalogBytes?: number,
            sizeGB: number,
            fourKPercent: number,
            catalogWatchedPct?: number,
            healthLabel: string,
            movies?: number,
            shows?: number,
            episodes?: number,
            artists?: number,
            albums?: number,
            tracks?: number,
            resolutions?: Record<string, number> | null,
            codecs?: Record<string, number> | null,
            fileSizes?: Record<string, any> | null,
            deltas?: any
        },
        requestedPeriodDays?: string | number,
        cachePeriodDays?: string | number | null,
        cacheFallback?: boolean,
    } | null>(null);
    const [tautulliData, setTautulliData] = useState<{ streamsRecord: number, transcodeRecord: number, directPlayRecord: number, directStreamRecord: number, totalPlays: number, tvPlays: number, moviePlays: number, musicPlays: number, totalTimeStr: string } | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState<string>('30');
    const [peakDate, setPeakDate] = useState<string>('');
    const [peakDateData, setPeakDateData] = useState<number[] | null>(null);
    const [peakDateLoading, setPeakDateLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState<{ id: string, username: string, thumb: string | null } | null>(null);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [contentTab, setContentTab] = useState<'movies' | 'shows' | 'music'>('movies');
    const [viewerPage, setViewerPage] = useState(1);
    const viewersPerPage = 10;
    const [viewTab, setViewTab] = useState<'overview' | 'graphs'>('overview');
    const mediaServerType = String(sessionInfo?.mediaServerType || 'plex').toLowerCase();
    const isJellyfinPortal = mediaServerType === 'jellyfin';
    const analyticsSourceLabel = isJellyfinPortal ? 'Jellystat' : 'Tautulli';
    const libraryDeltas = (analyticsData?.libraryHealth as any)?.deltas || {};

    const resolveUserAvatar = (thumb: string | null | undefined, width = 80, height = 80) => {
        if (!thumb) return logoUrl();
        if (thumb.startsWith('http://') || thumb.startsWith('https://') || thumb.startsWith('/api/')) {
            return resolvePortalAssetUrl(thumb);
        }
        return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumb)}&width=${width}&height=${height}`);
    };

    useEffect(() => {
        if (!isAdmin) return;
        const fetchUsers = async () => {
            try {
                const usersData = await apiFetch('/api/users');
                setAllUsers(usersData);
            } catch (err) {
                console.error("Failed to fetch users", err);
            }
        };
        fetchUsers();
    }, []);

    useEffect(() => {
        const checkHash = () => {
            if (allUsers.length === 0) return;
            const hash = typeof window !== 'undefined' ? window.location.hash : '';
            if (hash.startsWith('#user=')) {
                const username = decodeURIComponent(hash.replace('#user=', ''));
                if (username) {
                    const found = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
                    setSelectedUser({ 
                        id: found?.id || username, 
                        username: found?.username || username, 
                        thumb: found?.thumb || null 
                    });
                }
            }
        };

        checkHash();
        window.addEventListener('hashchange', checkHash);
        return () => window.removeEventListener('hashchange', checkHash);
    }, [allUsers]);

    useEffect(() => {
        if (!peakDate) {
            setPeakDateData(null);
            return;
        }
        let cancelled = false;
        setPeakDateLoading(true);
        apiFetch(`/api/plex/analytics/day?date=${peakDate}`)
            .then(data => {
                if (!cancelled) setPeakDateData(data);
            })
            .catch(err => {
                console.error("Failed to fetch day analytics", err);
                if (!cancelled) setPeakDateData(null);
            })
            .finally(() => {
                if (!cancelled) setPeakDateLoading(false);
            });
        return () => { cancelled = true; };
    }, [peakDate]);

    useEffect(() => {
        let cancelled = false;
        const fetchAnalytics = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await apiFetch(`${isJellyfinPortal ? '/api/jellystat/analytics' : '/api/plex/analytics'}?days=${days}`);
                if (cancelled) return;
                setAnalyticsData(data);

                if (isAdmin) {
                    try {
                        const tData = isJellyfinPortal ? data.jellystatInsights : await apiFetch('/api/tautulli/stats');
                        if (cancelled) return;
                        setTautulliData(tData);
                    } catch (e) {
                        // Tautulli/Jellystat might not be configured, ignore the extra panel.
                        if (!cancelled) setTautulliData(null);
                    }
                } else {
                    setTautulliData(null);
                }
            } catch (err: any) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchAnalytics();
        return () => { cancelled = true; };
    }, [days, isAdmin, isJellyfinPortal]);

    useEffect(() => {
        if (isJellyfinPortal && viewTab === 'graphs') setViewTab('overview');
    }, [isJellyfinPortal, viewTab]);

    const topUsersLength = analyticsData?.topUsers?.length || 0;
    const totalViewerPages = Math.max(1, Math.ceil(topUsersLength / viewersPerPage));

    useEffect(() => {
        setViewerPage(1);
    }, [days]);

    useEffect(() => {
        if (viewerPage > totalViewerPages) {
            setViewerPage(totalViewerPages);
        }
    }, [viewerPage, totalViewerPages]);

    if (isLoading) return <Loader isLoading={true} />;
    if (error) return <div className="text-red-500 font-bold p-8 text-center">{error}</div>;
    if (!analyticsData) return null;

    const { topUsers, topLibraries, topMovies, topShows, topMusic, topDevices, peakHours, totalPlaybacks, maxConcurrentStreams, maxDirectPlays, maxTranscodes } = analyticsData;
    const uniqueActiveViewers = topUsers.filter((u: any) => (u.plays || 0) > 0).length;
    const maxLibraryPlays = Math.max(...topLibraries.map(l => l.plays), 1);
    const maxDevicePlays = Math.max(...topDevices.map(d => d.plays), 1);
    const maxPeakHour = Math.max(...peakHours, 1);
    const viewerPageSafe = Math.min(viewerPage, totalViewerPages);
    const pagedTopUsers = topUsers.slice((viewerPageSafe - 1) * viewersPerPage, viewerPageSafe * viewersPerPage);

    let activeContent = topMovies;
    if (contentTab === 'shows') activeContent = topShows;
    else if (contentTab === 'music') activeContent = topMusic;
    const compare = analyticsData.compare || null;
    const libraryHealth = analyticsData.libraryHealth || null;

    const formatPriorPeriodLabel = (days: string) => {
        if (days === '1') return '24 hours';
        if (days === '7') return '7 days';
        if (days === '365') return 'year';
        if (days === '1825') return '5 years';
        return `${days} days`;
    };

    const renderDelta = (delta?: { absolute: number, percent: number | null, previous?: number, current?: number } | null) => {
        if (!delta) return null;
        if (delta.absolute === 0 && delta.previous === 0) return null;
        const isUp = delta.absolute >= 0;
        const sign = isUp ? '+' : '';
        let pctText: string;
        if (delta.percent !== null) {
            pctText = `${sign}${delta.percent}%`;
        } else if ((delta.previous ?? 0) === 0 && delta.absolute > 0) {
            pctText = 'New';
        } else {
            pctText = `${sign}${delta.absolute}`;
        }
        const priorLabel = compare?.previousPeriodDays ? formatPriorPeriodLabel(compare.previousPeriodDays) : null;
        const tooltip = priorLabel
            ? `Compared to the previous ${priorLabel}${delta.previous != null ? ` (${delta.previous})` : ''}`
            : undefined;
        return (
            <span
                title={tooltip}
                className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold mt-1 ${isUp ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}
            >
                {pctText}
            </span>
        );
    };
return (
        <div className="w-full min-w-0 animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col gap-4 mb-6">
                <h1 className="text-3xl font-black text-text flex items-center gap-3 uppercase tracking-wider">
                    <BarChart3 className="w-8 h-8 text-plex" />
                    Advanced Analytics
                </h1>
                <div className="flex flex-row items-center justify-between gap-3 w-full">
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 w-fit overflow-x-auto hide-scrollbar">
                        <button onClick={() => setViewTab('overview')} className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 md:gap-2 ${viewTab === 'overview' ? 'bg-plex text-background' : 'text-muted hover:text-text'}`}>
                            <Activity className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Overview</span><span className="sm:hidden">Overview</span>
                        </button>
                        {!isJellyfinPortal && (
                            <button onClick={() => setViewTab('graphs')} className={`px-3 md:px-4 py-2 rounded-md text-xs md:text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 md:gap-2 ${viewTab === 'graphs' ? 'bg-plex text-background' : 'text-muted hover:text-text'}`}>
                                <LucideLineChart className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Graphs</span><span className="sm:hidden">Graphs</span>
                            </button>
                        )}
                    </div>
                    {viewTab === 'overview' && (
                        <div className="w-[140px] md:w-48 shrink-0">
                            <CustomSelect
                                value={days}
                                onChange={(val) => setDays(val as string)}
                                compact={true}
                                options={[
                                    { label: 'Last 24 Hours', value: '1' },
                                    { label: 'Last 7 Days', value: '7' },
                                    { label: 'Last 30 Days', value: '30' },
                                    { label: 'Last 60 Days', value: '60' },
                                    { label: 'Last 1 Year', value: '365' },
                                    { label: 'Last 5 Years', value: '1825' },
                                    { label: 'All Time', value: 'all' }
                                ]}
                            />
                        </div>
                    )}
                </div>
            </div>

            {viewTab === 'graphs' && <TautulliGraphsTab />}

            {viewTab === 'overview' && (
                <>
                    {/* removed erroneous ServerInsightsOverview */}
                    {analyticsData.cacheFallback && (
                        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                            Analytics cache for this period is still building. Showing cached data from the last {analyticsData.cachePeriodDays} day period instead.
                        </div>
                    )}
                    {/* High Level Stats Overview */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="glass-card-sm p-6 flex items-center gap-4">
                            <div className="bg-plex/10 p-4 rounded-full">
                                <PlaySquare className="text-plex w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-muted text-sm uppercase tracking-wider font-bold mb-1">Total Playbacks</p>
                                <p className="text-2xl font-black text-text"><CountUp end={totalPlaybacks} /></p>
                                {renderDelta(compare?.totalPlaybacks)}
                            </div>
                        </div>
                        <div className="glass-card-sm p-6 flex items-center gap-4">
                            <div className="bg-plex/10 p-4 rounded-full">
                                <Users className="text-plex w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-muted text-sm uppercase tracking-wider font-bold mb-1">Unique Viewers</p>
                                <p className="text-lg font-bold text-text truncate max-w-[150px]" title={String(uniqueActiveViewers)}>{uniqueActiveViewers}</p>
                                {renderDelta(compare?.uniqueViewers)}
                            </div>
                        </div>
                        <div className="glass-card-sm p-6 flex items-center gap-4 col-span-1 sm:col-span-2">
                            <div className="w-full h-full flex flex-col justify-center">
                                <p className="text-muted text-sm uppercase tracking-wider font-bold mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-plex" /> Peak Viewing Hours</p>
                                <div className="flex items-end gap-1 h-12 w-full mt-auto">
                                    {peakHours.map((val, idx) => (
                                        <div key={idx} className="flex-1 bg-plex opacity-20 hover:opacity-80 transition-opacity rounded-t-sm relative group" style={{ height: `${Math.max((val / maxPeakHour) * 100, 5)}%` }}>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                                                {idx === 0 ? '12 AM' : idx < 12 ? `${idx} AM` : idx === 12 ? '12 PM' : `${idx - 12} PM`}: {val} plays
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-[10px] text-muted mt-1 font-mono">
                                    <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {libraryHealth && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Library Balance</p>
                                    <p className="text-xl font-black text-plex">{libraryHealth.healthLabel}</p>
                                    <p className="text-[10px] text-muted mt-1 leading-snug">How evenly viewing is spread across libraries — not server health.</p>
                                </div>
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Active Libraries</p>
                                    <p className="text-xl font-black text-text">{libraryHealth.activeLibraries}</p>
                                </div>
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Catalog Size</p>
                                    <p className="text-xl font-black text-text">{libraryHealth.totalCatalogItems.toLocaleString()}</p>
                                    <p className="text-[11px] text-muted">{formatSizeCeil(libraryHealth.totalCatalogBytes ?? libraryHealth.sizeGB * 1024 ** 3)}</p>
                                </div>
                                <div className="glass-card-sm p-4">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Usage Concentration</p>
                                    <p className="text-xl font-black text-text">{libraryHealth.concentrationPct}%</p>
                                    <p className="text-[11px] text-muted truncate">Watched: {libraryHealth.catalogWatchedPct || 0}% • 4K: {libraryHealth.fourKPercent}%</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="glass-card-sm p-4 flex flex-col justify-center">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Movies Catalog</p>
                                    <div className="flex items-center">
                                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.movies || 0} /></p>
                                        <LibraryDeltaBadge value={libraryDeltas.movies} />
                                    </div>
                                    <p className="text-[11px] text-muted">Total movies in library</p>
                                </div>
                                <div className="glass-card-sm p-4 flex flex-col justify-center">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">TV Shows Catalog</p>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.shows || 0} /></p>
                                        <span className="text-xs font-semibold text-muted ml-1">Shows</span>
                                        <LibraryDeltaBadge value={libraryDeltas.shows} />
                                    </div>
                                    <div className="flex items-center text-[11px] text-muted mt-0.5">
                                        <CountUp end={libraryHealth.episodes || 0} /> <span className="ml-1">episodes</span>
                                        <LibraryDeltaBadge value={libraryDeltas.episodes} />
                                    </div>
                                </div>
                                <div className="glass-card-sm p-4 flex flex-col justify-center">
                                    <p className="text-muted text-xs uppercase tracking-wider font-bold mb-1">Music Catalog</p>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xl font-black text-text"><CountUp end={libraryHealth.artists || 0} /></p>
                                        <span className="text-xs font-semibold text-muted ml-1">Artists</span>
                                        <LibraryDeltaBadge value={libraryDeltas.artists} />
                                    </div>
                                    <div className="flex items-center text-[11px] text-muted mt-0.5">
                                        <CountUp end={libraryHealth.albums || 0} /> <span className="mx-1">albums</span> <LibraryDeltaBadge value={libraryDeltas.albums} />
                                        <span className="mx-1">•</span> 
                                        <CountUp end={libraryHealth.tracks || 0} /> <span className="mx-1">tracks</span> <LibraryDeltaBadge value={libraryDeltas.tracks} />
                                    </div>
                                </div>
                            </div>

                            {libraryHealth.resolutions && libraryHealth.codecs && libraryHealth.fileSizes && (() => {
                                const sortedCodecs = Object.entries(libraryHealth.codecs || {})
                                    .map(([name, count]) => ({ name, count: count as number }))
                                    .sort((a, b) => b.count - a.count);
                                const totalCodecs = sortedCodecs.reduce((sum, item) => sum + item.count, 0) || 1;

                                const sortedResolutions = Object.entries(libraryHealth.resolutions || {})
                                    .map(([name, count]) => ({ name, count: count as number }))
                                    .sort((a, b) => b.count - a.count);
                                const totalResolutions = sortedResolutions.reduce((sum, item) => sum + item.count, 0) || 1;

                                const fileSizeEntries = Object.entries(libraryHealth.fileSizes || {})
                                    .map(([range, val]) => {
                                        let movies = 0;
                                        let shows = 0;
                                        if (val && typeof val === 'object') {
                                            movies = (val as any).movies || 0;
                                            shows = (val as any).shows || 0;
                                        } else if (typeof val === 'number') {
                                            shows = val;
                                        }
                                        return { range, movies, shows, total: movies + shows };
                                    });
                                const maxFileSizeCount = Math.max(...fileSizeEntries.map(e => e.total), 1);

                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="glass-card-sm p-5 flex flex-col justify-between">
                                            <div>
                                                <h3 className="text-muted text-xs uppercase tracking-wider font-bold mb-4">Video Codecs</h3>
                                                <div className="flex flex-col gap-3">
                                                    {sortedCodecs.map((item) => {
                                                        const pct = Math.round((item.count / totalCodecs) * 100);
                                                        return (
                                                            <div key={item.name} className="flex flex-col gap-1">
                                                                <div className="flex justify-between text-xs font-semibold">
                                                                    <span className="text-text">{item.name}</span>
                                                                    <span className="text-muted font-mono">{item.count.toLocaleString()} ({pct}%)</span>
                                                                </div>
                                                                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                                                    <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="glass-card-sm p-5 flex flex-col justify-between">
                                            <div>
                                                <h3 className="text-muted text-xs uppercase tracking-wider font-bold mb-4">Resolutions</h3>
                                                <div className="flex flex-col gap-3">
                                                    {sortedResolutions.map((item) => {
                                                        const pct = Math.round((item.count / totalResolutions) * 100);
                                                        return (
                                                            <div key={item.name} className="flex flex-col gap-1">
                                                                <div className="flex justify-between text-xs font-semibold">
                                                                    <span className="text-text">{item.name}</span>
                                                                    <span className="text-muted font-mono">{item.count.toLocaleString()} ({pct}%)</span>
                                                                </div>
                                                                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                                                                    <div className="bg-plex h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="glass-card-sm p-5 flex flex-col">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-muted text-xs uppercase tracking-wider font-bold">File Size Distribution</h3>
                                                <div className="flex items-center gap-3 text-[10px] text-muted font-semibold">
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-2 h-2 bg-plex rounded-sm inline-block" />
                                                        <span>Movies</span>
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="w-2 h-2 bg-plex/30 rounded-sm inline-block border border-plex/20" />
                                                        <span>TV Shows</span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-end justify-between h-40 pt-4 px-2 w-full gap-3 mt-auto">
                                                {fileSizeEntries.map((item) => {
                                                    const totalHeightPct = (item.total / maxFileSizeCount) * 100;
                                                    const moviesPctOfBar = item.total > 0 ? (item.movies / item.total) * 100 : 0;
                                                    const showsPctOfBar = item.total > 0 ? (item.shows / item.total) * 100 : 0;
                                                    
                                                    return (
                                                        <div key={item.range} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                                                            <div 
                                                                className="w-full relative transition-all duration-500 flex flex-col justify-end" 
                                                                style={{ height: `${Math.max(totalHeightPct, 4)}%` }}
                                                            >
                                                                {/* Bar container with overflow-hidden for rounded-t corners */}
                                                                <div className="w-full h-full rounded-t overflow-hidden flex flex-col justify-end">
                                                                    {/* Movies part (Top) */}
                                                                    {item.movies > 0 && (
                                                                        <div 
                                                                            className="w-full bg-plex hover:opacity-100 transition-opacity" 
                                                                            style={{ height: `${moviesPctOfBar}%` }} 
                                                                        />
                                                                    )}
                                                                    {/* TV Shows part (Bottom) */}
                                                                    {item.shows > 0 && (
                                                                        <div 
                                                                            className="w-full bg-plex/30 hover:opacity-100 transition-opacity border-t border-black/10" 
                                                                            style={{ height: `${showsPctOfBar}%` }} 
                                                                        />
                                                                    )}
                                                                </div>

                                                                {/* Detailed Tooltip (Placed outside the overflow-hidden container, inside the height wrapper) */}
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-black/95 text-white text-[10px] px-2.5 py-1.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20 font-mono shadow-md border border-white/5 flex flex-col gap-0.5 leading-none">
                                                                    <span className="font-bold text-plex mb-1 text-[11px]">{item.range}</span>
                                                                    <span className="flex justify-between gap-4"><span>Movies:</span> <span className="text-white font-bold">{item.movies.toLocaleString()}</span></span>
                                                                    <span className="flex justify-between gap-4"><span>TV Episodes:</span> <span className="text-white font-bold">{item.shows.toLocaleString()}</span></span>
                                                                    <span className="border-t border-white/10 mt-1 pt-1 flex justify-between gap-4"><span>Total:</span> <span className="text-plex font-bold">{item.total.toLocaleString()}</span></span>
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] text-muted font-bold tracking-wider text-center line-clamp-1 w-full" title={item.range}>{item.range}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}

                    <div className="w-full">
                        <AnimatedLeaderboard users={topUsers} resolveAvatar={resolveUserAvatar} isAdmin={isAdmin} onUserClick={setSelectedUser as any} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        <ServerInsightsWidget 
                            peakHours={analyticsData?.peakHours || []} 
                            tautulliData={tautulliData} 
                            compare={analyticsData?.compare} 
                            analyticsSourceLabel={analyticsSourceLabel}
                            peakDate={peakDate}
                            setPeakDate={setPeakDate}
                            peakDateData={peakDateData}
                            peakDateLoading={peakDateLoading}
                            isJellyfinPortal={isJellyfinPortal}
                            periodPlays={analyticsData?.totalPlaybacks || tautulliData?.totalPlays || 0}
                            uniqueViewers={analyticsData?.totalActiveUsers || topUsers?.length || 0}
                        />

                        {/* Top Devices & Libraries Container */}
                        <div className="flex flex-col gap-6 lg:col-span-1">
                            {/* Popular Libraries Card */}
                            <div className="glass-card-sm p-4 md:p-6">
                                <h2 className="text-xl font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><PlaySquare className="text-plex w-5 h-5" /> Popular Libraries</h2>
                                <div className="flex flex-col gap-5 mt-2">
                                    {topLibraries.length === 0 ? <p className="text-muted text-sm">No data available.</p> : topLibraries.map((lib, idx) => (
                                        <div key={lib.id} className="flex flex-col gap-2">
                                            <div className="flex justify-between items-end">
                                                <span className="font-bold text-text flex items-center gap-2"><span className="text-muted text-xs">#{idx + 1}</span> {lib.title}</span>
                                                <span className="text-xs text-muted font-mono">{lib.plays} plays</span>
                                            </div>
                                            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-plex to-[#e5a00d] rounded-full" style={{ width: `${(lib.plays / maxLibraryPlays) * 100}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Devices Card */}
                            {topDevices && topDevices.length > 0 && (
                                <div className="glass-card-sm p-4 md:p-6">
                                    <h2 className="text-xl font-bold text-text mb-4 uppercase tracking-wider flex items-center gap-2"><MonitorSmartphone className="text-plex w-5 h-5" /> Top Devices</h2>
                                    <div className="flex flex-col gap-4">
                                        {topDevices.slice(0, 5).map((device: any, idx: number) => (
                                            <div key={idx} className="flex flex-col gap-1.5">
                                                <div className="flex justify-between items-end">
                                                    <span className="font-bold text-sm text-text truncate pr-2 flex items-center gap-2">
                                                        <span className="text-muted text-xs">#{idx + 1}</span> {device.name || 'Unknown Device'}
                                                    </span>
                                                    <span className="text-xs text-muted font-mono flex-shrink-0">{device.plays} plays</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${(device.plays / Math.max(maxDevicePlays, 1)) * 100}%` }}></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>



                        {/* Trending Content Card */}
                        <div className="glass-card-sm p-4 md:p-6 col-span-full">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                                <h2 className="text-xl font-bold text-text uppercase tracking-wider flex items-center gap-2"><TrendingUp className="text-plex w-5 h-5" /> Trending Content</h2>
                                <div className="flex items-center gap-2 bg-black/30 p-1 rounded-lg border border-border">
                                    <button onClick={() => setContentTab('movies')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${contentTab === 'movies' ? 'bg-plex text-black shadow-md' : 'text-muted hover:text-text hover:bg-white/5'}`}>Movies</button>
                                    <button onClick={() => setContentTab('shows')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${contentTab === 'shows' ? 'bg-plex text-black shadow-md' : 'text-muted hover:text-text hover:bg-white/5'}`}>TV Shows</button>
                                    <button onClick={() => setContentTab('music')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${contentTab === 'music' ? 'bg-plex text-black shadow-md' : 'text-muted hover:text-text hover:bg-white/5'}`}>Music</button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4">
                                {activeContent.length === 0 ? <p className="text-muted text-sm col-span-full">No data available.</p> : activeContent.slice(0, 10).map((item, idx) => (
                                    <a key={item.key} href={item.plexUrl} target="_blank" rel="noreferrer" className="flex flex-col sm:flex-row bg-black/20 rounded-xl overflow-hidden hover:bg-black/40 transition-all cursor-pointer group hover:ring-1 hover:ring-plex shadow-md">
                                        <div className={`sm:w-32 lg:w-40 flex-shrink-0 relative ${contentTab === 'music' ? 'aspect-square' : 'aspect-[2/3]'}`}>
                                            {item.thumbUrl ? (
                                                <img src={resolvePortalAssetUrl(item.thumbUrl)} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-black/40"><Film className="w-8 h-8 opacity-50 text-muted" /></div>
                                            )}
                                            <div className="absolute top-2 left-2 bg-plex text-black font-bold text-xs px-2 py-1 rounded-md shadow-lg drop-shadow-md">#{idx + 1}</div>
                                        </div>
                                        <div className="p-4 sm:p-5 flex flex-col justify-between flex-grow">
                                            <div>
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <h3 className="text-lg sm:text-xl font-bold text-text group-hover:text-plex transition-colors line-clamp-1">{item.title}</h3>
                                                    <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-md text-xs font-mono text-plex flex-shrink-0 whitespace-nowrap shadow-sm">
                                                        <PlaySquare className="w-3 h-3" /> {item.plays} plays
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted mb-3 font-medium">
                                                    {item.year && <span>{item.year}</span>}
                                                    {item.year && (item.contentRating || item.rating || item.duration > 0 || (item.genres && item.genres.length > 0)) && <span className="opacity-50">&bull;</span>}
                                                    {item.contentRating && <span>{item.contentRating}</span>}
                                                    {item.contentRating && (item.rating || item.duration > 0 || (item.genres && item.genres.length > 0)) && <span className="opacity-50">&bull;</span>}
                                                    {item.duration > 0 && <span>{Math.round(item.duration / 60000)} min</span>}
                                                    {item.duration > 0 && item.rating && <span className="opacity-50">&bull;</span>}
                                                    {item.rating && (
                                                        <span className="flex items-center gap-1 text-yellow-500">
                                                            <Star className="w-3 h-3 fill-current" /> {item.rating}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-text/80 line-clamp-2 sm:line-clamp-3 mb-3 leading-relaxed">
                                                    {item.summary || "No summary available."}
                                                </p>
                                            </div>
                                            {item.genres && item.genres.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-auto">
                                                    {item.genres.slice(0, 4).map((g: string, i: number) => (
                                                        <span key={i} className="text-[10px] uppercase tracking-wider bg-white/5 border border-white/10 text-muted px-2 py-1 rounded-full shadow-sm">{g}</span>
                                                    ))}
                                                    {item.genres.length > 4 && (
                                                        <span className="text-[10px] uppercase tracking-wider bg-white/5 border border-white/10 text-muted px-2 py-1 rounded-full shadow-sm">+{item.genres.length - 4}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}
            {isAdmin && selectedUser && (
                <UserAnalyticsModal
                    userId={selectedUser.id}
                    username={selectedUser.username}
                    thumb={selectedUser.thumb}
                    days={days}
                    onClose={() => {
                        setSelectedUser(null);
                        if (window.location.hash.startsWith('#user=')) {
                            window.history.pushState('', document.title, window.location.pathname + window.location.search);
                        }
                    }}
                />
            )}
        </div>
    );
};


// --- Logs Dashboard Component ---
export const LogsDashboard: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
    const [deletedUsers, setDeletedUsers] = useState<any[]>([]);
    const [auditEntries, setAuditEntries] = useState<any[]>([]);
    const [isLoading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<any[]>([]);
    const [auditPage, setAuditPage] = useState(1);
    const [emailPage, setEmailPage] = useState(1);
    const itemsPerPage = 20;

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(t => pushToast(t, message, type));
    }, []);

    const fetchSecurityData = useCallback(async () => {
        setLoading(true);
        try {
            const [deletedUsersData, auditLogData] = await Promise.all([
                apiFetch('/api/deleted-users'),
                apiFetch('/api/audit-log')
            ]);
            setDeletedUsers(deletedUsersData);
            setAuditEntries(auditLogData);
        } catch (error: any) {
            addToast(error instanceof Error ? error.message : 'Failed to fetch logs.', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchSecurityData();
    }, [fetchSecurityData]);

    const handleUnblockDeletedUser = async (deletedUser: any) => {
        const label = deletedUser.username || deletedUser.email || 'this user';
        appConfirm(`Allow ${label} to use the portal again? This does not invite them automatically.`, async () => {
            setLoading(true);
            try {
                await apiFetch(`/api/deleted-users/${encodeURIComponent(deletedUser.blockId)}`, { method: 'DELETE' });
                addToast('Deleted user unblocked.');
                await fetchSecurityData();
            } catch (error: any) {
                addToast(error instanceof Error ? error.message : 'Failed to unblock user.', 'error');
            } finally {
                setLoading(false);
            }
        });
    };

    // Helper functions
    const formatDateTime = (dateString: string) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}, ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    };

    const formatEventName = (event: string) => {
        return event.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const isConfigured = true;

    const filteredAuditLog = auditEntries.filter(e => e.event !== 'system_email_sent');
    const emailLogs = auditEntries.filter(e => e.event === 'system_email_sent');
    const totalAuditPages = Math.max(1, Math.ceil(filteredAuditLog.length / itemsPerPage));
    const totalEmailPages = Math.max(1, Math.ceil(emailLogs.length / itemsPerPage));

    return (
        <div className="w-full flex flex-col">
            <Loader isLoading={isLoading} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <header className="page-header">
                <h1 className="page-title">System Logs</h1>
            </header>
            <main>
                <div className="flex flex-col gap-6 mb-8">
                    <section className="glass-card-sm p-4 md:p-5 shadow-md">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-text">Deleted User Blocklist</h2>
                                <p className="text-muted text-xs mt-1">Deleted users are logged out and blocked from requesting temporary access again.</p>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold">{deletedUsers.length}</span>
                        </div>
                        <div className="flex flex-col gap-3">
                            {deletedUsers.length === 0 ? (
                                <p className="text-muted text-sm border border-dashed border-border rounded-lg p-4 text-center">No deleted users are currently blocked.</p>
                            ) : (
                                deletedUsers.map(deletedUser => (
                                    <div key={deletedUser.blockId} className="flex items-center justify-between gap-3 bg-background/60 border border-border rounded-lg p-3">
                                        <div className="min-w-0">
                                            <p className="text-text font-semibold text-sm truncate">{deletedUser.username || 'Unknown user'}</p>
                                            <p className="text-muted text-xs truncate">{deletedUser.email || deletedUser.plexId || deletedUser.id || 'No identifier'}</p>
                                            <p className="text-muted/70 text-[11px] mt-1">Deleted {formatDateTime(deletedUser.deletedAt)} by {deletedUser.deletedBy || 'admin'}</p>
                                        </div>
                                        <button className="px-3 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors text-xs flex-shrink-0" onClick={() => handleUnblockDeletedUser(deletedUser)}>
                                            Unblock
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    <section className="glass-card-sm p-4 md:p-5 shadow-md">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-text">Audit Log</h2>
                                <p className="text-muted text-xs mt-1">Recent invite, deletion, sync, and access events.</p>
                            </div>
                            <button className="px-3 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors text-xs" onClick={fetchSecurityData}>
                                Refresh
                            </button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {filteredAuditLog.length === 0 ? (
                                <p className="text-muted text-sm border border-dashed border-border rounded-lg p-4 text-center">No audit events recorded yet.</p>
                            ) : (
                                <>
                                    {filteredAuditLog.slice((auditPage - 1) * itemsPerPage, auditPage * itemsPerPage).map(entry => (
                                        <div key={entry.id} className="bg-background/60 border border-border rounded-lg p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-text font-semibold text-sm">{formatEventName(entry.event)}</p>
                                                <span className="text-muted text-[11px] whitespace-nowrap">{formatDateTime(entry.timestamp)}</span>
                                            </div>
                                            <p className="text-muted text-xs mt-1">
                                                Target: {entry.target?.username || entry.target?.email || 'System'}
                                                {entry.actor?.username || entry.actor?.email ? ` · Actor: ${entry.actor.username || entry.actor.email}` : ''}
                                            </p>
                                        </div>
                                    ))}
                                    {totalAuditPages > 1 && (
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                                            <button
                                                className="px-3 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                                                disabled={auditPage === 1}
                                            >
                                                Previous
                                            </button>
                                            <span className="text-xs text-muted font-semibold">Page {auditPage} of {totalAuditPages}</span>
                                            <button
                                                className="px-3 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() => setAuditPage(p => Math.min(totalAuditPages, p + 1))}
                                                disabled={auditPage === totalAuditPages}
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </section>

                    <section className="glass-card-sm p-4 md:p-5 shadow-md">
                        <div className="flex items-center justify-between gap-4 mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-text">Email Log</h2>
                                <p className="text-muted text-xs mt-1">Recent system emails sent.</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3">
                            {emailLogs.length === 0 ? (
                                <p className="text-muted text-sm border border-dashed border-border rounded-lg p-4 text-center">No emails sent yet.</p>
                            ) : (
                                <>
                                    {emailLogs.slice((emailPage - 1) * itemsPerPage, emailPage * itemsPerPage).map(entry => (
                                        <div key={entry.id} className="bg-background/60 border border-border rounded-lg p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-text font-semibold text-sm line-clamp-1">{entry.details?.subject || 'System Email'}</p>
                                                <span className="text-muted text-[11px] whitespace-nowrap">{formatDateTime(entry.timestamp)}</span>
                                            </div>
                                            <p className="text-muted text-xs mt-1">
                                                To: {entry.target?.username || entry.target?.email || 'Unknown'}
                                            </p>
                                        </div>
                                    ))}
                                    {totalEmailPages > 1 && (
                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                                            <button
                                                className="px-3 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() => setEmailPage(p => Math.max(1, p - 1))}
                                                disabled={emailPage === 1}
                                            >
                                                Previous
                                            </button>
                                            <span className="text-xs text-muted font-semibold">Page {emailPage} of {totalEmailPages}</span>
                                            <button
                                                className="px-3 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() => setEmailPage(p => Math.min(totalEmailPages, p + 1))}
                                                disabled={emailPage === totalEmailPages}
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
};

const ABOUT_CONTRIBUTORS = [
    {
        name: 'jl94x4',
        role: 'Plex side',
        href: 'https://github.com/jl94x4',
        avatarUrl: 'https://github.com/jl94x4.png?size=128',
        note: 'Original project maintainer and Plex workflow lead.',
    },
    {
        name: 'Nerdy-Technician',
        role: 'Jellyfin / Emby side',
        href: 'https://github.com/Nerdy-Technician',
        avatarUrl: 'https://github.com/Nerdy-Technician.png?size=128',
        note: 'Jellyfin and Emby focused contributor and integration work.',
    },
];

const ABOUT_LINKS = [
    { label: 'Documentation', href: 'https://jl94x4.github.io/Server-Manager-Portal/' },
    { label: 'GitHub Repository', href: 'https://github.com/jl94x4/Server-Manager-Portal' },
    { label: 'Feature Overview', href: 'https://jl94x4.github.io/Server-Manager-Portal/features/overview.html' },
    { label: 'Getting Started', href: 'https://jl94x4.github.io/Server-Manager-Portal/guide/getting-started.html' },
];

export const AboutDashboard: React.FC<{ appVersion?: string; mediaServerType?: string }> = ({ appVersion, mediaServerType = 'plex' }) => {
    const providerLabel = String(mediaServerType || 'plex').toLowerCase() === 'jellyfin'
        ? 'Jellyfin'
        : String(mediaServerType || 'plex').toLowerCase() === 'emby'
            ? 'Emby'
            : 'Plex';
    const featurePillClass = 'rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-muted';
    return (
        <div className="w-full space-y-6 animate-fade-in">
            <div className="rounded-xl border border-border/70 bg-card/80 overflow-hidden shadow-2xl">
                <div className="p-6 sm:p-8 border-b border-border/70 bg-gradient-to-br from-white/10 via-transparent to-plex/10">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="w-12 h-12 rounded-xl bg-plex/15 border border-plex/30 flex items-center justify-center">
                                    <Info className="w-6 h-6 text-plex" />
                                </span>
                                <div>
                                    <p className="text-xs uppercase tracking-[0.22em] text-muted font-bold">About the project</p>
                                    <h1 className="text-3xl sm:text-4xl font-black text-text tracking-tight">Server Portal Manager</h1>
                                </div>
                            </div>
                            <p className="text-base sm:text-lg text-muted max-w-3xl leading-relaxed">
                                Server Portal Manager is the Media Control Station for a self-hosted media server: one central pane of glass for user access, request workflows, live activity, analytics, dashboards, and maintenance across Plex, Emby, and Jellyfin.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 lg:w-72 flex-shrink-0">
                            <div className="rounded-lg border border-border bg-background/70 p-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Current mode</p>
                                <p className="mt-1 text-lg font-black text-text">{providerLabel}</p>
                            </div>
                            <div className="rounded-lg border border-border bg-background/70 p-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Version</p>
                                <p className="mt-1 text-sm font-mono font-bold text-plex truncate">{appVersion || 'Development'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8 grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6">
                    <section className="space-y-5">
                        <div>
                            <h2 className="text-xl font-black text-text mb-3">One Central Place</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { icon: Users, title: 'Access & users', body: 'Manage invites, expiry, revokes, profiles, and admin impersonation without jumping between server tools.' },
                                    { icon: BarChart3, title: 'Stats & analytics', body: 'Bring server-wide rankings, personal wrap-ups, watch history, peak hours, libraries, and play trends into one dashboard.' },
                                    { icon: Activity, title: 'Live monitoring', body: 'See active streams, direct play/transcode status, player details, bandwidth, and current media activity at a glance.' },
                                    { icon: ClipboardList, title: 'Requests & review', body: 'Review Seerr, Jellyseerr, and Ombi requests from the same place as dashboards, user stats, and media operations.' },
                                    { icon: Calendar, title: 'Media stack', body: 'Surface Sonarr and Radarr calendars, queues, history, and connected service health inside the portal.' },
                                    { icon: Shield, title: 'Maintenance', body: 'Run library cleanup, status monitoring, upgrader workflows, logs, audits, and operational checks from a single console.' },
                                ].map(({ icon: Icon, title, body }) => (
                                    <div key={title} className="rounded-lg border border-border bg-background/70 p-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="w-9 h-9 rounded-lg bg-plex/10 border border-plex/20 flex items-center justify-center">
                                                <Icon className="w-4 h-4 text-plex" />
                                            </span>
                                            <h3 className="font-bold text-text">{title}</h3>
                                        </div>
                                        <p className="text-sm text-muted leading-relaxed">{body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-background/70 p-4">
                            <h2 className="text-lg font-black text-text mb-3">Supported Ecosystem</h2>
                            <div className="flex flex-wrap gap-2">
                                {['Plex', 'Jellyfin', 'Emby', 'Seerr', 'Jellyseerr', 'Ombi', 'Sonarr', 'Radarr', 'Tautulli', 'Jellystat', 'Download clients'].map((item) => (
                                    <span key={item} className={featurePillClass}>{item}</span>
                                ))}
                            </div>
                        </div>
                    </section>

                    <aside className="space-y-5">
                        <section className="rounded-lg border border-border bg-background/70 p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <GitFork className="w-5 h-5 text-plex" />
                                <h2 className="text-lg font-black text-text">Contributors</h2>
                            </div>
                            <div className="space-y-3">
                                {ABOUT_CONTRIBUTORS.map((contributor) => (
                                    <a
                                        key={contributor.name}
                                        href={contributor.href}
	                                        target="_blank"
	                                        rel="noopener noreferrer"
	                                        className="block rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-plex/40 transition-colors p-3"
	                                    >
	                                        <div className="flex items-start gap-3">
	                                            <img
	                                                src={contributor.avatarUrl}
	                                                alt=""
	                                                className="w-12 h-12 rounded-full object-cover bg-background border border-white/10 flex-shrink-0"
	                                                loading="lazy"
	                                            />
	                                            <div className="min-w-0 flex-1">
	                                                <div className="flex items-center justify-between gap-3">
	                                                    <div className="min-w-0">
	                                                        <p className="font-bold text-text truncate">{contributor.name}</p>
	                                                        <p className="text-xs text-plex font-bold">{contributor.role}</p>
	                                                    </div>
	                                                    <ExternalLink className="w-4 h-4 text-muted flex-shrink-0" />
	                                                </div>
	                                                <p className="mt-2 text-xs text-muted leading-relaxed">{contributor.note}</p>
	                                            </div>
	                                        </div>
	                                    </a>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-lg border border-border bg-background/70 p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <BookOpen className="w-5 h-5 text-plex" />
                                <h2 className="text-lg font-black text-text">Project Links</h2>
                            </div>
                            <div className="space-y-2">
                                {ABOUT_LINKS.map((link) => (
                                    <a
                                        key={link.href}
                                        href={link.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-plex/40 transition-colors px-3 py-2 text-sm font-semibold text-text"
                                    >
                                        <span>{link.label}</span>
                                        <ExternalLink className="w-4 h-4 text-muted flex-shrink-0" />
                                    </a>
                                ))}
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
};

// --- Admin Dashboard Component ---

export const AdminDashboard: React.FC<{ onLogout: () => void, onViewUserPortal: () => void, onViewStatus: () => void, onViewDashboard: () => void, onViewAsUser: (userId: string) => Promise<void> }> = ({ onLogout, onViewUserPortal, onViewStatus, onViewDashboard, onViewAsUser }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [isConfigured, setConfigured] = useState(false);
    const [configSettings, setConfigSettings] = useState<AppSettings>({ checkIntervalMinutes: 60 });
    const [isUserModalOpen, setUserModalOpen] = useState(false);
    const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [bulkCustomDate, setBulkCustomDate] = useState('');
    const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);
    const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

    // Filters and Sorting States
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'expiring' | 'expired' | 'revoked'>('all');
    const [sortBy, setSortBy] = useState<'username-asc' | 'username-desc' | 'expiry-asc' | 'expiry-desc' | 'joined-desc'>('username-asc');
    const mediaServerType = String(configSettings.mediaServerType || 'plex').toLowerCase();
    const mediaServerLabel = mediaServerType === 'jellyfin' ? 'Jellyfin' : 'Plex';

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(t => pushToast(t, message, type));
    }, []);

    const fetchUsers = useCallback(async () => {
        try {
            const usersData = await apiFetch('/api/users');
            setUsers(usersData);
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to fetch users.', 'error');
        }
    }, [addToast]);

    const fetchSecurityData = useCallback(async () => {
        try {
            const [deletedUsersData, auditLogData] = await Promise.all([
                apiFetch('/api/deleted-users'),
                apiFetch('/api/audit-log')
            ]);
            setDeletedUsers(deletedUsersData);
            setAuditEntries(auditLogData);
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to fetch security data.', 'error');
        }
    }, [addToast]);

    useEffect(() => {
        const checkConfigAndFetchData = async () => {
            setLoading(true);
            try {
                const configStatus = await apiFetch('/api/config');
                setConfigured(configStatus.configured);
                setConfigSettings(configStatus.settings); // Always update settings from backend

                if (configStatus.configured) {
                    await fetchUsers();
                    await fetchSecurityData();
                } else {
                    addToast('Welcome! Please configure your media server settings to begin.', 'success');
                    setSettingsModalOpen(true);
                }
            } catch (error) {
                addToast(error instanceof Error ? error.message : 'Could not connect to backend.', 'error');
            } finally {
                setLoading(false);
            }
        };
        checkConfigAndFetchData();
    }, [fetchUsers, fetchSecurityData, addToast]);


    const handleSaveConfig = async (config: PlexConfig) => {
        setLoading(true);
        try {
            await apiFetch('/api/config', {
                method: 'POST',
                body: JSON.stringify(config)
            });
            setConfigured(true);
            setConfigSettings({
                token: config.token,
                serverIdentifier: config.serverIdentifier,
                checkIntervalMinutes: config.checkIntervalMinutes || 60,
                smtpHost: config.smtpHost,
                smtpPort: config.smtpPort,
                smtpUser: config.smtpUser,
                smtpPass: config.smtpPass,
                smtpFrom: config.smtpFrom,
                smtpSecure: config.smtpSecure,
                emailDaysBefore: config.emailDaysBefore,
                newsletterFrequency: config.newsletterFrequency,
                newsletterDay: config.newsletterDay,
                publicDomain: config.publicDomain
            });
            setSettingsModalOpen(false);
            addToast('Settings saved successfully!');
            await fetchUsers();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to save config.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleImportUsers = async () => {
        if (!isConfigured) {
            addToast(`Please configure ${mediaServerLabel} settings first.`, 'error');
            return;
        }
        setLoading(true);
        try {
            const result = await apiFetch('/api/sync', { method: 'POST' });
            addToast(result.message || `Synced ${result.count} users from ${mediaServerLabel}.`);
            await fetchUsers(); // Refresh user list
            await fetchSecurityData();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'An unknown error occurred during sync.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const revokePlexAccess = async (userId: string) => {
        setLoading(true);
        try {
            const updatedUser = await apiFetch(`/api/users/${userId}/revoke`, { method: 'POST' });
            setUsers(currentUsers => currentUsers.map(u => u.id === userId ? updatedUser : u));
            addToast('Plex access revoked successfully.');
            await fetchSecurityData();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to revoke access.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleViewAsUser = async (user: User) => {
        setLoading(true);
        try {
            await onViewAsUser(user.id);
            addToast(`Now viewing portal as ${user.username}.`);
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to view as user.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenUserModal = (user: User) => {
        setEditingUser(user);
        setUserModalOpen(true);
    };

    const handleCloseModal = () => {
        setUserModalOpen(false);
        setEditingUser(null);
    };

    const handleSaveUser = async (userToSave: User) => {
        setLoading(true);
        try {
            const updatedUser = await apiFetch(`/api/users/${userToSave.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    expiryDate: userToSave.expiryDate,
                    exemptFromCleanup: userToSave.exemptFromCleanup,
                    optOutNewsletter: userToSave.optOutNewsletter,
                    requestOverrides: userToSave.requestOverrides || {},
                })
            });
            setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
            handleCloseModal();
            addToast('User updated successfully!');
            await fetchSecurityData();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to save user.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        appConfirm(`Are you sure you want to delete this user? This will revoke ${mediaServerLabel} access first where supported.`, async () => {
            setLoading(true);
            try {
                await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
                setUsers(users.filter(u => u.id !== userId));
                addToast('User removed from manager.');
                await fetchSecurityData();
            } catch (error) {
                addToast(error instanceof Error ? error.message : 'Failed to delete user.', 'error');
            } finally {
                setLoading(false);
            }
        });
    };

    const handleToggleSelection = (userId: string) => {
        setSelectedUserIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleBulkUpdate = async (action: 'addMonth' | 'addYear' | 'unlimited' | 'custom', customDate?: string) => {
        setLoading(true);
        try {
            await apiFetch('/api/users/bulk-update', {
                method: 'POST',
                body: JSON.stringify({ userIds: selectedUserIds, action, customDate })
            });
            addToast(`Successfully updated ${selectedUserIds.length} users.`);
            setSelectedUserIds([]);
            setBulkCustomDate('');
            await fetchUsers();
            await fetchSecurityData();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Bulk update failed.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUnblockDeletedUser = async (deletedUser: DeletedUser) => {
        const label = deletedUser.username || deletedUser.email || 'this user';
        appConfirm(`Allow ${label} to use the portal again? This does not invite them automatically.`, async () => {
            setLoading(true);
            try {
                await apiFetch(`/api/deleted-users/${encodeURIComponent(deletedUser.blockId)}`, { method: 'DELETE' });
                addToast('Deleted user unblocked.');
                await fetchSecurityData();
            } catch (error) {
                addToast(error instanceof Error ? error.message : 'Failed to unblock user.', 'error');
            } finally {
                setLoading(false);
            }
        });
    };

    // Derived State for Filtering and Sorting
    const filteredAndSortedUsers = useMemo(() => {
        return users
            .filter(user => {
                const query = searchQuery.toLowerCase().trim();
                if (query) {
                    const matchesName = user.username.toLowerCase().includes(query);
                    const matchesEmail = user.email?.toLowerCase().includes(query) || false;
                    if (!matchesName && !matchesEmail) return false;
                }

                if (statusFilter === 'all') return true;

                const days = getDaysUntilExpiry(user.expiryDate);
                const isRevoked = user.plexAccessStatus === 'revoked';
                const isTrial = user.isTrial === true;

                if (statusFilter === 'trial') return isTrial;
                if (statusFilter === 'revoked') return isRevoked;
                if (isRevoked) return false; // Hide revoked from active/expiring/expired lists

                if (statusFilter === 'active') {
                    return days === null || days > 30;
                }
                if (statusFilter === 'expiring') {
                    return days !== null && days >= 0 && days <= 30;
                }
                if (statusFilter === 'expired') {
                    return days !== null && days < 0;
                }
                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'username-asc') {
                    return a.username.localeCompare(b.username);
                }
                if (sortBy === 'username-desc') {
                    return b.username.localeCompare(a.username);
                }
                if (sortBy === 'joined-desc') {
                    return new Date(b.joiningDate).getTime() - new Date(a.joiningDate).getTime();
                }
                if (sortBy === 'expiry-asc') {
                    if (a.expiryDate === null) return 1;
                    if (b.expiryDate === null) return -1;
                    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                }
                if (sortBy === 'expiry-desc') {
                    if (a.expiryDate === null) return 1;
                    if (b.expiryDate === null) return -1;
                    return new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime();
                }
                return 0;
            });
    }, [users, searchQuery, statusFilter, sortBy]);

    const filteredUserIds = useMemo(() => filteredAndSortedUsers.map(u => u.id), [filteredAndSortedUsers]);
    const allFilteredSelected = filteredUserIds.length > 0 && filteredUserIds.every(id => selectedUserIds.includes(id));

    return (
        <div className="w-full flex flex-col">
            <Loader isLoading={isLoading} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />

            <header className="page-header">
                <h1 className="page-title">Users Management</h1>
            </header>
            <main>
                {isConfigured && (
                    <div className="flex flex-col md:flex-row gap-4 md:items-center mb-8 glass-card-sm p-4 shadow-md">
                        <span className="font-bold text-muted uppercase tracking-wider text-sm hidden md:inline-block mr-2">Quick Actions:</span>
                        <div className="grid grid-cols-2 md:flex md:flex-row gap-3 w-full md:w-auto flex-1">
                            <button className="col-span-2 md:col-span-1 px-3 py-2 bg-plex text-background rounded-md font-bold hover:bg-plex-hover transition-colors flex items-center justify-center gap-2 text-sm md:text-base" onClick={handleImportUsers} disabled={isLoading}>
                                Sync {mediaServerLabel} Users
                            </button>
                        </div>
                    </div>
                )}

                {/* Search & Filter Controls */}
                {isConfigured && (
                    <div className="flex flex-col xl:flex-row justify-between xl:items-center bg-card border border-border p-4 rounded-xl mb-8 gap-4 xl:gap-6 w-full">
                        <div className="relative w-full xl:w-auto xl:flex-1 min-w-[250px]">
                            <input
                                type="text"
                                placeholder="Search by username or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full py-3 pr-10 pl-4 rounded-lg border border-border bg-background text-text text-sm outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                            />
                            {searchQuery && (
                                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text text-xl" onClick={() => setSearchQuery('')}>×</button>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-1 bg-background p-1 rounded-lg border border-border w-full xl:w-auto sm:flex sm:flex-row sm:gap-0 sm:overflow-x-auto sm:custom-scrollbar">
                            {(['all', 'active', 'trial', 'expiring', 'expired', 'revoked'] as const).map((status) => (
                                <button
                                    key={status}
                                    className={`w-full sm:w-auto min-w-0 px-2 sm:px-4 py-2 rounded-md font-medium transition-all text-xs sm:text-sm text-center truncate ${statusFilter === status ? 'bg-plex text-background shadow-md font-bold' : 'text-muted hover:bg-white/5 hover:text-text'}`}
                                    onClick={() => setStatusFilter(status)}
                                >
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 whitespace-nowrap w-full xl:w-auto xl:ml-auto">
                            <label htmlFor="sortSelect" className="text-muted font-bold text-sm hidden sm:block">Sort By</label>
                            <CustomSelect
                                id="sortSelect"
                                value={sortBy}
                                onChange={(val) => setSortBy(val as any)}
                                className="w-full sm:w-[200px]"
                                options={[
                                    { label: 'Username (A-Z)', value: 'username-asc' },
                                    { label: 'Username (Z-A)', value: 'username-desc' },
                                    { label: 'Expiry (Soonest)', value: 'expiry-asc' },
                                    { label: 'Expiry (Furthest)', value: 'expiry-desc' },
                                    { label: 'Joined Date (Newest)', value: 'joined-desc' }
                                ]}
                            />
                        </div>
                    </div>
                )}

                {selectedUserIds.length > 0 && (
                    <div className="glass-card-sm p-4 flex justify-between items-center mb-8 flex-wrap gap-4 w-full">
                        <div className="flex items-center flex-wrap gap-4 text-sm font-medium">
                            <span className="text-plex">{selectedUserIds.length} selected</span>
                            {allFilteredSelected ? (
                                <button className="text-muted hover:text-text transition-colors underline" onClick={() => setSelectedUserIds(prev => prev.filter(id => !filteredUserIds.includes(id)))}>Unselect Filtered</button>
                            ) : (
                                <button className="text-muted hover:text-text transition-colors underline" onClick={() => setSelectedUserIds(prev => Array.from(new Set([...prev, ...filteredUserIds])))}>Select Filtered ({filteredAndSortedUsers.length})</button>
                            )}
                            {selectedUserIds.length < users.length && (
                                <button className="text-muted hover:text-text transition-colors underline" onClick={() => setSelectedUserIds(users.map(user => user.id))}>Select All ({users.length})</button>
                            )}
                            <button className="text-muted hover:text-text transition-colors underline" onClick={() => setSelectedUserIds([])}>Unselect All</button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={() => handleBulkUpdate('addMonth')}>+1 Month</button>
                            <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={() => handleBulkUpdate('addYear')}>+1 Year</button>
                            <button className="px-4 py-2 bg-border text-text rounded-md font-medium hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={() => handleBulkUpdate('unlimited')}>Unlimited</button>
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={bulkCustomDate}
                                    onChange={(e) => setBulkCustomDate(e.target.value)}
                                    className="p-2 rounded-md border border-border bg-background text-text text-sm outline-none focus:border-plex cursor-pointer"
                                />
                                <button
                                    className="px-4 py-2 bg-plex text-background rounded-md font-medium hover:bg-plex-hover transition-colors flex items-center justify-center gap-2"
                                    onClick={() => {
                                        if (!bulkCustomDate) {
                                            addToast('Please select a custom expiry date.', 'error');
                                            return;
                                        }
                                        handleBulkUpdate('custom', bulkCustomDate);
                                    }}
                                >
                                    Set Custom Date
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {isConfigured && filteredAndSortedUsers.length === 0 && !isLoading && (
                    <p className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full">No users found matching your filters. Try syncing or widening filters.</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 w-full">
                    {filteredAndSortedUsers.map((user) => (
                        <UserCard
                            key={user.id}
                            user={user}
                            onEdit={() => handleOpenUserModal(user)}
                            onDelete={() => handleDeleteUser(user.id)}
                            onRevoke={() => revokePlexAccess(user.id)}
                            onViewAs={() => handleViewAsUser(user)}
                            isConfigured={isConfigured}
                            isSelected={selectedUserIds.includes(user.id)}
                            onSelect={handleToggleSelection}
                            providerLabel={mediaServerLabel}
                        />
                    ))}
                </div>
            </main>
            <UserModal
                isOpen={isUserModalOpen}
                onClose={handleCloseModal}
                onSave={handleSaveUser}
                user={editingUser}
            />
        </div>
    );
};

// --- User Portal Components ---

const loginPrimaryBtnClass = themeClasses.btnPrimaryLg;
const loginSecondaryBtnClass = `${themeClasses.btnSecondary} w-full px-8 py-4 text-base`;

const PublicUptimeBanner: React.FC = () => {
    const [healthData, setHealthData] = useState<Record<string, any>>({});
    const [config, setConfig] = useState<any>({});

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await apiFetch('/api/status');
                setConfig(res.config);
                setHealthData(res.healthData);
            } catch (e) { }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    if (!config.services?.length) return null;

    const visibleServices = config.services.filter((service: any) => healthData[service.id]);
    if (visibleServices.length === 0) return null;

    return (
        <div className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl px-4 py-5 sm:px-6 w-full">
            <div className="w-full flex flex-col">
                <div className="flex flex-col items-center text-center mb-4">
                    <a href={portalUrl('/status')} className="text-plex hover:text-plex-hover font-bold text-[10px] tracking-[0.16em] uppercase mb-1.5 transition-colors">
                        View Full Status Page &rarr;
                    </a>
                    <h3 className="text-text font-bold uppercase tracking-[0.14em] text-xs">Live System Status</h3>
                </div>
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3 w-full">
                    {visibleServices.map((service: any) => {
                        const health = healthData[service.id];
                        const isUp = health.currentStatus === 'online';
                        const colorClass = isUp ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10';
                        const dotClass = isUp ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';

                        return (
                            <div key={service.id} className={`inline-flex items-center gap-1.5 sm:gap-2.5 px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl border ${colorClass} backdrop-blur-sm`}>
                                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${dotClass}`} />
                                <span className="text-[11px] sm:text-sm font-bold text-text leading-tight">{service.name}</span>
                                <span className="text-[10px] sm:text-xs font-bold text-muted tabular-nums">{health.uptimePercentage}%</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const LivePlexStats: React.FC = () => {
    const [stats, setStats] = useState<{ movies: number, shows: number, music: number, fourKPercent?: number } | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            const endpoints = [portalUrl('/api/public/plex/stats'), portalUrl('/api/plex/stats')];

            for (const endpoint of endpoints) {
                try {
                    const response = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
                    if (!response.ok) continue;
                    const res = await response.json();
                    if (res && typeof res.movies === 'number' && typeof res.shows === 'number' && typeof res.music === 'number') {
                        setStats(res);
                        return;
                    }
                } catch (e) {
                    // Try next endpoint
                }
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    if (!stats) return (
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
                { icon: Film, label: 'Movies & TV', desc: 'Massive library' },
                { icon: Music, label: 'Music', desc: 'Thousands of albums' },
                { icon: Sparkles, label: 'Requests', desc: 'Automated system' },
            ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-4 flex flex-col items-center text-center gap-2 animate-pulse">
                    <Icon className="w-5 h-5 text-plex/60" />
                    <span className="text-xs font-bold text-muted uppercase tracking-wider">{label}</span>
                    <span className="text-[11px] text-muted/70">{desc}</span>
                </div>
            ))}
        </div>
    );

    const statCardClass = 'section-card p-4 flex flex-col items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

    return (
        <div className="w-full flex flex-col">
            <div className="inline-flex self-center items-center gap-2 px-3 py-1 rounded-full bg-plex/10 border border-plex/25 text-plex text-[10px] font-bold uppercase tracking-[0.14em] mb-4">
                <Activity className="w-3 h-3" /> Live Library Stats
            </div>
            <div className={`grid gap-3 w-full ${stats.music > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className={statCardClass}>
                    <Film className="w-5 h-5 text-plex mb-0.5" />
                    <span className="text-plex font-black text-xl tabular-nums">{stats.movies.toLocaleString()}</span>
                    <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">Movies</span>
                </div>
                <div className={statCardClass}>
                    <Tv className="w-5 h-5 text-plex mb-0.5" />
                    <span className="text-plex font-black text-xl tabular-nums">{stats.shows.toLocaleString()}</span>
                    <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">TV Shows</span>
                </div>
                {stats.music > 0 && (
                    <div className={statCardClass}>
                        <Music className="w-5 h-5 text-plex mb-0.5" />
                        <span className="text-plex font-black text-xl tabular-nums">{stats.music.toLocaleString()}</span>
                        <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">Artists</span>
                    </div>
                )}
            </div>
            <div className="w-full mt-3">
                <div className={statCardClass + ' py-3.5'}>
                    <span className="text-plex font-black text-lg flex items-center gap-2 tabular-nums">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        {stats.fourKPercent !== undefined ? stats.fourKPercent : 30}%
                    </span>
                    <span className="text-muted text-[10px] uppercase tracking-[0.12em] font-bold">Available in 4K</span>
                </div>
            </div>
        </div>
    );
};

export const Login: React.FC<{ onLoginSuccess: () => void, publicConfig?: any, initialError?: string }> = ({ onLoginSuccess, publicConfig, initialError }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(initialError || '');
    const [jellyfinUsername, setJellyfinUsername] = useState('');
    const [jellyfinPassword, setJellyfinPassword] = useState('');
    const [showJellyfinPassword, setShowJellyfinPassword] = useState(false);
    const [quickConnect, setQuickConnect] = useState<{ sessionId: string, code: string, jellyfinUrl: string } | null>(null);
    const quickConnectPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [publicInfo, setPublicInfo] = useState<{ thumb: string | null, serverName: string, isConfigured: boolean | null, mediaServerType?: string }>({ thumb: null, serverName: 'Server Portal', isConfigured: null, mediaServerType: 'plex' });
    const [publicInfoLoading, setPublicInfoLoading] = useState(true);
    const [publicInfoLoadFailed, setPublicInfoLoadFailed] = useState(false);

    const fetchPublicInfo = () => {
        setPublicInfoLoading(true);
        setPublicInfoLoadFailed(false);
        apiFetch('/api/public/info').then(data => {
            if (data) {
                setPublicInfo({
                    thumb: data.thumb || null,
                    serverName: data.serverName || 'Server Portal',
                    isConfigured: data.isConfigured !== false,
                    mediaServerType: data.mediaServerType || 'plex'
                });
                if (data.thumb) updateFavicon(data.thumb);
                if (data.serverName) document.title = `${data.serverName} Portal`;
            }
        }).catch(() => {
            setPublicInfoLoadFailed(true);
            setError('Could not reach the portal. If you just restarted or updated, wait a few seconds and refresh.');
        }).finally(() => setPublicInfoLoading(false));
    };

    const handleSetupComplete = () => {
        window.dispatchEvent(new CustomEvent('portal-public-config-updated'));
        fetchPublicInfo();
    };

    useEffect(() => {
        if (initialError) {
            window.history.replaceState({}, '', portalUrl('/'));
        }
    }, [initialError]);

    useEffect(() => () => {
        if (quickConnectPollRef.current) clearInterval(quickConnectPollRef.current);
    }, []);

    useEffect(() => {
        fetchPublicInfo();

        const path = stripBasePath(window.location.pathname);
        const params = new URLSearchParams(window.location.search);
        const loginError = params.get('loginError');
        if (loginError) {
            setError(loginError);
            window.history.replaceState({}, '', portalUrl('/'));
            return;
        }

        // Setup wizard OAuth return — SetupWizard handles this, not login
        if (path.startsWith('/auth/setup/')) {
            return;
        }

        if (path.startsWith('/auth/')) {
            const pinId = path.split('/')[2];
            setIsLoading(true);
            window.history.replaceState({}, '', portalUrl('/'));
            apiFetch('/api/auth/plex/callback', {
                method: 'POST',
                body: JSON.stringify({ pinId }),
            }).then(() => onLoginSuccess()).catch(e => {
                setError(e.message || 'Login failed');
            }).finally(() => {
                setIsLoading(false);
            });
        }
    }, [onLoginSuccess]);

    const handlePlexLogin = async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await apiFetch('/api/auth/plex/login', { method: 'POST' });
            const clientId = data.clientIdentifier || data.clientId || '';
            const forwardUrl = window.location.origin + portalUrl('/api/auth/plex/callback?pinId=' + data.id);
            const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${data.code}&context[device][product]=Server%20Manager%20Portal&forwardUrl=${encodeURIComponent(forwardUrl)}`;
            window.location.href = authUrl;
        } catch (e) {
            setError('Failed to initiate Plex login');
            setIsLoading(false);
        }
    };

    const handleJellyfinLogin = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await apiFetch('/api/auth/jellyfin/login', {
                method: 'POST',
                body: JSON.stringify({ username: jellyfinUsername.trim(), password: jellyfinPassword }),
            });
            onLoginSuccess();
        } catch (e: any) {
            setError(e.message || 'Failed to authenticate with Jellyfin');
        } finally {
            setIsLoading(false);
        }
    };

    const stopQuickConnectPolling = () => {
        if (quickConnectPollRef.current) {
            clearInterval(quickConnectPollRef.current);
            quickConnectPollRef.current = null;
        }
    };

    const pollJellyfinQuickConnect = (sessionId: string) => {
        stopQuickConnectPolling();
        quickConnectPollRef.current = setInterval(async () => {
            try {
                const data = await apiFetch('/api/auth/jellyfin/quick-connect/poll', {
                    method: 'POST',
                    body: JSON.stringify({ sessionId }),
                });
                if (data?.success) {
                    stopQuickConnectPolling();
                    onLoginSuccess();
                }
            } catch (e: any) {
                stopQuickConnectPolling();
                setIsLoading(false);
                setError(e.message || 'Jellyfin Quick Connect failed');
            }
        }, 5000);
    };

    const handleJellyfinQuickConnect = async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await apiFetch('/api/auth/jellyfin/quick-connect/initiate', { method: 'POST' });
            setQuickConnect({
                sessionId: data.sessionId,
                code: data.code,
                jellyfinUrl: data.jellyfinUrl || '',
            });
            setIsLoading(false);
            pollJellyfinQuickConnect(data.sessionId);
        } catch (e: any) {
            setIsLoading(false);
            setError(e.message || 'Failed to start Jellyfin Quick Connect');
        }
    };

    const handleOpenJellyfinQuickConnect = async () => {
        if (!quickConnect?.jellyfinUrl) return;
        try {
            await copyTextToClipboard(quickConnect.code);
        } catch {
            // Clipboard access can be blocked by browser settings; opening Jellyfin is still useful.
        }
        window.open(jellyfinQuickConnectUrl(quickConnect.jellyfinUrl), '_blank', 'noopener,noreferrer');
    };

    if (publicInfo.isConfigured === false || (typeof window !== 'undefined' && stripBasePath(window.location.pathname).startsWith('/auth/setup/'))) {
        return <SetupWizard onComplete={handleSetupComplete} />;
    }

    if (publicInfoLoading || (publicInfo.isConfigured === null && !publicInfoLoadFailed)) {
        return <Loader isLoading={true} isCinematic={!!publicConfig?.useCinematicLoading} />;
    }

    const mediaServerType = String(publicInfo.mediaServerType || publicConfig?.mediaServerType || 'plex').toLowerCase();
    const isJellyfinAuth = mediaServerType === 'jellyfin';
    const showTrialAccess = !isJellyfinAuth && publicConfig?.allowTemporaryAccess !== false;
    const logoSrc = publicConfig?.customLogoUrl
        ? resolvePortalAssetUrl(publicConfig.customLogoUrl)
        : (publicInfo.thumb ? resolvePortalAssetUrl(publicInfo.thumb) : '');
    const splashBackgroundUrl = publicConfig?.backgroundImageUrl ? resolvePortalAssetUrl(publicConfig.backgroundImageUrl) : undefined;

    return (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10 overflow-hidden">
            <AuthPageBackground backgroundImageUrl={splashBackgroundUrl} trendingBackgrounds={publicConfig?.useTrendingSlideshowOnLogin ? publicConfig?.trendingBackgrounds : undefined} trendingSlideshowInterval={publicConfig?.trendingSlideshowInterval} />
            <Loader isLoading={isLoading} isCinematic={!!publicConfig?.useCinematicLoading} />

            <div className="relative z-10 w-full max-w-6xl flex flex-col gap-6">
                <div className={`glass-card-lg overflow-hidden flex flex-col ${showTrialAccess ? 'lg:flex-row min-h-[min(680px,calc(100vh-3rem))]' : 'max-w-xl mx-auto w-full'}`}>
                    {showTrialAccess && (
                        <div className="flex-1 flex flex-col justify-center p-6 sm:p-8 lg:p-10 xl:p-12 border-t lg:border-t-0 lg:border-r border-white/10 bg-gradient-to-br from-plex/[0.08] via-plex/[0.03] to-transparent min-w-0 order-last lg:order-none">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-plex/10 border border-plex/25 text-plex text-[11px] font-bold uppercase tracking-widest mb-5 w-fit">
                                <Sparkles className="w-3.5 h-3.5" /> New here?
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-black text-text tracking-tight leading-tight mb-3">
                                Welcome to{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-plex to-amber-400">{publicInfo.serverName}</span>
                            </h1>
                            <p className="text-muted text-sm sm:text-base leading-relaxed mb-6 max-w-lg">
                                The ultimate Plex experience. Get instant access to our entire library with a{' '}
                                <strong className="text-text font-semibold">3-Day Temporary Access</strong> pass.
                            </p>

                            {publicConfig?.showPublicLibraryStats !== false && (
                                <div className="mb-6">
                                    <LivePlexStats />
                                </div>
                            )}

                            <p className="text-xs text-muted/80 leading-relaxed mb-5">
                                You&apos;ll need a free Plex account to continue. You can create one securely on the next screen.
                            </p>
                            <button type="button" className={loginPrimaryBtnClass} onClick={handlePlexLogin} disabled={isLoading}>
                                <img src={logoUrl()} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                Request Temporary Access
                            </button>
                        </div>
                    )}

                    <div className={`flex flex-col justify-center items-center text-center p-6 sm:p-8 lg:p-10 xl:p-12 min-w-0 ${showTrialAccess ? 'flex-1 order-first lg:order-none' : 'w-full py-10 sm:py-12'}`}>
                        <div className="relative mb-8">
                            {!logoSrc && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 bg-plex/20 rounded-full blur-[60px] pointer-events-none" />}
                            {logoSrc ? (
                                <img
                                    src={logoSrc}
                                    alt="Server Logo"
                                    className="w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10"
                                    onError={(e) => {
                                        e.currentTarget.src = logoUrl();
                                        e.currentTarget.className = 'w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10';
                                    }}
                                />
                            ) : (
                                <img src={logoUrl()} alt="Server Logo" className="w-28 h-28 sm:w-32 sm:h-32 object-cover rounded-full border-2 border-plex/40 shadow-[0_0_40px_rgba(229,160,13,0.25)] relative z-10" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                        </div>

                        {!showTrialAccess && (
                            <>
                                <h1 className="text-3xl sm:text-4xl font-black text-text tracking-tight mb-3">
                                    {publicInfo.serverName}
                                </h1>
                                <p className="text-muted text-sm sm:text-base leading-relaxed mb-8 max-w-sm">
                                    {isJellyfinAuth
                                        ? 'Sign in with your Jellyfin account to access your portal and manage your subscription.'
                                        : 'Sign in with Plex to access your portal and manage your subscription.'}
                                </p>
                            </>
                        )}

                        {showTrialAccess && (
                            <>
                                <p className="text-[11px] font-bold text-muted uppercase tracking-[0.16em] mb-2">Returning member</p>
                                <h2 className="text-2xl sm:text-3xl font-black text-text tracking-tight mb-3">Already on our server?</h2>
                                <p className="text-muted text-sm sm:text-base leading-relaxed mb-8 max-w-sm">
                                    Manage your existing access or re-link your Plex account.
                                </p>
                            </>
                        )}

                        {isJellyfinAuth ? (
                            <div className="w-full max-w-sm flex flex-col gap-4 text-left">
                                <button type="button" className={loginSecondaryBtnClass} onClick={handleJellyfinQuickConnect} disabled={isLoading}>
                                    <img src={JELLYFIN_ICON_URL} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    Login with Jellyfin
                                </button>

                                {quickConnect && (
                                    <div className="w-full rounded-xl border border-plex/30 bg-plex/10 p-4 text-center">
                                        <p className="text-[10px] font-bold text-muted uppercase tracking-[0.14em] mb-2">Quick Connect code</p>
                                        <div className="font-black text-3xl tracking-[0.18em] text-text tabular-nums mb-3">{quickConnect.code}</div>
                                        <p className="text-xs text-muted leading-relaxed">
                                            Approve this code in Jellyfin Quick Connect. This page will finish login automatically.
                                        </p>
                                        {quickConnect.jellyfinUrl && (
                                            <button
                                                type="button"
                                                onClick={handleOpenJellyfinQuickConnect}
                                                className="mt-3 inline-flex items-center justify-center text-xs font-bold text-plex hover:text-text transition"
                                            >
                                                Copy code & open Quick Connect
                                            </button>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="self-center text-xs font-bold text-muted hover:text-text transition"
                                    onClick={() => setShowJellyfinPassword((value) => !value)}
                                >
                                    {showJellyfinPassword ? 'Hide password login' : 'Use password instead'}
                                </button>

                                {showJellyfinPassword && (
                                    <form onSubmit={handleJellyfinLogin} className="w-full flex flex-col gap-3 text-left">
                                        <label className="flex flex-col gap-1.5">
                                            <span className="text-[10px] font-bold text-muted uppercase tracking-[0.14em]">Jellyfin username</span>
                                            <input
                                                value={jellyfinUsername}
                                                onChange={(e) => setJellyfinUsername(e.target.value)}
                                                autoComplete="username"
                                                className="w-full bg-black/25 border border-white/15 rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-plex/70 focus:ring-2 focus:ring-plex/20 transition"
                                                placeholder="Username"
                                                disabled={isLoading}
                                                required
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1.5">
                                            <span className="text-[10px] font-bold text-muted uppercase tracking-[0.14em]">Password</span>
                                            <input
                                                value={jellyfinPassword}
                                                onChange={(e) => setJellyfinPassword(e.target.value)}
                                                type="password"
                                                autoComplete="current-password"
                                                className="w-full bg-black/25 border border-white/15 rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-plex/70 focus:ring-2 focus:ring-plex/20 transition"
                                                placeholder="Password"
                                                disabled={isLoading}
                                                required
                                            />
                                        </label>
                                        <button type="submit" className={loginSecondaryBtnClass} disabled={isLoading || !jellyfinUsername.trim() || !jellyfinPassword}>
                                            <img src={JELLYFIN_ICON_URL} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                            Login with password
                                        </button>
                                    </form>
                                )}
                            </div>
                        ) : (
                            <button type="button" className={loginSecondaryBtnClass} onClick={handlePlexLogin} disabled={isLoading}>
                                <img src={logoUrl()} alt="" className="w-5 h-5 object-contain opacity-80" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                Login with Plex
                            </button>
                        )}

                        {!showTrialAccess && !isJellyfinAuth && publicConfig?.showPublicLibraryStats !== false && (
                            <div className="w-full mt-10 pt-8 border-t border-white/10">
                                <LivePlexStats />
                            </div>
                        )}
                    </div>
                </div>

                {publicConfig?.showPublicStatusMonitor !== false && <PublicUptimeBanner />}

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const RebuildLibraryCacheButton: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'starting' | 'building' | 'done' | 'error'>('idle');
    const [lastBuilt, setLastBuilt] = useState<number | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        apiFetch('/api/plex/stats/status').then((s: any) => {
            if (s.lastGeneratedAt) setLastBuilt(s.lastGeneratedAt);
            if (s.isBuilding) startPolling();
        }).catch(() => { });
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    const startPolling = () => {
        setStatus('building');
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const s: any = await apiFetch('/api/plex/stats/status');
                if (s.lastGeneratedAt) setLastBuilt(s.lastGeneratedAt);
                if (!s.isBuilding) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    pollRef.current = null;
                    setStatus('done');
                    setTimeout(() => setStatus('idle'), 4000);
                }
            } catch {
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = null;
                setStatus('error');
            }
        }, 3000);
    };

    const handleRebuild = async () => {
        setStatus('starting');
        try {
            await apiFetch('/api/plex/stats/rebuild', { method: 'POST' });
            startPolling();
        } catch {
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    const isRunning = status === 'building' || status === 'starting';
    return (
        <div className="flex flex-col gap-1.5">
            <button
                onClick={handleRebuild}
                disabled={isRunning}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all border
                    ${status === 'done' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                        status === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                            isRunning ? 'bg-white/5 border-white/10 text-muted cursor-not-allowed' :
                                'bg-white/5 border-white/10 text-text hover:bg-white/10'}`}
            >
                {isRunning ? (
                    <><div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Building Cache...</>
                ) : status === 'done' ? (
                    <><CheckCircle size={14} /> Cache Updated!</>
                ) : status === 'error' ? (
                    <><AlertCircle size={14} /> Build Failed</>
                ) : (
                    <><RefreshCw size={14} /> Rebuild Library Cache</>
                )}
            </button>
            {lastBuilt && (
                <p className="text-[10px] text-muted text-center">
                    Last built: {new Date(lastBuilt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
            )}
        </div>
    );
};

const WrapUpModal: React.FC<{ metric: string; analytics: any; days: number | string; onClose: () => void }> = ({ metric, analytics, days, onClose }) => {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const renderContent = () => {
        switch (metric) {
            case 'Server Rank': {
                const leaderboardRank = Number(analytics.leaderboardRank);
                const totalActiveUsers = Number(analytics.totalActiveUsers) || 0;
                const hasRank = Number.isFinite(leaderboardRank) && leaderboardRank > 0;
                const percentile = hasRank && totalActiveUsers > 0 ? Math.max(1, Math.round((leaderboardRank / totalActiveUsers) * 100)) : null;
                const progressPct = hasRank && totalActiveUsers > 0 ? Math.max(2, 100 - Math.round(((leaderboardRank - 1) / totalActiveUsers) * 100)) : 0;
                const neighbourhood: any[] = analytics.leaderboardNeighbourhood || [];
                const myPlays = analytics.myPlaysOnLeaderboard || analytics.totalPlays || 0;
                const userAbove = hasRank ? neighbourhood.find((u: any) => !u.isMe && u.rank < leaderboardRank) : null;
                const playsToClimb = userAbove ? (userAbove.plays - myPlays + 1) : null;

                const rankEmoji = (leaderboardRank === 1) ? '🥇' : (leaderboardRank === 2) ? '🥈' : (leaderboardRank === 3) ? '🥉' : '🏆';

                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <span className="text-5xl mb-3">{rankEmoji}</span>
                        <h2 className="text-3xl font-black text-white mb-1">{hasRank ? `Rank #${leaderboardRank}` : 'Not ranked yet'}</h2>
                        <p className="text-muted mb-5 text-sm">Out of {totalActiveUsers} active users</p>

                        {/* Progress bar */}
                        <div className="w-full mb-1">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1.5">
                                <span className="text-gray-500">#1 Top</span>
                                <span className="text-plex">{percentile ? `Top ${percentile}%` : 'No rank yet'}</span>
                                <span className="text-gray-500">{totalActiveUsers > 0 ? `#${totalActiveUsers} Last` : 'No users'}</span>
                            </div>
                            <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10">
                                <div
                                    className="h-full bg-gradient-to-r from-plex via-amber-400 to-orange-400 rounded-full shadow-[0_0_10px_rgba(229,160,13,0.6)] transition-all duration-1000"
                                    style={{ width: `${progressPct}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-2 gap-3 w-full mt-4 mb-4">
                            <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center shadow-lg">
                                <span className="text-2xl font-black text-white mb-1">{myPlays}</span>
                                <span className="text-[9px] text-muted uppercase tracking-widest font-black">My Streams</span>
                            </div>
                            <div className="bg-gradient-to-b from-plex/20 to-plex/5 border border-plex/30 rounded-xl p-4 flex flex-col items-center shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-plex/20 blur-xl -mr-5 -mt-5 rounded-full" />
                                <span className="text-2xl font-black text-plex mb-1">{percentile ? `${percentile}%` : '-'}</span>
                                <span className="text-[9px] text-plex/80 uppercase tracking-widest font-black">Top Percentile</span>
                            </div>
                        </div>

                        {/* Plays to climb */}
                        {playsToClimb !== null && playsToClimb > 0 && (
                            <div className="w-full bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 mb-4 text-sm text-blue-300 font-medium">
                                🎯 <strong>{playsToClimb} more stream{playsToClimb !== 1 ? 's' : ''}</strong> to overtake <strong>{userAbove?.username}</strong> (Rank #{userAbove?.rank})
                            </div>
                        )}
                        {playsToClimb === null && leaderboardRank === 1 && (
                            <div className="w-full bg-plex/10 border border-plex/30 rounded-xl px-4 py-3 mb-4 text-sm text-plex font-medium">
                                👑 You're at the top of the leaderboard!
                            </div>
                        )}
                        {!hasRank && (
                            <div className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4 text-sm text-muted font-medium">
                                Stream activity has not been matched to your account for this period yet.
                            </div>
                        )}

                        {/* Mini leaderboard neighbourhood */}
                        {neighbourhood.length > 0 && (
                            <div className="w-full">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Your Leaderboard Position</p>
                                <div className="flex flex-col gap-1.5">
                                    {neighbourhood.map((u: any, i: number) => (
                                        <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2.5 border transition-all ${u.isMe
                                            ? 'bg-plex/15 border-plex/50 shadow-[0_0_12px_rgba(229,160,13,0.2)]'
                                            : 'bg-white/5 border-white/5'
                                            }`}>
                                            <div className="flex items-center gap-3">
                                                <span className={`font-black text-sm w-8 text-right ${u.isMe ? 'text-plex' : 'text-gray-500'}`}>#{u.rank}</span>
                                                <span className={`font-bold text-sm ${u.isMe ? 'text-white' : 'text-gray-300'}`}>
                                                    {u.isMe ? <span className="inline-flex items-center gap-1.5">{u.username} <span className="text-[9px] text-plex font-black uppercase tracking-widest bg-plex/20 px-1.5 py-0.5 rounded">You</span></span> : u.username}
                                                </span>
                                            </div>
                                            <span className={`text-xs font-black whitespace-nowrap ${u.isMe ? 'text-plex' : 'text-gray-400'}`}>{u.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'Total Streams': {
                const total = analytics.totalPlays || 0;
                const movies = analytics.moviesCount || 0;
                const episodes = analytics.showsCount || 0;
                const tracks = analytics.musicCount || 0;
                const moviePct = total > 0 ? Math.round((movies / total) * 100) : 0;
                const episodePct = total > 0 ? Math.round((episodes / total) * 100) : 0;
                const trackPct = total > 0 ? Math.round((tracks / total) * 100) : 0;
                // Approximate daily average based on current filter
                const filterDays = (days === 'all' || !days) ? 365 : (parseInt(String(days)) || 30);
                const dailyAvg = filterDays > 0 ? (total / filterDays).toFixed(1) : '—';
                const recentItems = (analytics.recentHistory || []).slice(0, 5);

                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <PlayCircle className="w-14 h-14 text-plex mb-3 drop-shadow-lg" />
                        <h2 className="text-5xl font-black text-white mb-1">{total}</h2>
                        <p className="text-muted uppercase tracking-widest text-xs font-bold mb-5">Total Streams</p>

                        {/* Type breakdown bars */}
                        <div className="w-full flex flex-col gap-3 mb-5">
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span className="text-blue-400">🎬 Movies</span>
                                    <span className="text-gray-300">{movies} <span className="text-gray-500">({moviePct}%)</span></span>
                                </div>
                                <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-1000" style={{ width: `${moviePct}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span className="text-green-400">📺 Episodes</span>
                                    <span className="text-gray-300">{episodes} <span className="text-gray-500">({episodePct}%)</span></span>
                                </div>
                                <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all duration-1000" style={{ width: `${episodePct}%` }} />
                                </div>
                            </div>
                            {tracks > 0 && (
                                <div>
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="text-purple-400">🎵 Tracks</span>
                                        <span className="text-gray-300">{tracks} <span className="text-gray-500">({trackPct}%)</span></span>
                                    </div>
                                    <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                                        <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-1000" style={{ width: `${trackPct}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Extra stats */}
                        <div className="grid grid-cols-2 gap-3 w-full mb-5">
                            <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center shadow-lg">
                                <span className="text-2xl font-black text-white mb-1">{dailyAvg}</span>
                                <span className="text-[9px] text-muted uppercase tracking-widest font-black">Per Day</span>
                            </div>
                            <div className="bg-gradient-to-b from-plex/20 to-plex/5 border border-plex/30 rounded-xl p-4 flex flex-col items-center shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-12 h-12 bg-plex/20 blur-xl -mr-4 -mt-4 rounded-full" />
                                <span className="text-2xl font-black text-plex mb-1">{analytics.uniqueTitles || 0}</span>
                                <span className="text-[9px] text-plex/80 uppercase tracking-widest font-black">Unique Titles</span>
                            </div>
                        </div>

                        {/* Recent activity */}
                        {recentItems.length > 0 && (
                            <div className="w-full">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Recently Watched</p>
                                <div className="flex flex-col gap-1.5">
                                    {recentItems.map((item: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg px-3 py-2 hover:bg-white/10 transition-colors">
                                            {item.thumbUrl
                                                ? <img src={resolvePortalAssetUrl(item.thumbUrl)} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                                                : <div className="w-8 h-8 rounded bg-white/10 flex-shrink-0" />}
                                            <div className="flex flex-col text-left overflow-hidden">
                                                <span className="font-bold text-sm text-gray-200 truncate">{item.title}</span>
                                                {item.episodeTitle && <span className="text-[10px] text-gray-400 truncate">{item.episodeTitle}</span>}
                                            </div>
                                            <span className="ml-auto text-[10px] text-gray-500 whitespace-nowrap flex-shrink-0">
                                                {new Date(item.viewedAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'Top Binge':
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6 relative">
                        {analytics.topBinge?.artUrl || analytics.topBinge?.thumbUrl ? (
                            <div className="w-full h-40 bg-cover bg-center rounded-xl shadow-lg mb-6 border border-white/10 relative overflow-hidden" style={{ backgroundImage: `url('${resolvePortalAssetUrl(analytics.topBinge.artUrl) || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=600'}')` }}>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-0 right-0 px-4 flex flex-col items-center">
                                    <h2 className="text-2xl font-black text-white mb-1 line-clamp-1 drop-shadow-md">{analytics.topBinge?.title || 'Nothing yet'}</h2>
                                    <p className="text-plex font-bold drop-shadow-md">{analytics.topBinge?.plays || 0} episodes</p>
                                </div>
                            </div>
                        ) : (
                            <Tv className="w-16 h-16 text-plex mb-6 drop-shadow-lg" />
                        )}

                        {analytics.topBinge?.summary && (
                            <div className="w-full mt-2 mb-4 bg-white/5 border border-white/5 rounded-lg p-4 text-left">
                                <p className="text-gray-300 text-sm leading-relaxed">{analytics.topBinge.summary}</p>
                                {analytics.topBinge.year && <span className="inline-block mt-3 text-xs font-black px-2 py-1 bg-black/40 rounded text-gray-400">{analytics.topBinge.year}</span>}
                            </div>
                        )}

                        {analytics.topShows && analytics.topShows.length > 1 ? (
                            <div className="w-full mt-2">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Runner Ups</p>
                                <div className="flex flex-col gap-2">
                                    {analytics.topShows.slice(1).map((show: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-500 font-bold w-4 text-right">{i + 2}</span>
                                                {show.thumbUrl ? <img src={resolvePortalAssetUrl(show.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                                <span className="font-bold text-sm text-gray-200 line-clamp-1 text-left">{show.title}</span>
                                            </div>
                                            <span className="text-xs font-black text-plex whitespace-nowrap">{show.plays} eps</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full mt-2 py-6 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-50">
                                <Tv className="w-8 h-8 text-gray-500 mb-2" />
                                <p className="text-sm font-bold text-gray-400">No other shows watched</p>
                            </div>
                        )}
                    </div>
                );
            case 'Top Movie':
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6 relative">
                        {analytics.topMovie?.artUrl || analytics.topMovie?.thumbUrl ? (
                            <div className="w-full h-40 bg-cover bg-center rounded-xl shadow-lg mb-6 border border-white/10 relative overflow-hidden" style={{ backgroundImage: `url('${resolvePortalAssetUrl(analytics.topMovie.artUrl || analytics.topMovie.thumbUrl) || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&q=80&w=600'}')` }}>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-0 right-0 px-4 flex flex-col items-center">
                                    <h2 className="text-2xl font-black text-white mb-1 line-clamp-1 drop-shadow-md">{analytics.topMovie?.title || 'Nothing yet'}</h2>
                                    <p className="text-plex font-bold drop-shadow-md">{analytics.topMovie?.plays || 0} plays</p>
                                </div>
                            </div>
                        ) : (
                            <Clapperboard className="w-16 h-16 text-plex mb-6 drop-shadow-lg" />
                        )}

                        {analytics.topMovie?.summary && (
                            <div className="w-full mt-2 mb-4 bg-white/5 border border-white/5 rounded-lg p-4 text-left">
                                {analytics.topMovie.tagline && <p className="italic text-plex text-xs mb-2 font-bold">"{analytics.topMovie.tagline}"</p>}
                                <p className="text-gray-300 text-sm leading-relaxed">{analytics.topMovie.summary}</p>
                                {analytics.topMovie.year && <span className="inline-block mt-3 text-xs font-black px-2 py-1 bg-black/40 rounded text-gray-400">{analytics.topMovie.year}</span>}
                            </div>
                        )}

                        {analytics.topMovies && analytics.topMovies.length > 1 ? (
                            <div className="w-full mt-2">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Runner Ups</p>
                                <div className="flex flex-col gap-2">
                                    {analytics.topMovies.slice(1).map((movie: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-500 font-bold w-4 text-right">{i + 2}</span>
                                                {movie.thumbUrl ? <img src={resolvePortalAssetUrl(movie.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                                <span className="font-bold text-sm text-gray-200 line-clamp-1 text-left">{movie.title}</span>
                                            </div>
                                            <span className="text-xs font-black text-plex whitespace-nowrap">{movie.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="w-full mt-2 py-6 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-50">
                                <Film className="w-8 h-8 text-gray-500 mb-2" />
                                <p className="text-sm font-bold text-gray-400">No other movies watched</p>
                            </div>
                        )}
                    </div>
                );
            case 'Time of Day':
                const maxHour = Math.max(...(analytics.hourDistribution || [0]));
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Clock className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.timeOfDay || 'Unknown'}</h2>
                        <p className="text-muted mb-6">You typically stream around {formatStreamingHour(analytics.peakHour ?? analytics.avgHour)}.</p>

                        <div className="w-full mt-2 mb-6">
                            <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">24-Hour Heat Map</p>
                            <div className="w-full flex items-end justify-between h-24 gap-[2px] mt-4 px-1">
                                {analytics.hourDistribution?.map((count: number, hour: number) => {
                                    const height = maxHour > 0 ? (count / maxHour) * 100 : 0;
                                    const isTop = count === maxHour && count > 0;
                                    return (
                                        <div key={hour} className="flex flex-col items-center justify-end w-full h-full group relative">
                                            <div className={`w-full rounded-t-sm transition-all duration-500 relative flex items-end justify-center overflow-hidden
                                                ${isTop ? 'bg-plex shadow-[0_0_10px_rgba(229,160,13,0.5)]' : 'bg-white/10 group-hover:bg-white/30'}`}
                                                style={{ height: `${Math.max(height, 2)}%` }}>
                                            </div>
                                            {hour % 6 === 0 && <span className="text-[8px] mt-1 font-bold text-muted absolute top-full pointer-events-none">{hour}h</span>}

                                            <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                                {count} plays at {formatStreamingHour(hour)}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="w-full bg-gradient-to-r from-plex/5 via-plex/10 to-plex/5 border border-plex/20 rounded-xl p-4 shadow-inner mt-4">
                            <p className="text-sm text-plex font-medium">
                                {analytics.timeOfDay === 'Early Bird' ? 'Catching the worm with those morning streams!' :
                                    analytics.timeOfDay === 'Afternoon Watcher' ? 'Perfect way to spend the afternoon.' :
                                        analytics.timeOfDay === 'Evening Streamer' ? 'Unwinding after a long day.' :
                                            'Burning the midnight oil with some late night streaming!'}
                            </p>
                        </div>
                    </div>
                );
            case 'Top Day':
                const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const maxCount = Math.max(...(analytics.dayOfWeekCounts ? Object.values(analytics.dayOfWeekCounts) as number[] : [0]));
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Calendar className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.popularDay || 'Unknown'}</h2>
                        <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold">Most Active Day</p>
                        <div className="w-full flex items-end justify-between h-32 gap-1.5 mt-4 px-2">
                            {daysOfWeek.map((day, i) => {
                                const count = analytics.dayOfWeekCounts ? analytics.dayOfWeekCounts[i] : 0;
                                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                const isTop = count === maxCount && count > 0;
                                return (
                                    <div key={day} className="flex flex-col items-center justify-end w-full h-full group relative">
                                        <div className={`w-full rounded-t-md transition-all duration-500 relative flex items-end justify-center pb-1 overflow-hidden
                                            ${isTop ? 'bg-gradient-to-t from-plex/80 to-plex shadow-[0_0_15px_rgba(229,160,13,0.3)]' : 'bg-gradient-to-t from-white/10 to-white/20 group-hover:from-white/20 group-hover:to-white/30'}`}
                                            style={{ height: `${Math.max(height, 8)}%` }}>
                                        </div>
                                        <span className={`text-[9px] mt-2 font-black uppercase tracking-wider ${isTop ? 'text-plex' : 'text-muted'}`}>{day}</span>
                                        <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                            {count} plays
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                );
            case 'Top Library':
                const maxLibPlays = analytics.allLibraries?.[0]?.plays || 1;
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6 max-h-[80vh] overflow-hidden flex-1">
                        <Layers className="w-16 h-16 text-plex mb-4 drop-shadow-lg shrink-0" />
                        <h2 className="text-3xl font-black text-white mb-2 line-clamp-1 shrink-0">{analytics.favoriteLibrary || 'None'}</h2>
                        <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold shrink-0">Library Breakdown</p>

                        <div className="w-full flex flex-col gap-3 overflow-y-auto pr-2 pb-2 custom-scrollbar">
                            {analytics.allLibraries?.map((lib: any, i: number) => {
                                const percent = (lib.plays / maxLibPlays) * 100;
                                return (
                                    <div key={i} className="flex flex-col gap-1 w-full text-left">
                                        <div className="flex justify-between items-end">
                                            <span className={`font-bold text-sm truncate pr-2 ${i === 0 ? 'text-plex' : 'text-gray-300'}`}>{i + 1}. {lib.title}</span>
                                            <span className={`font-black text-xs whitespace-nowrap ${i === 0 ? 'text-plex' : 'text-gray-400'}`}>{lib.plays} plays</span>
                                        </div>
                                        <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden border border-white/5">
                                            <div className={`h-full rounded-full transition-all duration-1000 ${i === 0 ? 'bg-plex shadow-[0_0_8px_rgba(229,160,13,0.8)]' : 'bg-gray-400'}`} style={{ width: `${percent}%` }}></div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                );
            case 'Media Profile': {
                const total = analytics.totalPlays || 1;
                const movies = analytics.moviesCount || 0;
                const shows = analytics.showsCount || 0;
                const music = analytics.musicCount || 0;
                const moviePct = Math.round((movies / total) * 100);
                const showPct = Math.round((shows / total) * 100);
                const musicPct = Math.round((music / total) * 100);

                const topMoviesList: any[] = (analytics.topMovies || []).slice(0, 3);
                const topShowsList: any[] = (analytics.topShows || []).slice(0, 3);

                const profileDesc = analytics.mediaPreference === 'Movie Buff'
                    ? 'You love the big screen experience. Movies are your go-to comfort.'
                    : analytics.mediaPreference === 'TV Show Binger'
                        ? 'You\'re a serial binger — once you start a show, you see it through.'
                        : analytics.mediaPreference === 'Music Lover'
                            ? 'Music is your thing — you\'re always on the listening grind.'
                            : 'You keep things varied. A bit of everything keeps it interesting.';

                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <PieChart className="w-14 h-14 text-plex mb-3 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-1">{analytics.mediaPreference || 'Mixed Bag'}</h2>
                        <p className="text-muted mb-2 uppercase tracking-widest text-xs font-bold">Content Breakdown</p>
                        <p className="text-gray-400 text-sm mb-5 italic">{profileDesc}</p>

                        {/* Breakdown bars with percentages */}
                        <div className="w-full flex flex-col gap-4 mb-5">
                            <div>
                                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                                    <span className="text-blue-400 flex items-center gap-1.5">🎬 Movies</span>
                                    <span className="text-gray-300">{movies} <span className="text-gray-500 font-normal">({moviePct}%)</span></span>
                                </div>
                                <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                                    <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000" style={{ width: `${moviePct}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                                    <span className="text-green-400 flex items-center gap-1.5">📺 Shows</span>
                                    <span className="text-gray-300">{shows} <span className="text-gray-500 font-normal">({showPct}%)</span></span>
                                </div>
                                <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                                    <div className="bg-gradient-to-r from-green-600 to-green-400 h-full rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)] transition-all duration-1000" style={{ width: `${showPct}%` }} />
                                </div>
                            </div>
                            {music > 0 && (
                                <div>
                                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1.5">
                                        <span className="text-purple-400 flex items-center gap-1.5">🎵 Music</span>
                                        <span className="text-gray-300">{music} <span className="text-gray-500 font-normal">({musicPct}%)</span></span>
                                    </div>
                                    <div className="w-full bg-black/60 rounded-full h-3 overflow-hidden shadow-inner border border-white/5">
                                        <div className="bg-gradient-to-r from-purple-600 to-purple-400 h-full rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)] transition-all duration-1000" style={{ width: `${musicPct}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Top picks per category */}
                        {(topMoviesList.length > 0 || topShowsList.length > 0) && (
                            <div className="w-full">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Top Picks This Period</p>
                                <div className="flex flex-col gap-2">
                                    {topMoviesList.length > 0 && (
                                        <>
                                            <p className="text-left text-[9px] text-blue-400 font-black uppercase tracking-widest mt-1">🎬 Movies</p>
                                            {topMoviesList.map((m: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                                    <span className="text-gray-500 font-black text-xs w-4 text-right flex-shrink-0">{i + 1}</span>
                                                    {m.thumbUrl
                                                        ? <img src={resolvePortalAssetUrl(m.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm flex-shrink-0" />
                                                        : <div className="w-8 h-12 bg-white/10 rounded flex-shrink-0" />}
                                                    <div className="flex flex-col text-left overflow-hidden">
                                                        <span className="font-bold text-sm text-gray-200 truncate">{m.title}</span>
                                                        <span className="text-[10px] text-gray-400">{m.plays} play{m.plays !== 1 ? 's' : ''}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                    {topShowsList.length > 0 && (
                                        <>
                                            <p className="text-left text-[9px] text-green-400 font-black uppercase tracking-widest mt-2">📺 Shows</p>
                                            {topShowsList.map((s: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                                    <span className="text-gray-500 font-black text-xs w-4 text-right flex-shrink-0">{i + 1}</span>
                                                    {s.thumbUrl
                                                        ? <img src={resolvePortalAssetUrl(s.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm flex-shrink-0" />
                                                        : <div className="w-8 h-12 bg-white/10 rounded flex-shrink-0" />}
                                                    <div className="flex flex-col text-left overflow-hidden">
                                                        <span className="font-bold text-sm text-gray-200 truncate">{s.title}</span>
                                                        <span className="text-[10px] text-gray-400">{s.plays} episode{s.plays !== 1 ? 's' : ''}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'Watch Style':
                const discoveryPlays = analytics.uniqueTitles || 0;
                const rewatchPlays = Math.max(0, (analytics.totalPlays || 0) - discoveryPlays);
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Compass className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.watchStyle || 'Unknown'}</h2>
                        <p className="text-muted mb-6 uppercase tracking-widest text-xs font-bold">Discovery vs Rewatch</p>

                        <div className="w-full relative h-4 rounded-full overflow-hidden flex shadow-inner bg-black/50 border border-white/10 mb-2 mt-2">
                            <div className="h-full bg-gradient-to-r from-plex to-orange-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden" style={{ width: `${((discoveryPlays) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                            </div>
                            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden" style={{ width: `${((rewatchPlays) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                            </div>
                        </div>
                        <div className="flex justify-between w-full px-2 mb-6 text-[10px] font-black uppercase tracking-wider">
                            <span className="text-plex">{discoveryPlays} New</span>
                            <span className="text-blue-400">{rewatchPlays} Rewatches</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full mb-6">
                            <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center shadow-lg">
                                <span className="text-3xl font-black text-white mb-1 drop-shadow">{analytics.totalPlays || 0}</span>
                                <span className="text-[9px] text-muted uppercase tracking-widest font-black">Total Plays</span>
                            </div>
                            <div className="bg-gradient-to-b from-plex/20 to-plex/5 border border-plex/30 rounded-xl p-4 flex flex-col items-center justify-center shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-plex/20 blur-xl -mr-5 -mt-5 rounded-full"></div>
                                <span className="text-3xl font-black text-plex mb-1 drop-shadow-md">{analytics.uniqueTitles || 0}</span>
                                <span className="text-[9px] text-plex/80 uppercase tracking-widest font-black">Unique Titles</span>
                            </div>
                        </div>

                        <p className="text-sm text-gray-300 italic bg-white/5 border border-white/10 rounded-lg px-4 py-3 w-full shadow-inner mb-4">
                            {analytics.watchStyle === 'Comfort Binger' ? 'You love returning to your favorite comfort shows.' :
                                analytics.watchStyle === 'Loyal Fan' ? 'You stick around to finish what you start.' :
                                    'You love exploring a wide variety of different content!'}
                        </p>

                        {analytics.topWatched && analytics.topWatched.filter((c: any) => c.plays > 1).length > 0 && (
                            <div className="w-full mt-2">
                                <p className="text-left text-xs uppercase tracking-widest font-bold text-muted mb-3 border-b border-white/10 pb-2">Top Obsessions</p>
                                <div className="flex flex-col gap-2">
                                    {analytics.topWatched.filter((c: any) => c.plays > 1).slice(0, 5).map((item: any, i: number) => (
                                        <div key={i} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-gray-500 font-bold w-4 text-right">{i + 1}</span>
                                                {item.thumbUrl ? <img src={resolvePortalAssetUrl(item.thumbUrl)} className="w-8 h-12 object-cover rounded shadow-sm" /> : <div className="w-8 h-12 bg-white/10 rounded"></div>}
                                                <div className="flex flex-col text-left">
                                                    <span className="font-bold text-sm text-gray-200 line-clamp-1">{item.title}</span>
                                                    <span className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">{item.type}</span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-black text-plex whitespace-nowrap">{item.plays} plays</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'Streaming Habit':
                const avgWd = (analytics.weekdayPlays || 0) / 5;
                const avgWe = (analytics.weekendPlays || 0) / 2;
                return (
                    <div className="flex flex-col items-center justify-center text-center p-6">
                        <Coffee className="w-16 h-16 text-plex mb-4 drop-shadow-lg" />
                        <h2 className="text-3xl font-black text-white mb-2">{analytics.streamingHabit || 'Unknown'}</h2>
                        <p className="text-muted mb-8 uppercase tracking-widest text-xs font-bold">Weekday vs Weekend</p>

                        <div className="w-full relative h-16 rounded-2xl overflow-hidden flex shadow-inner bg-black/50 border border-white/10">
                            <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden group" style={{ width: `${((analytics.weekdayPlays || 0) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                                {analytics.weekdayPlays > 0 && <span className="text-white font-black drop-shadow-md z-10 text-sm">WD</span>}
                            </div>
                            <div className="h-full bg-gradient-to-r from-plex to-orange-400 flex items-center justify-center transition-all duration-1000 shadow-[inset_0_0_20px_rgba(0,0,0,0.3)] relative overflow-hidden group" style={{ width: `${((analytics.weekendPlays || 0) / Math.max(analytics.totalPlays || 1, 1)) * 100}%` }}>
                                {analytics.weekendPlays > 0 && <span className="text-white font-black drop-shadow-md z-10 text-sm">WE</span>}
                            </div>
                        </div>
                        <div className="flex justify-between w-full mt-3 px-2">
                            <div className="flex flex-col items-start">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-400">Weekdays (5 days)</span>
                                <span className="text-lg font-black text-white">{analytics.weekdayPlays || 0} <span className="text-[10px] text-gray-500 font-normal">({avgWd.toFixed(1)}/day)</span></span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-plex">Weekends (2 days)</span>
                                <span className="text-lg font-black text-white">{analytics.weekendPlays || 0} <span className="text-[10px] text-gray-500 font-normal">({avgWe.toFixed(1)}/day)</span></span>
                            </div>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className="relative bg-gradient-to-b from-card to-background border border-border/80 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-plex/0 via-plex to-plex/0 opacity-50"></div>
                <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full p-2 transition-all z-20 group">
                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                </button>
                {renderContent()}
            </div>
        </div>
    );
};

export const DiscoverPosterCard: React.FC<{
    item: { title: string; thumb?: string; thumbUrl?: string; posterFallbackUrl?: string; plexUrl: string; tags?: string[]; year?: number | string; parentTitle?: string };
    aspect?: '2/3' | 'square';
    overlay?: React.ReactNode;
    variant?: 'discover' | 'home';
    className?: string;
    footer?: React.ReactNode;
    showQualityBadges?: boolean;
    posterOnlyLink?: boolean;
    onPosterClick?: () => void;
    posterWidth?: number;
    posterHeight?: number;
}> = ({ item, aspect = '2/3', overlay, variant = 'discover', className = 'w-full', footer, showQualityBadges = true, posterOnlyLink = false, onPosterClick, posterWidth = 300, posterHeight }) => {
    const resolvedPosterHeight = posterHeight ?? (aspect === 'square' ? posterWidth : Math.round(posterWidth * 1.5));
    const posterShell = variant === 'home'
        ? 'relative rounded-xl overflow-hidden bg-background border border-border transition-[border-color] duration-300 group-hover:border-plex/50'
        : 'relative rounded-lg overflow-hidden border border-border group-hover:border-plex transition-colors bg-card';

    const primaryPosterSrc = item.thumbUrl
        ? resolvePortalAssetUrl(item.thumbUrl)
        : item.thumb
            ? portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=${posterWidth}&height=${resolvedPosterHeight}`)
            : '';
    const fallbackPosterSrc = item.posterFallbackUrl
        ? resolvePortalAssetUrl(item.posterFallbackUrl)
        : '';
    const [posterSrc, setPosterSrc] = useState(primaryPosterSrc);
    const [posterFailed, setPosterFailed] = useState(false);
    useEffect(() => {
        setPosterSrc(primaryPosterSrc);
        setPosterFailed(false);
    }, [primaryPosterSrc]);

    const hasPoster = !!(primaryPosterSrc || fallbackPosterSrc);
    const showPosterPlaceholder = !hasPoster || posterFailed;
    const posterInner = (
        <div className={`${posterShell} ${aspect === 'square' ? 'aspect-square' : 'aspect-[2/3]'} w-full`}>
            {showPosterPlaceholder ? (
                <NoPosterPlaceholder />
            ) : (
                <img
                    src={posterSrc || fallbackPosterSrc}
                    alt={item.title}
                    loading="lazy"
                    onError={() => {
                        if (fallbackPosterSrc && posterSrc !== fallbackPosterSrc) {
                            setPosterSrc(fallbackPosterSrc);
                            return;
                        }
                        setPosterFailed(true);
                    }}
                    className={`w-full h-full object-cover ${variant === 'home' ? 'transition-[transform,opacity] duration-300 group-hover:scale-105 group-hover:opacity-80' : ''}`}
                />
            )}
            {overlay}
            {showQualityBadges && item.tags && item.tags.length > 0 && (
                <div className={`absolute left-1 right-1 flex flex-wrap gap-0.5 pointer-events-none z-20 ${overlay ? 'bottom-7' : 'bottom-1'}`}>
                    {item.tags.map((tag) => (
                        <span key={tag} className="text-[8px] font-bold px-1 py-px rounded bg-black/85 text-white/95 border border-white/15 uppercase tracking-wide">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );

    const defaultFooter = (
        <div className={`text-xs font-medium line-clamp-2 leading-tight text-text ${variant === 'home' ? 'text-left px-1' : 'text-center mt-1'}`}>
            {item.title}
        </div>
    );

    if (posterOnlyLink) {
        const posterWrapper = onPosterClick ? (
            <button
                type="button"
                onClick={onPosterClick}
                className="block w-full text-left border-0 p-0 bg-transparent cursor-pointer"
                style={{ color: 'inherit' }}
            >
                {posterInner}
            </button>
        ) : (
            <a
                href={item.plexUrl}
                target="_blank"
                rel="noreferrer"
                className="block no-underline"
                style={{ textDecoration: 'none', color: 'inherit' }}
            >
                {posterInner}
            </a>
        );

        return (
            <div className={`flex flex-col gap-2 group ${className}`} style={{ color: 'inherit' }}>
                {posterWrapper}
                {footer ?? defaultFooter}
            </div>
        );
    }

    if (onPosterClick && !posterOnlyLink) {
        return (
            <button
                type="button"
                onClick={onPosterClick}
                className={`flex flex-col gap-2 group text-left border-0 p-0 bg-transparent cursor-pointer ${className}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
            >
                {posterInner}
                {footer ?? defaultFooter}
            </button>
        );
    }

    return (
        <a href={item.plexUrl} target="_blank" rel="noreferrer" className={`flex flex-col gap-2 group no-underline ${className}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            {posterInner}
            {footer ?? defaultFooter}
        </a>
    );
};

const discoverViewsOverlay = (views: number) => (
    <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-6 pb-1.5 px-1.5">
        <span className="text-[10px] font-semibold text-white/90 tracking-wide">
            {views} {views === 1 ? 'view' : 'views'}
        </span>
    </div>
);

const DISCOVER_DESKTOP_ITEM_LIMIT = 20;
const DISCOVER_MOBILE_ITEM_LIMIT = 12;
const RECENTLY_ADDED_ITEM_LIMIT = 100;
const DISCOVER_LIMIT_OPTIONS = [
    { value: '12', label: '12' },
    { value: '20', label: '20' },
    { value: '25', label: '25' },
    { value: '50', label: '50' },
    { value: '100', label: '100' },
    { value: '150', label: '150' },
    { value: '200', label: '200' },
    { value: '250', label: '250' },
];

const TrendingDiscoverSection: React.FC<{ title: string; items: any[]; limit: number; showQualityBadges?: boolean; useScrollRevealAnimations?: boolean; onItemClick?: (item: any) => void; gridSize?: UpgraderGridSize }> = ({ title, items, limit, showQualityBadges = true, useScrollRevealAnimations, onItemClick, gridSize = 'medium' }) => {
    if (!items?.length) return null;
    return (
        <ScrollReveal enabled={!!useScrollRevealAnimations} className="flex flex-col">
            <h3 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">{title}</h3>
            <div className={upgraderPosterGridClass(gridSize)} style={upgraderPosterGridStyle(gridSize)}>
                {items.slice(0, limit).map((item, i) => (
                    <DiscoverPosterCard
                        key={i}
                        item={{ ...item, plexUrl: item.plexUrl || '#' }}
                        overlay={discoverViewsOverlay(item.views)}
                        showQualityBadges={showQualityBadges}
                        onPosterClick={onItemClick ? () => onItemClick(item) : undefined}
                    />
                ))}
            </div>
        </ScrollReveal>
    );
};

const moveDashboardItem = <T extends string,>(items: T[], from: number, direction: -1 | 1): T[] => {
    const to = from + direction;
    if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

const moveDashboardItemTo = <T extends string,>(items: T[], from: number, to: number): T[] => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

const PortalLayoutRow: React.FC<{
    label: string;
    description?: string;
    hidden: boolean;
    first: boolean;
    last: boolean;
    draggable?: boolean;
    selected?: boolean;
    size?: DashboardWidgetSize;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onToggle: () => void;
    onSelect?: () => void;
    onDragStart?: () => void;
    onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
    onSizeChange?: (size: DashboardWidgetSize) => void;
}> = ({ label, description, hidden, first, last, draggable, selected, size, onMoveUp, onMoveDown, onToggle, onSelect, onDragStart, onDragOver, onDrop, onSizeChange }) => (
    <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onSelect}
        onKeyDown={(event) => {
            if (!onSelect) return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect();
            }
        }}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors outline-none ${draggable ? 'cursor-pointer active:cursor-grabbing' : ''} ${selected ? 'border-plex/70 bg-plex/10 ring-1 ring-plex/40' : hidden ? 'border-border/30 bg-background/20 opacity-70' : 'border-border/50 bg-background/40 hover:border-plex/35 hover:bg-background/55'}`}
    >
        <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex flex-col gap-1 shrink-0">
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onMoveUp();
                }}
                disabled={first}
                className="p-1 rounded-md text-muted hover:text-text hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed"
                aria-label={`Move ${label} up`}
            >
                <ChevronUp className="w-4 h-4" />
            </button>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onMoveDown();
                }}
                disabled={last}
                className="p-1 rounded-md text-muted hover:text-text hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed"
                aria-label={`Move ${label} down`}
            >
                <ChevronDown className="w-4 h-4" />
            </button>
        </div>
        <div className="min-w-0 flex-1">
            <p className={`font-semibold truncate ${hidden ? 'text-muted line-through' : 'text-text'}`}>{label}</p>
            <p className="text-xs text-muted truncate mt-0.5">{selected ? 'Selected - click another row to move it there.' : (description || 'Click to pick up, then click another row to move.')}</p>
        </div>
        </div>
        {onSizeChange && !hidden && (
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/60 bg-background/30 p-1 shrink-0">
                {(['compact', 'normal', 'wide', 'full'] as DashboardWidgetSize[]).map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onSizeChange(option);
                        }}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${
                            (size || 'normal') === option ? 'bg-plex text-black' : 'text-muted hover:text-text hover:bg-white/10'
                        }`}
                    >
                        {option === 'compact' ? 'S' : option === 'normal' ? 'M' : option === 'wide' ? 'L' : 'XL'}
                    </button>
                ))}
            </div>
        )}
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onToggle();
            }}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-colors shrink-0 ${
                hidden
                    ? 'border-plex/40 bg-plex/10 text-plex hover:bg-plex/20'
                    : 'border-border/60 bg-white/5 text-muted hover:text-text hover:border-white/20'
            }`}
        >
            {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {hidden ? 'Add' : 'Hide'}
        </button>
    </div>
);

const PortalWidgetEditorModal: React.FC<{
    layout: DashboardLayoutConfig;
    onChange: (layout: DashboardLayoutConfig) => void;
    onSave: () => void;
    onClose: () => void;
    saving: boolean;
}> = ({ layout, onChange, onSave, onClose, saving }) => {
    const [movingItem, setMovingItem] = useState<{ list: 'sections' | 'main' | 'recent'; index: number } | null>(null);

    const reorderList = (list: 'sections' | 'main' | 'recent', targetIndex: number, source = movingItem) => {
        if (!source || source.list !== list || source.index === targetIndex) return;
        if (list === 'sections') {
            onChange(normalizeSectionLayout({ ...layout, sections: moveDashboardItemTo(layout.sections, source.index, targetIndex) }));
            return;
        }
        const items = list === 'main' ? layout.mainGridOrder : layout.recentlyAddedOrder;
        const next = moveDashboardItemTo(items, source.index, targetIndex);
        onChange(normalizeSectionLayout(list === 'main' ? { ...layout, mainGridOrder: next } : { ...layout, recentlyAddedOrder: next }));
    };

    const selectOrMove = (list: 'sections' | 'main' | 'recent', index: number) => {
        if (!movingItem) {
            setMovingItem({ list, index });
            return;
        }
        if (movingItem.list !== list) {
            setMovingItem({ list, index });
            return;
        }
        if (movingItem.index === index) {
            setMovingItem(null);
            return;
        }
        reorderList(list, index, movingItem);
        setMovingItem(null);
    };

    const toggleSection = (id: DashboardSectionId) => {
        const hiddenSections = layout.hiddenSections.includes(id)
            ? layout.hiddenSections.filter((sectionId) => sectionId !== id)
            : [...layout.hiddenSections, id];
        onChange(normalizeSectionLayout({ ...layout, hiddenSections }));
    };

    const toggleWidget = (id: DashboardWidgetId) => {
        const hiddenWidgets = layout.hiddenWidgets.includes(id)
            ? layout.hiddenWidgets.filter((widgetId) => widgetId !== id)
            : [...layout.hiddenWidgets, id];
        onChange(normalizeSectionLayout({ ...layout, hiddenWidgets }));
    };

    const moveSection = (index: number, direction: -1 | 1) => {
        onChange(normalizeSectionLayout({ ...layout, sections: moveDashboardItem(layout.sections, index, direction) }));
    };

    const moveMainWidget = (index: number, direction: -1 | 1) => {
        onChange(normalizeSectionLayout({ ...layout, mainGridOrder: moveDashboardItem(layout.mainGridOrder, index, direction) }));
    };

    const moveRecentWidget = (index: number, direction: -1 | 1) => {
        onChange(normalizeSectionLayout({ ...layout, recentlyAddedOrder: moveDashboardItem(layout.recentlyAddedOrder, index, direction) }));
    };

    const setWidgetSize = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
        const widgetSizes = { ...(layout.widgetSizes || {}) };
        if (size === 'normal') delete widgetSizes[id];
        else widgetSizes[id] = size;
        onChange(normalizeSectionLayout({ ...layout, widgetSizes }));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl flex flex-col">
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border">
                    <div>
                        <h2 className="text-xl font-black text-text">Portal Widgets</h2>
                        <p className="text-sm text-muted mt-1">Move, hide, and add portal widgets for everyone.</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted hover:text-text hover:bg-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto p-5 space-y-6">
                    <section>
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Page sections</h3>
                            <button
                                type="button"
                                onClick={() => onChange({ ...DEFAULT_DASHBOARD_LAYOUT })}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-bold text-muted hover:text-text hover:border-plex/40 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reset
                            </button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            {layout.sections.map((id, index) => (
                                <PortalLayoutRow
                                    key={id}
                                    label={DASHBOARD_SECTION_LABELS[id]}
                                    hidden={layout.hiddenSections.includes(id)}
                                    first={index === 0}
                                    last={index === layout.sections.length - 1}
                                    draggable
                                    selected={movingItem?.list === 'sections' && movingItem.index === index}
                                    onSelect={() => selectOrMove('sections', index)}
                                    onDragStart={() => setMovingItem({ list: 'sections', index })}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        reorderList('sections', index);
                                        setMovingItem(null);
                                    }}
                                    onMoveUp={() => moveSection(index, -1)}
                                    onMoveDown={() => moveSection(index, 1)}
                                    onToggle={() => toggleSection(id)}
                                />
                            ))}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">Main widgets</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            {layout.mainGridOrder.map((id: MainGridWidgetId, index) => (
                                <PortalLayoutRow
                                    key={id}
                                    label={MAIN_GRID_WIDGET_META[id].label}
                                    description="Drag to move. Resize with S, M, L, XL."
                                    hidden={layout.hiddenWidgets.includes(id)}
                                    first={index === 0}
                                    last={index === layout.mainGridOrder.length - 1}
                                    draggable
                                    size={layout.widgetSizes?.[id] || 'normal'}
                                    selected={movingItem?.list === 'main' && movingItem.index === index}
                                    onSelect={() => selectOrMove('main', index)}
                                    onDragStart={() => setMovingItem({ list: 'main', index })}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        reorderList('main', index);
                                        setMovingItem(null);
                                    }}
                                    onMoveUp={() => moveMainWidget(index, -1)}
                                    onMoveDown={() => moveMainWidget(index, 1)}
                                    onToggle={() => toggleWidget(id)}
                                    onSizeChange={(size) => setWidgetSize(id, size)}
                                />
                            ))}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">Recently added widgets</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                            {layout.recentlyAddedOrder.map((id: RecentlyAddedWidgetId, index) => (
                                <PortalLayoutRow
                                    key={id}
                                    label={RECENTLY_ADDED_WIDGET_META[id]}
                                    hidden={layout.hiddenWidgets.includes(id)}
                                    first={index === 0}
                                    last={index === layout.recentlyAddedOrder.length - 1}
                                    draggable
                                    size={layout.widgetSizes?.[id] || 'full'}
                                    selected={movingItem?.list === 'recent' && movingItem.index === index}
                                    onSelect={() => selectOrMove('recent', index)}
                                    onDragStart={() => setMovingItem({ list: 'recent', index })}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        reorderList('recent', index);
                                        setMovingItem(null);
                                    }}
                                    onMoveUp={() => moveRecentWidget(index, -1)}
                                    onMoveDown={() => moveRecentWidget(index, 1)}
                                    onToggle={() => toggleWidget(id)}
                                    onSizeChange={(size) => setWidgetSize(id, size)}
                                />
                            ))}
                        </div>
                    </section>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 px-5 py-4 border-t border-border bg-background/40">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-muted hover:text-text hover:border-white/20 transition-colors">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-plex text-black font-bold hover:bg-plex/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Save Widgets
                    </button>
                </div>
            </div>
        </div>
    );
};

export const UserDashboard: React.FC<{ sessionInfo: any; publicConfig?: any; onLogout: () => void; refreshSession: () => void; onViewAdmin: () => void; onViewStatus: () => void; onViewDashboard: () => void; onViewSettings?: () => void; onViewLogs?: () => void; onViewCollexions?: () => void; onViewScanner?: () => void; onViewMediaAutomation?: () => void; onViewRequests?: (reviewId?: number) => void; onPendingRequestsChange?: () => void }> = ({ sessionInfo, publicConfig, onLogout, refreshSession, onViewAdmin, onViewStatus, onViewDashboard, onViewSettings, onViewLogs, onViewCollexions, onViewScanner, onViewMediaAutomation, onViewRequests, onPendingRequestsChange }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<ToastMessage | null>(null);
    const [analytics, setAnalytics] = useState<any>(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [serverStats, setServerStats] = useState<any>(null);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [bazarrWidgets, setBazarrWidgets] = useState<any>(null);
    const [serverDataLoading, setServerDataLoading] = useState(true);
    const [topContentPage, setTopContentPage] = useState(0);
    const [dashboardLayoutDraft, setDashboardLayoutDraft] = useState<DashboardLayoutConfig>(() => normalizeSectionLayout(publicConfig?.dashboardLayout));
    const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
    const [layoutSaving, setLayoutSaving] = useState(false);
    const [inlineWidgetEditing, setInlineWidgetEditing] = useState(false);
    const [isDesktopMostWatched, setIsDesktopMostWatched] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );
    const topWatchedPageSize = (dashboardLayoutDraft.topWatchedRows || DEFAULT_DASHBOARD_LAYOUT.topWatchedRows || 2) * 6;
    const [recentHistoryPage, setRecentHistoryPage] = useState(0);
    const recentHistoryPageSize = (dashboardLayoutDraft.recentHistoryRows || DEFAULT_DASHBOARD_LAYOUT.recentHistoryRows || 6);
    const [analyticsDays, setAnalyticsDaysState] = useState<number | 'all'>(() => readPersistedAnalyticsDays());
    const setAnalyticsDays = (value: number | 'all') => {
        persistAnalyticsDays(value);
        setAnalyticsDaysState(value);
    };
    const [analyticsDaysOpen, setAnalyticsDaysOpen] = useState(false);
    const [wrapUpDaysOpen, setWrapUpDaysOpen] = useState(false);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [reportItem, setReportItem] = useState<any>(null);
    const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
    const [shareWrapUpOpen, setShareWrapUpOpen] = useState(false);
    const [recentLimit, setRecentLimit] = useState(24);
    const [detailsItem, setDetailsItem] = useState<any>(null);

    const user = sessionInfo.account;
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const mediaServerType = String(publicConfig?.mediaServerType || 'plex').toLowerCase();
    const isJellyfinPortal = mediaServerType === 'jellyfin' || mediaServerType === 'emby';
    const [optOutNewsletter, setOptOutNewsletter] = useState(user?.optOutNewsletter || false);

    useEffect(() => {
        setDashboardLayoutDraft(normalizeSectionLayout(publicConfig?.dashboardLayout));
    }, [publicConfig?.dashboardLayout]);

    const resolveHomeImage = (thumbUrl: string | null | undefined, fallback = logoUrl()) => {
        if (!thumbUrl) return fallback;
        if (thumbUrl.startsWith('http://') || thumbUrl.startsWith('https://') || thumbUrl.startsWith('/api/')) {
            return resolvePortalAssetUrl(thumbUrl);
        }
        return portalUrl(`/api/plex/image?path=${encodeURIComponent(thumbUrl)}&width=256&height=256`);
    };
    const heroBg = publicConfig?.backgroundImageUrl
        ? resolvePortalAssetUrl(publicConfig.backgroundImageUrl)
        : resolveHomeImage(
            dashboardData?.recentShows?.[0]?.artUrl ||
            dashboardData?.recentShows?.[0]?.thumbUrl ||
            dashboardData?.recentMovies?.[0]?.artUrl ||
            dashboardData?.recentMovies?.[0]?.thumbUrl ||
            dashboardData?.recentMusic?.[0]?.artUrl ||
            dashboardData?.recentMusic?.[0]?.thumbUrl,
            ''
        );

    const buildJellyfinHomeAnalytics = (data: any) => {
        const topMovies = Array.isArray(data?.topMovies) ? data.topMovies : [];
        const topShows = Array.isArray(data?.topShows) ? data.topShows : [];
        const topMusic = Array.isArray(data?.topMusic) ? data.topMusic : [];
        const topWatched = [...topShows, ...topMovies, ...topMusic].sort((a: any, b: any) => (b.plays || 0) - (a.plays || 0));
        const peakHours = Array.isArray(data?.peakHours) ? data.peakHours : [];
        const peakHour = peakHours.reduce((best: number, value: number, hour: number) => value > (peakHours[best] || 0) ? hour : best, 0);
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
        const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
            timeOfDay: peakHour >= 5 && peakHour < 12 ? 'Early Bird' : peakHour >= 12 && peakHour < 18 ? 'Afternoon Watcher' : peakHour >= 18 ? 'Evening Streamer' : 'Night Owl',
            popularDay: topDayEntry && topDayEntry.count > 0 ? daysOfWeek[topDayEntry.day] : 'Recent Activity',
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
            leaderboardNeighbourhood: data?.leaderboardNeighbourhood || [],
            libraryHealth: data?.libraryHealth || null,
            heatmapData: data?.heatmapData || null,
        };
    };
    const handleToggleNewsletter = async () => {
        setIsLoading(true);
        try {
            const newValue = !optOutNewsletter;
            await apiFetch('/api/users/preferences', {
                method: 'POST',
                body: JSON.stringify({ optOutNewsletter: newValue })
            });
            setOptOutNewsletter(newValue);
            setToast({ id: 3, message: 'Newsletter preferences updated!', type: 'success' });
            refreshSession();
        } catch (e: any) {
            setToast({ id: 3, message: e.message || 'Failed to update preferences', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestInvite = async (): Promise<boolean> => {
        setIsLoading(true);
        try {
            await apiFetch('/api/users/request-invite', { method: 'POST' });
            setToast({ id: 1, message: 'Invite requested successfully! Check your email.', type: 'success' });
            refreshSession();
            return true;
        } catch (e: any) {
            setToast({ id: 1, message: e.message || 'Failed to request invite', type: 'error' });
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-request invite if user is totally new — retry if the first attempt fails.
    useEffect(() => {
        if (!user && !isLoading && !sessionInfo.session.isAdmin) {
            if (sessionStorage.getItem('autoInviteSucceeded') === 'true') return;
            if (sessionStorage.getItem('autoInviteRequested') === 'true') return;
            sessionStorage.setItem('autoInviteRequested', 'true');
            handleRequestInvite().then((ok) => {
                if (ok) sessionStorage.setItem('autoInviteSucceeded', 'true');
                else sessionStorage.removeItem('autoInviteRequested');
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        let cancelled = false;
        let refreshTimer: ReturnType<typeof setInterval> | null = null;
        const ANALYTICS_REFRESH_MS = 5 * 60 * 1000;

        const fetchAnalytics = async ({ silent = false } = {}) => {
            if (!sessionInfo?.session?.isAdmin && !user) {
                if (!silent) setAnalyticsLoading(false);
                return;
            }
            try {
                if (!silent) {
                    setAnalyticsLoading(true);
                    setAnalyticsError(null);
                }
                const res = isJellyfinPortal
                    ? buildJellyfinHomeAnalytics(await apiFetch(`/api/jellystat/analytics?days=${analyticsDays}`))
                    : await apiFetch(`/api/plex/analytics/me?days=${analyticsDays}`);
                if (cancelled) return;
                setAnalytics(res);
                if (!silent) {
                    setTopContentPage(0);
                    setRecentHistoryPage(0);
                }
            } catch (e: any) {
                if (!cancelled && !silent) {
                    const message = e?.message || 'Failed to load your analytics';
                    setAnalyticsError(message);
                    setAnalytics(null);
                    setToast({ id: Date.now(), message, type: 'error' });
                }
            } finally {
                if (!cancelled && !silent) setAnalyticsLoading(false);
            }
        };

        fetchAnalytics();
        refreshTimer = setInterval(() => fetchAnalytics({ silent: true }), ANALYTICS_REFRESH_MS);

        const onFocus = () => fetchAnalytics({ silent: true });
        const onVisibility = () => {
            if (document.visibilityState === 'visible') onFocus();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            cancelled = true;
            if (refreshTimer) clearInterval(refreshTimer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [user, sessionInfo.session.isAdmin, analyticsDays, isJellyfinPortal]);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = (e: MediaQueryListEvent) => setIsDesktopMostWatched(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (!analytics?.topWatched?.length) return;
        const maxPage = Math.max(0, Math.ceil(analytics.topWatched.length / topWatchedPageSize) - 1);
        setTopContentPage((p) => Math.min(p, maxPage));
    }, [topWatchedPageSize, analytics?.topWatched?.length]);

    useEffect(() => {
        if (!analytics?.recentHistory?.length) return;
        const maxPage = Math.max(0, Math.ceil(analytics.recentHistory.length / recentHistoryPageSize) - 1);
        setRecentHistoryPage((p) => Math.min(p, maxPage));
    }, [recentHistoryPageSize, analytics?.recentHistory?.length]);

    useEffect(() => {
        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let dashboardTimer: ReturnType<typeof setInterval> | null = null;
        let isMounted = true;
        const DASHBOARD_REFRESH_MS = 5 * 60 * 1000;

        const fetchDashboard = async () => {
            if (!isMounted) return;
            try {
                const [dashboardRes, bazarrRes] = await Promise.all([
                    apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${RECENTLY_ADDED_ITEM_LIMIT}`),
                    sessionInfo?.session?.isAdmin
                        ? apiFetch('/api/bazarr/widgets').catch(() => null)
                        : Promise.resolve(null),
                ]);
                if (isMounted) {
                    setDashboardData(dashboardRes);
                    if (bazarrRes) setBazarrWidgets(bazarrRes);
                }
            } catch (e) {
                console.error('Failed to refresh dashboard data', e);
            }
        };

        const fetchServerData = async () => {
            if (!isMounted) return;
            try {
                const p1 = isJellyfinPortal
                    ? Promise.resolve({ provider: 'jellyfin' }).then(res => { if (isMounted) setServerStats(res); })
                    : apiFetch('/api/plex/stats').then(res => {
                        if (isMounted) {
                            setServerStats(res);
                            if (res?.isBuilding) {
                                pollTimer = setTimeout(fetchServerData, 5000);
                            }
                        }
                    }).catch(e => console.error("Failed to fetch server stats", e));

                const p2 = fetchDashboard();
                await Promise.all([p1, p2]);
            } finally {
                if (isMounted) setServerDataLoading(false);
            }
        };
        fetchServerData();
        dashboardTimer = setInterval(fetchDashboard, DASHBOARD_REFRESH_MS);
        return () => {
            isMounted = false;
            if (pollTimer) clearTimeout(pollTimer);
            if (dashboardTimer) clearInterval(dashboardTimer);
        };
    }, [isJellyfinPortal]);

    useEffect(() => {
        if (!isJellyfinPortal || !analytics?.libraryHealth) return;
        setServerStats((current: any) => ({
            ...(current || {}),
            provider: 'jellyfin',
            ...analytics.libraryHealth,
        }));
    }, [isJellyfinPortal, analytics?.libraryHealth]);

    const handleRelink = async () => {
        setIsLoading(true);
        try {
            await apiFetch('/api/users/relink', { method: 'POST' });
            setToast({ id: 2, message: 'Account re-linked! Check your email for the invite.', type: 'success' });
            refreshSession();
        } catch (e: any) {
            setToast({ id: 2, message: e.message || 'Failed to re-link account', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveDashboardLayout = async () => {
        setLayoutSaving(true);
        try {
            const result = await apiFetch('/api/config/dashboard-layout', {
                method: 'POST',
                body: JSON.stringify({ dashboardLayout: dashboardLayoutDraft }),
            });
            const nextLayout = normalizeSectionLayout(result?.dashboardLayout || dashboardLayoutDraft);
            setDashboardLayoutDraft(nextLayout);
            setToast({ id: Date.now(), message: 'Portal widgets saved.', type: 'success' });
            setLayoutEditorOpen(false);
            setInlineWidgetEditing(false);
        } catch (e: any) {
            setToast({ id: Date.now(), message: e.message || 'Failed to save portal widgets', type: 'error' });
        } finally {
            setLayoutSaving(false);
        }
    };

    const updateDashboardLayoutDraft = (next: DashboardLayoutConfig | ((layout: DashboardLayoutConfig) => DashboardLayoutConfig)) => {
        setDashboardLayoutDraft((current) => normalizeSectionLayout(typeof next === 'function' ? next(current) : next));
    };

    const toggleDashboardSection = (id: DashboardSectionId) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            hiddenSections: layout.hiddenSections.includes(id)
                ? layout.hiddenSections.filter((sectionId) => sectionId !== id)
                : [...layout.hiddenSections, id],
        }));
    };

    const toggleDashboardWidget = (id: DashboardWidgetId) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            hiddenWidgets: layout.hiddenWidgets.includes(id)
                ? layout.hiddenWidgets.filter((widgetId) => widgetId !== id)
                : [...layout.hiddenWidgets, id],
        }));
    };

    const moveDashboardSection = (id: DashboardSectionId, direction: -1 | 1) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            sections: moveDashboardItem(layout.sections, layout.sections.indexOf(id), direction),
        }));
    };

    const reorderDashboardSection = (sourceId: DashboardSectionId, targetId: DashboardSectionId) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            sections: moveDashboardItemTo(layout.sections, layout.sections.indexOf(sourceId), layout.sections.indexOf(targetId)),
        }));
    };

    const moveDashboardMainWidget = (id: MainGridWidgetId, direction: -1 | 1) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            mainGridOrder: moveDashboardItem(layout.mainGridOrder, layout.mainGridOrder.indexOf(id), direction),
        }));
    };

    const reorderDashboardMainWidget = (sourceId: MainGridWidgetId, targetId: MainGridWidgetId) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            mainGridOrder: moveDashboardItemTo(layout.mainGridOrder, layout.mainGridOrder.indexOf(sourceId), layout.mainGridOrder.indexOf(targetId)),
        }));
    };

    const moveDashboardRecentWidget = (id: RecentlyAddedWidgetId, direction: -1 | 1) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            recentlyAddedOrder: moveDashboardItem(layout.recentlyAddedOrder, layout.recentlyAddedOrder.indexOf(id), direction),
        }));
    };

    const reorderDashboardRecentWidget = (sourceId: RecentlyAddedWidgetId, targetId: RecentlyAddedWidgetId) => {
        updateDashboardLayoutDraft((layout) => ({
            ...layout,
            recentlyAddedOrder: moveDashboardItemTo(layout.recentlyAddedOrder, layout.recentlyAddedOrder.indexOf(sourceId), layout.recentlyAddedOrder.indexOf(targetId)),
        }));
    };

    const setDashboardWidgetSize = (id: DashboardWidgetId, size: DashboardWidgetSize) => {
        updateDashboardLayoutDraft((layout) => {
            const widgetSizes = { ...(layout.widgetSizes || {}) };
            if (size === 'normal') delete widgetSizes[id];
            else widgetSizes[id] = size;
            return { ...layout, widgetSizes };
        });
    };

    const daysLeft = user?.expiryDate ? getDaysUntilExpiry(user.expiryDate) : null;
    const progressPct = getAccessProgressPct(user?.expiryDate || null, user?.joiningDate || null);
    const isExpired = daysLeft !== null && daysLeft < 0;
    const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
    const isRevoked = user?.plexAccessStatus === 'revoked';
    const isPending = user?.plexAccessStatus?.toLowerCase() === 'pending';

    const wrapUpDaysOptions = ANALYTICS_PERIOD_OPTIONS;

    const layoutCtx = useMemo(() => ({
        isAdmin: !!sessionInfo.session.isAdmin,
        hasUser: !!user,
        referralEnabled: !!publicConfig?.referralEnabled,
        requestsQueueEnabled: !!sessionInfo?.navFeatures?.requestsQueue,
        collexionsEnabled: !!sessionInfo?.navFeatures?.collexions,
        scannerHomeWidgetEnabled: !!sessionInfo?.navFeatures?.scannerHomeWidget,
        mediaAutomationHomeWidgetEnabled: !!sessionInfo?.navFeatures?.mediaAutomationHomeWidget,
        mediaServerType: publicConfig?.mediaServerType || 'plex',
    }), [sessionInfo.session.isAdmin, user, publicConfig?.referralEnabled, publicConfig?.mediaServerType, sessionInfo?.navFeatures?.requestsQueue, sessionInfo?.navFeatures?.collexions, sessionInfo?.navFeatures?.scannerHomeWidget, sessionInfo?.navFeatures?.mediaAutomationHomeWidget]);

    const widgetDeps = useMemo(() => ({
        sessionInfo,
        publicConfig,
        user,
        isRevoked,
        isExpiringSoon,
        daysLeft,
        progressPct,
        optOutNewsletter,
        serverStats,
        serverDataLoading,
        analytics,
        analyticsLoading,
        analyticsDays,
        analyticsDaysOpen,
        setAnalyticsDays,
        setAnalyticsDaysOpen,
        showQualityBadges,
        dashboardData,
        bazarrWidgets,
        handleRelink,
        handleToggleNewsletter,
        onViewAdmin,
        onViewSettings,
        onViewLogs,
        onViewCollexions,
        onViewScanner,
        onViewMediaAutomation,
        onViewRequests,
        onPendingRequestsChange,
        setToast,
        DiscoverPosterCard,
        RebuildLibraryCacheButton,
    }), [
        sessionInfo, publicConfig, user, isRevoked, isExpiringSoon, daysLeft, progressPct, optOutNewsletter,
        serverStats, serverDataLoading, analytics, analyticsLoading, analyticsDays, analyticsDaysOpen,
        showQualityBadges, dashboardData, bazarrWidgets, onViewAdmin, onViewSettings, onViewLogs, onViewCollexions, onViewScanner, onViewMediaAutomation, onViewRequests, onPendingRequestsChange,
    ]);

    const renderMainGridWidget = useMemo(() => createMainGridWidgetRenderer(widgetDeps), [widgetDeps]);
    const renderPendingRequests = useMemo(() => createPendingRequestsSectionRenderer(widgetDeps), [widgetDeps]);
    const renderScanner = useMemo(() => createScannerSectionRenderer(widgetDeps), [widgetDeps]);
    const renderMediaAutomation = useMemo(() => createMediaAutomationSectionRenderer(widgetDeps), [widgetDeps]);
    const renderBazarrTools = useMemo(() => createBazarrToolsSectionRenderer(widgetDeps), [widgetDeps]);
    const renderRecentlyAddedWidget = useMemo(() => createRecentlyAddedWidgetRenderer(widgetDeps), [widgetDeps]);

    return (
        <div className="w-full flex flex-col gap-3 md:gap-4">
            <Loader isLoading={isLoading} isCinematic={!!publicConfig?.useCinematicLoading} />
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            {layoutEditorOpen && (
                <PortalWidgetEditorModal
                    layout={dashboardLayoutDraft}
                    onChange={setDashboardLayoutDraft}
                    onSave={handleSaveDashboardLayout}
                    onClose={() => setLayoutEditorOpen(false)}
                    saving={layoutSaving}
                />
            )}

            {/* Massive Hero Banner */}
            <div className="home-hero-banner relative w-full rounded-2xl overflow-hidden shadow-2xl bg-card border border-border">
                {/* Blurred Background */}
                <div className="absolute inset-0 bg-background overflow-hidden">
                    {publicConfig?.useTrendingSlideshow && publicConfig?.trendingBackgrounds?.length > 0 ? (
                        <>
                            <div className="absolute inset-0 opacity-100">
                                <SlideshowBackground
                                    backgrounds={publicConfig.trendingBackgrounds}
                                    intervalSeconds={publicConfig.trendingSlideshowInterval}
                                    opacity={1}
                                    smartFocus
                                />
                            </div>
                            <div className="home-hero-scrim absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/20 to-transparent" />
                            <div className="absolute inset-0 bg-black/10" />
                        </>
                    ) : dashboardData?.recentMovies?.length > 0 ? (
                        <>
                            <div className="absolute -inset-[50%] opacity-40 transform -rotate-12 scale-110 flex gap-4 overflow-hidden pointer-events-none justify-center">
                                {[...Array(6)].map((_, colIdx) => (
                                    <div key={colIdx} className={`flex flex-col gap-4 ${colIdx % 2 === 0 ? 'animate-[scrollVertical_40s_linear_infinite]' : 'animate-[scrollVertical_50s_linear_infinite_reverse]'}`}>
                                        {[...dashboardData.recentMovies, ...dashboardData.recentMovies].sort(() => 0.5 - Math.random()).map((m: any, i: number) => (m.thumb || m.thumbUrl) && (
                                            <img key={`c${colIdx}-${i}`} src={m.thumbUrl ? resolvePortalAssetUrl(m.thumbUrl) : portalUrl(`/api/plex/image?path=${encodeURIComponent(m.thumb)}&width=200&height=300`)} className="w-32 md:w-48 rounded-xl object-cover" alt="" />
                                        ))}
                                    </div>
                                ))}
                            </div>
                            <div className="home-hero-scrim absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                        </>
                    ) : heroBg ? (
                        <>
                            <div
                                className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
                                style={{ backgroundImage: `url(${heroBg})` }}
                            />
                            <div className="home-hero-scrim absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                        </>
                    ) : (
                        <>
                            <div className="home-hero-scrim absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-card via-card/40 to-transparent" />
                        </>
                    )}
                </div>

                {false && sessionInfo.session.isAdmin && (
                    <div className="absolute top-4 right-4 z-20 flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setInlineWidgetEditing((value) => !value)}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold backdrop-blur-md transition-colors shadow-lg ${inlineWidgetEditing ? 'border-plex/70 bg-plex text-black' : 'border-white/15 bg-black/45 text-text hover:border-plex/50 hover:text-plex'}`}
                        >
                            <Settings className="w-4 h-4" />
                            {inlineWidgetEditing ? 'Editing Widgets' : 'Edit Widgets'}
                        </button>
                        {inlineWidgetEditing && (
                            <button
                                type="button"
                                onClick={handleSaveDashboardLayout}
                                disabled={layoutSaving}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-400/40 bg-emerald-500/20 text-emerald-100 text-sm font-bold backdrop-blur-md hover:bg-emerald-500/30 disabled:opacity-60 transition-colors shadow-lg"
                            >
                                {layoutSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Save
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setLayoutEditorOpen(true)}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-black/45 text-text text-sm font-bold backdrop-blur-md hover:border-plex/50 hover:text-plex transition-colors shadow-lg"
                        >
                            List
                        </button>
                    </div>
                )}

                <div className="relative pt-14 pb-7 px-4 md:pt-32 md:pb-12 md:px-12 flex flex-col items-center md:items-start text-center md:text-left z-10">
                    <div className="flex flex-col md:flex-row items-center md:items-center gap-4 md:gap-6">
                        {/* Avatar */}
                        {(() => {
                            const thumbUrl = user?.thumb || sessionInfo.session.thumb || (sessionInfo.session.isAdmin ? sessionInfo.adminThumb : null);
                            if (thumbUrl) {
                                return (
                                    <div className="relative">
                                        <img
                                            src={resolveHomeImage(thumbUrl)}
                                            alt={sessionInfo.session.username}
                                            className="relative w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-4 border-plex shadow-2xl bg-card"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.add('flex');
                                            }}
                                        />
                                        <div className={`hidden relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-plex/40 to-plex/10 border-4 border-plex items-center justify-center text-plex font-black text-5xl shadow-2xl overflow-hidden`}>
                                            {sessionInfo.session.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div className="relative">
                                    <div className={`relative w-28 h-28 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-plex/40 to-plex/10 border-4 border-plex items-center justify-center text-plex font-black text-5xl flex shadow-2xl overflow-hidden`}>
                                        {sessionInfo.session.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                </div>
                            );
                        })()}

                        <div className="pb-1 md:pb-2 overflow-visible min-w-0 max-w-full">
                            <p className="text-plex text-sm uppercase tracking-[4px] font-bold mb-1 drop-shadow-md">
                                {(() => {
                                    const hour = new Date().getHours();
                                    if (hour >= 5 && hour < 12) return 'Good Morning';
                                    if (hour >= 12 && hour < 17) return 'Good Afternoon';
                                    if (hour >= 17 && hour < 22) return 'Good Evening';
                                    return 'Good Night';
                                })()}
                            </p>
                            <h1
                                className="text-4xl md:text-5xl font-black text-text leading-normal pb-0.5"
                                style={{ fontSize: 'clamp(1.6rem, 8vw, 3rem)', wordBreak: 'break-word' }}
                            >
                                {sessionInfo.session.username}
                            </h1>
                            {sessionInfo.session.isAdmin && (
                                <span className="inline-block mt-3 px-3 py-1 rounded-full text-[10px] font-black bg-plex/20 text-plex border border-plex/40 uppercase tracking-widest">Server Admin</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedMetric && analytics && (
                <WrapUpModal metric={selectedMetric} analytics={analytics} days={analyticsDays} onClose={() => setSelectedMetric(null)} />
            )}
            {shareWrapUpOpen && analytics && (
                <ShareWrapUpModal
                    analytics={analytics}
                    days={analyticsDays}
                    serverName={sessionInfo?.serverName || 'Server Portal'}
                    username={sessionInfo?.session?.username || user?.username}
                    onClose={() => setShareWrapUpOpen(false)}
                    onToast={(message, type) => setToast({ id: Date.now(), message, type })}
                />
            )}

            <DetailsModal item={detailsItem} onClose={() => setDetailsItem(null)} />

            <UserDashboardLayout
                layoutConfig={dashboardLayoutDraft}
                layoutCtx={layoutCtx}
                renderMainGridWidget={renderMainGridWidget}
                renderPendingRequests={renderPendingRequests}
                renderScanner={renderScanner}
                renderMediaAutomation={renderMediaAutomation}
                renderBazarrTools={renderBazarrTools}
                renderRecentlyAddedWidget={renderRecentlyAddedWidget}
                recentlyAddedLoading={serverDataLoading}
                hasDashboardData={!!dashboardData}
                renderRecentlyAddedSkeleton={() => <HomeRecentlyAddedSkeleton />}
                renderWrapUp={() => (
                    <>
                        {/* Personal Wrap-Up */}
                        {(sessionInfo.session.isAdmin || user) && analyticsLoading && (
                            <WrapUpCardsSkeleton />
                        )}
                        {(sessionInfo.session.isAdmin || user) && !analyticsLoading && analyticsError && (
                            <div className="glass-card p-4 md:p-5 shadow-xl border border-red-500/30 bg-red-500/5">
                                <p className="text-red-300 text-sm font-medium">{analyticsError}</p>
                            </div>
                        )}
                        {(sessionInfo.session.isAdmin || user) && !analyticsLoading && analytics && (
                            <div className="glass-card p-4 md:p-5 shadow-xl">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 md:mb-4">
                                    <h3 className="text-xl font-bold text-text">Your Personal Wrap-Up</h3>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShareWrapUpOpen(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-plex/10 border border-plex/30 text-plex hover:bg-plex/20 transition-colors shadow-sm"
                                        >
                                            <Share2 className="w-4 h-4 flex-shrink-0" />
                                            Share
                                        </button>
                                        <PeriodDropdown
                                            value={analyticsDays}
                                            open={wrapUpDaysOpen}
                                            onToggle={() => setWrapUpDaysOpen(!wrapUpDaysOpen)}
                                            onClose={() => setWrapUpDaysOpen(false)}
                                            onChange={(value) => setAnalyticsDays(value as number | 'all')}
                                            options={wrapUpDaysOptions}
                                            fallbackLabel="Last 7 Days"
                                            buttonClassName="flex items-center gap-2 bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm font-medium text-text focus:outline-none hover:border-plex/50 transition-colors cursor-pointer shadow-sm"
                                        />
                                    </div>
                                </div>
                                <WrapUpCardGrid analytics={analytics} interactive onCardClick={setSelectedMetric} minCardHeight={112} />
                                {analytics.heatmapData && (
                                    <div className="mt-6 pt-6 border-t border-white/10 min-w-0 overflow-hidden">
                                        <h4 className="text-xs uppercase tracking-widest text-muted font-bold mb-4 flex items-center gap-2">
                                            <Calendar className="w-4 h-4 text-plex" /> Activity ({analyticsDays === 'all' ? 'All Time' : `Last ${analyticsDays} Days`})
                                        </h4>
                                        <ActivityHeatmap data={analytics.heatmapData} />
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
                renderWatchRowLeft={() => {
                    if (!(sessionInfo.session.isAdmin || user)) return null;
                    if (analyticsLoading || !analytics?.recentHistory?.length) return null;
                    return (
                        <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col h-full w-full min-h-0">
                            <div className="flex items-center justify-between mb-3 md:mb-4 flex-shrink-0">
                                <h3 className="text-lg md:text-xl font-bold text-text">Recently Watched</h3>
                                {analytics.recentHistory.length > recentHistoryPageSize && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setRecentHistoryPage(p => Math.max(0, p - 1))}
                                            disabled={recentHistoryPage === 0}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                        >
                                            <ChevronUp className="w-4 h-4 -rotate-90" />
                                        </button>
                                        <span className="text-xs text-muted font-medium w-8 text-center">
                                            {recentHistoryPage + 1} / {Math.ceil(analytics.recentHistory.length / recentHistoryPageSize)}
                                        </span>
                                        <button
                                            onClick={() => setRecentHistoryPage(p => Math.min(Math.ceil(analytics.recentHistory.length / recentHistoryPageSize) - 1, p + 1))}
                                            disabled={recentHistoryPage >= Math.ceil(analytics.recentHistory.length / recentHistoryPageSize) - 1}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                        >
                                            <ChevronDown className="w-4 h-4 -rotate-90" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="relative flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar pl-8 pr-2 pt-2 pb-2">
                                {/* Vertical Line */}
                                <div className="absolute left-[15px] top-6 bottom-6 w-[2px] bg-white/5 rounded-full" />
                                
                                {analytics.recentHistory.slice(recentHistoryPage * recentHistoryPageSize, (recentHistoryPage + 1) * recentHistoryPageSize).map((item: any, idx: number) => (
                                    <div key={idx} className="relative flex items-center py-2.5 group">
                                        {/* Timeline Node */}
                                        <div className="absolute -left-[21px] w-[10px] h-[10px] rounded-full bg-white/20 group-hover:bg-plex group-hover:scale-[1.6] group-hover:shadow-[0_0_15px_rgba(229,160,13,0.8)] transition-all duration-300 z-10" />
                                        
                                        <button onClick={() => setDetailsItem(item)} className="flex items-center flex-1 min-w-0 gap-4 p-2.5 -my-2.5 rounded-2xl hover:bg-white/5 transition-colors border-0 bg-transparent text-left cursor-pointer outline-none w-full relative group">
                                            <div className={`w-10 sm:w-12 ${item.type === 'track' ? 'aspect-square' : 'aspect-[2/3]'} rounded-md overflow-hidden bg-black/50 flex-shrink-0 shadow-lg border border-white/5 group-hover:border-plex/40 transition-colors`}>
                                                {item.thumbUrl ? (
                                                    <img src={resolvePortalAssetUrl(item.thumbUrl)} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <PlaySquare className="w-5 h-5 text-muted/50" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                <p className="text-sm text-muted truncate">
                                                    Watched <span className="font-bold text-text group-hover:text-plex transition-colors">{item.title}</span>
                                                </p>
                                                {item.episodeTitle && <p className="text-[11px] font-semibold text-muted/70 truncate mt-0.5">{item.episodeTitle}</p>}
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    <Clock className="w-3 h-3 text-plex/80" />
                                                    <p className="text-[10px] font-mono font-bold text-muted/60 uppercase tracking-wider">{new Date(item.viewedAt * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                                                </div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={(e) => { e.preventDefault(); setReportItem(item); }}
                                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2.5 ml-2 text-muted hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all focus:outline-none flex-shrink-0"
                                            title="Report a playback issue"
                                        >
                                            <AlertTriangle className="w-[18px] h-[18px]" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                }}
                renderWatchRowRight={() => {
                    if (!(sessionInfo.session.isAdmin || user)) return null;
                    if (analyticsLoading) return <TopWatchedGridSkeleton />;
                    if (!(analytics && analytics.totalPlays > 0 && analytics.topWatched && analytics.topWatched.length > 0)) return null;
                    return (
                        <div className="glass-card p-4 md:p-5 shadow-xl flex flex-col h-full w-full min-h-0">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 md:mb-4 flex-shrink-0">
                                <div>
                                    <h3 className="text-lg md:text-xl font-bold text-text mb-0.5">Your Most Watched</h3>
                                    <p className="text-muted text-sm">Based on your {analytics.totalPlays} total plays</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {analytics.topWatched.length > topWatchedPageSize && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setTopContentPage(p => Math.max(0, p - 1))}
                                                disabled={topContentPage === 0}
                                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                            >
                                                <ChevronUp className="w-4 h-4 -rotate-90" />
                                            </button>
                                            <span className="text-xs text-muted font-medium w-8 text-center">
                                                {topContentPage + 1} / {Math.ceil(analytics.topWatched.length / topWatchedPageSize)}
                                            </span>
                                            <button
                                                onClick={() => setTopContentPage(p => Math.min(Math.ceil(analytics.topWatched.length / topWatchedPageSize) - 1, p + 1))}
                                                disabled={topContentPage >= Math.ceil(analytics.topWatched.length / topWatchedPageSize) - 1}
                                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-text"
                                            >
                                                <ChevronDown className="w-4 h-4 -rotate-90" />
                                            </button>
                                        </div>
                                    )}
                                    <PeriodDropdown
                                        value={analyticsDays}
                                        open={analyticsDaysOpen}
                                        onToggle={() => setAnalyticsDaysOpen(!analyticsDaysOpen)}
                                        onClose={() => setAnalyticsDaysOpen(false)}
                                        onChange={(value) => setAnalyticsDays(value as number | 'all')}
                                        options={ANALYTICS_PERIOD_OPTIONS}
                                        fallbackLabel="Last 7 Days"
                                        buttonClassName="flex items-center gap-2 bg-background border border-border/50 rounded-lg px-3 py-1.5 text-sm font-medium text-text focus:outline-none hover:border-plex/50 transition-colors cursor-pointer shadow-sm"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 md:gap-3.5 flex-1 min-h-0 content-start">
                                {analytics.topWatched.slice(topContentPage * topWatchedPageSize, (topContentPage + 1) * topWatchedPageSize).map((item: any) => (
                                    <a key={item.key} href={item.plexUrl} target="_blank" rel="noreferrer" className="group flex flex-col gap-1.5">
                                        <div className="relative rounded-lg overflow-hidden aspect-[2/3] bg-background border border-white/5 transition-[box-shadow,border-color] duration-300 group-hover:shadow-xl group-hover:border-plex/50">
                                            {item.thumbUrl ? (
                                                <img src={resolvePortalAssetUrl(item.thumbUrl)} alt={item.title} className="w-full h-full object-cover transition-[transform,opacity] duration-300 group-hover:scale-105 group-hover:opacity-80" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center p-4 text-center bg-white/5">
                                                    <span className="text-xs font-bold text-muted line-clamp-3">{item.title}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col px-0.5">
                                            <p className="text-xs sm:text-sm font-bold text-text truncate group-hover:text-plex transition-colors">{item.title}</p>
                                            <p className="text-[10px] sm:text-xs text-plex font-black mt-0.5 uppercase tracking-wider">{item.plays} plays</p>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    );
                }}
            />

            {reportItem && (
                <ReportIssueModal item={reportItem} onClose={() => setReportItem(null)} />
            )}
        </div>
    );
};

const ServiceCustomSelect = ({ value, onChange, options }: { value: string, onChange: (val: string) => void, options: { id: string, name: string }[] }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selected = options.find(o => o.id === value);

    return (
        <div className="relative flex-1 md:flex-none md:w-64">
            <button
                type="button"
                className="w-full bg-black/20 border border-border hover:border-white/20 rounded-lg px-4 py-2.5 text-text outline-none flex items-center justify-between transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="truncate">{selected ? selected.name : '-- Choose a service --'}</span>
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1f2e] border border-border rounded-lg shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                        {options.map(option => (
                            <button
                                key={option.id}
                                className={`w-full text-left px-4 py-3 text-sm hover:bg-white/10 transition-colors ${value === option.id ? 'bg-plex/10 text-plex font-bold' : 'text-text'}`}
                                onClick={() => {
                                    onChange(option.id);
                                    setIsOpen(false);
                                }}
                            >
                                {option.name}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export const StatusDashboard: React.FC<{ onBack: () => void, isAdmin: boolean, isPublic?: boolean }> = ({ onBack, isAdmin, isPublic }) => {
    const [statusData, setStatusData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'analytics'>('overview');
    const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
    const [period, setPeriod] = useState<StatusPeriod>('90d');

    const fetchStatus = useCallback(async () => {
        try {
            const data = await apiFetch('/api/status');
            setStatusData(data);
            setHasError(false);
        } catch (e) {
            console.error(e);
            setHasError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    useEffect(() => {
        if (statusData && !selectedServiceId) {
            const nextServices = statusData.config?.services || [];
            if (nextServices.length > 0) {
                setSelectedServiceId(nextServices[0].id);
            }
        }
    }, [statusData, selectedServiceId]);

    if (isLoading || !statusData) {
        return (
            <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center">
                <header className="flex items-center gap-4 w-full mb-8 pb-4 border-b border-border">
                    {isPublic && (
                        <button onClick={onBack} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center text-muted hover:text-text">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                    )}
                    <h2 className="text-2xl font-bold text-text">Server Status</h2>
                </header>
                {hasError ? (
                    <div className="text-center p-8">
                        <p className="text-status-expired mb-4">Failed to load status data.</p>
                        <button onClick={fetchStatus} className="px-4 py-2 bg-plex text-background rounded-lg font-bold">Retry</button>
                    </div>
                ) : (
                    <Loader isLoading={true} />
                )}
            </div>
        );
    }

    const { config, healthData } = statusData;
    const services = config?.services || [];
    const groups = config?.groups || [];
    const serviceIds = services.map((s: any) => s.id);
    const statusCounts = services.reduce((acc: any, service: any) => {
        const status = healthData[service.id]?.currentStatus || 'unknown';
        acc.total += 1;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { total: 0, online: 0, degraded: 0, offline: 0, unknown: 0 });
    const fleetPct = fleetUptimeForPeriod(healthData, serviceIds, period);
    const periodLabel = STATUS_PERIODS.find((p) => p.id === period)?.label || period;
    const selectedService = services.find((s: any) => s.id === selectedServiceId) || services[0];
    const selectedHealth = selectedService ? healthData[selectedService.id] : null;
    const selectedStats = periodStats(selectedHealth, period);
    const selectedBars = barsForPeriod(selectedHealth, period);
    const selectedLatencySeries = latencySeriesForPeriod(selectedHealth, period);

    const barClassForTone = (tone: string) => {
        if (tone === 'online') return 'bg-status-active hover:shadow-[0_0_8px_rgba(35,134,54,0.6)]';
        if (tone === 'offline') return 'bg-status-expired hover:shadow-[0_0_8px_rgba(218,54,51,0.6)]';
        if (tone === 'degraded') return 'bg-status-expiring hover:shadow-[0_0_8px_rgba(210,153,34,0.6)]';
        return 'bg-border';
    };

    const heightForTone = (tone: string) => {
        if (tone === 'online') return 'h-full';
        if (tone === 'degraded') return 'h-2/3';
        if (tone === 'offline') return 'h-1/3';
        return 'h-1/5';
    };

    return (
        <div className="w-full flex flex-col">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full mb-6 pb-4 border-b border-border">
                <div className="flex items-center gap-4">
                    {isPublic && (
                        <button onClick={onBack} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center text-muted hover:text-text">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </button>
                    )}
                    <h2 className="text-2xl font-bold text-text">Server Status</h2>
                </div>
                <div className="flex flex-wrap gap-1.5 p-1 bg-black/20 rounded-xl border border-border w-fit">
                    {STATUS_PERIODS.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setPeriod(p.id)}
                            className={`px-3.5 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all border-none outline-none cursor-pointer ${
                                period === p.id ? 'bg-plex text-background' : 'bg-transparent text-muted hover:text-text hover:bg-white/5'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex flex-wrap gap-2 mb-8 p-1.5 bg-black/20 rounded-xl border border-border w-fit mx-auto md:mx-0">
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'history', label: 'Detailed History' },
                    { id: 'analytics', label: 'Analytics' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 cursor-pointer border-none outline-none ${activeTab === tab.id
                            ? 'bg-plex text-background'
                            : 'bg-transparent text-muted hover:text-text hover:bg-white/5'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <main className="user-content">
                {activeTab === 'overview' && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                            {[
                                { label: 'Services', value: statusCounts.total, tone: 'text-text' },
                                { label: 'Online', value: statusCounts.online, tone: 'text-status-active' },
                                { label: 'Degraded', value: statusCounts.degraded, tone: 'text-status-expiring' },
                                { label: 'Offline', value: statusCounts.offline, tone: 'text-status-expired' },
                                { label: `${periodLabel} uptime`, value: `${fleetPct.toFixed(1)}%`, tone: 'text-plex' },
                            ].map((item) => (
                                <div key={item.label} className="rounded-xl border border-white/5 bg-card p-4 shadow-lg">
                                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted">{item.label}</p>
                                    <p className={`text-2xl font-black mt-1 ${item.tone}`}>{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {!isPublic && <StatusSpeedTest />}

                        {config.announcement && config.announcement.enabled && (
                            <div className="status-announcement">
                                {config.announcement.message}
                            </div>
                        )}

                        {groups.length === 0 && (
                            <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-border rounded-xl bg-card my-8">
                                <Activity className="w-12 h-12 text-muted mb-4 opacity-50" />
                                <h3 className="text-xl font-bold text-text mb-2">No Services Monitored</h3>
                                <p className="text-muted max-w-md">
                                    The status page is currently blank because no services have been configured yet.
                                    {isAdmin ? (
                                        <>
                                            <br /><br />
                                            You can add status monitors by going to <strong className="text-text">Settings &gt; Status Page</strong> and adding your services and groups.
                                        </>
                                    ) : (
                                        <>
                                            <br /><br />
                                            The server administrator hasn't added any services to monitor yet. Check back later!
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {groups.map((group: any) => {
                            const groupServices = services.filter((s: any) => s.groupId === group.id);
                            if (groupServices.length === 0) return null;
                            return (
                                <div key={group.id} className="mb-8">
                                    <h3 className="text-lg font-bold text-muted uppercase tracking-[2px] mb-6 border-b border-white/10 pb-2">{group.name}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {groupServices.map((service: any, index: number) => {
                                            const health = healthData[service.id] || { currentStatus: 'unknown', uptimePercentage: 100, dailyHistory: {} };
                                            const uptime = uptimeForPeriod(health, period);
                                            const bars = barsForPeriod(health, period);
                                            const latency = health.lastLatency;
                                            const avgLatency = periodStats(health, period).latency.avg;
                                            const rangeLeft = period === '24h' ? '24h ago' : period === '7d' ? '7 days ago' : period === '30d' ? '30 days ago' : '90 days ago';
                                            return (
                                                <div key={service.id} className="bg-card rounded-xl p-4 md:p-6 border border-white/5 shadow-lg flex flex-col gap-4 animate-fade-in hover:-translate-y-1 hover:shadow-plex/10 hover:shadow-2xl hover:border-plex/30 transition-all duration-300" style={{ animationFillMode: 'both', animationDelay: `${index * 75}ms` }}>
                                                    <div className="flex justify-between items-start mb-2 gap-4">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <StatusServiceIcon service={service} />
                                                            <div className="min-w-0">
                                                                <h4 className="font-bold text-text text-lg truncate">{service.name}</h4>
                                                                {service.description && <p className="text-xs text-muted truncate">{service.description}</p>}
                                                            </div>
                                                        </div>
                                                        <span className={`px-3 py-1 rounded-full text-[0.65rem] uppercase tracking-wider font-bold border flex items-center gap-1.5 shadow-lg transition-all duration-300 ${health.currentStatus === 'online' ? 'bg-status-active/10 text-status-active border-status-active/30 shadow-[0_0_10px_rgba(35,134,54,0.3)]' : health.currentStatus === 'offline' ? 'bg-status-expired/10 text-[#D32F2F] border-[#D32F2F]/30 shadow-[0_0_10px_rgba(211,47,47,0.3)] animate-pulse' : 'bg-status-expiring/10 text-status-expiring border-status-expiring/30 shadow-[0_0_10px_rgba(210,153,34,0.3)]'}`}>
                                                            {health.currentStatus === 'online' && <span className="w-1.5 h-1.5 rounded-full bg-status-active animate-pulse shadow-[0_0_5px_rgba(35,134,54,0.8)]" />}
                                                            {health.currentStatus === 'offline' && <span className="w-1.5 h-1.5 rounded-full bg-[#D32F2F] animate-ping" />}
                                                            {health.currentStatus === 'degraded' && <span className="w-1.5 h-1.5 rounded-full bg-status-expiring animate-pulse shadow-[0_0_5px_rgba(210,153,34,0.8)]" />}
                                                            {(health.currentStatus || 'unknown').toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted font-medium">
                                                        <span>{periodLabel} uptime: <span className="text-text font-bold tabular-nums">{uptime.pct.toFixed(1)}%</span></span>
                                                        <span>Latency: <span className="text-text font-bold tabular-nums">{formatLatencyMs(latency)}</span>
                                                            {avgLatency != null && <span className="text-muted font-normal"> avg {formatLatencyMs(avgLatency)}</span>}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-[2px] h-12 mt-auto items-end pt-4 group/bars relative">
                                                        {bars.map((bar, i) => {
                                                            const tone = statusToneFromPct(bar.pct);
                                                            const title = bar.pct == null
                                                                ? `${bar.label}: No data`
                                                                : `${bar.label}: ${bar.pct.toFixed(1)}% uptime${bar.avgLatency != null ? ` · ${formatLatencyMs(bar.avgLatency)} avg` : ''}`;
                                                            return (
                                                                <div
                                                                    key={bar.key}
                                                                    className={`flex-1 rounded-sm transition-all duration-300 hover:opacity-100 opacity-60 cursor-pointer animate-fade-in ${barClassForTone(tone)} ${heightForTone(tone)}`}
                                                                    style={{ animationFillMode: 'both', animationDelay: `${Math.min(i, 40) * 10}ms` }}
                                                                    title={title}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-muted font-bold tracking-wider mt-1 opacity-50 uppercase">
                                                        <span>{rangeLeft}</span>
                                                        <span className="text-center flex-1 tabular-nums">{uptime.pct.toFixed(1)}%</span>
                                                        <span>Now</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}

                {activeTab === 'history' && (
                    <div className="flex flex-col gap-8 animate-fade-in">
                        {services.map((service: any) => {
                            const health = healthData[service.id];
                            const rows = historyRowsForPeriod(health, period);
                            const incidents = incidentsForPeriod(health, period);
                            return (
                                <div key={service.id} className="bg-card border border-white/5 shadow-2xl rounded-2xl overflow-hidden mt-4">
                                    <div className="p-4 bg-black/20 border-b border-border/50 flex flex-wrap items-center justify-between gap-2">
                                        <h3 className="text-lg font-bold text-plex uppercase tracking-wider">{service.name}</h3>
                                        <span className="text-xs text-muted font-bold uppercase tracking-wider">{periodLabel} history</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-black/40 border-b border-border text-muted text-xs uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-6 py-4 font-bold whitespace-nowrap">{period === '24h' || period === '7d' ? 'Hour (UTC)' : 'Date'}</th>
                                                    <th className="px-6 py-4 font-bold whitespace-nowrap">Uptime %</th>
                                                    <th className="px-6 py-4 font-bold whitespace-nowrap">Checks (Up / Total)</th>
                                                    {(period === '24h' || period === '7d') && (
                                                        <th className="px-6 py-4 font-bold whitespace-nowrap">Avg latency</th>
                                                    )}
                                                    <th className="px-6 py-4 font-bold text-right whitespace-nowrap">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/50">
                                                {rows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={period === '24h' || period === '7d' ? 5 : 4} className="px-6 py-8 text-center text-muted text-sm">
                                                            No history for this period yet. Data builds as probes run.
                                                        </td>
                                                    </tr>
                                                ) : rows.map((row) => {
                                                    const tone = statusToneFromPct(row.pct);
                                                    return (
                                                        <tr key={row.key} className="hover:bg-white/5 transition-colors">
                                                            <td className="px-6 py-4 font-medium whitespace-nowrap text-text">{row.label}</td>
                                                            <td className="px-6 py-4 font-mono whitespace-nowrap text-muted">{row.pct.toFixed(2)}%</td>
                                                            <td className="px-6 py-4 text-muted text-sm whitespace-nowrap">{row.up} / {row.total} checks</td>
                                                            {(period === '24h' || period === '7d') && (
                                                                <td className="px-6 py-4 text-muted text-sm whitespace-nowrap tabular-nums">{formatLatencyMs(row.avgLatency)}</td>
                                                            )}
                                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                                <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-widest border ${tone === 'online' ? 'bg-status-active/10 text-status-active border-status-active/30' : tone === 'degraded' ? 'bg-status-expiring/10 text-status-expiring border-status-expiring/30' : tone === 'offline' ? 'bg-status-expired/10 text-status-expired border-status-expired/30' : 'bg-white/5 text-muted border-border'}`}>
                                                                    {tone === 'online' ? 'Healthy' : tone === 'degraded' ? 'Degraded' : tone === 'offline' ? 'Outage' : 'Unknown'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="border-t border-border/50 p-4 bg-black/10">
                                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Incidents ({periodLabel})</h4>
                                        {incidents.length === 0 ? (
                                            <p className="text-sm text-muted">No incidents in this window.</p>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left border-collapse text-sm">
                                                    <thead className="text-muted text-[10px] uppercase tracking-wider">
                                                        <tr>
                                                            <th className="pb-2 pr-4 font-bold">Started</th>
                                                            <th className="pb-2 pr-4 font-bold">Ended</th>
                                                            <th className="pb-2 pr-4 font-bold">Duration</th>
                                                            <th className="pb-2 font-bold text-right">Severity</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/40">
                                                        {incidents.map((incident) => {
                                                            const duration = incident.endedAt != null
                                                                ? (incident.durationMs ?? Math.max(0, incident.endedAt - incident.startedAt))
                                                                : Math.max(0, Date.now() - incident.startedAt);
                                                            const severity = incident.to === 'offline' ? 'Offline' : 'Degraded';
                                                            return (
                                                                <tr key={incident.id}>
                                                                    <td className="py-2.5 pr-4 text-text whitespace-nowrap">{formatDateTime(new Date(incident.startedAt).toISOString())}</td>
                                                                    <td className="py-2.5 pr-4 text-muted whitespace-nowrap">{incident.endedAt != null ? formatDateTime(new Date(incident.endedAt).toISOString()) : 'Ongoing'}</td>
                                                                    <td className="py-2.5 pr-4 text-muted tabular-nums">{formatDurationShort(duration)}</td>
                                                                    <td className="py-2.5 text-right">
                                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest border ${severity === 'Offline' ? 'bg-status-expired/10 text-status-expired border-status-expired/30' : 'bg-status-expiring/10 text-status-expiring border-status-expiring/30'}`}>
                                                                            {severity}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div className="flex flex-col gap-6 animate-fade-in">
                        {services.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                                {services.map((service: any) => (
                                    <button
                                        key={service.id}
                                        type="button"
                                        onClick={() => setSelectedServiceId(service.id)}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors border ${
                                            selectedService?.id === service.id
                                                ? 'bg-plex text-background border-plex'
                                                : 'bg-card text-muted border-border hover:text-text hover:border-plex/40'
                                        }`}
                                    >
                                        {service.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedService && (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Uptime', value: `${selectedStats.pct.toFixed(2)}%` },
                                        { label: 'Checks', value: selectedStats.total.toLocaleString() },
                                        { label: 'Avg latency', value: formatLatencyMs(selectedStats.latency.avg) },
                                        { label: 'p95 latency', value: formatLatencyMs(selectedStats.latency.p95) },
                                        { label: 'Incidents', value: String(selectedStats.incidentCount) },
                                        { label: 'Longest outage', value: formatDurationShort(selectedStats.longestOutageMs) },
                                        { label: 'Healthy streak', value: selectedStats.currentStreakHours ? `${selectedStats.currentStreakHours}h` : '—' },
                                        { label: 'Worst day', value: selectedStats.worstDay ? `${selectedStats.worstDay.pct.toFixed(1)}%` : '—' },
                                    ].map((chip) => (
                                        <div key={chip.label} className="rounded-xl border border-white/5 bg-card p-4 shadow-lg">
                                            <p className="text-[10px] uppercase tracking-widest font-bold text-muted">{chip.label}</p>
                                            <p className="text-xl font-black mt-1 text-text tabular-nums">{chip.value}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-6 md:p-10">
                                    <h3 className="text-xl font-bold mb-10 text-center text-muted tracking-widest uppercase">
                                        {selectedService.name} — {periodLabel} Uptime Trend
                                    </h3>
                                    <div className="relative h-64 md:h-80 flex items-end gap-1 w-full pl-12 pr-4 md:pr-8">
                                        <div className="absolute inset-0 pl-12 pr-4 md:pr-8 flex flex-col justify-between pointer-events-none pb-8">
                                            {['100%', '75%', '50%', '25%', '0%'].map((label) => (
                                                <div key={label} className={`w-full border-t ${label === '0%' ? 'border-white/20' : 'border-white/5'} h-0 relative`}>
                                                    <span className="absolute -left-12 -top-2.5 text-xs font-mono text-muted/50 w-10 text-right">{label}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="w-full h-full flex items-end gap-[2px] pb-8 z-10">
                                            {selectedBars.map((bar) => {
                                                const pct = bar.pct ?? 0;
                                                const hasData = bar.pct != null && bar.total > 0;
                                                return (
                                                    <div key={bar.key} className="flex-1 flex flex-col justify-end h-full relative group/chart cursor-crosshair">
                                                        <div
                                                            className={`w-full rounded-t-sm transition-all duration-300 opacity-80 group-hover/chart:opacity-100 ${
                                                                !hasData ? 'bg-white/10' : pct >= 99 ? 'bg-status-active' : pct >= 90 ? 'bg-status-expiring' : 'bg-status-expired'
                                                            }`}
                                                            style={{ height: `${Math.max(1, hasData ? pct : 1)}%` }}
                                                        />
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-card border border-border shadow-2xl text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/chart:opacity-100 pointer-events-none transition-opacity z-50 flex flex-col items-center">
                                                            <strong className="text-plex mb-1 tracking-wider uppercase text-[10px]">{bar.label}</strong>
                                                            <span className="text-lg font-mono font-bold">{hasData ? `${pct.toFixed(2)}%` : 'No data'}</span>
                                                            {bar.avgLatency != null && (
                                                                <span className="text-muted mt-0.5">{formatLatencyMs(bar.avgLatency)} avg</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-muted font-bold tracking-widest mt-2 px-12 uppercase">
                                        <span>{period === '24h' ? '24h ago' : `${periodLabel} ago`}</span>
                                        <span>Now</span>
                                    </div>
                                </div>

                                <div className="bg-card border border-white/5 shadow-2xl rounded-2xl p-6 md:p-10">
                                    <h3 className="text-xl font-bold mb-8 text-center text-muted tracking-widest uppercase">
                                        {selectedService.name} — {periodLabel} Latency
                                    </h3>
                                    {selectedLatencySeries.some((p) => p.avg != null) ? (
                                        <div className="h-56 md:h-72 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={selectedLatencySeries.filter((p) => p.avg != null)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                                    <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
                                                    <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} width={48} tickFormatter={(v) => `${v}ms`} />
                                                    <RechartsTooltip
                                                        contentStyle={{ background: 'var(--card, #1a1a1a)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                                                        labelStyle={{ color: '#e5a00d' }}
                                                        formatter={(value: any) => [formatLatencyMs(Number(value)), 'Avg latency']}
                                                    />
                                                    <Area type="monotone" dataKey="avg" stroke="#e5a00d" fill="rgba(229,160,13,0.2)" strokeWidth={2} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <p className="text-center text-muted text-sm py-12">
                                            Latency history will appear after probes collect response times for this period.
                                        </p>
                                    )}
                                    {selectedStats.bestDay && selectedStats.worstDay && period !== '24h' && (
                                        <div className="flex flex-wrap justify-center gap-6 mt-6 text-sm text-muted">
                                            <span>Best: <strong className="text-status-active">{selectedStats.bestDay.key}</strong> ({selectedStats.bestDay.pct.toFixed(1)}%)</span>
                                            <span>Worst: <strong className="text-status-expired">{selectedStats.worstDay.key}</strong> ({selectedStats.worstDay.pct.toFixed(1)}%)</span>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};
const StreamSpecCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">{label}</p>
        {children}
    </div>
);

const StreamDetailsModal: React.FC<{ session: any, onClose: () => void, isAdmin?: boolean, onKilled?: () => void, providerLabel?: string }> = ({ session, onClose, isAdmin, onKilled, providerLabel = 'Plex' }) => {
    const [killReason, setKillReason] = useState('');
    const [isKilling, setIsKilling] = useState(false);
    const [showKillConfirm, setShowKillConfirm] = useState(false);
    const sessionPosterSrc = session.thumbUrl
        ? resolvePortalAssetUrl(session.thumbUrl)
        : portalUrl(`/api/plex/image?path=${encodeURIComponent(session.thumb)}&width=400&height=600`);
    const sessionFallbackPosterSrc = session.posterFallbackUrl ? resolvePortalAssetUrl(session.posterFallbackUrl) : '';
    const sessionUserThumbSrc = session.userThumb ? resolvePortalAssetUrl(session.userThumb) : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
    const geo = isAdmin && session.geo && Number.isFinite(Number(session.geo.latitude)) && Number.isFinite(Number(session.geo.longitude))
        ? session.geo
        : null;
    const geoLat = geo ? Number(geo.latitude) : NaN;
    const geoLon = geo ? Number(geo.longitude) : NaN;
    const mapPad = 0.35;
    const osmEmbedUrl = geo
        ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
            `${geoLon - mapPad},${geoLat - mapPad},${geoLon + mapPad},${geoLat + mapPad}`,
        )}&layer=mapnik&marker=${encodeURIComponent(`${geoLat},${geoLon}`)}`
        : '';
    const googleMapsUrl = geo
        ? `https://www.google.com/maps?q=${encodeURIComponent(`${geoLat},${geoLon}`)}`
        : '';

    // Lock background scroll while the sheet is open (esp. important on mobile).
    useEffect(() => {
        const scrollY = window.scrollY;
        const { body, documentElement } = document;
        const prev = {
            overflow: body.style.overflow,
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            right: body.style.right,
            width: body.style.width,
            htmlOverflow: documentElement.style.overflow,
        };
        body.style.overflow = 'hidden';
        body.style.position = 'fixed';
        body.style.top = `-${scrollY}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';
        documentElement.style.overflow = 'hidden';
        return () => {
            body.style.overflow = prev.overflow;
            body.style.position = prev.position;
            body.style.top = prev.top;
            body.style.left = prev.left;
            body.style.right = prev.right;
            body.style.width = prev.width;
            documentElement.style.overflow = prev.htmlOverflow;
            window.scrollTo(0, scrollY);
        };
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const showTitle = session.grandparentTitle || session.title;
    const episodeLine = session.grandparentTitle
        ? [
            session.title,
            session.type === 'episode' && session.season !== undefined
                ? `S${String(session.season).padStart(2, '0')}E${String(session.episode).padStart(2, '0')}`
                : null,
        ].filter(Boolean).join(' · ')
        : (session.type === 'episode' && session.season !== undefined
            ? `S${String(session.season).padStart(2, '0')}E${String(session.episode).padStart(2, '0')}`
            : '');
    const progressPct = Math.min(100, Math.max(0, Number(session.progress) || 0));
    const resolutionLabel = session.resolution
        ? (String(session.resolution).includes('p') || String(session.resolution).includes('k')
            ? String(session.resolution).toUpperCase()
            : `${session.resolution}p`)
        : null;
    const isLocal = session.sessionLocation === 'lan';
    const bandwidthLabel = Number.isFinite(Number(session.bandwidth))
        ? `${(Number(session.bandwidth) / 1000).toFixed(1)} Mbps`
        : null;

    const handleKill = async () => {
        setIsKilling(true);
        try {
            const res = await apiFetch('/api/streams/kill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: session.sessionId, reason: killReason })
            });
            if (res.error) {
                alert(res.error);
            } else {
                onClose();
                if (onKilled) onKilled();
            }
        } catch (e: any) {
            alert('Failed to kill stream');
        } finally {
            setIsKilling(false);
        }
    };

    return ReactDOM.createPortal(
        <div
            className="fixed inset-x-0 top-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overscroll-none bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] sm:inset-0 sm:bottom-0"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="stream-details-title"
                className="relative w-full sm:max-w-2xl lg:max-w-3xl max-h-full sm:max-h-[85vh] bg-card border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden overscroll-contain"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start gap-4 p-5 border-b border-white/10 bg-black/20 shrink-0">
                    <div className="w-[4.5rem] h-[6.75rem] sm:w-24 sm:h-36 rounded-xl overflow-hidden flex-shrink-0 bg-black/40 border border-white/10 shadow-lg">
                        {session.thumb || session.thumbUrl ? (
                            <img
                                src={sessionPosterSrc}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    if (sessionFallbackPosterSrc && e.currentTarget.src !== sessionFallbackPosterSrc) {
                                        e.currentTarget.src = sessionFallbackPosterSrc;
                                    }
                                }}
                            />
                        ) : (
                            <NoPosterPlaceholder compact />
                        )}
                    </div>

                    <div className="min-w-0 flex-1 pt-0.5">
                        {session.user && (
                            <div className="inline-flex items-center gap-2 mb-2 rounded-full border border-white/10 bg-white/5 pl-1 pr-2.5 py-1">
                                <img
                                    src={sessionUserThumbSrc}
                                    alt=""
                                    className="w-5 h-5 rounded-full object-cover"
                                    onError={(e) => { e.currentTarget.src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'; }}
                                />
                                <span className="text-[11px] font-bold text-white/80 truncate max-w-[10rem]">{session.user}</span>
                            </div>
                        )}
                        <h2 id="stream-details-title" className="text-xl sm:text-2xl font-black text-text leading-tight tracking-tight">
                            {showTitle}
                        </h2>
                        {episodeLine ? (
                            <p className="text-sm text-muted mt-1 leading-snug">{episodeLine}</p>
                        ) : null}

                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {resolutionLabel && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide bg-white/10 text-white/80 border border-white/10">
                                    {resolutionLabel}
                                </span>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide border ${
                                isLocal
                                    ? 'bg-status-active/15 text-status-active border-status-active/25'
                                    : 'bg-plex/15 text-plex border-plex/30'
                            }`}>
                                {isLocal ? 'Local' : 'Remote'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide border ${
                                session.isTranscoding
                                    ? 'bg-status-expiring/15 text-status-expiring border-status-expiring/25'
                                    : 'bg-status-active/15 text-status-active border-status-active/25'
                            }`}>
                                {session.isTranscoding ? 'Transcode' : 'Direct Play'}
                            </span>
                            {session.state && session.state !== 'playing' && (
                                <span className="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide bg-white/10 text-white/70 border border-white/10">
                                    {session.state}
                                </span>
                            )}
                        </div>

                        {progressPct > 0 && (
                            <div className="mt-3.5 max-w-md">
                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                    <div className="h-full rounded-full bg-plex transition-all" style={{ width: `${progressPct}%` }} />
                                </div>
                                <p className="text-[10px] text-muted mt-1.5 font-medium">{Math.round(progressPct)}% watched</p>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/10 text-white/45 hover:text-white transition-colors shrink-0"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-5 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2.5">
                        <StreamSpecCard label="Player">
                            <p className="text-sm font-semibold text-text truncate" title={session.playerTitle}>{session.playerTitle || 'Unknown'}</p>
                            <p className="text-xs text-muted truncate mt-0.5" title={session.playerProduct}>{session.playerProduct || '—'}</p>
                        </StreamSpecCard>
                        <StreamSpecCard label="Network">
                            <p className="text-sm font-semibold text-text font-mono tracking-tight truncate">
                                {isAdmin ? (session.playerAddress || 'Unknown IP') : 'Hidden'}
                            </p>
                            {bandwidthLabel && <p className="text-xs text-muted mt-0.5 truncate">{bandwidthLabel}</p>}
                        </StreamSpecCard>
                        <StreamSpecCard label="Video">
                            <p className="text-sm font-semibold text-text uppercase tracking-wide truncate">
                                {session.videoCodec || 'Unknown'}
                                {session.videoProfile ? ` · ${session.videoProfile}` : ''}
                            </p>
                            {session.transcodeVideoDecision === 'transcode' && (
                                <p className="text-[10px] text-status-expiring font-bold mt-1">Transcoding</p>
                            )}
                        </StreamSpecCard>
                        <StreamSpecCard label="Audio">
                            <p className="text-sm font-semibold text-text uppercase tracking-wide truncate">
                                {session.audioCodec || 'Unknown'}
                                {session.audioChannels ? ` · ${session.audioChannels}ch` : ''}
                            </p>
                            {session.transcodeAudioDecision === 'transcode' && (
                                <p className="text-[10px] text-status-expiring font-bold mt-1">Transcoding</p>
                            )}
                        </StreamSpecCard>
                    </div>

                    {geo && osmEmbedUrl && (
                        <div className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.03]">
                            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-white/10">
                                <div className="min-w-0 flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-plex shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-text truncate">{geo.label}</p>
                                        <p className="text-[10px] text-muted">Approximate location from IP</p>
                                    </div>
                                </div>
                                <a
                                    href={googleMapsUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold text-plex hover:text-plex-hover transition-colors"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    Google Maps
                                </a>
                            </div>
                            {/* Crop OSM’s dense attribution strip on small screens */}
                            <div className="relative w-full h-36 sm:h-44 overflow-hidden">
                                <iframe
                                    title={`Approximate location: ${geo.label}`}
                                    src={osmEmbedUrl}
                                    className="absolute inset-0 w-full h-[calc(100%+28px)] border-0"
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer sits above the mobile bottom nav (overlay stops above it) */}
                <div className="shrink-0 border-t border-white/10 bg-black/30 p-4 sm:p-5">
                    {isAdmin && session.sessionId && showKillConfirm ? (
                        <div className="flex flex-col gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3">
                            <input
                                type="text"
                                placeholder="Reason (optional)"
                                value={killReason}
                                onChange={e => setKillReason(e.target.value)}
                                className="w-full bg-black/30 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-red-500"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleKill}
                                    disabled={isKilling}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm disabled:opacity-50"
                                >
                                    {isKilling ? 'Terminating…' : 'Confirm terminate'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowKillConfirm(false)}
                                    className="px-4 bg-white/10 hover:bg-white/15 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-2.5">
                            {isAdmin && session.sessionId && (
                                <button
                                    type="button"
                                    onClick={() => setShowKillConfirm(true)}
                                    className="w-full sm:flex-1 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 font-bold py-3 rounded-xl transition-colors text-sm inline-flex items-center justify-center gap-2"
                                >
                                    <X className="w-4 h-4" /> Terminate Stream
                                </button>
                            )}
                            <a
                                href={session.plexUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full sm:flex-1 bg-plex hover:bg-plex-hover text-background font-bold text-center py-3 rounded-xl transition-colors text-sm inline-flex items-center justify-center gap-2"
                            >
                                Open in {providerLabel}
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

const EMPTY_STREAM_MESSAGES = [
    "Nobody is watching... the server can finally breathe.",
    "0 streams active. The hard drives are enjoying a well-earned nap.",
    "The popcorn is ready. The audience is missing.",
    "All quiet on the streaming front.",
    "The server is awake. The humans are not.",
    "No one is streaming... the GPUs are confused.",
    "No streams detected. Suspicious behaviour.",
    "Everyone left. The server is binge-watching itself.",
    "No one is watching. Somewhere, a movie is feeling ignored.",
    "No active viewers. Time to dust off the virtual popcorn machine.",
    "The only thing streaming right now is disappointment.",
    "The server is ready. The couch is empty.",
    "The media centre is open 24/7. The viewers are not.",
    "The server has 10,000 movies and nobody pressed play.",
    "No active sessions. The bandwidth is feeling useless.",
    "The server is fully loaded and emotionally unavailable.",
    "The Plex goblins are idle.",
    "The server is bored. Please entertain it.",
    "No viewers detected. Initiating dramatic silence.",
    "The hard drives are spinning... for nothing.",
    "Even the thumbnails are getting lonely."
];

const EmptyStreamsMessage: React.FC = () => {
    const [msg] = useState(() => EMPTY_STREAM_MESSAGES[Math.floor(Math.random() * EMPTY_STREAM_MESSAGES.length)]);
    return <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full">{msg}</div>;
};

export const LibraryDashboard: React.FC<{ onBack: () => void, isAdmin?: boolean, publicConfig?: any, mediaServerType?: string, onViewAnalytics?: (hash?: string) => void }> = ({ onBack, isAdmin, publicConfig, mediaServerType, onViewAnalytics }) => {
    const [dashboardData, setDashboardData] = useState<{ activeSessions: any[], recentMovies: any[], recentShows: any[], recentMusic: any[] } | null>(null);
    const [trendingStats, setTrendingStats] = useState<{ trending7Days: any[], movies30Days: any[], shows30Days: any[], top365Days: any[], allTime: any[], weekendWarriors: any[], nightOwls: any[], retroHits: any[], cultClassics: any[] } | null>(null);
    const [dashboardLoading, setDashboardLoading] = useState(true);
    const [trendingLoading, setTrendingLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pollError, setPollError] = useState<string | null>(null);
    const [isDiscoverDesktop, setIsDiscoverDesktop] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
    );
    const [recentLimitOverride, setRecentLimitOverride] = useState<number | null>(() => {
        const saved = localStorage.getItem('discoverRecentLimitOverride');
        return saved ? Number(saved) : null;
    });
    const responsiveRecentLimit = isDiscoverDesktop ? DISCOVER_DESKTOP_ITEM_LIMIT : DISCOVER_MOBILE_ITEM_LIMIT;
    const recentLimit = recentLimitOverride ?? responsiveRecentLimit;
    const [gridSize, setGridSize] = useDiscoverGridSize();
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const showQualityBadges = publicConfig?.showPosterQualityBadges !== false;
    const isJellyfinPortal = String(publicConfig?.mediaServerType || mediaServerType || 'plex').toLowerCase() === 'jellyfin';
    const hasLoadedDashboard = useRef(false);
    const hasLoadedTrending = useRef(false);

    const [discoverSearchQuery, setDiscoverSearchQuery] = useState('');
    const [discoverSearchResults, setDiscoverSearchResults] = useState<any[] | null>(null);
    const [isDiscoverSearching, setIsDiscoverSearching] = useState(false);
    const searchDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
                setDiscoverSearchQuery('');
                setDiscoverSearchResults(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const performDiscoverSearch = async () => {
        if (!discoverSearchQuery.trim()) {
            setDiscoverSearchResults(null);
            return;
        }
        setIsDiscoverSearching(true);
        try {
            const res = await apiFetch(`/api/plex/discover-search?query=${encodeURIComponent(discoverSearchQuery)}`);
            if (!res.error) {
                setDiscoverSearchResults(res.results || []);
            }
        } catch(err) {
            // ignore
        } finally {
            setIsDiscoverSearching(false);
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performDiscoverSearch();
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (discoverSearchQuery.trim().length >= 2) {
                performDiscoverSearch();
            } else if (!discoverSearchQuery.trim()) {
                setDiscoverSearchResults(null);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [discoverSearchQuery]);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const onChange = (e: MediaQueryListEvent) => setIsDiscoverDesktop(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (!isJellyfinPortal) return;
        setDashboardData({ activeSessions: [], recentMovies: [], recentShows: [], recentMusic: [] });
        setTrendingStats(null);
        setError(null);
        setPollError(null);
        setDashboardLoading(false);
        setTrendingLoading(false);
    }, [isJellyfinPortal]);

    const handleRecentLimitChange = useCallback((value: string) => {
        const next = Number(value);
        setRecentLimitOverride(next);
        localStorage.setItem('discoverRecentLimitOverride', String(next));
        localStorage.removeItem('discoverRecentLimit');
    }, []);

    const fetchDashboardOnly = useCallback(async () => {
        try {
            const res = await apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${recentLimit}`);
            if (res.error) {
                setPollError(res.error);
                return;
            }
            setDashboardData(res);
            setPollError(null);
        } catch (err: any) {
            setPollError(err?.message || 'Live dashboard update failed');
        }
    }, [recentLimit, isJellyfinPortal]);

    const fetchData = useCallback(async () => {
        setError(null);
        if (!hasLoadedDashboard.current) setDashboardLoading(true);
        if (!isJellyfinPortal && !hasLoadedTrending.current) setTrendingLoading(true);
        try {
            const res = await apiFetch(`${isJellyfinPortal ? '/api/jellyfin/dashboard' : '/api/plex/dashboard'}?limit=${recentLimit}`);
            if (res.error) throw new Error(res.error);
            setDashboardData(res);
        } catch (err: any) {
            setError(err.message || 'Failed to load dashboard data');
        } finally {
            hasLoadedDashboard.current = true;
            setDashboardLoading(false);
        }

        if (isJellyfinPortal) {
            setTrendingStats(null);
            hasLoadedTrending.current = true;
            setTrendingLoading(false);
            return;
        }

        try {
            const statsRes = await apiFetch('/api/plex/stats/trending');
            if (!statsRes.error) {
                setTrendingStats(statsRes);
            }
        } catch {
            // Trending cache may still be building
        } finally {
            hasLoadedTrending.current = true;
            setTrendingLoading(false);
        }
    }, [recentLimit, isJellyfinPortal]);

    useEffect(() => {
        fetchData();
        const liveInterval = setInterval(fetchDashboardOnly, 10000);
        return () => clearInterval(liveInterval);
    }, [fetchDashboardOnly, fetchData]);

    if (dashboardLoading && !dashboardData) {
        return <DiscoverPageSkeleton recentLimit={recentLimit} gridSize={gridSize} />;
    }

    const totalStreams = dashboardData?.activeSessions?.length || 0;
    const trendingCount = recentLimit;
    const transcodingStreams = dashboardData?.activeSessions?.filter(s => s.isTranscoding).length || 0;
    const directStreams = totalStreams - transcodingStreams;
    const totalBandwidthKbps = dashboardData?.activeSessions?.reduce((acc, s) => acc + (s.bandwidth || 0), 0) || 0;
    const totalBandwidthMbps = (totalBandwidthKbps / 1000).toFixed(2);

    return (
        <div className="w-full flex flex-col min-h-screen">
            <main className="discover-layout-container w-full pb-8 mt-4 md:mt-0">
                {error && <div className="toast error show">{error}</div>}
                {pollError && !error && <div className="toast error show">{pollError}</div>}

                {isAdmin && !isJellyfinPortal && (
                    <div className="mb-6 w-full relative z-40" ref={searchDropdownRef}>
                        <form onSubmit={handleSearchSubmit} className="flex gap-2">
                            <div className="relative flex-1">
                                <input 
                                    type="text" 
                                    value={discoverSearchQuery}
                                    onChange={(e) => setDiscoverSearchQuery(e.target.value)}
                                    placeholder="Search library to check watch history..." 
                                    className="w-full bg-card border border-border rounded-xl px-4 py-3 text-white focus:border-plex focus:ring-1 focus:ring-plex outline-none transition-all shadow-lg pr-12"
                                />
                                {discoverSearchQuery && (
                                    <button 
                                        type="button" 
                                        onClick={() => { setDiscoverSearchQuery(''); setDiscoverSearchResults(null); }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors p-1"
                                    >
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                            <button type="submit" className="bg-plex hover:bg-orange-500 text-white px-6 py-3 rounded-xl font-bold transition-colors disabled:opacity-50 shadow-lg" disabled={isDiscoverSearching || !discoverSearchQuery.trim()}>
                                {isDiscoverSearching ? 'Searching...' : 'Search'}
                            </button>
                        </form>

                        {(discoverSearchResults || isDiscoverSearching) && discoverSearchQuery.trim() && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl flex flex-col gap-4 max-h-[500px] overflow-y-auto p-4 custom-scrollbar z-50">
                                {isDiscoverSearching ? (
                                    <p className="text-muted text-sm text-center py-4">Searching...</p>
                                ) : discoverSearchResults?.length === 0 ? (
                                    <p className="text-muted text-sm text-center py-4">No results found.</p>
                                ) : (
                                    discoverSearchResults?.map((item: any) => (
                                        <div key={item.ratingKey} className="bg-background border border-white/5 rounded-lg p-4 flex flex-col md:flex-row gap-4">
                                            <div className="w-16 h-24 flex-shrink-0 bg-white/5 rounded overflow-hidden">
                                                <img src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=150&height=225`)} alt={item.title} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1 flex flex-col min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-bold text-lg text-white truncate">{item.title}</h3>
                                                        <p className="text-xs text-muted mb-2">{String(item.type).toUpperCase()} • {item.year}</p>
                                                    </div>
                                                    <a href={item.plexUrl} target="_blank" rel="noreferrer" className="text-xs text-plex font-bold bg-plex/10 hover:bg-plex hover:text-white transition-colors border border-plex/20 rounded-md px-3 py-1.5 shrink-0 flex items-center gap-1.5 shadow-sm">
                                                        <Play size={12} />
                                                        View in Plex
                                                    </a>
                                                </div>
                                                
                                                <div className="mt-auto">
                                                    {item.history && item.history.length > 0 ? (
                                                        <div className="mt-3 pt-3 border-t border-white/10">
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <Clock size={14} className="text-status-active" />
                                                                <span className="text-xs font-bold uppercase tracking-widest text-status-active">Watch History <span className="bg-status-active/20 px-1.5 py-0.5 rounded-full text-[10px] ml-1">{item.history.length}</span></span>
                                                            </div>
                                                            <div className="bg-black/40 border border-white/5 rounded-xl overflow-hidden shadow-inner">
                                                                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                                    {item.history.map((h: any, i: number) => (
                                                                        <div key={i} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs p-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    if (onViewAnalytics && h.user) {
                                                                                        onViewAnalytics(`#user=${encodeURIComponent(h.user)}`);
                                                                                    }
                                                                                }}
                                                                                className="flex items-center gap-3 md:w-1/3 min-w-[120px] text-left hover:opacity-80 transition-opacity focus:outline-none cursor-pointer group"
                                                                                title="View user analytics"
                                                                            >
                                                                                {h.userThumb ? (
                                                                                    <div className="w-6 h-6 rounded-full overflow-hidden shadow-lg flex-shrink-0 border border-white/10 group-hover:ring-2 ring-plex transition-all">
                                                                                        <img src={h.userThumb.startsWith('http') ? h.userThumb : portalUrl(`/api/plex/image?path=${encodeURIComponent(h.userThumb)}&width=64&height=64`)} alt={h.user || 'User'} className="w-full h-full object-cover" />
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-status-active to-green-600 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white uppercase shadow-lg shadow-status-active/20 group-hover:ring-2 ring-plex transition-all">
                                                                                        {h.user ? h.user.substring(0,2) : '?'}
                                                                                    </div>
                                                                                )}
                                                                                <span className="font-bold text-white truncate text-sm group-hover:text-plex transition-colors">{h.user}</span>
                                                                            </button>
                                                                            <div className="flex-1 flex flex-wrap md:flex-nowrap items-center gap-3 text-muted md:justify-end text-[11px] md:text-xs">
                                                                                <span className="flex items-center gap-1.5 shrink-0 md:min-w-[125px] md:justify-end"><Calendar size={12} className="opacity-50"/> {new Date(h.date * 1000).toLocaleString([], { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit'})}</span>
                                                                                <span className="opacity-30">|</span>
                                                                                <span className="flex items-center gap-1.5 shrink-0 min-w-[50px]"><Clock size={12} className="opacity-50"/> {Math.round(h.duration / 60)}m</span>
                                                                                {h.player && (
                                                                                    <>
                                                                                        <span className="opacity-30">|</span>
                                                                                        <span className="flex items-center gap-1.5 truncate md:w-[150px]"><Monitor size={12} className="opacity-50 shrink-0"/> <span className="truncate">{h.player}</span></span>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-3 flex items-center gap-2 text-muted bg-white/5 border border-white/10 rounded-lg p-3">
                                                            <Clock size={14} className="opacity-50" />
                                                            <span className="text-xs font-bold uppercase tracking-widest">No Watch History</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* SUMMARY CARDS */}
                {dashboardData && totalStreams > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-plex font-bold text-2xl">{totalStreams}</span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Total Streams</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-status-active font-bold text-2xl">{directStreams}</span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Direct Play</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-status-expiring font-bold text-2xl">{transcodingStreams}</span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Transcoding</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl py-2 px-3 flex flex-col items-center justify-center gap-0.5 shadow-lg backdrop-blur-sm">
                            <span className="text-plex font-bold text-2xl">{totalBandwidthMbps} <span className="text-sm">Mbps</span></span>
                            <span className="text-muted text-[10px] uppercase tracking-wider font-bold">Total Bandwidth</span>
                        </div>
                    </div>
                )}

                {/* ACTIVITY CARDS */}
                <section className="mb-12 w-full">
                    <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">ACTIVITY</h2>
                    {dashboardData && dashboardData.activeSessions && dashboardData.activeSessions.length > 0 ? (
                        <div className="w-full">
                            <div className={activityStreamGridClass()}>
                                {dashboardData.activeSessions.map((session, i) => {
                                    const sessionPosterSrc = session.thumbUrl
                                        ? resolvePortalAssetUrl(session.thumbUrl)
                                        : portalUrl(`/api/plex/image?path=${encodeURIComponent(session.thumb)}&width=360&height=540`);
                                    const sessionFallbackPosterSrc = session.posterFallbackUrl ? resolvePortalAssetUrl(session.posterFallbackUrl) : '';
                                    const sessionUserThumbSrc = session.userThumb ? resolvePortalAssetUrl(session.userThumb) : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
                                    const posterColumnClass = 'grid-cols-[clamp(6rem,36%,8.5rem)_minmax(0,1fr)]';
                                    return (
                                        <div key={session.sessionId ?? i} onClick={() => setSelectedSession(session)} className="bg-card rounded-xl border border-border flex flex-col overflow-hidden shadow-lg hover:border-plex/50 hover:shadow-plex/20 transition-all cursor-pointer select-none h-full">
                                            <div className={`grid ${posterColumnClass} items-stretch flex-1 min-h-0`}>
                                                <div className="relative aspect-[2/3] w-full overflow-hidden bg-black self-start">
                                                    <img
                                                        src={sessionPosterSrc}
                                                        alt={session.title}
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            if (sessionFallbackPosterSrc && e.currentTarget.src !== sessionFallbackPosterSrc) {
                                                                e.currentTarget.src = sessionFallbackPosterSrc;
                                                            }
                                                        }}
                                                        className="absolute inset-0 w-full h-full object-cover object-top drop-shadow-[4px_0_15px_rgba(0,0,0,0.5)]"
                                                    />
                                                </div>
                                                <div className="p-2.5 md:p-3 flex flex-col min-w-0 h-full">
                                                    <div className="activity-header mb-1.5 min-w-0">
                                                        <div className="activity-title-group min-w-0">
                                                            <div className="text-sm md:text-base font-bold text-text line-clamp-2 leading-tight">{session.grandparentTitle ? session.grandparentTitle : session.title}</div>
                                                            {session.type === 'episode' && session.season !== undefined && session.episode !== undefined ? (
                                                                <div className="text-[10px] md:text-xs text-muted line-clamp-2 leading-snug mt-0.5">
                                                                    {session.title} | S{String(session.season).padStart(2, '0')}E{String(session.episode).padStart(2, '0')}
                                                                </div>
                                                            ) : (
                                                                session.grandparentTitle && <div className="text-[10px] md:text-xs text-muted line-clamp-2 leading-snug mt-0.5">{session.title}</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1 mb-2">
                                                        {session.user && (
                                                            <span className="inline-flex items-center min-w-0 max-w-full gap-1.5 bg-black/45 backdrop-blur-md rounded-full pr-2 p-0.5 shadow-md border border-white/5">
                                                                <img src={sessionUserThumbSrc} alt={session.user} className="w-5 h-5 rounded-full object-cover shrink-0" onError={(e) => { e.currentTarget.src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'; }} />
                                                                <span className="text-[10px] font-bold text-white/90 truncate">{session.user}</span>
                                                            </span>
                                                        )}
                                                        {session.resolution && (
                                                            <span className="shrink-0 bg-white/10 text-white/90 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border border-white/10">{session.resolution.includes('p') || session.resolution.includes('k') ? session.resolution : `${session.resolution}p`}</span>
                                                        )}
                                                        <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide border ${session.sessionLocation === 'lan' ? 'bg-status-active/20 text-status-active border-status-active/30' : 'bg-plex/20 text-plex border-plex/30'}`}>
                                                            {session.sessionLocation === 'lan' ? 'Local' : 'Remote'}
                                                        </span>
                                                    </div>

                                                    <div className="activity-details flex flex-col gap-0.5 mt-auto">
                                                        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-2 text-[10px] md:text-xs border-b border-white/5 pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold mt-0.5">Player</span>
                                                            <span className="detail-value text-right truncate" title={session.playerTitle}>{session.playerTitle}</span>
                                                        </div>
                                                        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[10px] md:text-xs border-b border-white/5 pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold">Stream</span>
                                                            <span className={`font-bold text-right ${session.isTranscoding ? 'text-status-expiring' : 'text-status-active'}`}>
                                                                {session.isTranscoding ? 'Transcode' : 'Direct Play'}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[10px] md:text-xs border-b border-white/5 pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold">State</span>
                                                            <div className="flex items-center justify-end gap-1.5 min-w-0">
                                                                <span className="detail-value font-bold truncate">{session.state.charAt(0).toUpperCase() + session.state.slice(1)}</span>
                                                                {session.timeRemaining > 0 && session.state === 'playing' && (
                                                                    <span className="text-[9px] text-muted/80 whitespace-nowrap shrink-0">
                                                                        ({Math.floor(session.timeRemaining / 3600000) > 0 ? `${Math.floor(session.timeRemaining / 3600000)}h ` : ''}
                                                                        {Math.floor((session.timeRemaining % 3600000) / 60000)}m left)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-[10px] md:text-xs pb-0.5">
                                                            <span className="text-muted uppercase tracking-wider font-bold">Bandwidth</span>
                                                            <span className="detail-value text-right truncate">{(session.bandwidth / 1000).toFixed(1)} Mbps</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Progress Bar with embedded text */}
                                            {(() => {
                                                const progressBarText = `${Math.round(session.progress)}%${session.timeRemaining > 0 && session.state === 'playing' ? ` • ETA ${formatTime(new Date(Date.now() + session.timeRemaining))}` : ''}`;
                                                return (
                                                    <div className="w-full h-4 bg-white/10 relative mt-auto z-10 overflow-hidden rounded-b-lg">
                                                        {/* Progress fill */}
                                                        <div className="h-full bg-plex absolute top-0 left-0 transition-all duration-1000 z-10" style={{ width: `${session.progress}%` }}></div>

                                                        {/* Text visible on black background (white text) */}
                                                        <div
                                                            className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white z-20 pointer-events-none whitespace-nowrap"
                                                            style={{ clipPath: `inset(0 0 0 ${session.progress}%)` }}
                                                        >
                                                            {progressBarText}
                                                        </div>

                                                        {/* Text visible on yellow progress bar (black text) */}
                                                        <div
                                                            className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-black z-30 pointer-events-none whitespace-nowrap"
                                                            style={{ clipPath: `inset(0 ${100 - session.progress}% 0 0)` }}
                                                        >
                                                            {progressBarText}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <EmptyStreamsMessage />
                    )}
                </section>

                <div className="flex justify-end gap-2 sm:gap-3 items-end mb-8 flex-wrap">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted px-0.5">Grid</span>
                        <DiscoverGridSizeSelect className="w-36" value={gridSize} onChange={setGridSize} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted px-0.5">Per section</span>
                        <CustomSelect
                            compact
                            className="w-28"
                            value={String(recentLimit)}
                            onChange={handleRecentLimitChange}
                            options={DISCOVER_LIMIT_OPTIONS}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-12 w-full">
                    {/* RECENT MOVIES */}
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations} className="flex flex-col">
                        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">RECENTLY ADDED MOVIES</h2>
                        <div className={upgraderPosterGridClass(gridSize)} style={upgraderPosterGridStyle(gridSize)}>
                            {dashboardData && dashboardData.recentMovies.slice(0, recentLimit).map((item, i) => (
                                <DiscoverPosterCard key={i} item={item} showQualityBadges={showQualityBadges} />
                            ))}
                            {(!dashboardData || dashboardData.recentMovies.length === 0) && <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full col-span-full">No recent movies</div>}
                        </div>
                    </ScrollReveal>

                    {/* RECENT TV SHOWS */}
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations} className="flex flex-col">
                        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">{isJellyfinPortal ? 'RECENTLY ADDED EPISODES' : 'RECENTLY ADDED TV SHOWS'}</h2>
                        <div className={upgraderPosterGridClass(gridSize)} style={upgraderPosterGridStyle(gridSize)}>
                            {dashboardData && dashboardData.recentShows.slice(0, recentLimit).map((item, i) => (
                                <DiscoverPosterCard key={i} item={item} showQualityBadges={showQualityBadges} />
                            ))}
                            {(!dashboardData || dashboardData.recentShows.length === 0) && <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full col-span-full">{isJellyfinPortal ? 'No recent episodes' : 'No recent TV shows'}</div>}
                        </div>
                    </ScrollReveal>

                    {/* RECENT MUSIC */}
                    <ScrollReveal enabled={!!publicConfig?.useScrollRevealAnimations} className="flex flex-col">
                        <h2 className="text-plex text-sm uppercase tracking-[2px] mb-6 font-bold border-b border-white/10 pb-2">RECENTLY ADDED MUSIC</h2>
                        <div className={upgraderPosterGridClass(gridSize)} style={upgraderPosterGridStyle(gridSize)}>
                            {dashboardData && dashboardData.recentMusic.slice(0, recentLimit).map((item, i) => (
                                <DiscoverPosterCard key={i} item={item} aspect="square" showQualityBadges={showQualityBadges} />
                            ))}
                            {(!dashboardData || dashboardData.recentMusic.length === 0) && <div className="text-center text-muted p-8 border border-dashed border-border rounded-xl mt-4 w-full col-span-full">No recent music</div>}
                        </div>
                    </ScrollReveal>
                </div>

                {/* SERVER WIDE STATS SECTION */}
                {!isJellyfinPortal && trendingLoading && !trendingStats ? (
                    <TrendingSectionsSkeleton count={trendingCount} sections={3} />
                ) : !isJellyfinPortal && trendingStats && (
                    <div className="mt-16 w-full flex flex-col gap-12">
                        <div className="flex flex-col gap-2 items-center text-center mb-4">
                            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Other things happening on {publicConfig?.serverIdentifier || 'this server'}</h2>
                            <p className="text-muted text-sm max-w-xl">A look at what the community is currently watching across the entire server.</p>
                        </div>

                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🔥 Trending This Week" items={trendingStats.trending7Days} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🍿 Most Watched Movies (This Month)" items={trendingStats.movies30Days} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="📺 Most Watched Shows (This Month)" items={trendingStats.shows30Days} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🏆 Top of the Year" items={trendingStats.top365Days} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🌟 All Time Favorites" items={trendingStats.allTime} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🍿 Weekend Warriors" items={trendingStats.weekendWarriors} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="🦇 Night Owl Club" items={trendingStats.nightOwls} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="📼 Blast from the Past" items={trendingStats.retroHits} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                        <TrendingDiscoverSection useScrollRevealAnimations={publicConfig?.useScrollRevealAnimations} title="💎 Cult Classics" items={trendingStats.cultClassics} limit={recentLimit} showQualityBadges={showQualityBadges} gridSize={gridSize} />
                    </div>
                )}
            </main>

            {/* Stream Details Modal */}
            {selectedSession && <StreamDetailsModal session={selectedSession} onClose={() => setSelectedSession(null)} isAdmin={isAdmin} onKilled={fetchData} providerLabel={isJellyfinPortal ? 'Jellyfin' : 'Plex'} />}
        </div>
    );
};

export const MaintenanceDashboard: React.FC = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [maintenanceFeatureEnabled, setMaintenanceFeatureEnabled] = useState(false);
    const [overview, setOverview] = useState<any>(null);
    const [runs, setRuns] = useState<any[]>([]);
    const [previewGroups, setPreviewGroups] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]);
    const [overviewInsights, setOverviewInsights] = useState<{
        totalMatches: number;
        uniqueMatches: number;
        estimatedReclaimGB: number;
        libraries: Array<{ libraryTitle: string; count: number; reclaimGB: number }>;
        rules: Array<{ ruleId: string; ruleName: string; totalMatches: number; reclaimGB: number }>;
    }>({
        totalMatches: 0,
        uniqueMatches: 0,
        estimatedReclaimGB: 0,
        libraries: [],
        rules: []
    });
    const [preferences, setPreferences] = useState<any>({
        global: { dryRunByDefault: true, maxActionsPerRun: 25, requireConfirmForDestructive: true },
        exclusions: { ratingKeys: [], titles: [], libraries: [] }
    });
    const [candidateRuleId, setCandidateRuleId] = useState<string>('');
    const [candidateItems, setCandidateItems] = useState<any[]>([]);
    const [candidateSearch, setCandidateSearch] = useState('');
    const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
    const [libraryJsonInput, setLibraryJsonInput] = useState('');
    const [libraryItems, setLibraryItems] = useState<any[]>([]);
    const [libraryOptions, setLibraryOptions] = useState<Array<{ id: string; title: string; count: number }>>([]);
    const [libraryBrowseId, setLibraryBrowseId] = useState('all');
    const [libraryBrowseSearch, setLibraryBrowseSearch] = useState('');
    const [libraryBrowsePage, setLibraryBrowsePage] = useState(1);
    const [libraryBrowseLimit] = useState(48);
    const [libraryBrowseTotal, setLibraryBrowseTotal] = useState(0);
    const [libraryBrowseLoading, setLibraryBrowseLoading] = useState(false);
    const [selectedExcludeKeys, setSelectedExcludeKeys] = useState<string[]>([]);
    const [exclusionsSummary, setExclusionsSummary] = useState<{ ratingKeys: any[]; titles: any[]; libraries: any[] }>({ ratingKeys: [], titles: [], libraries: [] });
    const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
    const [storageSummary, setStorageSummary] = useState<any>(null);
    const [storageSummaryLoading, setStorageSummaryLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState(() => {
        const hash = window.location.hash.replace('#', '');
        if (hash.startsWith('maintenance-')) {
            const section = hash.replace('maintenance-', '');
            if (section === 'overlays') return 'overview';
            return section;
        }
        return 'overview';
    });

    const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToasts(t => pushToast(t, message, type));
    }, []);
    const isMaintenanceDisabledError = useCallback((error: any) => {
        const msg = String(error?.message || '');
        return msg.includes('Maintenance Experimental Mode is disabled');
    }, []);

    const sections = [
        { id: 'overview', label: 'Overview' },
        { id: 'exclusions', label: 'Exclusions' },
        { id: 'rules', label: 'Rules' },
        { id: 'collections', label: 'Collections' },
        { id: 'candidates', label: 'Candidates' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'storage', label: 'Storage Metrics' },
        { id: 'library', label: 'Rule Library' },
        { id: 'settings', label: 'Cleaner Settings' },
        { id: 'runs', label: 'Logs' }
    ];

    useEffect(() => {
        window.location.hash = `maintenance-${activeSection}`;
    }, [activeSection]);

    useEffect(() => {
        if (activeSection !== 'calendar') {
            setSelectedCalendarDate(null);
        }
    }, [activeSection]);

    const loadOverview = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const configData = await apiFetch('/api/config');
            const isEnabled = !!configData?.settings?.maintenanceExperimentalEnabled;
            setMaintenanceFeatureEnabled(isEnabled);
            if (!isEnabled) {
                return;
            }
            const [indexData, runsData, previewData, rulesData, prefData] = await Promise.all([
                apiFetch('/api/maintenance/index'),
                apiFetch('/api/maintenance/runs'),
                apiFetch('/api/maintenance/preview', {
                    method: 'POST',
                    body: JSON.stringify({ limit: 30, includeArrDiagnostics: true })
                }),
                apiFetch('/api/maintenance/rules'),
                apiFetch('/api/maintenance/preferences')
            ]);
            setOverview(indexData || null);
            setRuns(Array.isArray(runsData) ? runsData : []);
            setPreviewGroups(Array.isArray(previewData?.previews) ? previewData.previews : []);
            setRules(Array.isArray(rulesData) ? rulesData : []);
            setPreferences(prefData || {
                global: { dryRunByDefault: true, maxActionsPerRun: 25, requireConfirmForDestructive: true },
                exclusions: { ratingKeys: [], titles: [], libraries: [] }
            });
            const previewAll = Array.isArray(previewData?.previews) ? previewData.previews : [];
            const uniqueItems = new Map<string, any>();
            const libraryMap: Record<string, { libraryTitle: string; count: number; reclaimGB: number }> = {};
            const ruleInsights = previewAll.map((preview: any) => {
                const sample = Array.isArray(preview?.sample) ? preview.sample : [];
                let ruleReclaim = 0;
                sample.forEach((item: any) => {
                    const ratingKey = String(item?.ratingKey || '');
                    if (ratingKey && !uniqueItems.has(ratingKey)) uniqueItems.set(ratingKey, item);
                    const size = Number(item?.sizeGB || 0);
                    ruleReclaim += size;
                    const libraryTitle = item?.libraryTitle || 'Unknown Library';
                    if (!libraryMap[libraryTitle]) libraryMap[libraryTitle] = { libraryTitle, count: 0, reclaimGB: 0 };
                    libraryMap[libraryTitle].count += 1;
                    libraryMap[libraryTitle].reclaimGB += size;
                });
                return {
                    ruleId: String(preview?.ruleId || ''),
                    ruleName: preview?.ruleName || 'Unnamed Rule',
                    totalMatches: Number(preview?.totalMatches || sample.length || 0),
                    reclaimGB: ruleReclaim
                };
            });
            const uniqueValues = Array.from(uniqueItems.values());
            const estimatedReclaimGB = uniqueValues.reduce((sum: number, item: any) => sum + Number(item?.sizeGB || 0), 0);
            const totalMatches = ruleInsights.reduce((sum: number, rule: any) => sum + Number(rule.totalMatches || 0), 0);
            setOverviewInsights({
                totalMatches,
                uniqueMatches: uniqueValues.length,
                estimatedReclaimGB,
                libraries: Object.values(libraryMap).sort((a, b) => b.reclaimGB - a.reclaimGB),
                rules: ruleInsights.sort((a: any, b: any) => b.reclaimGB - a.reclaimGB)
            });
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load cleaner overview', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [addToast, isMaintenanceDisabledError]);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    useEffect(() => {
        if (!rules.length) {
            setCandidateRuleId('');
            setCandidateItems([]);
            return;
        }
        if (!candidateRuleId || !rules.some((rule: any) => rule.id === candidateRuleId)) {
            setCandidateRuleId(rules[0].id);
        }
    }, [rules, candidateRuleId]);

    const fetchCandidatesForRule = useCallback(async (ruleId: string) => {
        if (!maintenanceFeatureEnabled) {
            setCandidateItems([]);
            return;
        }
        if (!ruleId) {
            setCandidateItems([]);
            return;
        }
        setIsLoadingCandidates(true);
        try {
            const payload = await apiFetch('/api/maintenance/preview', {
                method: 'POST',
                body: JSON.stringify({
                    ruleId,
                    includeAll: true,
                    includeArrDiagnostics: true
                })
            });
            const previews = Array.isArray(payload?.previews) ? payload.previews : [];
            const selected = previews.find((preview: any) => preview.ruleId === ruleId);
            setCandidateItems((selected?.sample || []).map((item: any) => ({ ...item, _ruleId: selected?.ruleId, _ruleName: selected?.ruleName })));
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load candidates', 'error');
        } finally {
            setIsLoadingCandidates(false);
        }
    }, [addToast, isMaintenanceDisabledError, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && (activeSection === 'candidates' || activeSection === 'storage' || activeSection === 'calendar')) {
            fetchCandidatesForRule(candidateRuleId);
        }
    }, [activeSection, candidateRuleId, fetchCandidatesForRule, maintenanceFeatureEnabled]);

    const saveAllRules = async (nextRules: any[]) => {
        await apiFetch('/api/maintenance/rules', { method: 'POST', body: JSON.stringify(nextRules) });
        setRules(nextRules);
    };

    const savePreferences = async (nextPrefs: any) => {
        const response = await apiFetch('/api/maintenance/preferences', { method: 'POST', body: JSON.stringify(nextPrefs) });
        setPreferences(response?.preferences || nextPrefs);
    };

    const loadExclusionsSummary = useCallback(async () => {
        if (!maintenanceFeatureEnabled) return;
        try {
            const payload = await apiFetch('/api/maintenance/exclusions/summary');
            setExclusionsSummary({
                ratingKeys: Array.isArray(payload?.ratingKeys) ? payload.ratingKeys : [],
                titles: Array.isArray(payload?.titles) ? payload.titles : [],
                libraries: Array.isArray(payload?.libraries) ? payload.libraries : []
            });
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load exclusions summary.', 'error');
        }
    }, [addToast, isMaintenanceDisabledError, maintenanceFeatureEnabled]);

    const refreshExclusionsSummaryQuietly = useCallback(() => {
        loadExclusionsSummary().catch(() => { });
    }, [loadExclusionsSummary]);

    const updateRatingKeyExclusions = async (nextKeys: string[]) => {
        const next = {
            ...preferences,
            exclusions: { ...(preferences.exclusions || {}), ratingKeys: nextKeys }
        };
        await savePreferences(next);
        refreshExclusionsSummaryQuietly();
    };

    const loadLibraryBrowse = useCallback(async () => {
        if (!maintenanceFeatureEnabled) return;
        setLibraryBrowseLoading(true);
        try {
            const params = new URLSearchParams({
                libraryId: libraryBrowseId,
                search: libraryBrowseSearch,
                page: String(libraryBrowsePage),
                limit: String(libraryBrowseLimit),
                includeExcluded: 'true'
            });
            const payload = await apiFetch(`/api/maintenance/library-items?${params.toString()}`);
            setLibraryItems(Array.isArray(payload?.items) ? payload.items : []);
            setLibraryOptions(Array.isArray(payload?.libraries) ? payload.libraries : []);
            setLibraryBrowseTotal(Number(payload?.total || 0));
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load library posters.', 'error');
        } finally {
            setLibraryBrowseLoading(false);
        }
    }, [addToast, isMaintenanceDisabledError, libraryBrowseId, libraryBrowseLimit, libraryBrowsePage, libraryBrowseSearch, maintenanceFeatureEnabled]);

    const loadStorageSummary = useCallback(async (ruleId?: string) => {
        if (!maintenanceFeatureEnabled) return;
        setStorageSummaryLoading(true);
        try {
            const query = ruleId ? `?ruleId=${encodeURIComponent(ruleId)}` : '';
            const payload = await apiFetch(`/api/maintenance/storage-summary${query}`);
            setStorageSummary(payload || null);
        } catch (e: any) {
            if (isMaintenanceDisabledError(e)) {
                setMaintenanceFeatureEnabled(false);
                return;
            }
            addToast(e.message || 'Failed to load storage summary.', 'error');
        } finally {
            setStorageSummaryLoading(false);
        }
    }, [addToast, isMaintenanceDisabledError, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && activeSection === 'exclusions') {
            loadExclusionsSummary();
        }
    }, [activeSection, loadExclusionsSummary, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && activeSection === 'exclusions') {
            loadLibraryBrowse();
        }
    }, [activeSection, libraryBrowseId, libraryBrowsePage, libraryBrowseSearch, loadLibraryBrowse, maintenanceFeatureEnabled]);

    useEffect(() => {
        if (maintenanceFeatureEnabled && activeSection === 'storage') {
            loadStorageSummary(candidateRuleId || undefined);
        }
    }, [activeSection, candidateRuleId, maintenanceFeatureEnabled, loadStorageSummary]);

    const filteredCandidates = candidateItems.filter((item: any) => {
        if (!candidateSearch.trim()) return true;
        const q = candidateSearch.trim().toLowerCase();
        return `${item.title || ''} ${item.libraryTitle || ''}`.toLowerCase().includes(q);
    });
    const selectedCandidateRule = useMemo(
        () => rules.find((rule: any) => rule.id === candidateRuleId) || null,
        [rules, candidateRuleId]
    );

    const excludedRatingKeySet = useMemo(
        () => new Set((preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v))),
        [preferences?.exclusions?.ratingKeys]
    );

    const formatReclaimSizeFromGB = (sizeGB: number) => {
        const safeGB = Math.max(0, Number(sizeGB || 0));
        if (safeGB >= 1024) {
            return `${Math.ceil(safeGB / 1024)} TB`;
        }
        if (safeGB >= 1) {
            return `${Math.ceil(safeGB)} GB`;
        }
        return `${Math.ceil(safeGB * 1024)} MB`;
    };

    const getEligibilityTooltip = (item: any) => {
        const daysUntilEligible = Math.max(0, Number(item?.daysUntilEligible || 0));
        const watchDays = Number(item?.daysSinceLastWatch);
        const addedDays = Number(item?.daysSinceAdded);
        const base = daysUntilEligible > 0
            ? `Not eligible yet. Rule grace has ${daysUntilEligible} day(s) remaining.`
            : 'Eligible now for this rule.';
        if (Number.isFinite(watchDays) && watchDays >= 0) {
            return `${base} Last watched ${watchDays} day(s) ago.`;
        }
        if (Number.isFinite(addedDays) && addedDays >= 0) {
            return `${base} Added ${addedDays} day(s) ago.`;
        }
        return base;
    };

    const ELIGIBLE_NOW_KEY = 'eligible-now';
    const calendarEligibility = useMemo(() => {
        const graceDays = Math.max(0, Number(selectedCandidateRule?.graceDays || 0));
        const createdAtMs = Date.parse(String(selectedCandidateRule?.createdAt || ''));
        const hasRuleCreatedAt = Number.isFinite(createdAtMs);
        const daysSinceRuleCreated = hasRuleCreatedAt
            ? Math.max(0, Math.floor((Date.now() - createdAtMs) / (24 * 60 * 60 * 1000)))
            : graceDays;
        const daysUntilEligible = Math.max(0, graceDays - daysSinceRuleCreated);
        const nowItems: any[] = [];
        const byDay = new Map<string, any[]>();
        filteredCandidates.forEach((item: any) => {
            if (daysUntilEligible <= 0) {
                nowItems.push({ ...item, daysUntilEligible: 0, eligibleDate: null });
                return;
            }
            const etaDate = new Date(Date.now() + (daysUntilEligible * 24 * 60 * 60 * 1000));
            const dateKey = etaDate.toISOString().split('T')[0];
            const enriched = { ...item, daysUntilEligible, eligibleDate: dateKey };
            if (!byDay.has(dateKey)) byDay.set(dateKey, []);
            byDay.get(dateKey)?.push(enriched);
        });
        const laterByDay = Array.from(byDay.entries())
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([date, items]) => ({
                date,
                items,
                count: items.length,
                reclaimGB: items.reduce((sum: number, item: any) => sum + Number(item.sizeGB || 0), 0),
                preview: items.slice(0, 4),
                minDaysUntil: Math.min(...items.map((item: any) => Number(item.daysUntilEligible || 0)))
            }));
        return {
            graceDays,
            daysSinceRuleCreated,
            daysUntilEligible,
            eligibleNow: nowItems.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))),
            eligibleLaterByDay: laterByDay
        };
    }, [filteredCandidates, selectedCandidateRule?.createdAt, selectedCandidateRule?.graceDays]);

    const selectedCalendarGroup = useMemo(() => {
        if (!selectedCalendarDate) return null;
        if (selectedCalendarDate === ELIGIBLE_NOW_KEY) {
            const items = calendarEligibility.eligibleNow;
            return {
                date: ELIGIBLE_NOW_KEY,
                title: 'Eligible Now',
                items,
                count: items.length,
                reclaimGB: items.reduce((sum: number, item: any) => sum + Number(item.sizeGB || 0), 0)
            };
        }
        const day = calendarEligibility.eligibleLaterByDay.find((group) => group.date === selectedCalendarDate);
        if (!day) return null;
        return {
            ...day,
            title: new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        };
    }, [calendarEligibility, selectedCalendarDate]);

    const renderScaffoldPage = (title: string, description: string, bullets: string[]) => (
        <div className="glass-card-sm p-5">
            <h3 className="text-xl font-bold text-plex mb-2">{title}</h3>
            <p className="text-sm text-muted mb-4">{description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bullets.map((item) => (
                    <div key={item} className="bg-black/20 border border-border rounded-lg px-3 py-2 text-sm text-text">
                        {item}
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="w-full flex flex-col">
            <Loader isLoading={loading} />
            <ToastContainer toasts={toasts} setToasts={setToasts} />
            <header className="page-header">
                <h1 className="page-title">Cleaner</h1>
            </header>
            <div className="w-full flex flex-col p-0 md:p-8 bg-transparent md:glass-card rounded-none md:rounded-2xl border-0 md:border shadow-none">
                <div className="md:hidden mb-3">
                    <label className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1 block">Module Page</label>
                    <CustomSelect
                        value={activeSection}
                        onChange={(value) => setActiveSection(value)}
                        compact
                        className="w-full"
                        options={sections.map((section) => ({ label: section.label, value: section.id }))}
                    />
                </div>
                <div className="md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
                    <aside className="hidden md:block glass-card-sm p-3 h-fit sticky top-20">
                        <p className="text-muted text-xs uppercase tracking-wider font-bold mb-2 px-2">Module Pages</p>
                        <div className="space-y-1">
                            {sections.map((section) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => setActiveSection(section.id)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${activeSection === section.id ? 'bg-plex text-background' : 'text-muted hover:text-text hover:bg-white/5'}`}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>
                    </aside>
                    <div className="overflow-y-auto flex-grow mb-4 custom-scrollbar space-y-4 md:pr-2">
                        {!maintenanceFeatureEnabled && (
                            <div className="glass-card-sm border-yellow-500/30 p-5">
                                <h3 className="text-xl font-bold text-plex mb-2">Cleaner Disabled</h3>
                                <p className="text-sm text-muted mb-3">Experimental Cleaner Mode is currently OFF.</p>
                                <p className="text-xs text-muted">Enable it in `Settings` → `System` under `Maintenance Experimental Mode`, then click Save Settings.</p>
                                <button
                                    type="button"
                                    onClick={() => { window.location.href = portalUrl('/settings?focus=maintenance-toggle#system'); }}
                                    className="mt-3 px-3 py-1.5 bg-plex text-background rounded-md text-xs font-semibold hover:bg-plex-hover transition-colors"
                                >
                                    Open Settings
                                </button>
                            </div>
                        )}
                        {maintenanceFeatureEnabled && (
                            <>
                                {activeSection === 'overview' && (
                                    <div className="space-y-4">
                                        <div className="glass-card-sm p-5">
                                            <h3 className="text-xl font-bold text-plex mb-2">Cleaner Control Center</h3>
                                            <p className="text-sm text-muted mb-4">Dedicated module for library maintenance automation: rules, collections, candidates, execution timeline, calendar, storage, and governance.</p>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Indexed Media</p>
                                                    <p className="text-2xl font-bold text-text">{overview?.itemCount || 0}</p>
                                                </div>
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Request Records</p>
                                                    <p className="text-2xl font-bold text-text">{overview?.requestItemCount || 0}</p>
                                                </div>
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Rules with Matches</p>
                                                    <p className="text-2xl font-bold text-text">{previewGroups.filter((p: any) => (p.totalMatches || 0) > 0).length}</p>
                                                </div>
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Total Runs</p>
                                                    <p className="text-2xl font-bold text-text">{runs.length}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="glass-card-sm p-5 space-y-4">
                                            <h4 className="font-bold text-text">Reclaim & Impact Overview</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Total Matched (Rules Combined)</p>
                                                    <p className="text-2xl font-bold text-text">{overviewInsights.totalMatches}</p>
                                                </div>
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Unique Candidate Titles</p>
                                                    <p className="text-2xl font-bold text-text">{overviewInsights.uniqueMatches}</p>
                                                </div>
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Estimated Reclaim</p>
                                                    <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(overviewInsights.estimatedReclaimGB)}</p>
                                                </div>
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted">Top Impact Library</p>
                                                    <p className="text-sm font-bold text-text line-clamp-2">{overviewInsights.libraries[0]?.libraryTitle || '—'}</p>
                                                    <p className="text-xs text-muted mt-1">{overviewInsights.libraries[0] ? formatReclaimSizeFromGB(overviewInsights.libraries[0].reclaimGB) : 'No data'}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted font-bold uppercase tracking-wider mb-2">Top Libraries by Reclaim</p>
                                                    <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                                        {overviewInsights.libraries.slice(0, 8).map((lib) => (
                                                            <div key={`overview-lib-${lib.libraryTitle}`} className="flex items-center justify-between text-xs bg-background/30 border border-white/5 rounded px-2 py-1.5">
                                                                <span className="text-text line-clamp-1">{lib.libraryTitle}</span>
                                                                <span className="text-muted ml-2 whitespace-nowrap">{formatReclaimSizeFromGB(lib.reclaimGB)} · {lib.count}</span>
                                                            </div>
                                                        ))}
                                                        {!overviewInsights.libraries.length && <p className="text-xs text-muted">No matching candidates yet.</p>}
                                                    </div>
                                                </div>
                                                <div className="bg-background/30 rounded-lg p-3 border border-white/5">
                                                    <p className="text-xs text-muted font-bold uppercase tracking-wider mb-2">Top Rules by Reclaim</p>
                                                    <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                                        {overviewInsights.rules.slice(0, 8).map((rule) => (
                                                            <div key={`overview-rule-${rule.ruleId}`} className="flex items-center justify-between text-xs bg-background/30 border border-white/5 rounded px-2 py-1.5">
                                                                <span className="text-text line-clamp-1">{rule.ruleName}</span>
                                                                <span className="text-muted ml-2 whitespace-nowrap">{formatReclaimSizeFromGB(rule.reclaimGB)} · {rule.totalMatches}</span>
                                                            </div>
                                                        ))}
                                                        {!overviewInsights.rules.length && <p className="text-xs text-muted">No rules with match data yet.</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {activeSection === 'rules' && <LibraryMaintenancePanel addToast={addToast} onRulesUpdated={() => loadOverview(true)} />}
                                {activeSection === 'collections' && (
                                    <div className="glass-card-sm p-5 space-y-3">
                                        <h3 className="text-xl font-bold text-plex">Collections</h3>
                                        <p className="text-sm text-muted">Manage collection behavior per rule. Changes save directly to each ruleset.</p>
                                        <div className="space-y-2">
                                            {rules.map((rule: any) => (
                                                <div key={`collection-${rule.id}`} className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <p className="font-semibold text-text text-sm">{rule.name || 'Unnamed Rule'}</p>
                                                        <label className="text-xs text-muted flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={rule?.collection?.enabled !== false}
                                                                onChange={async (e) => {
                                                                    const next = rules.map((r: any) => r.id === rule.id ? { ...r, collection: { ...(r.collection || {}), enabled: e.target.checked } } : r);
                                                                    setRules(next);
                                                                    await saveAllRules(next);
                                                                    addToast('Collection settings updated.');
                                                                }}
                                                            />
                                                            Enabled
                                                        </label>
                                                    </div>
                                                    <input
                                                        className="mt-2 w-full p-2 rounded border border-border bg-card text-text text-sm"
                                                        value={rule?.collection?.nameTemplate || 'Leaving Soon - {{ruleName}}'}
                                                        onChange={(e) => {
                                                            const next = rules.map((r: any) => r.id === rule.id ? { ...r, collection: { ...(r.collection || {}), nameTemplate: e.target.value } } : r);
                                                            setRules(next);
                                                        }}
                                                        onBlur={async (e) => {
                                                            const next = rules.map((r: any) => r.id === rule.id
                                                                ? { ...r, collection: { ...(r.collection || {}), nameTemplate: e.target.value } }
                                                                : r);
                                                            setRules(next);
                                                            await saveAllRules(next);
                                                            addToast('Collection template saved.');
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {activeSection === 'candidates' && (
                                    <div className="glass-card-sm p-3 md:p-5 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <h3 className="text-xl font-bold text-plex">Candidates</h3>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    className="p-2 rounded border border-border bg-card text-text text-sm"
                                                    placeholder="Search titles..."
                                                    value={candidateSearch}
                                                    onChange={(e) => setCandidateSearch(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {rules.map((rule: any) => (
                                                <button
                                                    key={`candidate-rule-tab-${rule.id}`}
                                                    type="button"
                                                    onClick={() => setCandidateRuleId(rule.id)}
                                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${candidateRuleId === rule.id ? 'bg-plex text-background border-plex' : 'bg-background/30 text-text border-white/5 hover:border-plex/40'}`}
                                                >
                                                    {rule.name || 'Unnamed Rule'}
                                                </button>
                                            ))}
                                            {!rules.length && <p className="text-sm text-muted">No saved rules found. Create a rule in `Rules` first.</p>}
                                        </div>
                                        {selectedCandidateRule && (
                                            <p className="text-xs text-muted">
                                                Showing candidates for <span className="text-text font-semibold">{selectedCandidateRule.name || 'Unnamed Rule'}</span> only.
                                            </p>
                                        )}
                                        {isLoadingCandidates ? <p className="text-sm text-muted">Loading candidates...</p> : (
                                            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2 md:gap-3 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
                                                {filteredCandidates.map((item: any) => (
                                                    <div key={`candidate-${item._ruleId || candidateRuleId}-${item.ratingKey}`} className="bg-background/30 border border-white/5 rounded-lg overflow-hidden">
                                                        <div className="aspect-[2/3] bg-black/40">
                                                            {item.thumb ? (
                                                                <img src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=220&height=330`)} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-xs text-muted">No Poster</div>
                                                            )}
                                                        </div>
                                                        <div className="p-2">
                                                            <p className="text-xs text-text line-clamp-2">{item.title}</p>
                                                            <p className="text-[11px] text-muted mt-1">{item.libraryTitle || 'Unknown Library'}</p>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {item.arrResolvable ? (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-300">
                                                                        {item.arrInstanceName || item.arrType || 'ARR'}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">Unmapped</span>
                                                                )}
                                                                {item.arrAmbiguous && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">Ambiguous</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {!filteredCandidates.length && <p className="text-sm text-muted col-span-full">No matching candidates found for this ruleset.</p>}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {activeSection === 'runs' && (
                                    <div className="glass-card-sm p-5 space-y-3">
                                        <h3 className="text-xl font-bold text-plex">Logs</h3>
                                        <div className="space-y-2 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
                                            {runs.map((run: any) => (
                                                <details key={`run-${run.id}`} className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                    <summary className="cursor-pointer list-none">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-semibold text-text">{run.ruleName}</p>
                                                                <p className="text-xs text-muted">{new Date(run.startedAt).toLocaleString()} · {run.dryRun ? 'Dry-run' : 'Destructive'}</p>
                                                            </div>
                                                            <span className="text-[11px] px-2 py-1 rounded bg-border text-muted">{run.status}</span>
                                                        </div>
                                                    </summary>
                                                    <div className="mt-3 text-xs text-muted">
                                                        Matched {run.totals?.matched || 0} · Processed {run.totals?.processed || 0} · Deleted {run.totals?.deleted || 0} · Skipped {run.totals?.skipped || 0} · Failed {run.totals?.failed || 0}
                                                    </div>
                                                    {Array.isArray(run.preflight?.warnings) && run.preflight.warnings.length > 0 && (
                                                        <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                                                            {run.preflight.warnings.join(' ')}
                                                        </div>
                                                    )}
                                                    <div className="mt-2 max-h-52 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                                                        {(run.outcomes || []).slice(0, 120).map((outcome: any, idx: number) => (
                                                            <div key={`outcome-${run.id}-${idx}`} className="text-xs bg-background/30 border border-white/5 rounded px-2 py-1">
                                                                {(outcome.title || outcome.type || 'Item')} · {outcome.status || (outcome.success ? 'success' : 'info')}
                                                                {outcome.arrInstanceName ? ` · ${outcome.arrInstanceName}` : ''}
                                                                {outcome.reason ? ` · ${outcome.reason}` : ''}
                                                                {outcome.arrWarning ? ` · ${outcome.arrWarning}` : ''}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </details>
                                            ))}
                                            {!runs.length && <p className="text-sm text-muted">No runs recorded yet.</p>}
                                        </div>
                                    </div>
                                )}
                                {activeSection === 'calendar' && (
                                    <div className="glass-card-sm p-5 space-y-3">
                                        <h3 className="text-xl font-bold text-plex">Calendar</h3>
                                        <p className="text-sm text-muted">Rule-based eligibility schedule. Grace days are applied from this rule's creation date.</p>
                                        <div className="flex flex-wrap gap-2">
                                            {rules.map((rule: any) => (
                                                <button
                                                    key={`calendar-rule-tab-${rule.id}`}
                                                    type="button"
                                                    onClick={() => setCandidateRuleId(rule.id)}
                                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${candidateRuleId === rule.id ? 'bg-plex text-background border-plex' : 'bg-background/30 text-text border-white/5 hover:border-plex/40'}`}
                                                >
                                                    {rule.name || 'Unnamed Rule'}
                                                </button>
                                            ))}
                                        </div>
                                        {selectedCandidateRule && (
                                            <p className="text-xs text-muted">
                                                Current rule: <span className="text-text font-semibold">{selectedCandidateRule.name || 'Unnamed Rule'}</span> · Grace Days: <span className="text-text font-semibold">{calendarEligibility.graceDays}</span> · Rule Age: <span className="text-text font-semibold">{calendarEligibility.daysSinceRuleCreated}</span> day(s)
                                            </p>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCalendarDate(ELIGIBLE_NOW_KEY)}
                                                className="text-left bg-background/30 border border-white/5 rounded-lg p-3 hover:border-plex/50 transition-colors"
                                                title="Titles that match this rule and whose grace window has elapsed."
                                            >
                                                <p className="text-xs text-muted">Eligible Now</p>
                                                <p className="text-2xl font-bold text-text mt-1">{calendarEligibility.eligibleNow.length}</p>
                                                <p className="text-[11px] text-muted mt-1">{formatReclaimSizeFromGB(calendarEligibility.eligibleNow.reduce((sum: number, item: any) => sum + Number(item.sizeGB || 0), 0))} reclaim now</p>
                                            </button>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3" title="Number of future dates with delayed eligibility while this rule's grace period is active.">
                                                <p className="text-xs text-muted">Eligible Later Days</p>
                                                <p className="text-2xl font-bold text-text mt-1">{calendarEligibility.eligibleLaterByDay.length}</p>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3" title="Titles currently matching this rule but still waiting for grace to expire.">
                                                <p className="text-xs text-muted">Later Titles</p>
                                                <p className="text-2xl font-bold text-text mt-1">{calendarEligibility.eligibleLaterByDay.reduce((sum: number, day: any) => sum + Number(day.count || 0), 0)}</p>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3" title="Reclaim estimate from matches that are delayed by active grace days.">
                                                <p className="text-xs text-muted">Later Reclaim</p>
                                                <p className="text-2xl font-bold text-text mt-1">{formatReclaimSizeFromGB(calendarEligibility.eligibleLaterByDay.reduce((sum: number, day: any) => sum + Number(day.reclaimGB || 0), 0))}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-xs uppercase tracking-wider text-muted font-bold" title="Dates when currently matched titles become eligible once this rule's grace period expires.">Eligible Later by Date</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[700px] overflow-y-auto custom-scrollbar pr-1">
                                            {calendarEligibility.eligibleLaterByDay.slice(0, 120).map((day) => {
                                                const dateLabel = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                                                return (
                                                    <button
                                                        key={`calendar-day-${day.date}`}
                                                        type="button"
                                                        onClick={() => setSelectedCalendarDate(day.date)}
                                                        className="text-left bg-background/30 border border-white/5 rounded-lg p-3 hover:border-plex/50 hover:bg-black/30 transition-colors"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-sm font-semibold text-text">{dateLabel}</p>
                                                            <span className="text-[11px] px-2 py-0.5 rounded bg-plex/20 text-plex font-semibold" title="Number of titles becoming eligible on this date.">{day.count}</span>
                                                        </div>
                                                        <p className="text-[11px] text-muted mt-1">{day.minDaysUntil} day(s) until eligible · {formatReclaimSizeFromGB(day.reclaimGB)} reclaim</p>
                                                        <div className="mt-2 flex -space-x-2">
                                                            {day.preview.map((item: any, idx: number) => (
                                                                <div key={`calendar-preview-${day.date}-${item.ratingKey}-${idx}`} className="w-8 h-8 rounded-full overflow-hidden border border-white/5 bg-black/50" title={`${item.title || 'Unknown Title'} • ${getEligibilityTooltip(item)}`}>
                                                                    {item.thumb ? (
                                                                        <img
                                                                            src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=64&height=64`)}
                                                                            alt={item.title}
                                                                            className="w-full h-full object-cover"
                                                                            loading="lazy"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full" />
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                            {!calendarEligibility.eligibleLaterByDay.length && <p className="text-sm text-muted col-span-full">No delayed dates. Current matches are eligible now.</p>}
                                        </div>
                                    </div>
                                )}
                                {activeSection === 'calendar' && selectedCalendarGroup && (
                                    <div className="fixed inset-0 z-[1500] bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-3 md:p-6" onClick={() => setSelectedCalendarDate(null)}>
                                        <div className="w-full max-w-6xl max-h-[86vh] bg-card/80 backdrop-blur-md border border-white/5 rounded-xl shadow-2xl p-4 md:p-5 overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div>
                                                    <h4 className="text-xl font-bold text-plex">
                                                        {selectedCalendarGroup.title || new Date(`${selectedCalendarGroup.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                                    </h4>
                                                    <p className="text-sm text-muted mt-1" title={selectedCalendarGroup.date === ELIGIBLE_NOW_KEY ? 'These titles currently match this rule and are eligible now.' : 'These titles match this rule but are waiting for the grace period to elapse.'}>
                                                        {selectedCalendarGroup.count} title(s) · {formatReclaimSizeFromGB(selectedCalendarGroup.reclaimGB)} reclaim
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="px-3 py-1.5 bg-border text-text rounded-md text-sm font-semibold hover:bg-opacity-80"
                                                    onClick={() => setSelectedCalendarDate(null)}
                                                >
                                                    Close
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
                                                {selectedCalendarGroup.items.map((item: any, idx: number) => (
                                                    <div key={`calendar-modal-item-${selectedCalendarGroup.date}-${item.ratingKey}-${idx}`} className="bg-background/30 border border-white/5 rounded-lg overflow-hidden" title={getEligibilityTooltip(item)}>
                                                        <div className="aspect-[2/3] bg-black/40">
                                                            {item.thumb ? (
                                                                <img
                                                                    src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=240&height=360`)}
                                                                    alt={item.title}
                                                                    loading="lazy"
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-xs text-muted">No Poster</div>
                                                            )}
                                                        </div>
                                                        <div className="p-2">
                                                            <p className="text-xs text-text line-clamp-2">{item.title}</p>
                                                            <p className="text-[11px] text-muted mt-1">{item.libraryTitle || 'Unknown Library'}</p>
                                                            <p className="text-[11px] text-muted mt-1" title="Eligibility detail used by the backend.">
                                                                Last watch: {Number.isFinite(Number(item.daysSinceLastWatch)) ? `${Number(item.daysSinceLastWatch)}d ago` : 'n/a'} · Added: {Number.isFinite(Number(item.daysSinceAdded)) ? `${Number(item.daysSinceAdded)}d ago` : 'n/a'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {activeSection === 'storage' && (
                                    <div className="glass-card-sm p-5 space-y-4">
                                        <h3 className="text-xl font-bold text-plex">Storage Metrics</h3>
                                        <p className="text-sm text-muted">Deep storage projection per library based on indexed size and current rule matches.</p>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="px-3 py-1.5 bg-border text-text rounded-md text-xs font-semibold hover:bg-opacity-80"
                                                onClick={() => loadStorageSummary(candidateRuleId || undefined)}
                                            >
                                                {storageSummaryLoading ? 'Refreshing...' : 'Refresh Summary'}
                                            </button>
                                            {selectedCandidateRule && (
                                                <p className="text-xs text-muted">Rule scope: <span className="text-text font-semibold">{selectedCandidateRule.name || 'Unnamed Rule'}</span></p>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted">Library Size Before</p>
                                                <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(Number(storageSummary?.totals?.beforeGB || 0))}</p>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted">Projected Reclaim</p>
                                                <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(Number(storageSummary?.totals?.reclaimGB || 0))}</p>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted">Projected Size After</p>
                                                <p className="text-2xl font-bold text-text">{formatReclaimSizeFromGB(Number(storageSummary?.totals?.afterGB || 0))}</p>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted">Reclaim Percent</p>
                                                <p className="text-2xl font-bold text-text">{Number(storageSummary?.totals?.reclaimPercent || 0).toFixed(1)}%</p>
                                            </div>
                                        </div>
                                        <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                            <div className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-2 px-2 py-1 text-[11px] uppercase tracking-wider text-muted font-bold border-b border-border">
                                                <span>Library</span>
                                                <span className="text-right">Before</span>
                                                <span className="text-right">Reclaim</span>
                                                <span className="text-right">After</span>
                                                <span className="text-right">Matched</span>
                                            </div>
                                            <div className="max-h-[420px] overflow-y-auto custom-scrollbar pr-1 space-y-1 mt-2">
                                                {(storageSummary?.libraries || []).map((row: any) => (
                                                    <div key={`storage-row-${row.libraryTitle}`} className="grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-2 px-2 py-2 text-sm bg-background/30 border border-white/5 rounded-lg items-center">
                                                        <span className="text-text line-clamp-1">{row.libraryTitle}</span>
                                                        <span className="text-muted text-right">{formatReclaimSizeFromGB(Number(row.totalSizeGB || 0))}</span>
                                                        <span className="text-right text-plex font-semibold">{formatReclaimSizeFromGB(Number(row.reclaimGB || 0))}</span>
                                                        <span className="text-muted text-right">{formatReclaimSizeFromGB(Number(row.afterSizeGB || 0))}</span>
                                                        <span className="text-muted text-right">{row.matchedItems || 0}</span>
                                                    </div>
                                                ))}
                                                {!storageSummaryLoading && !(storageSummary?.libraries || []).length && (
                                                    <p className="text-sm text-muted px-2 py-2">No storage summary yet. Refresh or load candidates/rules first.</p>
                                                )}
                                                {storageSummaryLoading && <p className="text-sm text-muted px-2 py-2">Loading storage summary...</p>}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted">Total Indexed Items</p>
                                                <p className="text-xl font-bold text-text">{Number(storageSummary?.totals?.items || 0)}</p>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted">Matched Candidate Items</p>
                                                <p className="text-xl font-bold text-text">{Number(storageSummary?.totals?.matchedItems || 0)}</p>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted">Libraries Covered</p>
                                                <p className="text-xl font-bold text-text">{Number(storageSummary?.totals?.libraries || 0)}</p>
                                            </div>
                                        </div>
                                        {storageSummary?.rulesConsidered?.length > 0 && (
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <p className="text-xs text-muted font-bold uppercase tracking-wider mb-2">Rules Included</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {storageSummary.rulesConsidered.map((rule: any) => (
                                                        <span key={`storage-rule-${rule.id}`} className="px-2 py-1 rounded bg-border text-xs text-text">{rule.name || 'Unnamed Rule'}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {activeSection === 'library' && (
                                    <div className="glass-card-sm p-5 space-y-3">
                                        <h3 className="text-xl font-bold text-plex">Rule Library</h3>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="px-3 py-2 bg-border text-text rounded-md text-sm font-semibold"
                                                onClick={() => {
                                                    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `maintenance-rules-${Date.now()}.json`;
                                                    a.click();
                                                    URL.revokeObjectURL(url);
                                                    addToast('Rule export downloaded.');
                                                }}
                                            >
                                                Export Rules JSON
                                            </button>
                                            <button
                                                type="button"
                                                className="px-3 py-2 bg-plex text-background rounded-md text-sm font-semibold"
                                                onClick={async () => {
                                                    try {
                                                        const parsed = JSON.parse(libraryJsonInput || '[]');
                                                        if (!Array.isArray(parsed)) throw new Error('JSON must be an array of rules.');
                                                        await saveAllRules(parsed);
                                                        addToast('Imported rules saved.');
                                                    } catch (e: any) {
                                                        addToast(e.message || 'Invalid JSON import.', 'error');
                                                    }
                                                }}
                                            >
                                                Import Rules JSON
                                            </button>
                                        </div>
                                        <textarea
                                            className="w-full min-h-[240px] p-3 rounded-lg border border-border bg-card text-text text-xs font-mono"
                                            placeholder="Paste exported rules JSON here to import."
                                            value={libraryJsonInput}
                                            onChange={(e) => setLibraryJsonInput(e.target.value)}
                                        />
                                    </div>
                                )}
                                {activeSection === 'exclusions' && (
                                    <div className="glass-card-sm p-4 md:p-5 space-y-3">
                                        <h3 className="text-xl font-bold text-plex">Exclusions</h3>
                                        <p className="text-sm text-muted">Click posters to select them for bulk actions. Selected items show a checkmark overlay. Use the Exclude link under each title for one-off changes.</p>
                                        <div className="bg-background/30 border border-white/5 rounded-lg p-3 md:p-4 space-y-2.5">
                                            <div className="min-w-0 md:w-[220px] h-9">
                                                <CustomSelect
                                                    value={libraryBrowseId}
                                                    onChange={(value) => {
                                                        setLibraryBrowseId(value);
                                                        setLibraryBrowsePage(1);
                                                    }}
                                                    options={[
                                                        { label: 'All Libraries', value: 'all' },
                                                        ...libraryOptions.map((library) => ({
                                                            label: `${library.title} (${library.count})`,
                                                            value: library.id
                                                        }))
                                                    ]}
                                                />
                                            </div>
                                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center mt-1">
                                                <input
                                                    className="h-9 px-2.5 rounded border border-border bg-card text-text text-xs md:text-sm min-w-0"
                                                    placeholder="Search title..."
                                                    value={libraryBrowseSearch}
                                                    onChange={(e) => {
                                                        setLibraryBrowseSearch(e.target.value);
                                                        setLibraryBrowsePage(1);
                                                    }}
                                                />
                                                <button type="button" className="h-9 px-3 bg-border text-text rounded-md text-xs md:text-sm font-semibold whitespace-nowrap" onClick={loadLibraryBrowse}>Refresh</button>
                                            </div>
                                            <div className="grid grid-cols-[minmax(0,1fr)_auto] md:flex md:flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="h-9 px-3 bg-border text-text rounded-md text-xs md:text-sm font-semibold whitespace-nowrap"
                                                    onClick={() => setSelectedExcludeKeys(libraryItems.map((item: any) => String(item.ratingKey || '')).filter(Boolean))}
                                                    disabled={!libraryItems.length}
                                                >
                                                    Select Page
                                                </button>
                                                <button
                                                    type="button"
                                                    className="h-9 px-3 bg-plex text-background rounded-md text-xs md:text-sm font-semibold whitespace-nowrap"
                                                    onClick={async () => {
                                                        if (!selectedExcludeKeys.length) {
                                                            addToast('Select posters to exclude first.', 'error');
                                                            return;
                                                        }
                                                        const merged = Array.from(new Set([...(preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v)), ...selectedExcludeKeys]));
                                                        await updateRatingKeyExclusions(merged);
                                                        setSelectedExcludeKeys([]);
                                                        addToast(`Excluded ${selectedExcludeKeys.length} selected title(s).`);
                                                    }}
                                                >
                                                    Exclude Selected ({selectedExcludeKeys.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    className="h-9 w-9 flex items-center justify-center bg-red-500/15 border border-red-500/40 text-red-300 rounded-md hover:bg-red-500/25 transition-colors"
                                                    onClick={() => setSelectedExcludeKeys([])}
                                                    title="Clear Selection"
                                                    aria-label="Clear Selection"
                                                >
                                                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="col-span-2 md:col-auto h-9 px-3 bg-border text-text rounded-md text-xs md:text-sm font-semibold whitespace-nowrap"
                                                    onClick={async () => {
                                                        if (!selectedExcludeKeys.length) {
                                                            addToast('Select posters to unexclude first.', 'error');
                                                            return;
                                                        }
                                                        const removedCount = selectedExcludeKeys.length;
                                                        const remaining = (preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v)).filter((key: string) => !selectedExcludeKeys.includes(key));
                                                        await updateRatingKeyExclusions(remaining);
                                                        setSelectedExcludeKeys([]);
                                                        addToast(`Removed ${removedCount} selected exclusion(s).`);
                                                    }}
                                                >
                                                    Remove Selected Exclusions
                                                </button>
                                                <p className="col-span-2 text-[11px] md:text-xs text-muted w-full md:w-auto md:ml-auto md:text-right">Showing {libraryItems.length} of {libraryBrowseTotal} titles · page {libraryBrowsePage}</p>
                                            </div>
                                            {libraryBrowseLoading ? (
                                                <p className="text-sm text-muted">Loading posters...</p>
                                            ) : (
                                                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-2 md:gap-3 max-h-[1240px] overflow-y-auto custom-scrollbar pr-1">
                                                    {libraryItems.map((item: any) => {
                                                        const key = String(item.ratingKey || '');
                                                        const selected = selectedExcludeKeys.includes(key);
                                                        const excluded = item.excluded || excludedRatingKeySet.has(key);
                                                        const toggleQuickExclude = async (event: React.MouseEvent) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            const currentKeys = (preferences?.exclusions?.ratingKeys || []).map((v: string) => String(v));
                                                            const nextKeys = excluded ? currentKeys.filter((v: string) => v !== key) : Array.from(new Set([...currentKeys, key]));
                                                            await updateRatingKeyExclusions(nextKeys);
                                                            addToast(excluded ? `Removed exclusion for ${item.title}.` : `Excluded ${item.title}.`);
                                                        };
                                                        return (
                                                            <div
                                                                key={`exclude-item-${key}`}
                                                                className={`relative w-full border rounded-lg overflow-hidden transition-all ${selected ? 'border-plex bg-plex/5 shadow-[0_0_0_1px_rgba(229,160,13,0.35)]' : 'border-white/5'} ${excluded ? 'ring-1 ring-red-500/60' : ''}`}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="w-full text-left"
                                                                    aria-pressed={selected}
                                                                    onClick={() => {
                                                                        setSelectedExcludeKeys((prev) => prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]);
                                                                    }}
                                                                >
                                                                    <div className="aspect-[2/3] bg-black/40 relative">
                                                                        {item.thumb ? (
                                                                            <img src={portalUrl(`/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=220&height=330`)} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-xs text-muted">No Poster</div>
                                                                        )}
                                                                        {selected && (
                                                                            <>
                                                                                <div className="absolute inset-0 bg-plex/20 pointer-events-none" />
                                                                                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-plex text-background flex items-center justify-center shadow-md pointer-events-none">
                                                                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                        {excluded && (
                                                                            <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-red-600/95 text-white font-bold pointer-events-none">
                                                                                Excluded
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="px-2 pt-2 text-xs text-text line-clamp-2">{item.title}</p>
                                                                </button>
                                                                <div className="px-2 pb-2 pt-1 flex items-center justify-between gap-2 min-h-[2rem]">
                                                                    <p className="text-[11px] text-muted truncate">{item.libraryTitle}</p>
                                                                    <button
                                                                        type="button"
                                                                        className={`text-[10px] font-semibold shrink-0 whitespace-nowrap transition-colors ${excluded ? 'text-muted hover:text-text' : 'text-plex hover:text-plex-hover'}`}
                                                                        onClick={toggleQuickExclude}
                                                                    >
                                                                        {excluded ? 'Unexclude' : 'Exclude'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {!libraryItems.length && <p className="text-sm text-muted col-span-full">No titles found for the current library/search.</p>}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between">
                                                <button
                                                    type="button"
                                                    className="px-3 py-1.5 bg-border text-text rounded-md text-sm font-semibold disabled:opacity-50"
                                                    disabled={libraryBrowsePage <= 1}
                                                    onClick={() => setLibraryBrowsePage((p) => Math.max(1, p - 1))}
                                                >
                                                    Previous
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-3 py-1.5 bg-border text-text rounded-md text-sm font-semibold disabled:opacity-50"
                                                    disabled={(libraryBrowsePage * libraryBrowseLimit) >= libraryBrowseTotal}
                                                    onClick={() => setLibraryBrowsePage((p) => p + 1)}
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                        <div className="bg-background/30 border border-white/5 rounded-lg p-3 space-y-3">
                                            <h4 className="text-sm font-bold text-text">Current Exclusions (Resolved)</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div className="bg-background/30 border border-white/5 rounded-lg p-3 space-y-2">
                                                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Excluded Titles by RatingKey</p>
                                                    <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                                        {exclusionsSummary.ratingKeys.map((entry: any) => (
                                                            <div key={`resolved-key-${entry.ratingKey}`} className="flex items-center gap-2 bg-background/30 border border-white/5 rounded-md p-2">
                                                                <div className="w-10 h-14 rounded overflow-hidden bg-black/40 flex-shrink-0">
                                                                    {entry.thumb ? (
                                                                        <img src={portalUrl(`/api/plex/image?path=${encodeURIComponent(entry.thumb)}&width=80&height=120`)} alt={entry.title} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center text-[9px] text-muted">No Poster</div>
                                                                    )}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-xs text-text line-clamp-2">{entry.title}</p>
                                                                    <p className="text-[10px] text-muted line-clamp-1">{entry.libraryTitle || entry.ratingKey}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {!exclusionsSummary.ratingKeys.length && <p className="text-xs text-muted">No ratingKey exclusions set.</p>}
                                                    </div>
                                                </div>
                                                <div className="bg-background/30 border border-white/5 rounded-lg p-3 space-y-2">
                                                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Excluded Title Terms</p>
                                                    <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                                        {exclusionsSummary.titles.map((entry: any) => (
                                                            <div key={`resolved-title-${entry.title}`} className="bg-background/30 border border-white/5 rounded-md px-2 py-1.5">
                                                                <p className="text-xs text-text line-clamp-1">{entry.title}</p>
                                                                <p className="text-[10px] text-muted">{entry.matchCount} indexed match(es)</p>
                                                            </div>
                                                        ))}
                                                        {!exclusionsSummary.titles.length && <p className="text-xs text-muted">No title exclusions set.</p>}
                                                    </div>
                                                </div>
                                                <div className="bg-background/30 border border-white/5 rounded-lg p-3 space-y-2">
                                                    <p className="text-xs font-bold text-muted uppercase tracking-wider">Excluded Libraries</p>
                                                    <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                                                        {exclusionsSummary.libraries.map((entry: any) => (
                                                            <div key={`resolved-library-${entry.libraryTitle}`} className="bg-background/30 border border-white/5 rounded-md px-2 py-1.5">
                                                                <p className="text-xs text-text line-clamp-1">{entry.libraryTitle}</p>
                                                                <p className="text-[10px] text-muted">{entry.matchCount} indexed item(s)</p>
                                                            </div>
                                                        ))}
                                                        {!exclusionsSummary.libraries.length && <p className="text-xs text-muted">No library exclusions set.</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-xs text-muted font-bold uppercase">Title Exclusions (advanced, one per line)</label>
                                                <textarea
                                                    className="w-full min-h-[180px] p-3 rounded-lg border border-border bg-card text-text text-xs"
                                                    value={(preferences?.exclusions?.titles || []).join('\n')}
                                                    onChange={(e) => setPreferences((prev: any) => ({ ...prev, exclusions: { ...(prev.exclusions || {}), titles: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) } }))}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-muted font-bold uppercase">Library Exclusions (advanced, one per line)</label>
                                                <textarea
                                                    className="w-full min-h-[180px] p-3 rounded-lg border border-border bg-card text-text text-xs"
                                                    value={(preferences?.exclusions?.libraries || []).join('\n')}
                                                    onChange={(e) => setPreferences((prev: any) => ({ ...prev, exclusions: { ...(prev.exclusions || {}), libraries: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) } }))}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-muted font-bold uppercase">RatingKey Exclusions (advanced, one per line)</label>
                                                <textarea
                                                    className="w-full min-h-[180px] p-3 rounded-lg border border-border bg-card text-text text-xs"
                                                    value={(preferences?.exclusions?.ratingKeys || []).join('\n')}
                                                    onChange={(e) => setPreferences((prev: any) => ({ ...prev, exclusions: { ...(prev.exclusions || {}), ratingKeys: e.target.value.split('\n').map(v => v.trim()).filter(Boolean) } }))}
                                                />
                                            </div>
                                        </div>
                                        <button type="button" className="px-3 py-2 bg-plex text-background rounded-md text-sm font-semibold" onClick={async () => { await savePreferences(preferences); await loadExclusionsSummary(); addToast('Exclusions saved.'); }}>
                                            Save Exclusions
                                        </button>
                                    </div>
                                )}
                                {activeSection === 'settings' && (
                                    <div className="glass-card-sm p-5 space-y-4">
                                        <h3 className="text-xl font-bold text-plex">Cleaner Settings</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <label className="text-xs text-muted font-bold uppercase block mb-2">Default Dry-run</label>
                                                <label className="text-sm text-muted flex items-center gap-2">
                                                    <input type="checkbox" checked={!!preferences?.global?.dryRunByDefault} onChange={(e) => setPreferences((prev: any) => ({ ...prev, global: { ...(prev.global || {}), dryRunByDefault: e.target.checked } }))} />
                                                    Enable by default
                                                </label>
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <label className="text-xs text-muted font-bold uppercase block mb-2">Max Actions Per Run</label>
                                                <input type="number" min={1} className="w-full p-2 rounded border border-border bg-card text-text text-sm" value={preferences?.global?.maxActionsPerRun || 25} onChange={(e) => setPreferences((prev: any) => ({ ...prev, global: { ...(prev.global || {}), maxActionsPerRun: Math.max(1, Number(e.target.value) || 1) } }))} />
                                            </div>
                                            <div className="bg-background/30 border border-white/5 rounded-lg p-3">
                                                <label className="text-xs text-muted font-bold uppercase block mb-2">Require Confirm Token</label>
                                                <label className="text-sm text-muted flex items-center gap-2">
                                                    <input type="checkbox" checked={!!preferences?.global?.requireConfirmForDestructive} onChange={(e) => setPreferences((prev: any) => ({ ...prev, global: { ...(prev.global || {}), requireConfirmForDestructive: e.target.checked } }))} />
                                                    Required for destructive runs
                                                </label>
                                            </div>
                                        </div>
                                        <button type="button" className="px-3 py-2 bg-plex text-background rounded-md text-sm font-semibold" onClick={async () => { await savePreferences(preferences); addToast('Maintenance settings saved.'); }}>
                                            Save Cleaner Settings
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};


interface NavigationProps {
    currentRoute: string;
    onNavigate: (route: 'admin' | 'user' | 'status' | 'dashboard' | 'settings' | 'logs' | 'analytics' | 'downloads' | 'mediastack' | 'maintenance' | 'upgrader' | 'collexions' | 'scanner' | 'media-automation' | 'requests' | 'discovery' | 'about') => void;
    onLogout: () => void;
    isAdmin: boolean;
    serverName: string;
    adminThumb?: string | null;
    customLogoUrl?: string | null;
    requestUrl: string;
    navOrder: string[];
    navHiddenKeys?: string[];
    navFeatures?: NavFeatureFlags;
    appVersion?: string;
    activeTheme: string;
    setActiveTheme: (theme: string) => void;
    pendingRequestCount?: number;
    watchingCount?: number;
    downloadCount?: number;
    showDashboardWatchingBadge?: boolean;
    sessionInfo?: any;
    mediaServerType?: string;
    sidebarIdentityPosition?: 'top' | 'bottom';
}

export const Navigation: React.FC<NavigationProps> = ({ currentRoute, onNavigate, onLogout, isAdmin, serverName, adminThumb, customLogoUrl, requestUrl, navOrder, navHiddenKeys, navFeatures, appVersion, activeTheme, setActiveTheme, pendingRequestCount = 0, watchingCount = 0, downloadCount = 0, showDashboardWatchingBadge = false, sessionInfo, mediaServerType = 'plex', sidebarIdentityPosition = 'bottom' }) => {
    const serverIcon = customLogoUrl ? resolvePortalAssetUrl(customLogoUrl) : (adminThumb ? (adminThumb.startsWith('http') ? adminThumb : portalUrl(`/api/plex/image?path=${encodeURIComponent(adminThumb)}&width=256&height=256`)) : logoUrl());
    const providerName = String(mediaServerType || 'plex').toLowerCase() === 'jellyfin'
        ? 'Jellyfin'
        : String(mediaServerType || 'plex').toLowerCase() === 'emby'
            ? 'Emby'
            : 'Plex';
    const profile = sessionInfo?.account || sessionInfo?.session || {};
    const profileName = profile?.username || sessionInfo?.session?.username || 'Profile';
    const profileEmail = profile?.email || sessionInfo?.session?.email || '';
    const profileThumb = profile?.thumb || sessionInfo?.session?.thumb || (isAdmin ? adminThumb : null);
    const profileIcon = profileThumb
        ? (String(profileThumb).startsWith('http://') || String(profileThumb).startsWith('https://') || String(profileThumb).startsWith('/api/')
            ? resolvePortalAssetUrl(profileThumb)
            : portalUrl(`/api/plex/image?path=${encodeURIComponent(profileThumb)}&width=256&height=256`))
        : logoUrl();
    useEffect(() => {
        updateFavicon(serverIcon);
    }, [serverIcon]);

    const [mobileThemeOpen, setMobileThemeOpen] = useState(false);
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const [firefoxMobileNav] = useState(() => isFirefoxMobileClient());
    const firefoxNavBarRef = useRef<HTMLDivElement>(null);
    useFirefoxMobileNavShell({ barRef: firefoxNavBarRef, enabled: firefoxMobileNav });
    const [profileOpen, setProfileOpen] = useState(false);
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [installHelpOpen, setInstallHelpOpen] = useState(false);
    const [isInstalledApp, setIsInstalledApp] = useState(() => (
        typeof window !== 'undefined'
        && (window.matchMedia?.('(display-mode: standalone)').matches
            || window.matchMedia?.('(display-mode: fullscreen)').matches
            || (navigator as any).standalone === true)
    ));
    const mobileThemeRef = useRef<HTMLDivElement>(null);
    const [mobileThemePos, setMobileThemePos] = useState<{ top: number; right: number } | null>(null);
    const isFirefoxMobile = typeof navigator !== 'undefined'
        && /Firefox/i.test(navigator.userAgent)
        && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
    const [installDiag, setInstallDiag] = useState<string[] | null>(null);

    useEffect(() => {
        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPrompt(event as BeforeInstallPromptEvent);
        };
        const handleInstalled = () => {
            setIsInstalledApp(true);
            setInstallPrompt(null);
            setInstallHelpOpen(false);
        };
        const syncInstalledState = () => {
            const installed = window.matchMedia?.('(display-mode: standalone)').matches
                || window.matchMedia?.('(display-mode: fullscreen)').matches
                || (navigator as any).standalone === true;
            setIsInstalledApp(!!installed);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleInstalled);
        const standaloneMq = window.matchMedia?.('(display-mode: standalone)');
        standaloneMq?.addEventListener?.('change', syncInstalledState);
        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleInstalled);
            standaloneMq?.removeEventListener?.('change', syncInstalledState);
        };
    }, []);

    useEffect(() => {
        if (!installHelpOpen) {
            setInstallDiag(null);
            return;
        }
        let cancelled = false;
        (async () => {
            const notes: string[] = [];
            const secure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
            if (!secure || window.location.protocol !== 'https:') {
                if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    notes.push('Site is not HTTPS — Firefox will not install a PWA over plain HTTP. Open the portal via your HTTPS URL (reverse proxy / tunnel), not http://IP:port.');
                }
            }
            try {
                if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !/Firefox/i.test(navigator.userAgent || '')) {
                    try {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        if (!regs.length) {
                            notes.push('No service worker registered yet — Chrome Android needs one for Install (not just Create shortcut). Reload once over HTTPS and try again.');
                        } else if (!navigator.serviceWorker.controller) {
                            notes.push('Service worker is registered but not controlling this page yet — reload once, then retry Install.');
                        }
                    } catch {
                        // ignore SW probe failures
                    }
                }
                const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
                const manifestHref = manifestLink?.href || portalUrl('/manifest.webmanifest');
                const manifestRes = await fetch(manifestHref, { credentials: 'same-origin', cache: 'no-store' });
                if (!manifestRes.ok) {
                    notes.push(`Manifest failed to load (${manifestRes.status}).`);
                } else {
                    const manifest = await manifestRes.json();
                    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
                    if (!manifest.name && !manifest.short_name) notes.push('Manifest is missing a name.');
                    if (!manifest.start_url) notes.push('Manifest is missing start_url.');
                    if (!icons.length) notes.push('Manifest has no icons.');
                    for (const icon of icons.slice(0, 3)) {
                        try {
                            const iconUrl = new URL(String(icon.src || ''), window.location.href).toString();
                            const iconRes = await fetch(iconUrl, { credentials: 'same-origin', cache: 'no-store' });
                            if (!iconRes.ok) {
                                notes.push(`Icon failed (${icon.sizes || '?'}): ${iconRes.status}`);
                                continue;
                            }
                            const type = (iconRes.headers.get('content-type') || '').toLowerCase();
                            if (type && !type.includes('image/')) {
                                notes.push(`Icon is not an image (${icon.sizes || '?'}): ${type}`);
                            }
                        } catch {
                            notes.push(`Icon could not be fetched (${icon.sizes || '?'}).`);
                        }
                    }
                    if (!notes.length) {
                        notes.push('Manifest and icons look OK. Chrome Android: menu ⋮ → Install app / Install and create shortcut → Install. Firefox: menu ⋮ → Install. If you still only see Create shortcut, clear site data for this origin and open the portal over HTTPS once more.');
                    }
                }
            } catch {
                notes.push('Could not verify the web app manifest from this device.');
            }
            if (!cancelled) setInstallDiag(notes);
        })();
        return () => { cancelled = true; };
    }, [installHelpOpen]);

    const handleInstallApp = async () => {
        if (isInstalledApp) return;
        // Firefox (and most non-Chromium browsers) never fire beforeinstallprompt —
        // always show manual install steps instead of appearing to do nothing.
        if (!installPrompt || isFirefoxMobile) {
            setInstallHelpOpen(true);
            return;
        }
        const promptEvent = installPrompt;
        setInstallPrompt(null);
        try {
            await promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            if (choice.outcome === 'accepted') {
                setIsInstalledApp(true);
            }
        } catch {
            setInstallHelpOpen(true);
        }
    };

    useEffect(() => {
        if (!mobileThemeOpen) { setMobileThemePos(null); return; }
        if (mobileThemeRef.current) {
            const rect = mobileThemeRef.current.getBoundingClientRect();
            setMobileThemePos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
        }
    }, [mobileThemeOpen]);

    useEffect(() => {
        if (!mobileThemeOpen) return;
        const handler = (e: MouseEvent) => {
            if (mobileThemeRef.current && !mobileThemeRef.current.contains(e.target as Node)) {
                setMobileThemeOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [mobileThemeOpen]);

    const navItemsConfig: Record<string, { label: string; icon: React.FC<any>; route: string; adminOnly: boolean; href?: string; onClick?: (e: any) => void }> = {
        'home': { label: 'Home', icon: Home, route: 'user', adminOnly: false },
        'users': { label: 'Users', icon: Users, route: 'users', adminOnly: true },
        'discover': { label: 'Dashboard', icon: Film, route: 'dashboard', adminOnly: false },
        'status': { label: 'Status', icon: Activity, route: 'status', adminOnly: false },
        'logs': { label: 'Logs', icon: FileText, route: 'logs', adminOnly: true },
        'analytics': { label: 'Analytics', icon: BarChart3, route: 'analytics', adminOnly: false },
        'downloads': { label: 'Downloads', icon: DownloadCloud, route: 'downloads', adminOnly: false },
        'mediastack': { label: 'Calendar', icon: Calendar, route: 'mediastack', adminOnly: false },
        'maintenance': { label: 'Cleaner', icon: Shield, route: 'maintenance', adminOnly: true },
        'upgrader': { label: 'Upgrader', icon: ArrowUpCircle, route: 'upgrader', adminOnly: true },
        'collexions': { label: 'ColleXions', icon: Layers, route: 'collexions', adminOnly: true },
        'scanner': { label: 'Scanner', icon: Radar, route: 'scanner', adminOnly: true },
        'media-automation': { label: 'Media Automation', icon: Cpu, route: 'media-automation', adminOnly: true },
        'requests': { label: 'Requests', icon: ClipboardList, route: 'requests', adminOnly: true },
        'request': { label: 'Discover & Request', icon: Sparkles, route: 'discovery', adminOnly: false },
        'about': { label: 'About', icon: Info, route: 'about', adminOnly: false },
        'settings': { label: 'Settings', icon: Settings, route: 'settings', adminOnly: true },
        'logout': { label: 'Logout', icon: LogOut, route: '', adminOnly: false, onClick: onLogout }
    };
    const normalizedNavOrder = useMemo(() => {
        const order = ensureCompleteNavOrder(navOrder);
        return filterNavOrder(order, { isAdmin, features: navFeatures, hiddenKeys: navHiddenKeys });
    }, [navOrder, navHiddenKeys, isAdmin, navFeatures]);

    const isNavCurrent = (key: string, route: string) => (
        ['admin', 'user'].includes(currentRoute) && key === 'home' ? true : currentRoute === route
    );

    const getNavBadgeCount = (key: string) => {
        if (key === 'requests') return pendingRequestCount;
        if (key === 'discover' && showDashboardWatchingBadge) return watchingCount;
        if (key === 'downloads') return downloadCount;
        return 0;
    };

    const renderNavAction = (
        key: string,
        item: { label: string; icon: React.FC<any>; route: string; href?: string; onClick?: (e: any) => void },
        options: { compactLabel?: string; mobile?: boolean; isCurrent: boolean; badgeCount?: number },
    ) => {
        const Icon = item.icon;
        const label = options.compactLabel || item.label;
        const badgeCount = options.badgeCount || 0;
        const baseClass = options.mobile
            ? `relative flex flex-col items-center justify-center gap-0.5 h-full flex-1 min-w-0 px-0.5 text-center text-[0.6rem] sm:text-[0.65rem] transition-colors ${options.isCurrent ? 'text-plex font-bold' : 'text-muted hover:text-text'}`
            : `flex items-center gap-2.5 px-3 py-2 no-underline rounded-lg transition-all text-sm font-medium ${options.isCurrent ? 'nav-item-active' : 'text-muted hover:bg-white/5 hover:text-text'}`;

        if (item.href) {
            return (
                <a key={key} href={item.href} target="_blank" rel="noreferrer" className={options.mobile ? baseClass.replace('hover:text-text', 'hover:text-text') : 'flex items-center gap-2.5 px-3 py-2 text-muted no-underline rounded-lg transition-all text-sm font-medium hover:bg-white/5 hover:text-text'}>
                    <Icon className="w-5 h-5 flex-shrink-0" /> {label}
                </a>
            );
        }

        const handleActivate = () => {
            if (options.mobile) setMobileMoreOpen(false);
            if (item.onClick) item.onClick({ preventDefault: () => {} });
            else if (item.route) onNavigate(item.route as any);
        };

        return (
            <button
                key={key}
                type="button"
                className={`${baseClass} bg-transparent border-0 cursor-pointer`}
                onClick={handleActivate}
            >
                <span className="relative shrink-0">
                    <Icon className="w-5 h-5" />
                    {badgeCount > 0 && options.mobile && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-plex text-background text-[8px] font-bold flex items-center justify-center leading-none">
                            {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                    )}
                </span>
                {options.mobile ? label : (
                    <span className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="truncate">{label}</span>
                        {badgeCount > 0 && (
                            <span className="ml-auto min-w-[1.15rem] h-[18px] px-1.5 rounded-full bg-plex text-background text-[10px] font-bold flex items-center justify-center shrink-0">
                                {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                        )}
                    </span>
                )}
                {options.mobile && options.isCurrent && (
                    <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-plex shadow-[0_0_5px_rgba(229,160,13,0.8)]" />
                )}
            </button>
        );
    };

    const renderServerIdentity = (placement: 'top' | 'bottom') => (
        <div className={`flex flex-col items-center w-full shrink-0 ${placement === 'top' ? 'pb-2 mb-2 border-b' : 'pt-2 mt-2 border-t'} border-white/10 group cursor-default`}>
            <div className={`relative mb-2 ${customLogoUrl ? 'w-24 flex items-center justify-center' : ''}`}>
                {customLogoUrl ? (
                    <img
                        src={serverIcon}
                        alt="Server Logo"
                        className="max-w-24 max-h-20 object-contain drop-shadow-[0_0_24px_rgba(0,0,0,0.75)] group-hover:scale-105 transition-transform duration-700 ease-out"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = logoUrl();
                        }}
                    />
                ) : (
                    <>
                        <div className="absolute inset-0 bg-plex blur-[25px] opacity-20 group-hover:opacity-40 transition-opacity duration-700 rounded-full"></div>
                        <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-plex via-amber-300 to-orange-600 opacity-60 group-hover:opacity-100 group-hover:rotate-180 transition-all duration-1000 ease-out"></div>
                        <div className="relative w-20 h-20 rounded-full p-[3px] shadow-2xl bg-card">
                            <div className="w-full h-full rounded-full overflow-hidden bg-background">
                                <img
                                    src={serverIcon}
                                    alt="Server Logo"
                                    className="w-full h-full group-hover:scale-110 transition-transform duration-700 ease-out object-cover"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = logoUrl();
                                    }}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="flex flex-col items-center text-center px-2">
                <h2 className="text-lg font-black text-text tracking-tight leading-tight line-clamp-2">
                    {serverName}
                </h2>
                <div className="mt-1 flex items-center gap-2">
                    <div className="h-px w-6 bg-gradient-to-r from-transparent to-plex/50"></div>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-plex font-bold">
                        Portal
                    </span>
                    <div className="h-px w-6 bg-gradient-to-l from-transparent to-plex/50"></div>
                </div>
            </div>
        </div>
    );

    return (
        <>

            {/* Mobile Top Nav — height grows with safe-area so content clears the iOS status bar in PWA */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-50 nav-shell border-b shadow-lg pt-[env(safe-area-inset-top,0px)]">
                <div className="h-16 flex items-center justify-between px-4">
                <div className="flex items-center gap-3 min-w-0">
                    <img
                        src={serverIcon}
                        alt="Logo"
                        className={`w-10 h-10 shrink-0 ${customLogoUrl ? 'object-contain' : 'rounded-full object-cover'}`}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = logoUrl();
                        }}
                    />
                    <span className="font-bold text-text uppercase tracking-widest text-sm truncate">{serverName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <DiscoverLocaleSelect showLabel={false} className="w-[6.75rem]" />
                    <div className="relative" ref={mobileThemeRef}>
                        <button
                            onClick={() => setMobileThemeOpen(v => !v)}
                            className={`w-8 h-8 flex items-center justify-center rounded-md border transition-all ${mobileThemeOpen ? 'border-plex text-plex ring-1 ring-plex' : 'border-border text-muted hover:border-plex/50 hover:text-text'}`}
                            title="Change theme"
                        >
                            <Palette className="w-3.5 h-3.5" />
                        </button>
                        {mobileThemeOpen && mobileThemePos && ReactDOM.createPortal(
                            <div
                                style={{ position: 'fixed', top: mobileThemePos.top, right: mobileThemePos.right, zIndex: 99999 }}
                                className="bg-card border border-border rounded-lg shadow-2xl py-1 min-w-[140px]"
                            >
                                {[
                                    { label: 'Dynamic (Chameleon)', value: 'dynamic' },
                                    { label: 'Plex Dark', value: 'plex' },
                                    { label: 'Sleek Slate', value: 'slate' },
                                    { label: 'Nordic Frost', value: 'nordic' },
                                    { label: 'Jellyfin Purple', value: 'jellyfin' },
                                    { label: 'Emerald Green', value: 'emerald' },
                                    { label: 'Neon Midnight', value: 'midnight' },
                                    { label: 'Crimson Red', value: 'crimson' },
                                    { label: 'Deep Amethyst', value: 'amethyst' },
                                    { label: 'Sunset Orange', value: 'sunset' },
                                    { label: 'Ocean Teal', value: 'ocean' },
                                    { label: 'Rose Pink', value: 'rose' },
                                    { label: 'Royal Blue', value: 'royal' },
                                    { label: 'Graphite', value: 'graphite' },
                                    { label: 'Cyber Lime', value: 'cyberlime' },
                                    { label: 'Aurora', value: 'aurora' },
                                ].map(opt => (
                                    <div
                                        key={opt.value}
                                        className={`px-4 py-2.5 cursor-pointer text-sm whitespace-nowrap transition-colors ${activeTheme === opt.value ? 'bg-plex/10 text-plex font-bold' : 'text-text hover:bg-border/40'}`}
                                        onMouseDown={e => { e.preventDefault(); setActiveTheme(opt.value); setMobileThemeOpen(false); }}
                                    >
                                        {opt.label}
                                    </div>
                                ))}
                            </div>,
                            document.body
                        )}
                    </div>
                    {isAdmin && (
                        <button onClick={(e) => { e.preventDefault(); onNavigate('logs'); }} className={`text-muted hover:text-text transition-colors ${currentRoute === 'logs' ? 'text-plex' : ''}`}>
                            <FileText className="w-4 h-4" />
                        </button>
                    )}
                    {!isInstalledApp && (
                        <button type="button" onClick={(e) => { e.preventDefault(); handleInstallApp(); }} className="text-muted hover:text-text transition-colors" title="Install app" aria-label="Install app">
                            <MonitorSmartphone className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={(e) => { e.preventDefault(); onLogout(); }} className="text-muted hover:text-red-500 transition-colors">
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
                </div>
            </div>


            {/* Desktop Sidebar */}
            <div className="hidden md:flex flex-col w-72 nav-shell border-r px-5 py-3 sticky top-0 self-start h-dvh shadow-2xl overflow-hidden">
                {sidebarIdentityPosition === 'top' && renderServerIdentity('top')}

                <div className="flex flex-col justify-start gap-1.5 min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-0.5 custom-scrollbar">
                    {normalizedNavOrder.map((key) => {
                        const item = navItemsConfig[key];
                        if (!item) return null;
                        if (key === 'logs') return null;
                        const isCurrent = item.route ? isNavCurrent(key, item.route) : false;
                        const labelOverride = key === 'mediastack' ? 'Calendar' : item.label;
                        return renderNavAction(key, { ...item, label: labelOverride }, { isCurrent, badgeCount: getNavBadgeCount(key) });
                    })}
                </div>

                {sidebarIdentityPosition !== 'top' && renderServerIdentity('bottom')}

                <div className="mt-2 pt-2 border-t border-white/10 shrink-0">
                    <button
                        type="button"
                        onClick={() => setProfileOpen(true)}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-plex/40 transition-all p-2 text-left"
                    >
                        <img
                            src={profileIcon}
                            alt=""
                            className="w-8 h-8 flex-shrink-0 rounded-full object-cover bg-background/60 border border-white/10"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = logoUrl();
                            }}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-text truncate">{profileName}</p>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{providerName} Profile</p>
                        </div>
                        <Palette className="w-4 h-4 text-plex flex-shrink-0" />
                    </button>
                    <div className="mt-1 flex flex-col items-center gap-0.5">
                        {appVersion && (
                            <div className="text-[10px] text-white/50 font-mono tracking-wider opacity-80 hover:opacity-100 transition-opacity">
                                {appVersion}
                            </div>
                        )}
                        <DiscoverLocaleSelect variant="text" />
                    </div>
                </div>
            </div>

            {profileOpen && (
                <div className="hidden md:block fixed inset-0 z-[80]" aria-modal="true" role="dialog">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/35 cursor-default"
                        aria-label="Close profile modal"
                        onClick={() => setProfileOpen(false)}
                    />
                    <div className="absolute left-5 bottom-4 w-[calc(18rem-2.5rem)] max-w-[calc(18rem-2.5rem)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in">
                        <div className="p-4 border-b border-border/70">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <img
                                        src={profileIcon}
                                        alt={`${profileName} profile`}
                                        className="w-11 h-11 flex-shrink-0 rounded-full object-cover bg-background/60 border border-white/10"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = logoUrl();
                                        }}
                                    />
                                    <div className="min-w-0">
                                        <p className="text-base font-black text-text truncate">{profileName}</p>
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-plex font-bold mt-0.5">{providerName} Profile</p>
                                        {profileEmail && <p className="text-xs text-muted truncate mt-1">{profileEmail}</p>}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setProfileOpen(false)}
                                    className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-colors shrink-0"
                                    aria-label="Close profile modal"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-4">
                            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted font-bold">
                                <Palette className="w-3.5 h-3.5 text-plex" />
                                Theme
                            </div>
                            <CustomSelect
                                value={activeTheme}
                                onChange={setActiveTheme}
                                compact={true}
                                className="w-full"
                                options={[
                                    { label: 'Dynamic (Chameleon)', value: 'dynamic' },
                                    { label: 'Plex Dark', value: 'plex' },
                                    { label: 'Sleek Slate', value: 'slate' },
                                    { label: 'Nordic Frost', value: 'nordic' },
                                    { label: 'Jellyfin Purple', value: 'jellyfin' },
                                    { label: 'Emerald Green', value: 'emerald' },
                                    { label: 'Neon Midnight', value: 'midnight' },
                                    { label: 'Crimson Red', value: 'crimson' },
                                    { label: 'Deep Amethyst', value: 'amethyst' },
                                    { label: 'Sunset Orange', value: 'sunset' },
                                    { label: 'Ocean Teal', value: 'ocean' },
                                    { label: 'Rose Pink', value: 'rose' },
                                    { label: 'Royal Blue', value: 'royal' },
                                    { label: 'Graphite', value: 'graphite' },
                                    { label: 'Cyber Lime', value: 'cyberlime' },
                                    { label: 'Aurora', value: 'aurora' },
                                ]}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setProfileOpen(false);
                                    onLogout();
                                }}
                                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 hover:bg-red-500/20 hover:border-red-400/50 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {installHelpOpen && (
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm animate-fade-in flex items-center justify-center p-4" aria-modal="true" role="dialog">
                    <button
                        type="button"
                        className="absolute inset-0 cursor-default"
                        aria-label="Close install help"
                        onClick={() => setInstallHelpOpen(false)}
                    />
                    <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-5">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-plex/10 border border-plex/25 flex items-center justify-center text-plex">
                                    <MonitorSmartphone className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-text">Install App</h3>
                                    <p className="text-xs text-muted">{serverName} Portal</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setInstallHelpOpen(false)}
                                className="p-2 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-colors"
                                aria-label="Close install help"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-sm text-muted leading-relaxed">
                            {isFirefoxMobile ? (
                                <>
                                    Tap the Firefox menu <span className="text-text font-semibold">(⋮)</span>, then choose{' '}
                                    <span className="text-text font-semibold">Install</span>.
                                    Use your public <span className="text-text font-semibold">HTTPS</span> URL — not a plain http://IP address.
                                </>
                            ) : (
                                <>
                                    Use your browser menu and choose <span className="text-text font-semibold">Install app</span> or <span className="text-text font-semibold">Add to Home Screen</span>.
                                </>
                            )}
                        </p>
                        {installDiag && (
                            <ul className="mt-4 space-y-2 rounded-xl border border-border bg-background/40 p-3 text-xs text-muted">
                                {installDiag.map((note) => (
                                    <li key={note} className="leading-relaxed">• {note}</li>
                                ))}
                            </ul>
                        )}
                        {!installDiag && installHelpOpen && (
                            <p className="mt-4 text-xs text-muted">Checking install requirements…</p>
                        )}
                        {isFirefoxMobile && (
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        if ('serviceWorker' in navigator) {
                                            const regs = await navigator.serviceWorker.getRegistrations();
                                            await Promise.all(regs.map((reg) => reg.unregister()));
                                        }
                                        if ('caches' in window) {
                                            const keys = await caches.keys();
                                            await Promise.all(keys.map((key) => caches.delete(key)));
                                        }
                                    } catch { /* ignore */ }
                                    window.location.reload();
                                }}
                                className="mt-3 w-full inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-bold text-text hover:bg-white/5 transition-colors"
                            >
                                Reset install data & reload
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setInstallHelpOpen(false)}
                            className="mt-3 w-full inline-flex items-center justify-center rounded-xl bg-plex px-4 py-3 text-sm font-bold text-background hover:bg-plex-hover transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile Bottom Nav
                Chrome / PWA Chromium: plain fixed bottom:0 (do not change).
                Firefox mobile: dock bar to visualViewport bottom (Firefox-only hook). */}
            {(() => {
                const maxPrimary = MOBILE_NAV_PRIMARY_SLOTS;
                const showMore = normalizedNavOrder.length > maxPrimary;
                const primary = showMore ? normalizedNavOrder.slice(0, maxPrimary) : normalizedNavOrder;
                const navButtons = (
                    <>
                        {primary.map((key) => {
                            const item = navItemsConfig[key];
                            if (!item) return null;
                            const isCurrent = item.route ? isNavCurrent(key, item.route) : false;
                            const labelOverride = key === 'mediastack' ? 'Calendar' : key === 'request' ? 'Request' : item.label;
                            return renderNavAction(key, { ...item, label: labelOverride }, { mobile: true, isCurrent, compactLabel: labelOverride, badgeCount: getNavBadgeCount(key) });
                        })}
                        {showMore && (
                            <button
                                type="button"
                                className={`relative flex flex-col items-center justify-center gap-1 h-full flex-1 min-w-[4.25rem] px-1 text-center text-[0.65rem] transition-colors bg-transparent border-0 ${
                                    mobileMoreOpen ? 'text-plex font-bold' : 'text-muted hover:text-text'
                                }`}
                                onClick={() => setMobileMoreOpen((open) => !open)}
                            >
                                <span className="relative shrink-0">
                                    <MoreHorizontal className="w-5 h-5" />
                                </span>
                                <span>More</span>
                            </button>
                        )}
                    </>
                );
                const navInner = (
                    <div className="flex items-center justify-between w-full h-16 px-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
                        {navButtons}
                    </div>
                );

                if (firefoxMobileNav && typeof document !== 'undefined') {
                    // Portal to body so no ancestor creates a fixed containing block.
                    // Hook sets top from visualViewport; bleed fills any gesture-bar gap.
                    return ReactDOM.createPortal(
                        <div
                            ref={firefoxNavBarRef}
                            className="md:hidden fixed left-0 w-screen max-w-none nav-shell border-t z-[310] pb-[env(safe-area-inset-bottom,0px)]"
                            style={{ bottom: 0 }}
                        >
                            {navInner}
                            <div
                                className="absolute left-0 w-screen max-w-none nav-shell pointer-events-none"
                                style={{ top: '100%', height: 120, borderTop: 'none' }}
                                aria-hidden="true"
                            />
                        </div>,
                        document.body
                    );
                }

                return (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 w-full nav-shell border-t z-[310] pb-[env(safe-area-inset-bottom)]">
                        {navInner}
                    </div>
                );
            })()}

            {/* Mobile More Drawer — above bottom nav (incl. Firefox body-portaled bar) */}
            {mobileMoreOpen && (
                <div className="md:hidden fixed inset-0 z-[320] bg-black/60 backdrop-blur-sm animate-fade-in flex flex-col justify-end" onClick={() => setMobileMoreOpen(false)}>
                    <div className="bg-card border-t border-border rounded-t-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-white/5">
                            <h3 className="font-bold text-text">More Menu</h3>
                            <button className="text-muted hover:text-text p-1 bg-white/5 rounded-full" onClick={() => setMobileMoreOpen(false)}><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 grid grid-cols-4 gap-4">
                            {(() => {
                                const maxPrimary = MOBILE_NAV_PRIMARY_SLOTS;
                                const secondary = normalizedNavOrder.length > maxPrimary ? normalizedNavOrder.slice(maxPrimary) : [];
                                return secondary.map(key => {
                                    const item = navItemsConfig[key];
                                    if (!item) return null;
                                    const isCurrent = item.route ? isNavCurrent(key, item.route) : false;
                                    const labelOverride = key === 'mediastack' ? 'Calendar' : key === 'request' ? 'Request' : item.label;
                                    const handleActivate = () => {
                                        setMobileMoreOpen(false);
                                        if (item.href) window.open(item.href, '_blank');
                                        else if (item.onClick) item.onClick({ preventDefault: () => {} });
                                        else if (item.route) onNavigate(item.route as any);
                                    };
                                    const badgeCount = getNavBadgeCount(key);
                                    return (
                                        <button key={key} onClick={handleActivate} className="flex flex-col items-center gap-2 relative bg-transparent border-0">
                                            <div className={`w-[3.25rem] h-[3.25rem] rounded-full flex items-center justify-center transition-colors ${isCurrent ? 'bg-plex text-background shadow-[0_0_15px_rgba(229,160,13,0.35)]' : 'bg-background/50 text-text hover:bg-white/10 border border-white/5'}`}>
                                                <item.icon className="w-6 h-6" />
                                            </div>
                                            {badgeCount > 0 && (
                                                <span className="absolute -top-1 -right-1 min-w-[18px] h-4.5 px-1 rounded-full bg-plex text-background text-[10px] font-bold flex items-center justify-center leading-none">
                                                    {badgeCount > 9 ? '9+' : badgeCount}
                                                </span>
                                            )}
                                            <span className={`text-[10px] text-center w-full truncate px-1 ${isCurrent ? 'text-plex font-bold' : 'text-muted'}`}>{labelOverride}</span>
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                        <div className="pb-[calc(env(safe-area-inset-bottom)+1rem)]"></div>
                    </div>
                </div>
            )}
        </>
    );
};

export const PublicInviteClaim: React.FC<{ code: string }> = ({ code }) => {
    const [info, setInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [claimed, setClaimed] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);

    useEffect(() => {
        apiFetch(`/api/invites/${code}/info`).then(setInfo).catch(e => setError(e.message || 'Invalid invite link'));
    }, [code]);

    const handleClaim = useCallback(async (token: string) => {
        setIsClaiming(true);
        try {
            await apiFetch(`/api/invites/${code}/claim`, {
                method: 'POST',
                body: JSON.stringify({ pinId: token })
            });
            setClaimed(true);
        } catch (e: any) {
            setError(e.message || 'Failed to claim invite');
        } finally {
            setIsClaiming(false);
        }
    }, [code]);

    useEffect(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#auth/')) {
            const token = hash.split('/')[1];
            if (token) {
                window.location.hash = ''; // clear hash
                handleClaim(token);
            }
        }
    }, [handleClaim]);

    const handlePlexLogin = async () => {
        setIsClaiming(true);
        setError(null);
        try {
            const data = await apiFetch('/api/auth/plex/login', { method: 'POST' });
            const clientId = data.clientIdentifier || data.clientId || '';
            const forwardUrl = window.location.origin + portalUrl('/invite/' + code) + '#auth/' + data.id;
            const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}&code=${data.code}&context[device][product]=Server%20Manager%20Portal&forwardUrl=${encodeURIComponent(forwardUrl)}`;
            window.location.href = authUrl;
        } catch (error) {
            setError('Failed to initiate Plex login');
            setIsClaiming(false);
        }
    };

    if (error) return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-md w-full animate-fade-in mx-auto px-4 mt-20">
            <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-2xl w-full">
                <h2 className="text-2xl font-bold text-red-500 mb-4">Invite Error</h2>
                <p className="text-text">{error}</p>
                <a href={portalUrl('/')} className="mt-6 inline-block text-plex hover:underline font-bold">Return to Home</a>
            </div>
        </div>
    );

    if (claimed) return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-md w-full animate-fade-in mx-auto px-4 mt-20">
            <div className="bg-green-500/10 border border-green-500/30 p-8 rounded-2xl w-full">
                <h2 className="text-3xl font-bold text-green-500 mb-4">Success!</h2>
                <p className="text-text mb-6">You have successfully claimed your invite to <strong className="text-plex">{info?.serverName}</strong>. Check your email or open Plex to accept the shared server invite!</p>
                <a href={portalUrl('/')} className="inline-block px-6 py-3 bg-plex text-background font-bold rounded-lg hover:bg-plex-hover transition-colors shadow-lg">Go to Dashboard</a>
            </div>
        </div>
    );

    if (!info) return <Loader isLoading={true} />;

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-lg w-full animate-fade-in mx-auto px-4 mt-20">
            <div className="relative mb-8">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-plex rounded-full blur-[50px] opacity-20 pointer-events-none"></div>
                {info.customLogoUrl || info.thumb ? (
                    <img src={resolvePortalAssetUrl(info.customLogoUrl || info.thumb)} alt="Server Logo" className="w-32 h-32 object-cover rounded-full border-2 border-plex drop-shadow-[0_0_15px_rgba(229,160,13,0.25)] relative z-10" onError={(e) => { e.currentTarget.src = logoUrl(); e.currentTarget.className = 'w-40 object-contain drop-shadow-[0_0_15px_rgba(229,160,13,0.25)] relative z-10'; }} />
                ) : (
                    <img src={logoUrl()} alt="Server Logo" className="w-40 object-contain drop-shadow-[0_0_15px_rgba(229,160,13,0.25)] relative z-10" onError={(e) => e.currentTarget.style.display = 'none'} />
                )}
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-text mb-4">You've been invited!</h1>
            <p className="text-xl text-muted mb-8 leading-relaxed">
                You have been invited to join <strong className="text-plex">{info.serverName}</strong> for a period of <strong className="text-plex">{info.durationDays} days</strong>.
            </p>

            {info.showPublicLibraryStats !== false && (
                <div className="w-full mb-8">
                    <LivePlexStats />
                </div>
            )}

            <button
                onClick={handlePlexLogin}
                disabled={isClaiming}
                className="w-full max-w-sm px-6 py-4 bg-plex text-background text-lg font-bold rounded-xl hover:bg-plex-hover transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-plex/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isClaiming ? 'Claiming...' : 'Sign in with Plex to Claim'}
            </button>
            <p className="mt-6 text-sm text-muted">You will be redirected to Plex.tv to securely authenticate your account.</p>
        </div>
    );
};

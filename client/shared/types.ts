import type { ReactNode } from 'react';

export interface User {
    id: string;
    username: string;
    email?: string;
    thumb?: string;
    joiningDate: string;
    expiryDate: string | null;
    plexAccessStatus: 'active' | 'pending' | 'revoked' | 'unknown';
    exemptFromCleanup?: boolean;
    isTrial?: boolean;
    optOutNewsletter?: boolean;
    lastLogin?: string;
    requestOverrides?: {
        movieQuotaLimit?: number | null;
        movieQuotaDays?: number | null;
        tvQuotaLimit?: number | null;
        tvQuotaDays?: number | null;
        fourKQuotaLimit?: number | null;
        fourKQuotaDays?: number | null;
        allowRequestMovies?: boolean | null;
        allowRequestTv?: boolean | null;
        allowRequest4kMovies?: boolean | null;
        allowRequest4kTv?: boolean | null;
        allowAdvancedRequests?: boolean | null;
    };
}

export interface PlexConfig {
    token: string;
    mediaServerType?: 'plex' | 'jellyfin' | 'emby';
    serverIdentifier: string;
    jellyfinUrl?: string;
    jellyfinApiKey?: string;
    checkIntervalMinutes: number;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpSecure: boolean;
    emailDaysBefore: number;
    gotifyEnabled?: boolean;
    gotifyUrl?: string;
    gotifyToken?: string;
    gotifyPriority?: number;
    alertRules?: Record<string, boolean>;
    newsletterFrequency: string;
    newsletterDay: number;
    publicDomain: string;
    requestUrl?: string;
    contactUrl?: string;
}

export interface ArrInstance {
    id: string;
    type: 'sonarr' | 'radarr' | 'lidarr' | 'bazarr';
    name: string;
    url: string;
    externalUrl?: string;
    apiKey: string;
    enabled: boolean;
    isDefault: boolean;
    /** When true, Discover request modal routes UHD/4K requests to this instance. */
    is4k?: boolean;
    plexLibraryIds?: string[];
}

export interface DownloadClientConfig {
    id: string;
    type: 'qbittorrent' | 'transmission' | 'bittorrent' | 'deluge' | 'sabnzbd';
    name: string;
    url: string;
    username?: string;
    password?: string;
    enabled: boolean;
}

export interface AppSettings {
    token?: string;
    mediaServerType?: 'plex' | 'jellyfin' | 'emby';
    serverIdentifier?: string;
    jellyfinUrl?: string;
    jellyfinApiKey?: string;
    checkIntervalMinutes: number;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
    smtpSecure?: boolean;
    emailDaysBefore?: number;
    gotifyEnabled?: boolean;
    gotifyUrl?: string;
    gotifyToken?: string;
    gotifyPriority?: number;
    alertRules?: Record<string, boolean>;
    newsletterFrequency?: string;
    newsletterDay?: number;
    publicDomain?: string;
    requestUrl?: string;
    contactUrl?: string;
    inactiveCleanupEnabled?: boolean;
    inactiveCleanupDays?: number;
    sonarrUrl?: string;
    sonarrApiKey?: string;
    radarrUrl?: string;
    radarrApiKey?: string;
    arrInstances?: ArrInstance[];
    downloadClients?: DownloadClientConfig[];
    tautulliUrl?: string;
    tautulliApiKey?: string;
    jellystatUrl?: string;
    jellystatApiKey?: string;
    primaryColor?: string;
    customLogoUrl?: string;
    sidebarIdentityPosition?: 'top' | 'bottom';
    backgroundImageUrl?: string;
    navOrder?: string[];
    /** Server-wide nav keys hidden from the sidebar/mobile bar (Settings → Navigation). */
    navHiddenKeys?: string[];
}

export interface PlexServer {
    name: string;
    identifier: string;
}

export interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error';
}

export interface DeletedUser {
    blockId: string;
    id?: string;
    plexId?: string;
    username?: string;
    email?: string;
    deletedAt?: string;
    deletedBy?: string;
}

export interface AuditEntry {
    id: string;
    timestamp: string;
    event: string;
    actor?: { username?: string; email?: string; isAdmin?: boolean } | null;
    target?: { username?: string; email?: string } | null;
    details?: Record<string, any>;
}

export type UserStatus = 'active' | 'expiring' | 'expired';

export interface CustomSelectProps {
    id?: string;
    value: string | number;
    onChange: (value: string) => void;
    options: { label: string; value: string | number; icon?: ReactNode; isGroup?: boolean }[];
    className?: string;
    compact?: boolean;
}

import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, MoreHorizontal, Shield, Users } from 'lucide-react';
import {
    ALWAYS_VISIBLE_MEMBER_NAV_KEYS,
    ALWAYS_VISIBLE_NAV_KEYS,
    getNavItemLabel,
    MOBILE_NAV_PRIMARY_SLOTS,
    normalizeMemberNavHiddenKeys,
    normalizeNavHiddenKeys,
} from '../shared/nav';
import { SettingsToggleRow } from '../shared/ui';
import { SettingHint } from './SettingHint';

type NavFeatureStatus = {
    upgrader?: boolean;
    collexions?: boolean;
    scanner?: boolean;
    mediaAutomation?: boolean;
    posterSets?: boolean;
    achievements?: boolean;
    maintenance?: boolean;
};

type Props = {
    navOrder: string[];
    onChange: (next: string[]) => void;
    navHiddenKeys: string[];
    onHiddenKeysChange: (next: string[]) => void;
    memberNavOrder: string[];
    onMemberNavOrderChange: (next: string[]) => void;
    memberNavHiddenKeys: string[];
    onMemberNavHiddenKeysChange: (next: string[]) => void;
    downloadsVisibleToMembers: boolean;
    onDownloadsVisibleToMembersChange: (next: boolean) => void;
    /** When false, sidebar still hides these until enabled in their Settings section. */
    featureStatus?: NavFeatureStatus;
};

const FEATURE_OFF_HINT: Record<string, string> = {
    upgrader: 'Feature off — enable under Settings → Library Upgrader',
    collexions: 'Feature off — enable under Settings → ColleXions',
    scanner: 'Feature off — enable under Settings → Scanner',
    'media-automation': 'Feature off — enable under Settings → Media Automation',
    'poster-sets': 'Feature off — enable under Settings → Poster Sets',
    achievements: 'Feature off — enable under Settings → Achievements',
    maintenance: 'Feature off — enable under Settings → Cleanup',
};

const reorder = (items: string[], from: number, to: number): string[] => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
};

/** Keys that never appear in the mobile bottom bar / More menu. */
const isMobileNavKey = (key: string) => key !== 'logout' && key !== 'logs';

const vibrate = (pattern: number | number[]) => {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(pattern);
        }
    } catch {
        /* ignore unsupported / blocked vibration */
    }
};

type ColumnProps = {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accentClass: string;
    navOrder: string[];
    onChange: (next: string[]) => void;
    navHiddenKeys: string[];
    onHiddenKeysChange: (next: string[]) => void;
    alwaysVisibleKeys: Set<string>;
    normalizeHidden: (keys: string[]) => string[];
    downloadsVisibleToMembers: boolean;
    showAdminSuffix: boolean;
    featureStatus?: NavFeatureStatus;
    downloadsMembersNote?: string | null;
};

const NavOrderColumn: React.FC<ColumnProps> = ({
    title,
    subtitle,
    icon,
    accentClass,
    navOrder,
    onChange,
    navHiddenKeys,
    onHiddenKeysChange,
    alwaysVisibleKeys,
    normalizeHidden,
    downloadsVisibleToMembers,
    showAdminSuffix,
    featureStatus,
    downloadsMembersNote,
}) => {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
    const dragIndexRef = useRef<number | null>(null);
    const dropIndexRef = useRef<number | null>(null);
    const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

    const hiddenSet = useMemo(() => new Set(normalizeHidden(navHiddenKeys)), [navHiddenKeys, normalizeHidden]);
    const mobileKeys = useMemo(() => navOrder.filter(isMobileNavKey), [navOrder]);
    const moreStartsAtMobileIndex = mobileKeys.length > MOBILE_NAV_PRIMARY_SLOTS
        ? MOBILE_NAV_PRIMARY_SLOTS
        : null;

    const mobileIndexByKey = useMemo(() => {
        const map = new Map<string, number>();
        mobileKeys.forEach((key, index) => map.set(key, index));
        return map;
    }, [mobileKeys]);

    const commitReorder = (from: number, to: number, { haptic = false } = {}) => {
        if (from === to) return;
        onChange(reorder(navOrder, from, to));
        if (haptic) vibrate(18);
    };

    const toggleHidden = (key: string) => {
        if (alwaysVisibleKeys.has(key)) return;
        const next = new Set(hiddenSet);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onHiddenKeysChange(normalizeHidden([...next]));
        vibrate(10);
    };

    const indexFromClientY = (clientY: number) => {
        let nextIndex = navOrder.length - 1;
        for (let i = 0; i < itemRefs.current.length; i += 1) {
            const node = itemRefs.current[i];
            if (!node) continue;
            const rect = node.getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                nextIndex = i;
                break;
            }
        }
        return Math.max(0, Math.min(navOrder.length - 1, nextIndex));
    };

    const clearDragState = () => {
        dragIndexRef.current = null;
        dropIndexRef.current = null;
        setDragIndex(null);
        setDropIndex(null);
        setDragPoint(null);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragIndexRef.current = index;
        dropIndexRef.current = index;
        setDragIndex(index);
        setDropIndex(index);
        setDragPoint({ x: event.clientX, y: event.clientY });
        vibrate(12);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (dragIndexRef.current === null) return;
        setDragPoint({ x: event.clientX, y: event.clientY });
        const nextDrop = indexFromClientY(event.clientY);
        if (dropIndexRef.current !== nextDrop) {
            dropIndexRef.current = nextDrop;
            setDropIndex(nextDrop);
            vibrate(8);
        }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (dragIndexRef.current === null) return;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            /* already released */
        }
        const from = dragIndexRef.current;
        const to = dropIndexRef.current ?? from;
        clearDragState();
        if (from !== to) {
            vibrate([10, 30, 16]);
            commitReorder(from, to);
        } else {
            vibrate(6);
        }
    };

    const handlePointerCancel = () => {
        clearDragState();
        vibrate(6);
    };

    const draggingKey = dragIndex != null ? navOrder[dragIndex] : null;

    return (
        <div className="min-w-0 rounded-2xl border border-border/70 bg-background/20 p-4">
            <div className="mb-4 flex items-start gap-3">
                <div className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${accentClass}`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <h4 className="text-base font-bold text-text">{title}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{subtitle}</p>
                    {downloadsMembersNote ? (
                        <p className="mt-2 text-[11px] font-semibold text-yellow-300/90">{downloadsMembersNote}</p>
                    ) : null}
                </div>
            </div>

            <div className={`relative flex flex-col gap-2 select-none ${dragIndex !== null ? 'cursor-grabbing' : ''}`}>
                {navOrder.map((key, index) => {
                    const mobileIndex = mobileIndexByKey.get(key);
                    const inMobileBar = mobileIndex !== undefined
                        && (moreStartsAtMobileIndex === null || mobileIndex < moreStartsAtMobileIndex);
                    const inMoreMenu = mobileIndex !== undefined
                        && moreStartsAtMobileIndex !== null
                        && mobileIndex >= moreStartsAtMobileIndex;
                    const showMoreDivider = moreStartsAtMobileIndex !== null
                        && mobileIndex === moreStartsAtMobileIndex;
                    const isAlwaysVisible = alwaysVisibleKeys.has(key);
                    const isHidden = hiddenSet.has(key);
                    const featureOffHint = (() => {
                        if (key === 'upgrader' && featureStatus?.upgrader === false) return FEATURE_OFF_HINT.upgrader;
                        if (key === 'collexions' && featureStatus?.collexions === false) return FEATURE_OFF_HINT.collexions;
                        if (key === 'scanner' && featureStatus?.scanner === false) return FEATURE_OFF_HINT.scanner;
                        if (key === 'media-automation' && featureStatus?.mediaAutomation === false) return FEATURE_OFF_HINT['media-automation'];
                        if (key === 'poster-sets' && featureStatus?.posterSets === false) return FEATURE_OFF_HINT['poster-sets'];
                        if (key === 'achievements' && featureStatus?.achievements === false) return FEATURE_OFF_HINT.achievements;
                        if (key === 'maintenance' && featureStatus?.maintenance === false) return FEATURE_OFF_HINT.maintenance;
                        return null;
                    })();

                    const isDragging = dragIndex === index;
                    const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;
                    const insertBefore = isDropTarget && dragIndex !== null && dropIndex < dragIndex;
                    const insertAfter = isDropTarget && dragIndex !== null && dropIndex > dragIndex;

                    return (
                        <React.Fragment key={key}>
                            {showMoreDivider && (
                                <div className="flex items-center gap-3 pt-3 pb-1">
                                    <div className="h-px flex-1 bg-border/70" />
                                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                        Mobile More menu
                                    </span>
                                    <div className="h-px flex-1 bg-border/70" />
                                </div>
                            )}

                            <div
                                ref={(node) => { itemRefs.current[index] = node; }}
                                data-nav-order-index={index}
                                className={`relative flex items-center gap-2 rounded-xl border bg-background/30 px-3 py-3 transition-[transform,box-shadow,opacity,border-color,background-color] duration-150 sm:gap-3
                                    ${isDragging ? 'scale-[0.985] border-plex/50 bg-plex/5 opacity-40 shadow-inner' : 'border-border/40'}
                                    ${isDropTarget ? 'border-plex bg-plex/10 ring-2 ring-plex/35' : ''}
                                    ${inMoreMenu && !isDropTarget ? 'border-dashed border-border/50 bg-white/[0.02]' : ''}
                                    ${isHidden && !isDropTarget ? 'border-dashed border-border/50 opacity-55' : ''}
                                    ${!isMobileNavKey(key) ? 'opacity-70' : ''}`}
                            >
                                {insertBefore && (
                                    <div className="pointer-events-none absolute -top-1.5 left-3 right-3 h-1 rounded-full bg-plex shadow-[0_0_12px_rgba(229,160,13,0.55)]" />
                                )}
                                {insertAfter && (
                                    <div className="pointer-events-none absolute -bottom-1.5 left-3 right-3 h-1 rounded-full bg-plex shadow-[0_0_12px_rgba(229,160,13,0.55)]" />
                                )}

                                <button
                                    type="button"
                                    aria-label={`Drag to reorder ${getNavItemLabel(key)}`}
                                    onPointerDown={(e) => handlePointerDown(e, index)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerCancel}
                                    className={`-ml-1 shrink-0 touch-none rounded-lg p-1.5 transition-colors cursor-grab active:cursor-grabbing
                                        ${isDragging ? 'bg-plex/15 text-plex' : 'text-muted hover:bg-white/5 hover:text-text active:scale-95 active:bg-white/10'}`}
                                >
                                    <GripVertical className="h-5 w-5" aria-hidden />
                                </button>

                                <div className="min-w-0 flex-1">
                                    <div className="font-medium text-text">
                                        {getNavItemLabel(key, {
                                            adminSuffix: showAdminSuffix,
                                            downloadsMembersVisible: downloadsVisibleToMembers,
                                        })}
                                    </div>
                                    {isHidden ? (
                                        <p className="mt-0.5 text-[11px] text-yellow-300/90">Hidden from navigation</p>
                                    ) : featureOffHint ? (
                                        <p className="mt-0.5 text-[11px] text-yellow-300/90">{featureOffHint}</p>
                                    ) : !isMobileNavKey(key) ? (
                                        <p className="mt-0.5 text-[11px] text-muted">Not shown in the mobile bottom bar</p>
                                    ) : null}
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    {inMobileBar && moreStartsAtMobileIndex !== null && !isHidden && (
                                        <span className="hidden rounded-md border border-plex/25 bg-plex/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-plex/90 lg:inline">
                                            Mobile bar
                                        </span>
                                    )}
                                    {inMoreMenu && !isHidden && (
                                        <span className="hidden rounded-md border border-border/60 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted lg:inline">
                                            More
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        aria-label={
                                            isAlwaysVisible
                                                ? `${getNavItemLabel(key)} cannot be hidden`
                                                : (isHidden ? `Show ${getNavItemLabel(key)}` : `Hide ${getNavItemLabel(key)}`)
                                        }
                                        title={
                                            isAlwaysVisible
                                                ? 'Always visible'
                                                : (isHidden ? 'Show in navigation' : 'Hide from navigation')
                                        }
                                        disabled={isAlwaysVisible}
                                        onClick={() => toggleHidden(key)}
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors
                                            ${isAlwaysVisible
                                                ? 'cursor-not-allowed border-border/40 bg-white/[0.02] text-muted/40'
                                                : isHidden
                                                    ? 'border-yellow-500/35 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/15'
                                                    : 'border-border/60 bg-white/[0.03] text-muted hover:border-plex/40 hover:text-text active:scale-90'}`}
                                    >
                                        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Move ${getNavItemLabel(key)} up`}
                                        disabled={index === 0}
                                        onClick={() => commitReorder(index, index - 1, { haptic: true })}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-white/[0.03] text-muted transition-transform hover:border-plex/40 hover:text-text active:scale-90 active:bg-plex/15 disabled:pointer-events-none disabled:opacity-30"
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Move ${getNavItemLabel(key)} down`}
                                        disabled={index === navOrder.length - 1}
                                        onClick={() => commitReorder(index, index + 1, { haptic: true })}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-white/[0.03] text-muted transition-transform hover:border-plex/40 hover:text-text active:scale-90 active:bg-plex/15 disabled:pointer-events-none disabled:opacity-30"
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}

                {draggingKey && dragPoint && (
                    <div
                        className="pointer-events-none fixed z-[80] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-plex/50 bg-card/95 px-3 py-3 shadow-2xl shadow-black/40 ring-1 ring-plex/30 backdrop-blur-md"
                        style={{ left: dragPoint.x, top: dragPoint.y }}
                        aria-hidden
                    >
                        <div className="flex items-center gap-3">
                            <GripVertical className="h-5 w-5 shrink-0 text-plex" />
                            <p className="truncate text-sm font-bold text-text">
                                {getNavItemLabel(draggingKey, {
                                    adminSuffix: showAdminSuffix,
                                    downloadsMembersVisible: downloadsVisibleToMembers,
                                })}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {moreStartsAtMobileIndex === null ? (
                <p className="mt-4 text-xs text-muted">
                    All mobile-visible items currently fit in the bottom bar — no More menu yet.
                </p>
            ) : (
                <p className="mt-4 text-xs text-muted">
                    Items below the divider open from the mobile More button.
                </p>
            )}
        </div>
    );
};

export const NavigationOrderSettings: React.FC<Props> = ({
    navOrder,
    onChange,
    navHiddenKeys,
    onHiddenKeysChange,
    memberNavOrder,
    onMemberNavOrderChange,
    memberNavHiddenKeys,
    onMemberNavHiddenKeysChange,
    downloadsVisibleToMembers,
    onDownloadsVisibleToMembersChange,
    featureStatus,
}) => (
    <div className="mb-8 animate-fade-in">
        <h3 className="mb-4 border-b border-border pb-2 text-xl font-bold text-plex">Navigation Order</h3>
        <p className="mb-2 max-w-3xl text-sm text-muted">
            Set separate layouts for admins and members. Drag the handle to reorder, or use the arrows.
            The first {MOBILE_NAV_PRIMARY_SLOTS} items stay in the mobile bottom bar; the rest move into More.
        </p>
        <p className="mb-4 max-w-3xl text-xs text-muted">
            Use the eye icon to hide items from that audience. Home stays visible for everyone; Settings and Logout stay visible for admins.
            Feature-gated items also need their Settings toggles turned on before they appear.
        </p>

        <div className="mb-6 max-w-xl rounded-xl border border-border/70 bg-background/30 p-4">
            <SettingsToggleRow
                title="Show Downloads to members"
                hint={(
                    <SettingHint>
                        When off, Downloads stays available in the admin layout only. Members will not see the tab or the download status page — even if it is enabled in the Users column.
                    </SettingHint>
                )}
                checked={downloadsVisibleToMembers}
                onChange={onDownloadsVisibleToMembersChange}
                border={false}
            />
            <p className={`mt-2 text-xs font-semibold ${downloadsVisibleToMembers ? 'text-green-300' : 'text-yellow-300'}`}>
                Members: {downloadsVisibleToMembers ? 'can see Downloads' : 'Downloads hidden'}
            </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
            <NavOrderColumn
                title="Admins"
                subtitle="Full portal nav — admin-only tools stay here."
                icon={<Shield className="h-4 w-4 text-plex" />}
                accentClass="border-plex/35 bg-plex/10 text-plex"
                navOrder={navOrder}
                onChange={onChange}
                navHiddenKeys={navHiddenKeys}
                onHiddenKeysChange={onHiddenKeysChange}
                alwaysVisibleKeys={ALWAYS_VISIBLE_NAV_KEYS}
                normalizeHidden={normalizeNavHiddenKeys}
                downloadsVisibleToMembers={downloadsVisibleToMembers}
                showAdminSuffix
                featureStatus={featureStatus}
            />
            <NavOrderColumn
                title="Users"
                subtitle="What non-admins see in the sidebar and mobile bar."
                icon={<Users className="h-4 w-4 text-sky-300" />}
                accentClass="border-sky-500/35 bg-sky-500/10 text-sky-200"
                navOrder={memberNavOrder}
                onChange={onMemberNavOrderChange}
                navHiddenKeys={memberNavHiddenKeys}
                onHiddenKeysChange={onMemberNavHiddenKeysChange}
                alwaysVisibleKeys={ALWAYS_VISIBLE_MEMBER_NAV_KEYS}
                normalizeHidden={normalizeMemberNavHiddenKeys}
                downloadsVisibleToMembers={downloadsVisibleToMembers}
                showAdminSuffix={false}
                downloadsMembersNote={
                    !downloadsVisibleToMembers
                        ? 'Downloads is forced off for members by the toggle above.'
                        : null
                }
            />
        </div>
    </div>
);

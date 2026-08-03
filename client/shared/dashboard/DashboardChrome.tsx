import React from 'react';

export type DashboardAccent = 'plex' | 'sky' | 'amber' | 'emerald' | 'violet' | 'rose';

const ACCENT: Record<DashboardAccent, {
    eyebrow: string;
    chip: string;
    heroGradient: string;
    blob: string;
}> = {
    plex: {
        eyebrow: 'text-plex/90',
        chip: 'border-plex/30 bg-plex/15',
        heroGradient: 'bg-gradient-to-br from-plex/15 via-background/40 to-amber-500/10',
        blob: 'bg-plex/10',
    },
    sky: {
        eyebrow: 'text-sky-300/90',
        chip: 'border-sky-400/30 bg-sky-500/15',
        heroGradient: 'bg-gradient-to-br from-sky-500/10 via-background/40 to-plex/10',
        blob: 'bg-sky-400/10',
    },
    amber: {
        eyebrow: 'text-amber-300/90',
        chip: 'border-amber-400/30 bg-amber-500/15',
        heroGradient: 'bg-gradient-to-br from-amber-500/10 via-background/40 to-plex/10',
        blob: 'bg-amber-400/10',
    },
    emerald: {
        eyebrow: 'text-emerald-300/90',
        chip: 'border-emerald-400/30 bg-emerald-500/15',
        heroGradient: 'bg-gradient-to-br from-emerald-500/10 via-background/40 to-plex/10',
        blob: 'bg-emerald-400/10',
    },
    violet: {
        eyebrow: 'text-violet-300/90',
        chip: 'border-violet-400/30 bg-violet-500/15',
        heroGradient: 'bg-gradient-to-br from-violet-500/10 via-background/40 to-plex/10',
        blob: 'bg-violet-400/10',
    },
    rose: {
        eyebrow: 'text-rose-300/90',
        chip: 'border-rose-400/30 bg-rose-500/15',
        heroGradient: 'bg-gradient-to-br from-rose-500/10 via-background/40 to-plex/10',
        blob: 'bg-rose-400/10',
    },
};

export const dashboardGlowClass = (accent: DashboardAccent | string) => {
    const map: Record<string, string> = {
        plex: 'bg-plex/20',
        sky: 'bg-sky-400/20',
        amber: 'bg-amber-400/20',
        emerald: 'bg-emerald-400/20',
        violet: 'bg-violet-400/20',
        rose: 'bg-rose-400/20',
        muted: 'bg-white/10',
    };
    return map[accent] || map.muted;
};

export const DashboardPageShell: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className = '',
}) => (
    <div className={`flex w-full animate-fade-in flex-col gap-6 pb-10 ${className}`.trim()}>
        {children}
    </div>
);

export const DashboardHero: React.FC<{
    accent?: DashboardAccent;
    eyebrow: string;
    title: string;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    secondaryBlob?: boolean;
}> = ({
    accent = 'plex',
    eyebrow,
    title,
    description,
    icon,
    actions,
    secondaryBlob = false,
}) => {
    const tone = ACCENT[accent];
    return (
        <div className={`relative overflow-hidden rounded-2xl border border-white/10 ${tone.heroGradient} p-5 md:p-6`}>
            <div className={`pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full blur-3xl ${tone.blob}`} />
            {secondaryBlob ? (
                <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-plex/5 blur-3xl" />
            ) : null}
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <div className={`mb-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] ${tone.eyebrow}`}>
                        {icon ? (
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${tone.chip}`}>
                                {icon}
                            </span>
                        ) : null}
                        {eyebrow}
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-text md:text-4xl">{title}</h1>
                    {description ? (
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted md:text-[15px]">
                            {description}
                        </p>
                    ) : null}
                </div>
                {actions ? (
                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                        {actions}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export const DashboardStatCard: React.FC<{
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    icon: React.ReactNode;
    glow?: string;
    valueClassName?: string;
}> = ({ label, value, hint, icon, glow = 'bg-white/10', valueClassName = '' }) => (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
        <div className={`pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl ${glow}`} />
        <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{label}</p>
                <p className={`mt-1.5 text-2xl font-black tabular-nums tracking-tight text-text md:text-3xl ${valueClassName}`.trim()}>
                    {value}
                </p>
                {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                {icon}
            </div>
        </div>
    </div>
);

export const DashboardPanel: React.FC<{
    title: string;
    subtitle?: string;
    badge?: React.ReactNode;
    controls?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}> = ({ title, subtitle, badge, controls, children, className = '' }) => (
    <section className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.035] to-black/25 p-4 shadow-xl md:p-5 ${className}`.trim()}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight text-text">{title}</h2>
                {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
            </div>
            {(controls || badge) ? (
                <div className="flex flex-wrap items-center gap-2">
                    {controls}
                    {badge}
                </div>
            ) : null}
        </div>
        {children}
    </section>
);

export const DashboardSubnav: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className = '',
}) => (
    <nav className={`hidden md:flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-1 no-scrollbar ${className}`.trim()}>
        {children}
    </nav>
);

export const dashboardSubnavLinkClass = (isActive: boolean) => (
    isActive
        ? 'bg-plex text-background shadow-md shadow-plex/25'
        : 'text-muted hover:bg-white/5 hover:text-text'
);

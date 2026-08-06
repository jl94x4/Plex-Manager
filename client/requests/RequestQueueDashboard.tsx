import React, { useState } from 'react';
import { AlertTriangle, Ban, ClipboardList } from 'lucide-react';
import {
    DashboardHero,
    DashboardPageShell,
    DashboardSubnav,
    dashboardSubnavLinkClass,
} from '../shared/dashboard/DashboardChrome';
import { RequestsAdminPanel } from './RequestsAdminPanel';
import { IssuesAdminPanel } from './IssuesAdminPanel';
import { BlocklistAdminPanel } from './BlocklistAdminPanel';

type QueueTab = 'requests' | 'issues' | 'blocklist';

type Props = {
    onCountsChange?: () => void;
    openIssueCount?: number;
};

export const RequestQueueDashboard: React.FC<Props> = ({ onCountsChange, openIssueCount = 0 }) => {
    const [tab, setTab] = useState<QueueTab>('requests');
    const [reviewRequestId, setReviewRequestId] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        const raw = new URLSearchParams(window.location.search).get('review');
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });

    return (
        <DashboardPageShell>
            <DashboardHero
                accent="amber"
                eyebrow="Requests"
                title="Review queue"
                description="Approve or decline portal requests, triage issues, and manage the blocklist."
                icon={<ClipboardList className="h-3.5 w-3.5" />}
                secondaryBlob
            />

            <DashboardSubnav className="!flex">
                <button
                    type="button"
                    onClick={() => setTab('requests')}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${dashboardSubnavLinkClass(tab === 'requests')}`}
                >
                    <ClipboardList className="h-4 w-4" />
                    Requests
                </button>
                <button
                    type="button"
                    onClick={() => setTab('issues')}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${dashboardSubnavLinkClass(tab === 'issues')}`}
                >
                    <AlertTriangle className="h-4 w-4" />
                    Issues
                    {openIssueCount > 0 && (
                        <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-black">
                            {openIssueCount > 99 ? '99+' : openIssueCount}
                        </span>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => setTab('blocklist')}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${dashboardSubnavLinkClass(tab === 'blocklist')}`}
                >
                    <Ban className="h-4 w-4" />
                    Blocklist
                </button>
            </DashboardSubnav>

            {tab === 'requests' ? (
                <RequestsAdminPanel
                    onCountsChange={onCountsChange}
                    embedded
                    initialReviewId={reviewRequestId}
                />
            ) : tab === 'issues' ? (
                <IssuesAdminPanel onCountsChange={onCountsChange} />
            ) : (
                <BlocklistAdminPanel />
            )}
        </DashboardPageShell>
    );
};

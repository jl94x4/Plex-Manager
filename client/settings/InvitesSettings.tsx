import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { getPublicOrigin } from '../shared/basePath';
import { appConfirm } from '../shared/confirm';
import { CustomSelect, SettingsToggleRow } from '../shared/ui';
import { Loader, ToastContainer, pushToast, type ToastMessage } from '../shared/toast';
import { getSettingsSectionElementId } from './settingsIndex';
import { SettingHint } from './SettingHint';
import { useDiscoverI18n } from '../discovery/i18n';
import type { User, AuditEntry, DeletedUser } from '../shared/types';
import { formatDateTime, formatEventName, hexToRgb, getDaysUntilExpiry, addMonths, addYears, formatDate } from '../shared/format';
export const InvitesSettings: React.FC<{
    addToast: (msg: string, type: 'success' | 'error') => void;
    publicDomain?: string;
    referralEnabled: boolean;
    setReferralEnabled: (value: boolean) => void;
    referralTrialDays: number;
    setReferralTrialDays: (value: number) => void;
    referralRewardDays: number;
    setReferralRewardDays: (value: number) => void;
}> = ({
    addToast,
    publicDomain = '',
    referralEnabled,
    setReferralEnabled,
    referralTrialDays,
    setReferralTrialDays,
    referralRewardDays,
    setReferralRewardDays,
}) => {
    const { t } = useDiscoverI18n();
    const inviteBaseUrl = useMemo(() => {
        const configured = String(publicDomain || '').trim().replace(/\/+$/, '');
        return configured || getPublicOrigin();
    }, [publicDomain]);
    const inviteUrlFor = useCallback((code: string) => `${inviteBaseUrl}/invite/${code}`, [inviteBaseUrl]);
    const [invites, setInvites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [durationDays, setDurationDays] = useState(30);
    const [maxUses, setMaxUses] = useState<string | number>(1);
    const [emailInvite, setEmailInvite] = useState('');
    const [emailNote, setEmailNote] = useState('');
    const [emailing, setEmailing] = useState(false);
    const [libraries, setLibraries] = useState<any[]>([]);
    const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);

    const fetchInvites = useCallback(async () => {
        try {
            const data = await apiFetch('/api/invites');
            setInvites(data);
            const libData = await apiFetch('/api/plex/libraries').catch(() => []);
            const libs = libData || [];
            setLibraries(libs);
            setSelectedLibraries(libs.map((l: any) => String(l.id)));
        } catch (e) {
            addToast(t('settings.invites.loadFailed'), 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, t]);

    useEffect(() => { fetchInvites(); }, [fetchInvites]);

    const handleCreate = async () => {
        try {
            const allIds = libraries.map((l) => String(l.id));
            const allSelected = allIds.length > 0 && allIds.every((id) => selectedLibraries.includes(id));
            const libraryIds = allSelected || selectedLibraries.length === 0 ? [] : selectedLibraries;
            await apiFetch('/api/invites', {
                method: 'POST',
                body: JSON.stringify({ durationDays, maxUses, libraryIds })
            });
            addToast(t('settings.invites.createSuccess'), 'success');
            fetchInvites();
        } catch (e: any) {
            addToast(e.message || t('settings.invites.createFailed'), 'error');
        }
    };

    const handleEmailInvite = async () => {
        if (!emailInvite) return addToast(t('settings.invites.emailRequired'), 'error');
        setEmailing(true);
        try {
            const allIds = libraries.map((l) => String(l.id));
            const allSelected = allIds.length > 0 && allIds.every((id) => selectedLibraries.includes(id));
            const libraryIds = allSelected || selectedLibraries.length === 0 ? [] : selectedLibraries;
            await apiFetch('/api/invites/email', {
                method: 'POST',
                body: JSON.stringify({ email: emailInvite, durationDays, libraryIds, note: emailNote.trim() || undefined })
            });
            addToast(t('settings.invites.emailSent'), 'success');
            setEmailInvite('');
            setEmailNote('');
            fetchInvites();
        } catch (e: any) {
            addToast(e.message || t('settings.invites.emailFailed'), 'error');
        } finally {
            setEmailing(false);
        }
    };

    const handleDelete = async (code: string) => {
        appConfirm(t('settings.invites.deleteConfirm'), async () => {
            try {
                await apiFetch(`/api/invites/${code}`, { method: 'DELETE' });
                addToast(t('settings.invites.deleteSuccess'), 'success');
                fetchInvites();
            } catch (e: any) {
                addToast(e.message || t('settings.invites.deleteFailed'), 'error');
            }
        });
    };

    const handleCopy = (code: string) => {
        navigator.clipboard.writeText(inviteUrlFor(code));
        addToast(t('settings.invites.copySuccess'), 'success');
    };

    if (loading) return <div className="text-muted">{t('settings.invites.loading')}</div>;

    return (
        <div className="animate-fade-in mb-8 space-y-10">
            <section id={getSettingsSectionElementId('referral')} className="scroll-mt-24">
                <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">{t('settings.invites.referralTitle')}</h3>
                <p className="text-sm text-muted mb-6">{t('settings.invites.referralDescription')}</p>
                <SettingsToggleRow
                    title={t('settings.invites.enableReferrals')}
                    hint={
                        <SettingHint>
                            {t('settings.invites.enableReferralsHint')}
                        </SettingHint>
                    }
                    checked={referralEnabled}
                    onChange={setReferralEnabled}
                    border={false}
                    className="mb-6"
                />
                <div className={`transition-all ${!referralEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-sm mb-1 font-medium">{t('settings.invites.referredUserTemporaryAccessDays')}</label>
                            <input type="number" min="0" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={referralTrialDays} onChange={e => setReferralTrialDays(Number(e.target.value))} />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm mb-1 font-medium">{t('settings.invites.referrerRewardDays')}</label>
                            <input type="number" min="0" className="w-full p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex transition-all" value={referralRewardDays} onChange={e => setReferralRewardDays(Number(e.target.value))} />
                        </div>
                    </div>
                </div>
            </section>

            <section id={getSettingsSectionElementId('invite-links')} className="scroll-mt-24">
            <h3 className="text-xl font-bold text-plex mb-4 border-b border-border pb-2">{t('settings.invites.inviteLinksTitle')}</h3>
            <p className="text-sm text-muted mb-2">{t('settings.invites.inviteLinksDescription')}</p>
            <p className="text-sm text-muted mb-6">
                {publicDomain
                    ? t('settings.invites.publicBaseUrlConfigured', { url: inviteBaseUrl })
                    : t('settings.invites.publicBaseUrlBrowserOrigin')}
            </p>

            <div className="space-y-6 mb-8">
                <h4 className="font-bold">{t('settings.invites.createNewInviteLink')}</h4>
                <div className="flex flex-col md:flex-row gap-4 items-end mb-6">
                    <div className="flex-1 w-full">
                        <label className="block text-sm mb-1 font-medium">{t('settings.invites.durationDays')}</label>
                        <input type="number" min="1" className="w-full p-2.5 rounded-lg bg-background border border-border text-text outline-none focus:border-plex" value={durationDays} onChange={e => setDurationDays(Number(e.target.value))} />
                    </div>
                    <div className="flex-1 w-full">
                        <label className="block text-sm mb-1 font-medium">{t('settings.invites.maxUses')}</label>
                        <input type="text" className="w-full p-2.5 rounded-lg bg-background border border-border text-text outline-none focus:border-plex" value={maxUses} onChange={e => setMaxUses(e.target.value)} />
                    </div>
                    <button className="w-full md:w-auto px-6 py-2.5 bg-plex text-background font-bold rounded-lg hover:bg-plex-hover transition-colors shadow-lg" onClick={handleCreate}>{t('settings.invites.generateLink')}</button>
                </div>

                {libraries.length > 0 && (
                    <div className="mb-6">
                        <label className="block text-sm mb-2 font-medium">{t('settings.invites.librariesToShare')}</label>
                        <div className="flex flex-wrap gap-2">
                            {libraries.map(lib => (
                                <label key={lib.id} className="flex items-center gap-2 bg-background border border-border px-3 py-2 rounded-lg cursor-pointer hover:border-plex transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedLibraries.includes(lib.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedLibraries([...selectedLibraries, lib.id]);
                                            else setSelectedLibraries(selectedLibraries.filter(id => id !== lib.id));
                                        }}
                                        className="accent-plex"
                                    />
                                    <span className="text-sm font-medium">{lib.title}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div className="border-t border-border/50 pt-6">
                    <h4 className="font-bold mb-4">{t('settings.invites.directEmailInvite')}</h4>
                    <p className="text-sm text-muted mb-4">{t('settings.invites.directEmailInviteDescription')}</p>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                            <label className="block text-sm mb-1 font-medium">{t('settings.invites.emailAddress')}</label>
                            <input type="email" placeholder="user@example.com" className="w-full p-2.5 rounded-lg bg-background border border-border text-text outline-none focus:border-plex" value={emailInvite} onChange={e => setEmailInvite(e.target.value)} />
                        </div>
                        <button disabled={emailing} className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50" onClick={handleEmailInvite}>
                            {emailing ? t('settings.invites.sending') : t('settings.invites.sendEmailInvite')}
                        </button>
                    </div>
                    <div className="mt-4">
                        <label className="block text-sm mb-1 font-medium">{t('settings.invites.personalNote')}</label>
                        <p className="text-xs text-muted mb-2">{t('settings.invites.personalNoteHint')}</p>
                        <textarea
                            value={emailNote}
                            onChange={(e) => setEmailNote(e.target.value)}
                            maxLength={2000}
                            rows={4}
                            placeholder={t('settings.invites.personalNotePlaceholder')}
                            className="w-full p-2.5 rounded-lg bg-background border border-border text-text outline-none focus:border-plex resize-y"
                        />
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                        <tr className="border-b border-border text-muted text-sm uppercase tracking-wider">
                            <th className="p-3">{t('settings.invites.inviteLink')}</th>
                            <th className="p-3">{t('settings.invites.duration')}</th>
                            <th className="p-3">{t('settings.invites.uses')}</th>
                            <th className="p-3">{t('settings.invites.libraries')}</th>
                            <th className="p-3">{t('settings.invites.created')}</th>
                            <th className="p-3 text-right">{t('settings.invites.actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {invites.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-muted">{t('settings.invites.empty')}</td></tr>
                        ) : invites.map(inv => (
                            <tr key={inv.code} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm text-plex select-all">{inviteUrlFor(inv.code)}</span>
                                        <button onClick={() => handleCopy(inv.code)} className="text-muted hover:text-plex transition-colors p-1" title={t('settings.invites.copyLink')}>
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                </td>
                                <td className="p-3 font-medium">{t('settings.invites.durationDaysValue', { count: inv.durationDays })}</td>
                                <td className="p-3">
                                    <div className="font-medium">{inv.maxUses === 'unlimited' ? t('settings.invites.unlimited') : `${inv.currentUses} / ${inv.maxUses}`}</div>
                                    {inv.usedBy && inv.usedBy.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1 max-w-[200px]">
                                            {inv.usedBy.map((u: any, idx: number) => (
                                                <span key={idx} className="text-[10px] text-plex bg-plex/10 border border-plex/20 px-1.5 py-0.5 rounded shadow-sm" title={t('settings.invites.claimedBy', { date: new Date(u.date).toLocaleString(), email: u.email })}>
                                                    {u.username}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="p-3 text-sm">
                                    {inv.libraryIds && inv.libraryIds.length > 0
                                        ? libraries.filter(l => inv.libraryIds.includes(l.id)).map(l => l.title).join(', ') || t('settings.invites.selectedCount', { count: inv.libraryIds.length })
                                        : <span className="text-plex opacity-80">{t('settings.invites.allLibraries')}</span>}
                                </td>
                                <td className="p-3 text-muted text-sm">
                                    {new Date(inv.createdAt).toLocaleDateString()}
                                    {inv.sentTo && <div className="text-xs text-blue-400 mt-1">{t('settings.invites.sentTo', { email: inv.sentTo })}</div>}
                                </td>
                                <td className="p-3 text-right">
                                    <button onClick={() => handleDelete(inv.code)} className="text-red-500 hover:text-red-400 font-bold border border-red-500/30 px-3 py-1 rounded hover:bg-red-500/10 transition-colors text-xs">{t('settings.invites.revoke')}</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            </section>
        </div>
    );
};

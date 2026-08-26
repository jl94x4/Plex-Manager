import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { apiFetch } from '../shared/api';
import { CustomSelect } from '../shared/ui';
import { appAlert } from '../shared/confirm';
import type { User, AuditEntry, DeletedUser } from '../shared/types';
import { formatDateTime, formatEventName, hexToRgb, getDaysUntilExpiry, addMonths, addYears, formatDate } from '../shared/format';
export const BroadcastSettingsTab: React.FC<{ selectedUserIds: string[]; users: User[]; }> = ({ selectedUserIds, users }) => {
    const [subject, setSubject] = useState('Big updates to the Plex Server! 🚀');
    const [body, setBody] = useState(`🎬 <b>Hey everyone! Big updates to the Plex Server!</b> 🚀<br><br>If you have any friends or family who want to check out the server, I’m currently offering a <b>3-Day Temporary Access</b> pass with instant access to the entire library! 🍿<br>✅ No bank details needed<br>✅ No purchase required<br>✅ Instant, automated setup<br><br>We also just launched a brand new <b>User Portal</b> (https://yourdomain.com) packed with awesome features for everyone:<br>🕒 <b>Account Status:</b> Easily check exactly how many days you have left until your account expires.<br>🟢 <b>Server Health:</b> View live 24/7 uptime stats for all server services.<br>📊 <b>Live Library Stats:</b> See exact, live counts of our massive library.<br><br>Feel free to share the link (https://yourdomain.com) with anyone who might be interested! 👇`);
    const [recipientFilter, setRecipientFilter] = useState<'all' | 'active' | 'trial' | 'expiring' | 'expired' | 'selected' | 'custom'>('all');
    const [customSelectedUserIds, setCustomSelectedUserIds] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isSendingTest, setIsSendingTest] = useState(false);

    const handleSend = async () => {
        setIsSending(true);
        try {
            const finalFilter = recipientFilter === 'custom' ? 'selected' : recipientFilter;
            const finalSelectedIds = recipientFilter === 'custom' ? customSelectedUserIds : selectedUserIds;

            const res = await apiFetch('/api/users/broadcast', {
                method: 'POST',
                body: JSON.stringify({ subject, body, recipientFilter: finalFilter, selectedUserIds: finalSelectedIds })
            });
            void appAlert(res.message);
        } catch (e: any) {
            void appAlert(e.message || 'Failed to send broadcast');
        } finally {
            setIsSending(false);
        }
    };

    const handleTestSend = async () => {
        setIsSendingTest(true);
        try {
            const res = await apiFetch('/api/users/broadcast/test', {
                method: 'POST',
                body: JSON.stringify({ subject, body })
            });
            void appAlert(res.message);
        } catch (e: any) {
            void appAlert(e.message || 'Failed to send test broadcast');
        } finally {
            setIsSendingTest(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <label className="block mb-2 font-bold text-text">Recipients</label>
                <CustomSelect
                    value={recipientFilter}
                    onChange={val => setRecipientFilter(val as any)}
                    options={[
                        { label: 'All Users', value: 'all' },
                        { label: 'Active Users Only', value: 'active' },
                        { label: 'Temporary Access Users Only', value: 'trial' },
                        { label: 'Expiring Soon (Next 7 Days)', value: 'expiring' },
                        { label: 'Expired Users', value: 'expired' },
                        ...(selectedUserIds.length > 0 ? [{ label: `Selected Users (${selectedUserIds.length})`, value: 'selected' }] : []),
                        { label: 'Custom User Selection...', value: 'custom' }
                    ]}
                />
            </div>

            {recipientFilter === 'custom' && (
                <div className="p-4 border border-border/40 rounded-lg max-h-48 overflow-y-auto">
                    <div className="mb-2 font-bold text-text">Select Users ({customSelectedUserIds.length} selected):</div>
                    {users.map(u => (
                        <label key={u.id} className="flex items-center gap-2 cursor-pointer py-1 text-sm text-text hover:text-plex transition-colors">
                            <input className="accent-plex w-4 h-4"
                                type="checkbox"
                                checked={customSelectedUserIds.includes(u.id)}
                                onChange={(e) => {
                                    if (e.target.checked) setCustomSelectedUserIds(prev => [...prev, u.id]);
                                    else setCustomSelectedUserIds(prev => prev.filter(id => id !== u.id));
                                }}
                            />
                            {u.username} <span className="text-muted">({u.email || 'No email'})</span>
                        </label>
                    ))}
                </div>
            )}

            <div>
                <label className="block mb-2 font-bold text-text">Subject</label>
                <input className="w-full appearance-none p-3 rounded-lg border border-border bg-background text-[16px] leading-5 text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all"
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                />
            </div>

            <div>
                <div className="flex justify-between items-center mb-2">
                    <label className="font-bold text-text m-0">Email Body (HTML supported)</label>
                    <button className="px-3 py-1 bg-border text-text rounded text-xs font-medium hover:bg-opacity-80 transition-colors" onClick={() => setIsPreviewMode(!isPreviewMode)}>
                        {isPreviewMode ? 'Edit HTML' : 'Preview Output'}
                    </button>
                </div>
                {isPreviewMode ? (
                    <iframe
                        title="Email body preview"
                        sandbox=""
                        srcDoc={body}
                        className="w-full h-[300px] rounded-lg bg-white border border-border"
                    />
                ) : (
                    <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        className="w-full h-[300px] p-3 rounded-lg border border-border bg-background text-text outline-none focus:border-plex focus:ring-1 focus:ring-plex transition-all font-mono text-sm"
                    />
                )}
            </div>

            <div className="flex justify-end gap-3 mt-2">
                <button className="px-6 py-2.5 bg-border text-text rounded-lg font-bold hover:bg-opacity-80 transition-colors flex items-center justify-center gap-2" onClick={handleTestSend} disabled={isSending || isSendingTest}>
                    {isSendingTest ? 'Sending Test...' : 'Send Test To Admin'}
                </button>
                <button className="px-6 py-2.5 bg-plex text-background rounded-lg font-bold hover:bg-plex-hover transition-colors flex items-center justify-center gap-2" onClick={handleSend} disabled={isSending || isSendingTest}>
                    {isSending ? 'Sending...' : 'Send Broadcast'}
                </button>
            </div>
        </div>
    );
};

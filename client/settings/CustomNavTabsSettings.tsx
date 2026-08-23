import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { CustomNavTab } from '../shared/types';
import {
    CUSTOM_NAV_ICON_OPTIONS,
    createDefaultCustomNavTab,
    customNavTabKey,
    detectCustomTabEmbedIssue,
    insertNavKeyBefore,
    removeNavKey,
    resolveCustomNavIcon,
} from '../shared/customNavTabs';
import { CustomSelect, SettingsToggleRow } from '../shared/ui';
import { SettingHint } from './SettingHint';
import { useDiscoverI18n } from '../discovery/i18n';

type Props = {
    customNavTabs: CustomNavTab[];
    onChange: (next: CustomNavTab[]) => void;
    navOrder: string[];
    onNavOrderChange: (next: string[]) => void;
    memberNavOrder: string[];
    onMemberNavOrderChange: (next: string[]) => void;
};

const OPEN_MODE_OPTIONS = [
    { value: 'embed', labelKey: 'settings.navigation.customTabs.openMode.embed' },
    { value: 'sameTab', labelKey: 'settings.navigation.customTabs.openMode.sameTab' },
    { value: 'newTab', labelKey: 'settings.navigation.customTabs.openMode.newTab' },
] as const;

export const CustomNavTabsSettings: React.FC<Props> = ({
    customNavTabs,
    onChange,
    navOrder,
    onNavOrderChange,
    memberNavOrder,
    onMemberNavOrderChange,
}) => {
    const { t } = useDiscoverI18n();
    const iconOptions = useMemo(
        () => CUSTOM_NAV_ICON_OPTIONS.map((icon) => ({ value: icon, label: icon })),
        [],
    );

    const updateTab = (id: string, patch: Partial<CustomNavTab>) => {
        const next = customNavTabs.map((tab) => (
            tab.id === id ? { ...tab, ...patch } : tab
        ));
        onChange(next);
        const key = customNavTabKey(id);
        const updated = next.find((tab) => tab.id === id);
        if (!updated) return;
        if (updated.adminOnly) {
            onMemberNavOrderChange(removeNavKey(memberNavOrder, key));
        } else if (!memberNavOrder.includes(key)) {
            onMemberNavOrderChange(insertNavKeyBefore(memberNavOrder, 'logout', key));
        }
    };

    const addTab = () => {
        const tab = createDefaultCustomNavTab();
        onChange([...customNavTabs, tab]);
        const key = customNavTabKey(tab.id);
        onNavOrderChange(insertNavKeyBefore(navOrder, 'settings', key));
        onMemberNavOrderChange(insertNavKeyBefore(memberNavOrder, 'logout', key));
    };

    const removeTab = (id: string) => {
        const key = customNavTabKey(id);
        onChange(customNavTabs.filter((tab) => tab.id !== id));
        onNavOrderChange(removeNavKey(navOrder, key));
        onMemberNavOrderChange(removeNavKey(memberNavOrder, key));
    };

    const moveTab = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= customNavTabs.length) return;
        const next = [...customNavTabs];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved);
        onChange(next);
        const orderedKeys = next.map((tab) => customNavTabKey(tab.id));
        const stockKeys = navOrder.filter((key) => !key.startsWith('custom:'));
        const settingsIndex = stockKeys.indexOf('settings');
        const merged = settingsIndex >= 0
            ? [...stockKeys.slice(0, settingsIndex), ...orderedKeys, ...stockKeys.slice(settingsIndex)]
            : [...stockKeys, ...orderedKeys];
        onNavOrderChange(merged);
    };

    return (
        <div className="mb-8 animate-fade-in">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
                <div>
                    <h3 className="text-xl font-bold text-plex">{t('settings.navigation.customTabs.title')}</h3>
                    <p className="mt-1 max-w-3xl text-sm text-muted">{t('settings.navigation.customTabs.description')}</p>
                </div>
                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-plex px-4 py-2 text-sm font-bold text-background hover:bg-plex-hover disabled:opacity-50"
                    onClick={addTab}
                    disabled={customNavTabs.length >= 20}
                >
                    <Plus className="h-4 w-4" />
                    {t('settings.navigation.customTabs.add')}
                </button>
            </div>

            {!customNavTabs.length ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/20 px-4 py-8 text-center text-sm text-muted">
                    {t('settings.navigation.customTabs.empty')}
                </div>
            ) : (
                <div className="space-y-4">
                    {customNavTabs.map((tab, index) => {
                        const Icon = resolveCustomNavIcon(tab.icon);
                        return (
                            <div key={tab.id} className="rounded-2xl border border-border/70 bg-background/20 p-4">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-plex/30 bg-plex/10 text-plex">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-text">{tab.name || t('settings.navigation.customTabs.untitled')}</p>
                                            <p className="truncate text-xs text-muted">{tab.url}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text disabled:opacity-40" disabled={index === 0} onClick={() => moveTab(index, -1)} aria-label="Move up">
                                            <ChevronUp className="h-4 w-4" />
                                        </button>
                                        <button type="button" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text disabled:opacity-40" disabled={index === customNavTabs.length - 1} onClick={() => moveTab(index, 1)} aria-label="Move down">
                                            <ChevronDown className="h-4 w-4" />
                                        </button>
                                        <button type="button" className="rounded-lg p-2 text-red-300 hover:bg-red-500/10" onClick={() => removeTab(tab.id)} aria-label="Delete tab">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block text-sm">
                                        <span className="mb-1 block font-semibold text-text">{t('settings.navigation.customTabs.name')}</span>
                                        <input
                                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-plex"
                                            value={tab.name}
                                            onChange={(event) => updateTab(tab.id, { name: event.target.value })}
                                            placeholder="Game library"
                                        />
                                    </label>
                                    <label className="block text-sm">
                                        <span className="mb-1 block font-semibold text-text">{t('settings.navigation.customTabs.url')}</span>
                                        <input
                                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-plex"
                                            value={tab.url}
                                            onChange={(event) => updateTab(tab.id, { url: event.target.value })}
                                            placeholder="https://games.example.com"
                                        />
                                    </label>
                                    <label className="block text-sm md:col-span-2">
                                        <span className="mb-1 block font-semibold text-text">{t('settings.navigation.customTabs.descriptionLabel')}</span>
                                        <input
                                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none focus:border-plex"
                                            value={tab.description || ''}
                                            onChange={(event) => updateTab(tab.id, { description: event.target.value })}
                                            placeholder={t('settings.navigation.customTabs.descriptionPlaceholder')}
                                        />
                                    </label>
                                    <label className="block text-sm">
                                        <span className="mb-1 block font-semibold text-text">{t('settings.navigation.customTabs.icon')}</span>
                                        <CustomSelect
                                            value={tab.icon}
                                            onChange={(value) => updateTab(tab.id, { icon: value })}
                                            options={iconOptions}
                                        />
                                    </label>
                                    <label className="block text-sm">
                                        <span className="mb-1 block font-semibold text-text">{t('settings.navigation.customTabs.openMode.label')}</span>
                                        <CustomSelect
                                            value={tab.openMode}
                                            onChange={(value) => updateTab(tab.id, { openMode: value as CustomNavTab['openMode'] })}
                                            options={OPEN_MODE_OPTIONS.map((option) => ({
                                                value: option.value,
                                                label: t(option.labelKey),
                                            }))}
                                        />
                                        <SettingHint>{t(`settings.navigation.customTabs.openMode.hint.${tab.openMode}`)}</SettingHint>
                                        {tab.openMode === 'embed' && detectCustomTabEmbedIssue(tab.url) === 'mixed-content' ? (
                                            <p className="mt-2 text-xs font-semibold text-yellow-300/90">
                                                {t('settings.navigation.customTabs.embedWarningMixedContent')}
                                            </p>
                                        ) : null}
                                        {tab.openMode === 'embed' && detectCustomTabEmbedIssue(tab.url) === 'blocked-host' ? (
                                            <p className="mt-2 text-xs font-semibold text-yellow-300/90">
                                                {t('settings.navigation.customTabs.embedWarningBlockedHost')}
                                            </p>
                                        ) : null}
                                    </label>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <SettingsToggleRow
                                        title={t('settings.navigation.customTabs.enabled')}
                                        checked={tab.enabled}
                                        onChange={(checked) => updateTab(tab.id, { enabled: checked })}
                                        border={false}
                                    />
                                    <SettingsToggleRow
                                        title={t('settings.navigation.customTabs.adminOnly')}
                                        hint={<SettingHint>{t('settings.navigation.customTabs.adminOnlyHint')}</SettingHint>}
                                        checked={!!tab.adminOnly}
                                        onChange={(checked) => updateTab(tab.id, { adminOnly: checked })}
                                        border={false}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

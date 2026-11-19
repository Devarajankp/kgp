import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellOff,
  BellRing,
  Check,
  Copy,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  getApiBaseUrl,
  hasCustomApiBaseUrl,
  isStaticPagesEnvironment,
  resolveApiUrl,
  setApiBaseUrl,
} from '../services/goldClient';
import {
  clearPriceAlert,
  createDefaultAlertConfig,
  dispatchGoldNotification,
  formatAlertNotification,
  getNotificationCapability,
  readPriceAlert,
  requestNotificationPermission,
  savePriceAlert,
  sendServerTestPush,
  syncServerPushSubscription,
  unregisterServerPushSubscription,
  type ActiveAlertEvent,
  type NotificationCapability,
  type PriceAlertConfig,
} from '../services/priceAlerts';
import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {formatInr} from '../utils/format';

interface PriceAlertModalProps {
  open: boolean;
  onClose: () => void;
  data: LatestGoldResponse | null;
  lang: AppLanguage;
  streamConnected?: boolean;
  onAlertChanged: (config: PriceAlertConfig | null) => void;
  onTriggerPreviewBanner?: (event: ActiveAlertEvent) => void;
  onApiServerChanged?: () => void;
}

export const PriceAlertModal: React.FC<PriceAlertModalProps> = ({
  open,
  onClose,
  data,
  lang,
  streamConnected = false,
  onAlertChanged,
  onTriggerPreviewBanner,
  onApiServerChanged,
}) => {
  const currentPavan = data?.current.pavan22k || 100320;
  const currentGram = data?.current.gram22k || 12540;

  const [enabled, setEnabled] = useState<boolean>(true);
  const [notifyOnPriceChange, setNotifyOnPriceChange] = useState<boolean>(true);
  const [notifyDailySummary, setNotifyDailySummary] = useState<boolean>(true);
  const [targetEnabled, setTargetEnabled] = useState<boolean>(false);
  const [unit, setUnit] = useState<'pavan' | 'gram'>('pavan');
  const [direction, setDirection] = useState<'below' | 'above'>('below');
  const [targetInput, setTargetInput] = useState<string>(String(Math.max(0, currentPavan - 1000)));
  const [capability, setCapability] = useState<NotificationCapability>('default');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedShortcut, setCopiedShortcut] = useState(false);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [showServerUrlBox, setShowServerUrlBox] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setCapability(getNotificationCapability());
    setServerUrlInput(hasCustomApiBaseUrl() ? getApiBaseUrl().replace(/\/+$/, '') : '');
    setShowServerUrlBox(isStaticPagesEnvironment());
    const existing = readPriceAlert();
    if (existing) {
      setEnabled(existing.enabled);
      setNotifyOnPriceChange(existing.notifyOnPriceChange);
      setNotifyDailySummary(existing.notifyDailySummary);
      setTargetEnabled(existing.targetEnabled);
      setUnit(existing.unit);
      setDirection(existing.direction);
      setTargetInput(String(existing.targetPrice));
    } else {
      const def = createDefaultAlertConfig(currentPavan);
      setEnabled(true);
      setNotifyOnPriceChange(def.notifyOnPriceChange);
      setNotifyDailySummary(def.notifyDailySummary);
      setTargetEnabled(false);
      setUnit(def.unit);
      setDirection(def.direction);
      setTargetInput(String(def.targetPrice));
    }
    setFeedback(null);
    setCopiedShortcut(false);
  }, [open, currentPavan]);

  const shortcutApiUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    if (isStaticPagesEnvironment()) {
      return `${window.location.origin}${import.meta.env.BASE_URL}api/shortcut.json`;
    }
    const qs = new URLSearchParams({unit, direction, format: 'text'});
    if (targetEnabled && Number(targetInput) > 0) {
      qs.set('target', String(Math.round(Number(targetInput))));
    }
    const resolved = resolveApiUrl(`api/gold/alert-check?${qs.toString()}`);
    return resolved.startsWith('http') ? resolved : `${window.location.origin}${resolved}`;
  }, [unit, direction, targetEnabled, targetInput, serverUrlInput]);

  if (!open || typeof document === 'undefined') return null;

  const handleUnitChange = (nextUnit: 'pavan' | 'gram') => {
    setUnit(nextUnit);
    setTargetInput(
      nextUnit === 'pavan'
        ? String(Math.max(0, currentPavan - 1000))
        : String(Math.max(0, currentGram - 150)),
    );
  };

  const handleToggleMaster = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    if (!nextEnabled) {
      const existing = readPriceAlert();
      const updated: PriceAlertConfig = {
        ...(existing || createDefaultAlertConfig(currentPavan)),
        enabled: false,
        updatedAt: new Date().toISOString(),
      };
      savePriceAlert(updated);
      onAlertChanged(updated);
      void unregisterServerPushSubscription();
      setPushRegistered(false);
      setFeedback(lang === 'ml' ? 'എല്ലാ അലേർട്ടുകളും ഓഫ് ചെയ്തു.' : 'All price notifications turned OFF.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericTarget = Math.max(0, Math.round(Number(targetInput) || 0));
    if (targetEnabled && numericTarget <= 0) {
      setFeedback(lang === 'ml' ? 'ശരിയായ ലക്ഷ്യ വില നൽകുക.' : 'Enter a valid target price.');
      return;
    }

    let cap = getNotificationCapability();
    if (enabled && cap === 'default') {
      cap = await requestNotificationPermission();
      setCapability(cap);
    }

    const existing = readPriceAlert();
    const config: PriceAlertConfig = {
      enabled,
      notifyOnPriceChange,
      notifyDailySummary,
      targetEnabled,
      unit,
      direction,
      targetPrice: numericTarget > 0 ? numericTarget : currentPavan - 1000,
      lastSeenKey: existing?.lastSeenKey,
      lastSeenPavan: data?.current.pavan22k ?? existing?.lastSeenPavan,
      lastSeenGram: data?.current.gram22k ?? existing?.lastSeenGram,
      lastDailyKey: existing?.lastDailyKey,
      lastTargetKey: existing?.lastTargetKey,
      updatedAt: new Date().toISOString(),
    };
    savePriceAlert(config);
    onAlertChanged(config);

    if (!enabled) {
      await unregisterServerPushSubscription();
      setPushRegistered(false);
      setFeedback(lang === 'ml' ? 'അലേർട്ട് ഓഫ് ചെയ്തു.' : 'Notifications paused (OFF).');
      return;
    }

    let pushRegOk = false;
    if (cap === 'granted') {
      const syncRes = await syncServerPushSubscription(config, lang);
      pushRegOk = syncRes.registered;
      setPushRegistered(pushRegOk);
    }

    const activeRate = unit === 'pavan' ? currentPavan : currentGram;
    const isMatchedNow =
      targetEnabled &&
      numericTarget > 0 &&
      (direction === 'above' ? activeRate >= numericTarget : activeRate <= numericTarget);

    if (isMatchedNow && data) {
      const event = formatAlertNotification({
        data,
        deltaPavan: data.current.changePavan,
        deltaGram: data.current.changeGram,
        reasons: ['target'],
        config,
        lang,
      });
      await dispatchGoldNotification(event.title, event.body);
      onTriggerPreviewBanner?.(event);
      setFeedback(
        lang === 'ml'
          ? 'ലക്ഷ്യ വിലയിലെത്തി! അലേർട്ട് നൽകി.'
          : 'Target price already met — alert triggered!',
      );
      return;
    }

    if (cap === 'granted') {
      setFeedback(
        pushRegOk
          ? lang === 'ml'
            ? 'ബാക്ക്ഗ്രൗണ്ട് വെബ് പുഷ് സജീവം! ആപ്പ് അടച്ചാലും വില മാറുമ്പോൾ നോട്ടിഫിക്കേഷൻ ലഭിക്കും.'
            : 'Background Web Push active! You will be notified instantly even when the app is closed.'
          : lang === 'ml'
            ? 'ഇൻ-ആപ്പ് & ബ്രൗസർ അലേർട്ടുകൾ സജീവം!'
            : 'Alerts active! Live notifications enabled (connect a Live Server URL for closed-app push).',
      );
    } else if (cap === 'ios-needs-install') {
      setFeedback(
        lang === 'ml'
          ? 'സേവ് ചെയ്തു! iOS ലോക്ക്-സ്ക്രീൻ അലേർട്ടിന് "Add to Home Screen" അല്ലെങ്കിൽ iPhone Shortcut ഉപയോഗിക്കുക.'
          : 'Saved for in-app alerts! Install to iPhone Home Screen or use the Shortcut URL below for Lock-Screen alerts.',
      );
    } else {
      setFeedback(
        lang === 'ml'
          ? 'ഇൻ-ആപ്പ് & ഷോർട്ട്കട്ട് അലേർട്ടുകൾ സേവ് ചെയ്തു!'
          : 'Saved! Live in-app alerts are active whenever gold rates update.',
      );
    }
  };

  const handleTestNotification = async () => {
    let cap = getNotificationCapability();
    if (cap === 'default') {
      cap = await requestNotificationPermission();
      setCapability(cap);
    }

    if (data) {
      const demoEvent = formatAlertNotification({
        data,
        deltaPavan: data.current.changePavan,
        deltaGram: data.current.changeGram,
        reasons: data.current.changePavan !== 0 ? ['change'] : ['daily'],
        lang,
      });
      onTriggerPreviewBanner?.(demoEvent);

      if (cap === 'granted') {
        const currentCfg = readPriceAlert() || createDefaultAlertConfig(currentPavan);
        const syncRes = await syncServerPushSubscription({...currentCfg, enabled: true}, lang);
        if (syncRes.registered) {
          setPushRegistered(true);
          const pushed = await sendServerTestPush(lang);
          if (pushed) {
            setFeedback(
              lang === 'ml'
                ? 'സർവർ വെബ് പുഷും ഇൻ-ആപ്പ് അലേർട്ടും അയച്ചു!'
                : 'Server Web Push + In-App alert dispatched!',
            );
            return;
          }
        }
        const ok = await dispatchGoldNotification(demoEvent.title, demoEvent.body, 'kgp-test-alert');
        if (ok) {
          setFeedback(
            lang === 'ml'
              ? 'OS നോട്ടിഫിക്കേഷനും ഇൻ-ആപ്പ് അലേർട്ടും അയച്ചു!'
              : 'Test notification sent (both OS Push & In-App banner)!',
          );
          return;
        }
      }
    }

    setFeedback(
      cap === 'ios-needs-install'
        ? lang === 'ml'
          ? 'ഇൻ-ആപ്പ് അലേർട്ട് പ്രിവ്യൂ അയച്ചു! iPhone-ൽ Home Screen ആപ്പായി ഇൻസ്റ്റാൾ ചെയ്താൽ Lock-Screen പുഷ് ലഭിക്കും.'
          : 'Live in-app alert banner triggered! For iPhone Lock-Screen push, open from Home Screen app or use Shortcut below.'
        : lang === 'ml'
          ? 'ഇൻ-ആപ്പ് അലേർട്ട് പ്രിവ്യൂ അയച്ചു!'
          : 'Live in-app color-coded alert triggered! Allow browser permission for OS popups.',
    );
  };

  const handleSaveServerUrl = () => {
    const normalized = setApiBaseUrl(serverUrlInput);
    onApiServerChanged?.();
    setFeedback(
      normalized
        ? `Connected Live Server: ${normalized}`
        : 'Cleared custom server URL (using built-in origin/snapshot).',
    );
  };

  const handleCopyShortcutUrl = async () => {
    try {
      await navigator.clipboard.writeText(shortcutApiUrl);
      setCopiedShortcut(true);
      setTimeout(() => setCopiedShortcut(false), 2000);
    } catch {
      setFeedback(shortcutApiUrl);
    }
  };

  const handleResetAll = () => {
    clearPriceAlert();
    setEnabled(false);
    setPushRegistered(false);
    void unregisterServerPushSubscription();
    onAlertChanged(null);
    setFeedback(lang === 'ml' ? 'വില അലേർട്ട് നീക്കം ചെയ്തു.' : 'All alerts cleared and disabled.');
  };

  const renderCapabilityBadge = () => {
    switch (capability) {
      case 'granted':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {lang === 'ml' ? 'OS പുഷ് + ഇൻ-ആപ്പ് സജീവം' : 'OS Push + In-App Active'}
          </span>
        );
      case 'ios-needs-install':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
            <Smartphone className="h-3.5 w-3.5" />
            {lang === 'ml' ? 'ഇൻ-ആപ്പ് + Shortcut (PWA-ൽ പുഷ്)' : 'In-App + Shortcut (Install PWA for iOS Push)'}
          </span>
        );
      case 'denied':
        return (
          <span className="font-semibold text-rose-700 dark:text-rose-400">
            {lang === 'ml' ? 'ഇൻ-ആപ്പ് സജീവം (ബ്രൗസർ ബ്ലോക്ക്)' : 'In-App Active (OS Blocked in Settings)'}
          </span>
        );
      case 'default':
        return (
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {lang === 'ml' ? 'അനുമതി നൽകുക' : 'Tap Save / Test to Allow OS Push'}
          </span>
        );
      default:
        return (
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {lang === 'ml' ? 'ഇൻ-ആപ്പ് & API അലേർട്ട് സജീവം' : 'In-App + API / Shortcut Active'}
          </span>
        );
    }
  };

  const currentRateForUnit = unit === 'pavan' ? currentPavan : currentGram;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl p-4 sm:p-5 text-slate-900 dark:text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2 id="alert-modal-title" className="font-display text-base sm:text-lg font-bold">
              {lang === 'ml' ? 'സ്വർണ്ണ വില അലേർട്ടുകൾ' : 'Gold Price Alerts'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price alert settings"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Master ON / OFF Switch */}
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-900/10 bg-white/65 px-3.5 py-2.5 dark:border-white/12 dark:bg-white/8">
          <div>
            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              {lang === 'ml' ? 'നോട്ടിഫിക്കേഷനുകൾ' : 'Notifications'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {enabled
                ? lang === 'ml'
                  ? '1 പവൻ & 1 ഗ്രാം അലേർട്ടുകൾ ഓൺ'
                  : 'ON — Tracks both 1 Pavan & 1 Gram'
                : lang === 'ml'
                  ? 'എല്ലാ അലേർട്ടുകളും ഓഫ്'
                  : 'OFF — Alerts muted'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => handleToggleMaster(!enabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              enabled ? 'bg-amber-600 dark:bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-3 space-y-3">
          {/* Individual Triggers */}
          <div
            className={`space-y-2 transition-opacity ${
              enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
            }`}
          >
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/8 bg-white/55 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5 cursor-pointer">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  {lang === 'ml' ? 'വില മാറുമ്പോൾ തൽക്ഷണ അലേർട്ട്' : 'Instant Rate Change Alert'}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  🟢 ▲ {lang === 'ml' ? 'കൂടിയാൽ' : 'Rise'} / 🔴 ▼ {lang === 'ml' ? 'കുറഞ്ഞാൽ' : 'Drop'} (1 Pavan & 1g)
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifyOnPriceChange}
                onChange={(e) => setNotifyOnPriceChange(e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/8 bg-white/55 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5 cursor-pointer">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {lang === 'ml' ? 'ദിവസേനയുള്ള വില അലേർട്ട്' : 'Daily Rate Update Alert'}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  {lang === 'ml'
                    ? 'ഓരോ ദിവസത്തെ 1 പവൻ & 1 ഗ്രാം വിലയും അറിയിക്കും'
                    : 'Daily summary with 1 Pavan & 1 Gram + change badge'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifyDailySummary}
                onChange={(e) => setNotifyDailySummary(e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/8 bg-white/55 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5 cursor-pointer">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {lang === 'ml' ? 'ലക്ഷ്യ വില അലേർട്ട്' : 'Custom Price Target Alert'}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  {lang === 'ml'
                    ? 'നിശ്ചയിച്ച വിലയിലെത്തുമ്പോൾ അറിയിപ്പ്'
                    : 'Alert when rate crosses your target price'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={targetEnabled}
                onChange={(e) => setTargetEnabled(e.target.checked)}
                className="h-4 w-4 accent-amber-600"
              />
            </label>

            {targetEnabled && (
              <div className="rounded-2xl border border-amber-600/20 bg-amber-500/5 p-3 space-y-2.5 dark:border-amber-400/20">
                <div className="grid grid-cols-2 gap-2">
                  <div className="liquid-segmented grid grid-cols-2 rounded-xl p-0.5">
                    <button
                      type="button"
                      onClick={() => handleUnitChange('pavan')}
                      className={`min-h-[32px] rounded-lg text-[11px] font-semibold cursor-pointer ${
                        unit === 'pavan'
                          ? 'liquid-pill-active text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      1 Pavan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnitChange('gram')}
                      className={`min-h-[32px] rounded-lg text-[11px] font-semibold cursor-pointer ${
                        unit === 'gram'
                          ? 'liquid-pill-active text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      1 Gram
                    </button>
                  </div>

                  <div className="liquid-segmented grid grid-cols-2 rounded-xl p-0.5">
                    <button
                      type="button"
                      onClick={() => setDirection('below')}
                      className={`min-h-[32px] inline-flex items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        direction === 'below'
                          ? 'liquid-pill-active text-rose-700 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <ArrowDownRight className="h-3 w-3" />
                      ≤ Drop
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('above')}
                      className={`min-h-[32px] inline-flex items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                        direction === 'above'
                          ? 'liquid-pill-active text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <ArrowUpRight className="h-3 w-3" />
                      ≥ Rise
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <label htmlFor="target-price-input" className="font-semibold text-slate-700 dark:text-slate-300">
                      {lang === 'ml' ? 'ലക്ഷ്യ വില (₹)' : 'Target Rate (₹)'}
                    </label>
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                      Current: {formatInr(currentRateForUnit)}
                    </span>
                  </div>
                  <input
                    id="target-price-input"
                    type="number"
                    min="1"
                    step={unit === 'pavan' ? 100 : 10}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/85 px-3 py-1.5 font-mono-nums text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Delivery Channel Status + Test */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-900/8 bg-white/55 px-3 py-2 text-[11px] dark:border-white/10 dark:bg-white/5">
            <div className="min-w-0">{renderCapabilityBadge()}</div>
            <button
              type="button"
              onClick={handleTestNotification}
              className="font-semibold text-amber-700 hover:underline dark:text-amber-400 shrink-0 cursor-pointer"
            >
              {lang === 'ml' ? 'ടെസ്റ്റ് അലേർട്ട്' : 'Test Alert'}
            </button>
          </div>

          {/* Live Push Server Connection (optional for GitHub Pages static deployments) */}
          <div className="rounded-xl border border-slate-900/8 bg-white/50 p-2.5 text-[11px] dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {streamConnected || pushRegistered
                  ? 'Live Stream & Push Server Connected'
                  : isStaticPagesEnvironment()
                    ? 'Static Mode (GitHub Pages)'
                    : 'Live API Connection'}
              </span>
              <button
                type="button"
                onClick={() => setShowServerUrlBox((v) => !v)}
                className="font-semibold text-amber-700 hover:underline dark:text-amber-400 cursor-pointer"
              >
                {showServerUrlBox ? 'Hide' : 'Configure Server URL'}
              </button>
            </div>
            {showServerUrlBox && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug">
                  GitHub Pages runs in static demo mode. For real-time live refresh &amp; instant alerts, deploy this repo to Vercel (or Node/Render) and optionally link its API URL here:
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="url"
                    placeholder="https://your-app.vercel.app"
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    className="flex-1 min-h-[34px] rounded-lg border border-slate-900/12 bg-white/85 px-2.5 py-1 text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleSaveServerUrl}
                    className="min-h-[34px] rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 cursor-pointer"
                  >
                    Connect
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* iPhone Shortcut / API Automation Copy */}
          <div className="rounded-xl border border-slate-900/8 bg-white/50 p-2.5 text-[11px] dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                iPhone Shortcut / API Automation URL
              </span>
              <button
                type="button"
                onClick={handleCopyShortcutUrl}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-900/12 bg-white/80 px-2 py-1 font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
              >
                {copiedShortcut ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copiedShortcut ? 'Copied' : 'Copy URL'}</span>
              </button>
            </div>
            <p className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug">
              Use Apple <strong>Shortcuts → Automation (Daily 9:45 AM &amp; 4:00 PM)</strong> → <em>Get Contents of URL</em> → <em>Show Notification</em> for Lock-Screen alerts even when the app is closed.
            </p>
          </div>

          {feedback && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{feedback}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
            >
              {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              <span>
                {enabled
                  ? lang === 'ml'
                    ? 'അലേർട്ടുകൾ സേവ് ചെയ്യുക'
                    : 'Save & Enable Alerts'
                  : lang === 'ml'
                    ? 'അലേർട്ട് ഓഫ് സേവ് ചെയ്യുക'
                    : 'Save (Muted)'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleResetAll}
              title="Reset alerts"
              className="min-h-[42px] px-3 rounded-xl border border-slate-900/12 bg-white/70 text-xs font-semibold text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 cursor-pointer"
            >
              {lang === 'ml' ? 'നീക്കുക' : 'Clear'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

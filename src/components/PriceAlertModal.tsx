import {Bell, BellOff, BellRing, CheckCircle2, X} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import {
  clearPriceAlert,
  dispatchGoldNotification,
  getNotificationPermissionState,
  readPriceAlert,
  requestNotificationPermission,
  savePriceAlert,
  type PriceAlertConfig,
} from '../services/priceAlerts';
import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {formatInr} from '../utils/format';

interface PriceAlertModalProps {
  open: boolean;
  onClose: () => void;
  data: LatestGoldResponse | null;
  lang: AppLanguage;
  onAlertChanged: (config: PriceAlertConfig | null) => void;
}

export const PriceAlertModal: React.FC<PriceAlertModalProps> = ({
  open,
  onClose,
  data,
  lang,
  onAlertChanged,
}) => {
  const currentPavan = data?.current.pavan22k || 100320;
  const currentGram = data?.current.gram22k || 12540;

  const [unit, setUnit] = useState<'pavan' | 'gram'>('pavan');
  const [targetInput, setTargetInput] = useState<string>(String(Math.max(0, currentPavan - 1000)));
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [savedConfig, setSavedConfig] = useState<PriceAlertConfig | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPermission(getNotificationPermissionState());
    const existing = readPriceAlert();
    setSavedConfig(existing);
    if (existing) {
      setUnit(existing.unit);
      setTargetInput(String(existing.targetPrice));
    } else {
      setUnit('pavan');
      setTargetInput(String(Math.max(0, currentPavan - 1000)));
    }
    setFeedback(null);
  }, [open, currentPavan]);

  if (!open) return null;

  const handleUnitChange = (nextUnit: 'pavan' | 'gram') => {
    setUnit(nextUnit);
    if (!savedConfig || savedConfig.unit !== nextUnit) {
      setTargetInput(
        nextUnit === 'pavan'
          ? String(Math.max(0, currentPavan - 1000))
          : String(Math.max(0, currentGram - 150)),
      );
    }
  };

  const handleSaveAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericTarget = Math.max(0, Math.round(Number(targetInput) || 0));
    if (numericTarget <= 0) {
      setFeedback(lang === 'ml' ? 'ശരിയായ വില നൽകുക.' : 'Enter a valid target price.');
      return;
    }

    let perm = getNotificationPermissionState();
    if (perm === 'default') {
      perm = await requestNotificationPermission();
      setPermission(perm);
    }

    const config: PriceAlertConfig = {
      enabled: true,
      unit,
      targetPrice: numericTarget,
      updatedAt: new Date().toISOString(),
    };
    savePriceAlert(config);
    setSavedConfig(config);
    onAlertChanged(config);

    const activeRate = unit === 'pavan' ? currentPavan : currentGram;
    const isMatchedNow = activeRate <= numericTarget;

    if (perm === 'granted') {
      if (isMatchedNow) {
        await dispatchGoldNotification(
          `Gold Target Reached: ${formatInr(activeRate)}`,
          `Current 22K ${unit === 'pavan' ? '1 Pavan' : '1 Gram'} price (${formatInr(activeRate)}) is already at or below ${formatInr(numericTarget)}.`,
        );
      }
      setFeedback(
        isMatchedNow
          ? lang === 'ml'
            ? 'ലക്ഷ്യ വിലയിലെത്തി! നോട്ടിഫിക്കേഷൻ അയച്ചു.'
            : 'Target already met — notification sent!'
          : lang === 'ml'
            ? 'ലക്ഷ്യ വില അലേർട്ട് സജ്ജമാക്കി!'
            : 'Target alert saved! You will be alerted when rates drop to or below your target.',
      );
    } else if (perm === 'denied') {
      setFeedback(
        lang === 'ml'
          ? 'ലക്ഷ്യ വില സേവ് ചെയ്തു. ബ്രൗസർ നോട്ടിഫിക്കേഷൻ ബ്ലോക്ക് ചെയ്തിരിക്കുകയാണ് — ആപ്പിൽ അലേർട്ട് കാണിക്കും.'
          : 'Alert saved for in-app banners. Enable browser notifications in site settings for push alerts.',
      );
    } else {
      setFeedback(
        lang === 'ml'
          ? 'ലക്ഷ്യ വില സേവ് ചെയ്തു (ഇൻ-ആപ്പ് അലേർട്ട്).'
          : 'Alert saved! In-app alert banners will notify you when matched.',
      );
    }
  };

  const handleTestNotification = async () => {
    let perm = getNotificationPermissionState();
    if (perm === 'default') {
      perm = await requestNotificationPermission();
      setPermission(perm);
    }
    if (perm !== 'granted') {
      setFeedback(
        lang === 'ml'
          ? 'ടെസ്റ്റ് ചെയ്യാൻ ബ്രൗസർ നോട്ടിഫിക്കേഷൻ അനുമതി നൽകുക.'
          : 'Please allow browser notifications to test alerts.',
      );
      return;
    }
    const ok = await dispatchGoldNotification(
      'Kerala Gold Price Alert Active',
      `Current 22K rate: ${formatInr(currentPavan)} / Pavan (${formatInr(currentGram)} / g).`,
    );
    setFeedback(
      ok
        ? lang === 'ml'
          ? 'ടെസ്റ്റ് നോട്ടിഫിക്കേഷൻ അയച്ചു!'
          : 'Test notification sent!'
        : 'Notification could not be displayed in this browser context.',
    );
  };

  const handleRemoveAlert = () => {
    clearPriceAlert();
    setSavedConfig(null);
    onAlertChanged(null);
    setFeedback(lang === 'ml' ? 'വില അലേർട്ട് നീക്കം ചെയ്തു.' : 'Target price alert cleared.');
  };

  const currentRateForUnit = unit === 'pavan' ? currentPavan : currentGram;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass w-full max-w-md rounded-3xl p-4 sm:p-5 text-slate-900 dark:text-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2 id="alert-modal-title" className="font-display text-base sm:text-lg font-bold">
              {lang === 'ml' ? 'ലക്ഷ്യ വില അലേർട്ട്' : 'Target Price Alert'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close target alert dialog"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
          {lang === 'ml'
            ? 'ദിവസേനയുള്ള സ്വർണ്ണ വില നിങ്ങളുടെ ലക്ഷ്യ വിലയിലോ അതിലും താഴെയോ എത്തിയാൽ ബ്രൗസർ നോട്ടിഫിക്കേഷൻ വഴി അറിയിപ്പ് ലഭിക്കും.'
            : 'Get notified via browser notification whenever the daily 22K Kerala rate reaches or falls below your target price.'}
        </p>

        <form onSubmit={handleSaveAlert} className="mt-4 space-y-3.5">
          <div>
            <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {lang === 'ml' ? 'അളവ് തിരഞ്ഞെടുക്കുക' : 'Alert Unit'}
            </span>
            <div className="liquid-segmented mt-1.5 grid grid-cols-2 rounded-xl p-1">
              <button
                type="button"
                onClick={() => handleUnitChange('pavan')}
                className={`min-h-[36px] rounded-lg text-xs font-semibold transition cursor-pointer ${
                  unit === 'pavan'
                    ? 'liquid-pill-active text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'ml' ? '1 പവൻ (8g)' : '1 Pavan (8g)'}
              </button>
              <button
                type="button"
                onClick={() => handleUnitChange('gram')}
                className={`min-h-[36px] rounded-lg text-xs font-semibold transition cursor-pointer ${
                  unit === 'gram'
                    ? 'liquid-pill-active text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lang === 'ml' ? '1 ഗ്രാം (22K)' : '1 Gram (22K)'}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="target-price-input" className="font-semibold text-slate-700 dark:text-slate-300">
                {lang === 'ml' ? 'ലക്ഷ്യ വില (₹)' : 'Target Rate (₹)'}
              </label>
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {lang === 'ml' ? 'നിലവിൽ:' : 'Current:'} {formatInr(currentRateForUnit)}
              </span>
            </div>
            <input
              id="target-price-input"
              type="number"
              min="1"
              step={unit === 'pavan' ? 100 : 10}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="mt-1.5 w-full min-h-[42px] rounded-xl border border-slate-900/12 bg-white/85 px-3 py-2 font-mono-nums text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-900/8 bg-white/55 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
            <span className="text-slate-600 dark:text-slate-300">
              {lang === 'ml' ? 'ബ്രൗസർ അനുമതി:' : 'Notifications:'}{' '}
              <strong className="text-slate-900 dark:text-white capitalize">{permission}</strong>
            </span>
            <button
              type="button"
              onClick={handleTestNotification}
              className="font-semibold text-amber-700 hover:underline dark:text-amber-400 cursor-pointer"
            >
              {lang === 'ml' ? 'ടെസ്റ്റ്' : 'Test Alert'}
            </button>
          </div>

          {savedConfig?.enabled && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
              <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Active: ≤ {formatInr(savedConfig.targetPrice)} /{' '}
                {savedConfig.unit === 'pavan' ? 'Pavan' : 'g'}
              </span>
              <button
                type="button"
                onClick={handleRemoveAlert}
                className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:underline dark:text-rose-400 cursor-pointer"
              >
                <BellOff className="h-3 w-3" aria-hidden="true" />
                <span>{lang === 'ml' ? 'നീക്കുക' : 'Disable'}</span>
              </button>
            </div>
          )}

          {feedback && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{feedback}</p>
          )}

          <button
            type="submit"
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span>
              {lang === 'ml' ? 'അലേർട്ട് സജീവമാക്കുക' : 'Save Target & Enable Alerts'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};

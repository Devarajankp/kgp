import {Bell, Calculator, Coins, History, Moon, RefreshCw, Share2, Sun} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import {useCallback, useEffect, useState} from 'react';
import {CalculatorTab} from './components/CalculatorTab';
import {HistoryTab} from './components/HistoryTab';
import {LivePriceTab} from './components/LivePriceTab';
import {OfflineIndicator} from './components/OfflineIndicator';
import {PriceAlertModal} from './components/PriceAlertModal';
import {PWAInstallButton} from './components/PWAInstallButton';
import {ShareModal} from './components/ShareModal';
import {TRANSLATIONS} from './i18n/translations';
import {maybeAutoPrune} from './services/cacheDb';
import {fetchLatestGold, fetchLiveSpotMarket} from './services/goldClient';
import {
  evaluateTargetPriceAlert,
  readPriceAlert,
  type PriceAlertConfig,
} from './services/priceAlerts';
import type {AppLanguage, LatestGoldResponse, LiveSpotMarketData, PreferredSource} from './types/gold';

type TabKey = 'history' | 'live' | 'calculator';

const THEME_STORAGE_KEY = 'kgp-theme';
const LANG_STORAGE_KEY = 'kgp-lang';

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialLang(): AppLanguage {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
  if (saved === 'ml' || saved === 'en') return saved;
  return 'en';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('live');
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [lang, setLang] = useState<AppLanguage>(getInitialLang);
  const [preferredSource, setPreferredSource] = useState<PreferredSource>('auto');

  const [latestData, setLatestData] = useState<LatestGoldResponse | null>(null);
  const [spotData, setSpotData] = useState<LiveSpotMarketData | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<PriceAlertConfig | null>(() => readPriceAlert());
  const [alertMatchedValue, setAlertMatchedValue] = useState<number | null>(null);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  const checkAlerts = useCallback(async (data: LatestGoldResponse) => {
    const evalRes = await evaluateTargetPriceAlert(data);
    setAlertConfig(evalRes.config);
    setAlertMatchedValue(evalRes.isMatched ? evalRes.currentValue : null);
  }, []);

  const loadLatest = useCallback(
    async (options?: {source?: PreferredSource; probe?: boolean; silent?: boolean}) => {
      const targetSource = options?.source ?? preferredSource;
      if (options?.silent) {
        setRefreshing(true);
      } else if (!latestData) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const [res, spot] = await Promise.all([
          fetchLatestGold({
            source: targetSource,
            probe: options?.probe ?? false,
          }),
          fetchLiveSpotMarket(),
        ]);
        setLatestData(res.data);
        setFromCache(res.fromCache);
        if (spot) setSpotData(spot);
        await checkAlerts(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to fetch gold prices.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [preferredSource, latestData, checkAlerts],
  );

  useEffect(() => {
    (async () => {
      await maybeAutoPrune();
      try {
        const cachedFirst = await fetchLatestGold({preferCacheFirst: true});
        setLatestData(cachedFirst.data);
        setFromCache(cachedFirst.fromCache);
        setLoading(false);
        await checkAlerts(cachedFirst.data);
      } catch {
        // Proceed directly to live fetch
      }
      await loadLatest({silent: true});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectSource = async (nextSource: PreferredSource) => {
    setPreferredSource(nextSource);
    await loadLatest({source: nextSource, probe: true, silent: true});
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleLang = () => {
    setLang((prev) => (prev === 'en' ? 'ml' : 'en'));
  };

  const navTabs = [
    {id: 'history' as const, label: t.navHistory, Icon: History},
    {id: 'live' as const, label: t.navGoldPrice, Icon: Coins},
    {id: 'calculator' as const, label: t.navCalculator, Icon: Calculator},
  ];

  return (
    <div className="kgp-canvas-bg fixed inset-0 flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Pinned Top App Bar — Always Visible */}
      <header className="shrink-0 z-30 border-b border-slate-900/8 liquid-glass-bar dark:border-white/10">
        <div className="mx-auto flex h-12 md:h-14 max-w-6xl items-center justify-between gap-2 sm:gap-6 px-3 sm:px-6">
          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className="flex items-center gap-2 text-left whitespace-nowrap cursor-pointer min-w-0"
          >
            <img
              src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
              alt="Kerala Gold Price logo"
              referrerPolicy="no-referrer"
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl object-cover shadow-sm shrink-0"
            />
            <span className="font-display text-sm sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate max-w-[110px] sm:max-w-none">
              <span className="sm:hidden">{lang === 'ml' ? 'സ്വർണ്ണ വില' : 'Kerala Gold'}</span>
              <span className="hidden sm:inline">{t.brandTitle}</span>
            </span>
          </button>

          {/* Zone 2: Desktop Primary Tabs */}
          <nav
            aria-label="Primary tabs"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400"
          >
            {navTabs.map(({id, label}) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`relative py-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'font-semibold text-amber-700 dark:text-amber-400'
                      : 'hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-amber-600 dark:bg-amber-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Share, Target Alert, Malayalam Toggle, Refresh, Theme, Install */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              disabled={!latestData}
              aria-label="Share gold rates"
              title="Share gold rates"
              className="min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl border border-slate-900/10 bg-white/70 text-slate-700 hover:bg-white disabled:opacity-50 dark:border-white/15 dark:bg-white/10 dark:text-slate-200 cursor-pointer"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setAlertOpen(true)}
              aria-label="Target price alert"
              title="Target price alert"
              className={`relative min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl border transition cursor-pointer ${
                alertConfig?.enabled
                  ? 'border-amber-600/35 bg-amber-500/15 text-amber-800 dark:border-amber-400/35 dark:bg-amber-400/15 dark:text-amber-300'
                  : 'border-slate-900/10 bg-white/70 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200'
              }`}
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={toggleLang}
              aria-label={lang === 'en' ? 'Switch to Malayalam view' : 'Switch to English view'}
              title={lang === 'en' ? 'മലയാളം' : 'English'}
              className="min-h-[36px] sm:min-h-[40px] px-2 sm:px-2.5 flex items-center justify-center rounded-xl border border-slate-900/10 bg-white/70 text-[11px] sm:text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 whitespace-nowrap cursor-pointer"
            >
              {lang === 'en' ? 'മല' : 'EN'}
            </button>

            <button
              type="button"
              onClick={() => loadLatest({probe: false, silent: true})}
              disabled={refreshing}
              aria-label="Refresh gold rate"
              title="Refresh gold rate"
              className="min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl border border-slate-900/10 bg-white/70 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to Day theme' : 'Switch to Night theme'}
              title={theme === 'dark' ? 'Day Theme' : 'Night Theme'}
              className="min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-xl border border-slate-900/10 bg-white/70 text-slate-700 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4 text-slate-700" aria-hidden="true" />
              )}
            </button>

            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Scrollable Middle Viewport Content (strictly bounded between pinned header & bottom nav) */}
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-5 pb-6 md:pb-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{opacity: 0, y: 4}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -3}}
              transition={{duration: 0.14, ease: [0.16, 1, 0.3, 1]}}
            >
              {activeTab === 'history' && <HistoryTab lang={lang} />}

              {activeTab === 'live' && (
                <LivePriceTab
                  lang={lang}
                  data={latestData}
                  spotData={spotData}
                  loading={loading}
                  refreshing={refreshing}
                  fromCache={fromCache}
                  error={error}
                  preferredSource={preferredSource}
                  alertConfig={alertConfig}
                  alertMatchedValue={alertMatchedValue}
                  onOpenAlertModal={() => setAlertOpen(true)}
                  onSelectSource={handleSelectSource}
                  onRefresh={(probe) => loadLatest({probe, silent: true})}
                  onOpenCalculator={() => setActiveTab('calculator')}
                />
              )}

              {activeTab === 'calculator' && <CalculatorTab lang={lang} latestData={latestData} />}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-6 border-t border-slate-900/8 pt-4 text-center text-[11px] sm:text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            {t.footerText}
          </footer>
        </div>
      </main>

      {/* Pinned Native-Style Bottom Navigation Bar on Mobile — Always Simultaneously Visible with Header */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden shrink-0 z-40 border-t border-slate-900/10 liquid-glass-bar pb-safe dark:border-white/10"
      >
        <div className="grid grid-cols-3 h-14 px-2 items-center">
          {navTabs.map(({id, label, Icon}) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-amber-500/12 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 font-medium'
                }`}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${active ? 'stroke-[2.3]' : 'stroke-[1.8]'}`}
                  aria-hidden="true"
                />
                <span className="text-[11px] leading-tight tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        data={latestData}
        lang={lang}
        theme={theme}
      />

      <PriceAlertModal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        data={latestData}
        lang={lang}
        onAlertChanged={(nextCfg) => {
          setAlertConfig(nextCfg);
          if (latestData && nextCfg?.enabled) {
            const val = nextCfg.unit === 'pavan' ? latestData.current.pavan22k : latestData.current.gram22k;
            setAlertMatchedValue(val <= nextCfg.targetPrice ? val : null);
          } else {
            setAlertMatchedValue(null);
          }
        }}
      />

      <OfflineIndicator message={t.offlineBanner} />
    </div>
  );
}

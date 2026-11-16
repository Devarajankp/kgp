import type {AppLanguage} from '../types/gold';

export interface AppStrings {
  brandTitle: string;
  navHistory: string;
  navGoldPrice: string;
  navCalculator: string;
  footerText: string;
  offlineBanner: string;
  live: {
    kicker: string;
    cached: string;
    title: string;
    fallbackSuffix: string;
    sourcesBtn: string;
    refreshBtn: string;
    syncingBtn: string;
    providersHeading: string;
    probeAllBtn: string;
    pavanTitle: string;
    gramTitle: string;
    steady: string;
    high: string;
    low: string;
    makingCalcLink: string;
    customWeightTitle: string;
    pavanUnit: string;
    gramUnit: string;
    chartTitleSuffix: string;
    chartSubtitle: string;
    priceLogTitle: string;
    colDate: string;
    colSession: string;
    colPavan: string;
    colGram: string;
    colChange: string;
    todayLabel: string;
    unableToLoad: string;
    retryFetch: string;
  };
  chart: {
    noPoints: string;
    pavanBtn: string;
    gramBtn: string;
    highShort: string;
    lowShort: string;
  };
  history: {
    title: string;
    subtitle: string;
    dailyTab: string;
    monthlyTab: string;
    yearlyTab: string;
    spanAll: string;
    span25: string;
    span10: string;
    searchPlaceholder: string;
    reloadBtn: string;
    high: string;
    low: string;
    deviceCache: string;
    liveArchive: string;
    recordedEntries: string;
    colYear: string;
    colMonth: string;
    colDate: string;
    colSession: string;
    colBenchmark: string;
    colPavan: string;
    colGram: string;
    colChange: string;
    cacheTitle: string;
    checkingCache: string;
    pruneBtn: string;
    clearBtn: string;
    prunedNone: string;
    clearedMsg: string;
  };
  calc: {
    estBill: string;
    effRate: string;
    title: string;
    syncedWith: string;
    syncLatest: string;
    purity: string;
    weightUnit: string;
    pavan: string;
    gram: string;
    ratePerGram: string;
    weightLabel: string;
    makingChargeVa: string;
    pctRate: string;
    perGramRate: string;
    flatRate: string;
    vaPercentage: string;
    gst: string;
    stone: string;
    exchange: string;
    hallmark: string;
    estJewelleryBill: string;
    baseGoldValue: string;
    makingCharge: string;
    stoneAddons: string;
    hallmarkingLabel: string;
    taxableSubtotal: string;
    oldGoldExchange: string;
    netPayable: string;
    reverseTitle: string;
    pavanSuffix: string;
    afterVaGst: string;
  };
}

export const TRANSLATIONS: Record<AppLanguage, AppStrings> = {
  en: {
    brandTitle: 'Kerala Gold Price',
    navHistory: 'History',
    navGoldPrice: 'Gold Price',
    navCalculator: 'Calculator',
    footerText: 'Kerala Gold Price (KGP) · Multi-Source Benchmark · Cached locally for offline PWA access',
    offlineBanner: 'Offline Mode · Using cached gold rates',
    live: {
      kicker: '22K Kerala',
      cached: 'Cached',
      title: "Today's Gold Price",
      fallbackSuffix: '(Fallback)',
      sourcesBtn: 'Sources',
      refreshBtn: 'Refresh',
      syncingBtn: 'Syncing',
      providersHeading: 'Primary & Fallback Providers',
      probeAllBtn: 'Probe All',
      pavanTitle: '1 Pavan (8g)',
      gramTitle: '1 Gram (22K)',
      steady: 'Steady',
      high: 'High',
      low: 'Low',
      makingCalcLink: 'Making Calculator',
      customWeightTitle: 'Custom Weight',
      pavanUnit: 'Pavan',
      gramUnit: 'Gram',
      chartTitleSuffix: 'Chart',
      chartSubtitle: 'Touch or hover to inspect daily & intraday updates',
      priceLogTitle: 'Price Log',
      colDate: 'Date',
      colSession: 'Session',
      colPavan: 'Pavan',
      colGram: '1 Gram',
      colChange: 'Change',
      todayLabel: 'Today',
      unableToLoad: 'Unable to load live gold prices',
      retryFetch: 'Retry Fetch',
    },
    chart: {
      noPoints: 'No chart points available for this selection.',
      pavanBtn: 'Pavan',
      gramBtn: '1 Gram',
      highShort: 'H',
      lowShort: 'L',
    },
    history: {
      title: 'Kerala Gold History',
      subtitle: 'Daily archives (Nov 2009+), monthly & yearly (1925–2026)',
      dailyTab: 'Daily',
      monthlyTab: 'Monthly',
      yearlyTab: 'Yearly',
      spanAll: '1925–2026',
      span25: '25 Years',
      span10: '10 Years',
      searchPlaceholder: 'Filter date, year, or price...',
      reloadBtn: 'Reload',
      high: 'High',
      low: 'Low',
      deviceCache: 'Device Cache',
      liveArchive: 'Live Archive',
      recordedEntries: 'Recorded Entries',
      colYear: 'Year',
      colMonth: 'Month',
      colDate: 'Date',
      colSession: 'Session',
      colBenchmark: 'Benchmark',
      colPavan: 'Pavan',
      colGram: '1 Gram',
      colChange: 'Change',
      cacheTitle: 'Device History Cache',
      checkingCache: 'Checking cache...',
      pruneBtn: 'Prune Unused',
      clearBtn: 'Clear',
      prunedNone: 'All cached entries are recent.',
      clearedMsg: 'Cleared offline history cache.',
    },
    calc: {
      estBill: 'Estimated Bill',
      effRate: 'Eff',
      title: 'Making Charge Calculator',
      syncedWith: 'Synced with',
      syncLatest: 'Sync Latest',
      purity: 'Purity',
      weightUnit: 'Weight Unit',
      pavan: 'Pavan',
      gram: 'Gram',
      ratePerGram: 'Rate / Gram (₹)',
      weightLabel: 'Weight',
      makingChargeVa: 'Making Charge (VA)',
      pctRate: '% Rate',
      perGramRate: '₹/g',
      flatRate: 'Flat ₹',
      vaPercentage: 'VA Percentage',
      gst: 'GST (%)',
      stone: 'Stone (₹)',
      exchange: 'Exchange (₹)',
      hallmark: 'Include BIS HUID Hallmarking (₹45 + GST)',
      estJewelleryBill: 'Estimated Jewellery Bill',
      baseGoldValue: 'Base Gold Value',
      makingCharge: 'Making Charge',
      stoneAddons: 'Stone / Add-ons',
      hallmarkingLabel: 'BIS HUID Hallmarking',
      taxableSubtotal: 'Taxable Subtotal',
      oldGoldExchange: 'Old Gold Exchange',
      netPayable: 'Net Payable',
      reverseTitle: 'Reverse Budget Estimator',
      pavanSuffix: 'Pavan',
      afterVaGst: 'g after VA & GST',
    },
  },
  ml: {
    brandTitle: 'കേരള സ്വർണ്ണ വില',
    navHistory: 'ചരിത്രം',
    navGoldPrice: 'സ്വർണ്ണ വില',
    navCalculator: 'കാൽക്കുലേറ്റർ',
    footerText: 'കേരള സ്വർണ്ണ വില (KGP) · വിവിധ സ്രോതസ്സുകൾ · ഓഫ്‌ലൈൻ PWA കാഷ് ലഭ്യം',
    offlineBanner: 'ഓഫ്‌ലൈൻ മോഡ് · കാഷ് ചെയ്ത നിരക്കുകൾ',
    live: {
      kicker: '22K കേരളം',
      cached: 'കാഷ്',
      title: 'ഇന്നത്തെ സ്വർണ്ണ വില',
      fallbackSuffix: '(ബാക്കപ്പ്)',
      sourcesBtn: 'സ്രോതസ്സ്',
      refreshBtn: 'പുതുക്കുക',
      syncingBtn: 'പുതുക്കുന്നു',
      providersHeading: 'പ്രധാന & ബാക്കപ്പ് സ്രോതസ്സുകൾ',
      probeAllBtn: 'എല്ലാം പരിശോധിക്കുക',
      pavanTitle: '1 പവൻ (8g)',
      gramTitle: '1 ഗ്രാം (22K)',
      steady: 'മാറ്റമില്ല',
      high: 'ഉയർന്നത്',
      low: 'കുറഞ്ഞത്',
      makingCalcLink: 'പണിക്കൂലി കണക്കാക്കാം',
      customWeightTitle: 'തൂക്കം അനുസരിച്ച് വില',
      pavanUnit: 'പവൻ',
      gramUnit: 'ഗ്രാം',
      chartTitleSuffix: 'ഗ്രാഫ്',
      chartSubtitle: 'ദിവസേനയുള്ള മാറ്റങ്ങൾ കാണാൻ ഗ്രാഫിൽ തൊടുക',
      priceLogTitle: 'നിരക്ക് പട്ടിക',
      colDate: 'തീയതി',
      colSession: 'സമയം',
      colPavan: 'പവൻ',
      colGram: '1 ഗ്രാം',
      colChange: 'മാറ്റം',
      todayLabel: 'ഇന്ന്',
      unableToLoad: 'തത്സമയ സ്വർണ്ണ വില ലഭ്യമായില്ല',
      retryFetch: 'വീണ്ടും ശ്രമിക്കുക',
    },
    chart: {
      noPoints: 'തിരഞ്ഞെടുത്ത വിവരങ്ങൾക്ക് ഗ്രാഫ് ലഭ്യമല്ല.',
      pavanBtn: 'പവൻ',
      gramBtn: '1 ഗ്രാം',
      highShort: 'ഉയർന്നത്',
      lowShort: 'കുറഞ്ഞത്',
    },
    history: {
      title: 'സ്വർണ്ണ വില ചരിത്രം',
      subtitle: 'ദിവസേന (2009+), പ്രതിമാസം & വാർഷികം (1925–2026)',
      dailyTab: 'ദിവസേന',
      monthlyTab: 'പ്രതിമാസം',
      yearlyTab: 'വാർഷികം',
      spanAll: '1925–2026',
      span25: '25 വർഷം',
      span10: '10 വർഷം',
      searchPlaceholder: 'തീയതി, വർഷം അല്ലെങ്കിൽ വില...',
      reloadBtn: 'പുതുക്കുക',
      high: 'ഉയർന്നത്',
      low: 'കുറഞ്ഞത്',
      deviceCache: 'ഉപകരണ കാഷ്',
      liveArchive: 'തത്സമയ രേഖ',
      recordedEntries: 'രേഖപ്പെടുത്തിയ നിരക്കുകൾ',
      colYear: 'വർഷം',
      colMonth: 'മാസം',
      colDate: 'തീയതി',
      colSession: 'സമയം',
      colBenchmark: 'നിരക്ക്',
      colPavan: 'പവൻ',
      colGram: '1 ഗ്രാം',
      colChange: 'മാറ്റം',
      cacheTitle: 'ഉപകരണ ചരിത്ര കാഷ്',
      checkingCache: 'കാഷ് പരിശോധിക്കുന്നു...',
      pruneBtn: 'പഴയത് നീക്കുക',
      clearBtn: 'മായ്ക്കുക',
      prunedNone: 'എല്ലാ കാഷ് രേഖകളും പുതിയതാണ്.',
      clearedMsg: 'ഓഫ്‌ലൈൻ ചരിത്ര കാഷ് മായ്ച്ചു.',
    },
    calc: {
      estBill: 'ഏകദേശ ബിൽ',
      effRate: 'ശരാശരി',
      title: 'പണിക്കൂലി കാൽക്കുലേറ്റർ',
      syncedWith: 'നിരക്ക്',
      syncLatest: 'ഇന്നത്തെ വില',
      purity: 'ശുദ്ധത',
      weightUnit: 'അളവ്',
      pavan: 'പവൻ',
      gram: 'ഗ്രാം',
      ratePerGram: '1 ഗ്രാം വില (₹)',
      weightLabel: 'തൂക്കം',
      makingChargeVa: 'പണിക്കൂലി (VA)',
      pctRate: '% നിരക്ക്',
      perGramRate: '₹/ഗ്രാം',
      flatRate: 'ആകെ ₹',
      vaPercentage: 'പണിക്കൂലി ശതമാനം',
      gst: 'GST (%)',
      stone: 'കല്ല് (₹)',
      exchange: 'പഴയ സ്വർണം (₹)',
      hallmark: 'BIS HUID ഹാൾമാർക്കിംഗ് (₹45 + GST)',
      estJewelleryBill: 'ഏകദേശ ആഭരണ ബിൽ',
      baseGoldValue: 'സ്വർണ്ണത്തിന്റെ വില',
      makingCharge: 'പണിക്കൂലി (VA)',
      stoneAddons: 'കല്ല് / മറ്റ് ചാർജ്',
      hallmarkingLabel: 'BIS HUID ഹാൾമാർക്ക്',
      taxableSubtotal: 'നികുതിക്ക് മുൻപ്',
      oldGoldExchange: 'പഴയ സ്വർണ്ണ കുറവ്',
      netPayable: 'ആകെ നൽകേണ്ട തുക',
      reverseTitle: 'ബജറ്റ് എസ്റ്റിമേറ്റർ',
      pavanSuffix: 'പവൻ',
      afterVaGst: 'ഗ്രാം (VA & GST ഉൾപ്പെടെ)',
    },
  },
};

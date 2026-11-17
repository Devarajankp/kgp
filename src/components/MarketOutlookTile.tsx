import {Compass, Info, TrendingDown, TrendingUp} from 'lucide-react';
import React from 'react';
import type {AppLanguage, LatestGoldResponse, LiveSpotMarketData} from '../types/gold';
import {formatInr} from '../utils/format';

interface MarketOutlookTileProps {
  lang: AppLanguage;
  latestData: LatestGoldResponse;
  spotData: LiveSpotMarketData | null;
}

export const MarketOutlookTile: React.FC<MarketOutlookTileProps> = ({
  lang,
  latestData,
  spotData,
}) => {
  if (!spotData) return null;

  const spotPct = spotData.spotChangePercent;
  const high = latestData.monthlyHigh?.pavan || latestData.current.pavan22k;
  const low = latestData.monthlyLow?.pavan || latestData.current.pavan22k;
  const rangeSpan = high - low;
  const rangePct =
    rangeSpan > 0 ? Math.round(((latestData.current.pavan22k - low) / rangeSpan) * 100) : 50;

  const isSpotSoft = spotPct <= -0.4;
  const isSpotRising = spotPct >= 0.4;
  const retailSpread = Math.max(0, Math.round(latestData.current.gram22k - spotData.spot22kGramInr));

  let headline = '';
  let situationUrgent = '';
  let situationFlexible = '';

  if (lang === 'ml') {
    if (isSpotSoft) {
      headline = 'ആഗോള വിപണിയിൽ നേരിയ ഇടിവ് — തിരക്കില്ലെങ്കിൽ നാളെ വരെ കാക്കാം';
      situationUrgent = 'അടിയന്തര ആവശ്യമെങ്കിൽ: ഇന്നത്തെ കുറഞ്ഞ ബോർഡ് നിരക്കിൽ വാങ്ങുകയോ അഡ്വാൻസ് ബുക്ക് ചെയ്യുകയോ ചെയ്യാം.';
      situationFlexible = 'സമയമുണ്ടെങ്കിൽ: അന്താരാഷ്ട്ര സ്പോട്ട് നിരക്ക് ഇടിഞ്ഞതിനാൽ (-' + Math.abs(spotPct).toFixed(2) + '%) നാളെ രാവിലെ 9:30 IST AKGSMA നിരക്കിൽ ചെറിയ കുറവിന് സാധ്യതയുണ്ട്.';
    } else if (isSpotRising) {
      headline = 'ആഗോള വിപണി ഉയരുന്നു — ഇന്ന് നിരക്ക് ലോക്ക് ചെയ്യുന്നത് ഉചിതം';
      situationUrgent = 'ഉടൻ വാങ്ങേണ്ടവർ: നാളെ രാവിലെ വില കൂടാൻ സാധ്യതയുള്ളതിനാൽ ഇന്നത്തെ ബോർഡ് നിരക്കിൽ വാങ്ങുന്നതോ ബുക്ക് ചെയ്യുന്നതോ സുരക്ഷിതം.';
      situationFlexible = 'സമയമുണ്ടെങ്കിൽ: ആഗോള സ്പോട്ട് (+' + spotPct.toFixed(2) + '%) ഉയർന്നതിനാൽ തിരക്കില്ലാത്തവർ ഒറ്റയടിക്ക് വാങ്ങാതെ തവണകളായി വാങ്ങുക.';
    } else {
      headline = 'വിപണി സ്ഥിരതയോടെ തുടരുന്നു — ആവശ്യാനുസരണം വാങ്ങാം';
      situationUrgent = 'ഉടൻ വാങ്ങേണ്ടവർ: വിലയിൽ വലിയ ചാഞ്ചാട്ടമില്ലാത്തതിനാൽ സുരക്ഷിതമായി വാങ്ങാം.';
      situationFlexible = 'സമയമുണ്ടെങ്കിൽ: പ്രതിമാസ നിരക്കിന്റെ ' + rangePct + '% നിലവാരത്തിലാണ് വില; ചെറിയ ഇടിവുകളിൽ ഘട്ടം ഘട്ടമായി വാങ്ങാം.';
    }
  } else {
    if (isSpotSoft) {
      headline = 'Global Spot Softer — Wait for Morning Fix if Flexible';
      situationUrgent =
        'Buying urgently today: Today’s board rate is already discounted; safe to buy or pre-book.';
      situationFlexible = `Flexible timing: Live global spot is ${spotPct.toFixed(2)}% softer. If overnight spot stays weak, tomorrow’s 9:30 AM IST Kerala fix may open slightly lower.`;
    } else if (isSpotRising) {
      headline = 'Global Spot Rising — Lock Today’s Rate Before Revision';
      situationUrgent = `Buying soon: Live global spot is up +${spotPct.toFixed(2)}%, which often puts upward pressure on tomorrow’s 9:30 AM IST opening.`;
      situationFlexible =
        'Flexible timing: Avoid chasing sudden spikes—consider splitting large jewellery purchases or pre-booking today’s rate.';
    } else {
      headline = 'Balanced Market — Steady Window for Planned Buys';
      situationUrgent =
        'Buying today: Spot volatility is mild, making today’s Kerala board rate predictable.';
      situationFlexible = `Flexible timing: Currently sitting at ${rangePct}% of this month’s price range; accumulate in tranches on dips.`;
    }
  }

  return (
    <section className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className="rounded-xl bg-amber-500/12 p-2 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
            <Compass className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              {lang === 'ml' ? 'ആഗോള സ്പോട്ട് & വാങ്ങൽ സൂചന' : 'Global Spot & Buy-vs-Wait Outlook'}
            </div>
            <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
              {headline}
            </h2>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums shrink-0 ${
            spotPct > 0
              ? 'text-emerald-700 dark:text-emerald-400'
              : spotPct < 0
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          {spotPct > 0 ? (
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          24h Spot: {spotPct > 0 ? '+' : ''}
          {spotPct.toFixed(2)}%
        </span>
      </div>

      {/* Real Side-by-Side Metrics */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] sm:text-xs tabular-nums">
        <div className="rounded-xl border border-slate-900/8 bg-white/55 px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {lang === 'ml' ? 'ആഗോള സ്പോട്ട് (22K)' : 'Global Spot (22K Raw)'}
          </div>
          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
            {formatInr(Math.round(spotData.spot22kGramInr))}/g
          </div>
        </div>

        <div className="rounded-xl border border-slate-900/8 bg-white/55 px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">USD / INR</div>
          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
            ₹{spotData.usdInr.toFixed(2)} ({spotData.usdInrChangePercent > 0 ? '+' : ''}
            {spotData.usdInrChangePercent.toFixed(2)}%)
          </div>
        </div>

        <div className="rounded-xl border border-slate-900/8 bg-white/55 px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {lang === 'ml' ? 'നികുതി / റീട്ടെയിൽ അന്തരം' : 'Duty & Board Spread'}
          </div>
          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
            +{formatInr(retailSpread)}/g
          </div>
        </div>

        <div className="rounded-xl border border-slate-900/8 bg-white/55 px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {lang === 'ml' ? 'മാസത്തെ നിരക്ക് നില' : 'Monthly Range Pos'}
          </div>
          <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
            {rangePct}% ({rangePct <= 35 ? (lang === 'ml' ? 'താഴ്ന്നത്' : 'Low Zone') : rangePct >= 70 ? (lang === 'ml' ? 'ഉയർന്നത്' : 'High Zone') : (lang === 'ml' ? 'മിതമായത്' : 'Mid')})
          </div>
        </div>
      </div>

      {/* Situational Guidance */}
      <div className="mt-3 space-y-1.5 text-[11px] sm:text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
        <p>{situationUrgent}</p>
        <p>{situationFlexible}</p>
      </div>

      <p className="mt-2.5 flex items-start gap-1.5 border-t border-slate-900/8 pt-2 text-[10px] text-slate-500 dark:border-white/10 dark:text-slate-400">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {lang === 'ml'
            ? 'LivePriceOfGold.com സ്പോട്ട് നിരക്കിൽ ഇന്ത്യൻ കസ്റ്റംസ് തീരുവയും (6%+) 3% GST-യും ഉൾപ്പെടുന്നില്ല. ഇത് തത്സമയ വിപണി സൂചന മാത്രമാണ്; നാളത്തെ നിരക്ക് ഉറപ്പുനൽകുന്നില്ല.'
            : 'LivePriceOfGold.com reflects raw XAU/INR spot rates (excluding Indian customs duty & GST). Market signal only — next-day AKGSMA rates cannot be guaranteed.'}
        </span>
      </p>
    </section>
  );
};

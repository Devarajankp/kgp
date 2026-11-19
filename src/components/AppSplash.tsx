import {AnimatePresence, motion} from 'motion/react';
import React, {useEffect, useState} from 'react';
import type {AppLanguage} from '../types/gold';

interface AppSplashProps {
  lang: AppLanguage;
  ready: boolean;
}

const SPLASH_SESSION_KEY = 'kgp-splash-shown-v2';

function shouldShowInitialSplash(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  try {
    if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === '1') {
      return false;
    }
    window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
  } catch {
    // Allow splash if storage is unavailable
  }
  return true;
}

export const AppSplash: React.FC<AppSplashProps> = ({lang, ready}) => {
  const [visible, setVisible] = useState<boolean>(shouldShowInitialSplash);
  const [minElapsed, setMinElapsed] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) return;
    const minTimer = window.setTimeout(() => setMinElapsed(true), 880);
    const maxTimer = window.setTimeout(() => setVisible(false), 1450);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [visible]);

  useEffect(() => {
    if (visible && minElapsed && ready) {
      setVisible(false);
    }
  }, [visible, minElapsed, ready]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="kgp-splash"
          initial={{opacity: 1}}
          exit={{opacity: 0, scale: 1.03}}
          transition={{duration: 0.34, ease: [0.16, 1, 0.3, 1]}}
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center kgp-canvas-bg select-none"
          aria-hidden="true"
        >
          {/* Ambient radial gold aura */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <motion.div
              initial={{opacity: 0, scale: 0.6}}
              animate={{opacity: 1, scale: 1}}
              transition={{duration: 0.65, ease: [0.16, 1, 0.3, 1]}}
              className="h-64 w-64 rounded-full bg-amber-400/20 blur-3xl dark:bg-amber-400/16"
            />
          </div>

          {/* 3D Stamped 22K Gold Sovereign Coin */}
          <div className="kgp-coin-stage relative">
            <motion.div
              initial={{opacity: 0, scale: 0.72, rotateY: -65, rotateX: 16}}
              animate={{opacity: 1, scale: 1, rotateY: 0, rotateX: 0}}
              transition={{
                type: 'spring',
                stiffness: 185,
                damping: 18,
                mass: 0.85,
              }}
              className="kgp-coin-3d relative flex h-24 w-24 items-center justify-center rounded-full"
            >
              {/* Outer beveled gold rim */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-200 via-amber-500 to-amber-800 p-[3px] shadow-[0_18px_40px_-10px_rgba(184,119,20,0.55)]">
                {/* Inner brushed bullion face */}
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#fff5cf] via-[#e5ac3c] to-[#9b620a]">
                  {/* Milled coin inner ring */}
                  <div className="absolute inset-2 rounded-full border border-dashed border-amber-950/25" />
                  <div className="absolute inset-[11px] rounded-full border border-amber-100/45" />

                  {/* Stamped emblem */}
                  <div className="relative z-10 flex flex-col items-center text-center leading-none text-amber-950">
                    <span className="font-gold-numeral text-2xl font-bold tracking-tight drop-shadow-[0_1px_0_rgba(255,248,220,0.65)]">
                      916
                    </span>
                    <span className="mt-0.5 text-[9px] font-bold tracking-[0.18em] uppercase opacity-80">
                      22K GOLD
                    </span>
                  </div>

                  {/* Specular foil glint sweep */}
                  <motion.div
                    initial={{x: '-130%', skewX: -22}}
                    animate={{x: '220%', skewX: -22}}
                    transition={{duration: 0.85, delay: 0.18, ease: [0.22, 1, 0.36, 1]}}
                    className="pointer-events-none absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/75 to-transparent"
                  />
                </div>
              </div>
            </motion.div>
          </div>

          {/* Wordmark + Hairline Progress */}
          <motion.div
            initial={{opacity: 0, y: 10}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.35, delay: 0.14, ease: [0.16, 1, 0.3, 1]}}
            className="mt-5 flex flex-col items-center text-center"
          >
            <span className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {lang === 'ml' ? 'കേരള സ്വർണ്ണ വില' : 'Kerala Gold Price'}
            </span>
            <span className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {lang === 'ml' ? 'തത്സമയ 22K വിപണി നിരക്ക്' : 'Live 22K Bullion & Sovereign Rates'}
            </span>

            <div className="mt-4 h-[2.5px] w-28 overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/12">
              <motion.div
                initial={{scaleX: 0}}
                animate={{scaleX: 1}}
                transition={{duration: 0.82, ease: [0.16, 1, 0.3, 1]}}
                style={{transformOrigin: 'left center'}}
                className="h-full w-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

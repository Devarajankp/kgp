import React, {useEffect, useRef, useState} from 'react';
import {formatInr} from '../utils/format';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  className?: string;
}

/**
 * Smoothly rolls INR gold rates on initial load and live price updates using compositor-friendly rAF easing.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  decimals = 0,
  className = '',
}) => {
  const [display, setDisplay] = useState<number>(value);
  const prevRef = useRef<number>(value);

  useEffect(() => {
    const startVal = prevRef.current;
    const endVal = value;
    prevRef.current = endVal;

    if (
      startVal === endVal ||
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(endVal);
      return;
    }

    const duration = 380;
    const startTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // Ease-out cubic for snappy Apple Stocks feel
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = startVal + (endVal - startVal) * eased;
      setDisplay(progress >= 1 ? endVal : Math.round(next));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return <span className={`tabular-nums ${className}`}>{formatInr(display, decimals)}</span>;
};

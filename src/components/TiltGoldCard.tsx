import React, {useRef} from 'react';

interface TiltGoldCardProps {
  children: React.ReactNode;
  className?: string;
  goldAccent?: boolean;
  flashDirection?: 'up' | 'down' | null;
}

/**
 * Hardware-accelerated 3D perspective tilt card with pointer-tracking specular metallic sheen.
 * Feels tactile like a physical 22K bullion card on desktop and presses smoothly on mobile touch.
 */
export const TiltGoldCard: React.FC<TiltGoldCardProps> = ({
  children,
  className = '',
  goldAccent = false,
  flashDirection = null,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = cardRef.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const rotY = (x - 0.5) * 9;
    const rotX = (0.5 - y) * 8;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      el.style.setProperty('--tilt-x', `${rotX.toFixed(2)}deg`);
      el.style.setProperty('--tilt-y', `${rotY.toFixed(2)}deg`);
      el.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--glare-opacity', '1');
    });
  };

  const handlePointerLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
    el.style.setProperty('--glare-opacity', '0');
  };

  const flashClass =
    flashDirection === 'up'
      ? 'kgp-flash-up'
      : flashDirection === 'down'
        ? 'kgp-flash-down'
        : '';

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`kgp-tilt-card ${goldAccent ? 'kgp-tilt-gold' : ''} ${flashClass} ${className}`}
    >
      <div className="kgp-tilt-glare" aria-hidden="true" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};

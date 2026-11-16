import {WifiOff} from 'lucide-react';
import React from 'react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  message?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  message = 'Offline Mode · Using cached gold rates',
}) => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 md:bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-600/95 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
};

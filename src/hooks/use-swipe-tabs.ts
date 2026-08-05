"use client";

import { useCallback, useRef } from "react";

/**
 * Horizontal swipe to cycle a discrete tab index.
 * Ignores mostly-vertical gestures so lists still scroll.
 */
export function useSwipeTabs<T extends string>({
  tabs,
  value,
  onChange,
  threshold = 56,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (v: T) => void;
  threshold?: number;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    tracking.current = true;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!tracking.current) return;
      tracking.current = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;
      if (Math.abs(dx) < threshold) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return; // vertical scroll

      const idx = tabs.indexOf(value);
      if (idx < 0) return;
      if (dx < 0 && idx < tabs.length - 1) {
        onChange(tabs[idx + 1]!);
      } else if (dx > 0 && idx > 0) {
        onChange(tabs[idx - 1]!);
      }
    },
    [tabs, value, onChange, threshold],
  );

  return { onTouchStart, onTouchEnd };
}

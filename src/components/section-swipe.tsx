"use client";

import { useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  SWIPE_PATH,
  resolveSwipeIndex,
  stepToHref,
} from "@/lib/swipe-path";

/**
 * One continuous horizontal swipe across the whole app:
 * Inicio → Lista → Resumen → Gráficos → Evolución → Pagos → Hogar → Gráficos hogar
 */
export function SectionSwipe({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
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
      if (Math.abs(dx) < 56) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.15) return;

      const tab = searchParams.get("tab");
      const idx = resolveSwipeIndex(pathname, tab);
      if (idx < 0) return;

      // Finger left → next step; finger right → previous step
      const nextIdx = dx < 0 ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= SWIPE_PATH.length) return;

      const step = SWIPE_PATH[nextIdx]!;
      router.push(stepToHref(step));
    },
    [pathname, searchParams, router],
  );

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="min-h-[50vh]"
    >
      {children}
    </div>
  );
}

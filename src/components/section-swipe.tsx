"use client";

import { useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Main bottom-nav order (mobile section swipe). */
const SECTIONS = [
  "/dashboard",
  "/consumos",
  "/deuda",
  "/compartido",
] as const;

type Section = (typeof SECTIONS)[number];

function sectionFromPath(pathname: string): Section | null {
  for (const s of SECTIONS) {
    if (pathname === s || pathname.startsWith(`${s}/`)) return s;
  }
  return null;
}

/**
 * Wraps page content so a clear horizontal swipe moves between
 * Inicio → Gastos → Deuda → Hogar (and back).
 * Nested tab swipes call stopPropagation when they handle the gesture;
 * at tab edges, the event reaches this wrapper and changes section.
 */
export function SectionSwipe({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
      // Slightly higher threshold than in-tab swipe so intentional section changes
      if (Math.abs(dx) < 72) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

      const current = sectionFromPath(pathname);
      if (!current) return;
      const idx = SECTIONS.indexOf(current);
      if (idx < 0) return;

      if (dx < 0 && idx < SECTIONS.length - 1) {
        router.push(SECTIONS[idx + 1]!);
      } else if (dx > 0 && idx > 0) {
        router.push(SECTIONS[idx - 1]!);
      }
    },
    [pathname, router],
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

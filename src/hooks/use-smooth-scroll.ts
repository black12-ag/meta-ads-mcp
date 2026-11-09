import { useEffect } from "react";

/** True when a scrollable element under the pointer can still move in the wheel's direction. */
function nestedCanScroll(el: Element | null, dy: number) {
  for (; el && el !== document.documentElement; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight) return true;
    }
  }
  return false;
}

/**
 * Slow, weighty wheel scrolling for the landing page (the Gravity spec's lerp of 0.09).
 * Mouse wheels only: touch, keyboard, the scrollbar and reduced motion keep native scrolling.
 */
export function useSmoothScroll(lerp = 0.09) {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!matchMedia("(pointer: fine)").matches) return;
    let target = scrollY;
    let current = scrollY;
    let raf = 0;
    const frame = () => {
      current += (target - current) * lerp;
      if (Math.abs(target - current) < 0.5) current = target;
      // "instant": the stylesheet's smooth scroll-behavior would otherwise animate every step
      scrollTo({ top: current, behavior: "instant" });
      raf = current === target ? 0 : requestAnimationFrame(frame);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch-zoom, sideways
      if (nestedCanScroll(e.target as Element | null, e.deltaY)) return; // menus, code blocks
      e.preventDefault();
      if (!raf) target = current = scrollY;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      const max = document.documentElement.scrollHeight - innerHeight;
      target = Math.min(max, Math.max(0, target + e.deltaY * unit));
      if (!raf) raf = requestAnimationFrame(frame);
    };
    // Keyboard, scrollbar and anchor jumps move the page without us: start from there next time.
    const onScroll = () => {
      if (!raf) target = current = scrollY;
    };
    addEventListener("wheel", onWheel, { passive: false });
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("wheel", onWheel);
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [lerp]);
}

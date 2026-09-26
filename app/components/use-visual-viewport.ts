"use client";
import { useEffect } from "react";

export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let baseline = viewport?.height || innerHeight;
    let frame = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const typing = () =>
      document.activeElement instanceof HTMLElement &&
      document.activeElement.matches(
        ".editor input:not([type=file]):not([type=checkbox]),.editor textarea",
      );
    const update = () => {
      const height = viewport?.height || innerHeight;
      const top = viewport?.offsetTop || 0;
      const focused = typing();
      if (!focused) baseline = Math.max(height, innerHeight);
      const layoutHeight = Math.max(baseline, innerHeight);
      const keyboard = focused && layoutHeight - height > 100;
      root.style.setProperty("--visible-height", `${height}px`);
      root.style.setProperty("--visible-top", `${top}px`);
      root.style.setProperty("--editor-layout-height", `${layoutHeight}px`);
      root.style.setProperty(
        "--keyboard-occlusion",
        `${keyboard ? layoutHeight - height : 0}px`,
      );
      root.classList.toggle("keyboard-open", keyboard);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement)) return;
        const scroller = field.closest<HTMLElement>(".editor-fields");
        if (!scroller) return;
        const f = field.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        // The sheet continues beneath the native keyboard; visibility does not.
        const bottom = Math.min(s.bottom, top + height) - 16;
        const start = Math.max(s.top, top) + 16;
        if (f.bottom > bottom) scroller.scrollTop += f.bottom - bottom;
        else if (f.top < start) scroller.scrollTop -= start - f.top;
      });
    };
    const focus = () => {
      update();
      timers.push(setTimeout(update, 120), setTimeout(update, 350));
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
      root.classList.remove("keyboard-open");
    };
  }, []);
}

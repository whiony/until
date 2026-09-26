"use client";
import { useEffect } from "react";
// iOS keyboards shrink the visual viewport, not always the layout viewport.
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      document.documentElement.style.setProperty("--visible-height", `${viewport?.height || window.innerHeight}px`);
      document.documentElement.style.setProperty("--visible-top", `${viewport?.offsetTop || 0}px`);
    };
    const resize = () => {
      update();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const field = document.activeElement;
        if (field instanceof HTMLElement && field.closest('.editor-fields'))
          field.scrollIntoView({ block: 'nearest' });
      });
    };
    update();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);
}

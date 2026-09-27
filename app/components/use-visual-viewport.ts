"use client";
import { useEffect } from "react";

export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let baseline = Math.max(viewport?.height || 0, innerHeight);
    let frame = 0;
    let width = innerWidth;
    let keyboardWasOpen = false;
    let editor: Element | null = null;
    const update = () => {
      const currentEditor = document.querySelector(".editor");
      if (editor !== currentEditor) {
        editor = currentEditor;
        root.style.setProperty("--editor-scroll-tail", "0px");
        keyboardWasOpen = false;
      }
      const field = document.activeElement;
      const typing =
        field instanceof HTMLElement &&
        field.matches(
          ".editor input:not([type=file]):not([type=checkbox]),.editor textarea",
        );
      const height = viewport?.height || innerHeight;
      const top = viewport?.offsetTop || 0;
      if (width !== innerWidth) {
        width = innerWidth;
        baseline = Math.max(height, innerHeight);
      } else if (!typing && !keyboardWasOpen)
        baseline = Math.max(baseline, height, innerHeight);
      const layoutHeight = Math.max(baseline, innerHeight);
      // Blur precedes the keyboard's closing animation on iOS. Keep its geometry
      // until the viewport expands, even when focus has moved to Done.
      const keyboard =
        !!editor && (typing || keyboardWasOpen) && layoutHeight - height > 100;
      const scroller = editor?.querySelector<HTMLElement>(".editor-fields");
      const previousScroll = scroller?.scrollTop || 0;
      root.style.setProperty("--visible-height", `${height}px`);
      root.style.setProperty("--visible-top", `${top}px`);
      root.style.setProperty("--editor-layout-height", `${layoutHeight}px`);
      root.style.setProperty(
        "--keyboard-occlusion",
        `${keyboard ? layoutHeight - height : 0}px`,
      );
      if (keyboard)
        root.style.setProperty(
          "--editor-scroll-tail",
          `${layoutHeight - height}px`,
        );
      root.classList.toggle("keyboard-open", keyboard);
      if (keyboardWasOpen && !keyboard && scroller) {
        root.style.setProperty("--editor-scroll-tail", "0px");
        // Removing keyboard clearance can clamp scrollTop by hundreds of pixels.
        // Retain only the clearance needed for the current reading position; it
        // contracts as the user scrolls back up, without moving their draft.
        const excess = Math.max(
          0,
          previousScroll - (scroller.scrollHeight - scroller.clientHeight),
        );
        root.style.setProperty("--editor-scroll-tail", `${excess}px`);
        scroller.scrollTop = previousScroll;
      }
      keyboardWasOpen = keyboard;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          !typing ||
          !keyboard ||
          !(field instanceof HTMLElement) ||
          !scroller
        )
          return;
        const f = field.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        const bottom = Math.min(s.bottom, top + height) - 16;
        const start = Math.max(s.top, top) + 16;
        if (f.height > bottom - start || f.top < start)
          scroller.scrollTop += f.top - start;
        else if (f.bottom > bottom) scroller.scrollTop += f.bottom - bottom;
      });
    };
    const focus = () => {
      update();
    };
    const scroll = (event: Event) => {
      if (
        keyboardWasOpen ||
        !(event.target instanceof HTMLElement) ||
        !event.target.matches(".editor-fields")
      )
        return;
      const scroller = event.target;
      const tail =
        parseFloat(root.style.getPropertyValue("--editor-scroll-tail")) || 0;
      if (!tail) return;
      const needed = Math.max(
        0,
        scroller.scrollTop +
          scroller.clientHeight -
          (scroller.scrollHeight - tail),
      );
      if (needed < tail)
        root.style.setProperty("--editor-scroll-tail", `${needed}px`);
    };
    const observer = new MutationObserver(() => {
      if (editor !== document.querySelector(".editor")) update();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    document.addEventListener("scroll", scroll, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
      document.removeEventListener("scroll", scroll, true);
      root.classList.remove("keyboard-open");
      root.style.removeProperty("--editor-scroll-tail");
    };
  }, []);
}

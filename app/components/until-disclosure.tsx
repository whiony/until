"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
export function Disclosure({
  title,
  defaultOpen = false,
  children,
  className = "",
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen),
    section = useRef<HTMLDetailsElement>(null),
    userExpanded = useRef(false);
  useLayoutEffect(() => {
    if (!open || !userExpanded.current) return;
    userExpanded.current = false;
    const element = section.current,
      scroller = element?.closest<HTMLElement>(".editor-fields");
    const first = element?.querySelector<HTMLElement>(
        ".section-content .field",
      ),
      heading = element?.querySelector("summary");
    if (!scroller || !first || !heading) return;
    const visible = scroller.getBoundingClientRect(),
      field = first.getBoundingClientRect(),
      titleBox = heading.getBoundingClientRect();
    const top = visible.top + 8,
      bottom = visible.bottom - 12;
    let delta = 0;
    if (titleBox.top < top) delta = titleBox.top - top;
    else if (field.bottom > bottom)
      delta = Math.min(field.bottom - bottom, Math.max(0, titleBox.top - top));
    if (delta)
      scroller.scrollBy({
        top: delta,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [open]);
  return (
    <details
      ref={section}
      className={`editor-section ${className}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          userExpanded.current = !open;
          setOpen(!open);
        }}
      >
        <span>{title}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="section-content">{children}</div>
    </details>
  );
}

"use client";
import { useState, type ReactNode } from "react";
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
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className={`editor-section ${className}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
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

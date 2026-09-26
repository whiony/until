"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
const helpEvent = "until-help-open";
export function Help({ label, text }: { label: string; text: string }) {
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [boundary, setBoundary] = useState<Element | undefined>();
  useEffect(() => {
    const other = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setOpen(false);
    };
    const scroll = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.matches(".editor-fields")
      ) {
        const visible = event.target.getBoundingClientRect();
        const button = trigger.current?.getBoundingClientRect();
        if (
          button &&
          (button.top < visible.top || button.bottom > visible.bottom)
        )
          setOpen(false);
      }
    };
    document.addEventListener(helpEvent, other);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener(helpEvent, other);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [id]);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setBoundary(trigger.current?.closest(".editor") || undefined);
        if (next)
          document.dispatchEvent(new CustomEvent(helpEvent, { detail: id }));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={trigger}
          type="button"
          className="field-help"
          aria-label={`Help: ${label}`}
          onClick={(event) => {
            event.preventDefault();
            if (!open) {
              setBoundary(trigger.current?.closest(".editor") || undefined);
              document.dispatchEvent(
                new CustomEvent(helpEvent, { detail: id }),
              );
            }
            setOpen(!open);
          }}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="field-help-content"
        role="note"
        align="start"
        sideOffset={8}
        collisionBoundary={boundary}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (
            event.detail.originalEvent.target instanceof Node &&
            trigger.current?.contains(event.detail.originalEvent.target)
          )
            event.preventDefault();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

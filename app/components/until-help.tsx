"use client";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
export function Help({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="field-help"
          aria-label={`Help: ${label}`}
          onClick={(e) => e.stopPropagation()}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent className="field-help-content" role="note">
        {text}
      </PopoverContent>
    </Popover>
  );
}

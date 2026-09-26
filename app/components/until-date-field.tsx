"use client";
import { useState, useId, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Help } from "./until-help";
import { validDate } from "@/lib/until/domain";

// Native pickers may change their input when dismissed. Only Apply commits a draft.
export function DateField({
  label,
  value,
  onChange,
  help,
  error,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: React.ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const pickerId = useId();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [invalid, setInvalid] = useState(false);
  function changeOpen(next: boolean) {
    if (next) {
      setDraft(value);
      setInvalid(false);
    }
    setOpen(next);
  }
  return (
    <div className="field date-field">
      <span className="field-label">
        <label htmlFor={props.id}>{label}</label>
        {help && <Help label={label} text={help} />}
      </span>
      <Popover open={open} onOpenChange={changeOpen}>
        <div className="date-trigger">
          <PopoverTrigger asChild>
            <input
              {...props}
              type="text"
              role="combobox"
              readOnly
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  changeOpen(true);
                }
              }}
              value={value}
              placeholder="Add a date"
              aria-label={label}
              aria-haspopup="dialog"
              aria-controls={pickerId}
              aria-expanded={open}
            />
          </PopoverTrigger>
          <CalendarDays aria-hidden="true" size={18} />
        </div>
        <PopoverContent
          id={pickerId}
          role="dialog"
          aria-label={`${label} picker`}
          className="date-picker"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <label className="field">
            <span>{label}</span>
            <input
              type="date"
              min="1900-01-01"
              max="2200-12-31"
              aria-label={`Choose ${label.toLowerCase()}`}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
              }}
            />
          </label>
          {invalid && <p role="alert">Choose a valid calendar date.</p>}
          <div className="date-picker-actions">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear date
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel date
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (draft && !validDate(draft)) {
                  setInvalid(true);
                  return;
                }
                onChange(draft);
                setOpen(false);
              }}
            >
              Apply date
            </button>
          </div>
        </PopoverContent>
      </Popover>
      {error}
    </div>
  );
}

"use client";
import { useState, useId, useRef, type InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Help } from "./until-help";
import { displayDate, today, validDate } from "@/lib/until/domain";

// Navigation and dismissal do not commit a date. Only selecting a day or Clear does.
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
  const pickerId = useId(),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [boundary, setBoundary] = useState<Element | undefined>();
  const selected =
    value && validDate(value) ? new Date(`${value}T12:00:00`) : undefined;
  return (
    <div className="field date-field">
      <span className="field-label">
        <span>{label}</span>
        {help && <Help label={label} text={help} />}
      </span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next)
            setBoundary(trigger.current?.closest(".editor") || undefined);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={trigger}
            type="button"
            role="combobox"
            id={props.id}
            name={props.name}
            disabled={props.disabled}
            className={`date-trigger ${value ? "" : "unset"}`}
            aria-label={label}
            aria-invalid={props["aria-invalid"]}
            aria-describedby={props["aria-describedby"]}
            aria-haspopup="dialog"
            aria-controls={pickerId}
            aria-expanded={open}
          >
            {displayDate(value) || "Add a date"}
            <CalendarDays aria-hidden="true" size={18} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          id={pickerId}
          role="dialog"
          aria-label={`${label} picker`}
          className="date-picker"
          align="start"
          collisionBoundary={boundary}
          collisionPadding={12}
        >
          <DayPicker
            key={open ? "open" : "closed"}
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            startMonth={new Date(1900, 0)}
            endMonth={new Date(2200, 11)}
            autoFocus
            onSelect={(day) => {
              if (day) {
                onChange(today(day));
                setOpen(false);
              }
            }}
            labels={{
              labelMonthDropdown: () => "Month",
              labelYearDropdown: () => "Year",
              labelDayButton: (day) => `Choose ${displayDate(today(day))}`,
            }}
          />
          <button
            type="button"
            disabled={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            Clear date
          </button>
        </PopoverContent>
      </Popover>
      {error}
    </div>
  );
}

"use client";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => {
            const v = typeof o === "string" ? o : o.value;
            return (
              <SelectItem key={v} value={v}>
                {typeof o === "string" ? o : o.label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </label>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="check">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <span>{label}</span>
    </label>
  );
}

export function EditableChoice({
  label,
  value,
  onChange,
  defaults,
  customValues,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  defaults: string[];
  customValues: string[];
}) {
  const [custom, setCustom] = useState(false);
  const values = [
    ...new Set([...defaults, ...customValues, value].filter(Boolean)),
  ];
  return (
    <div>
      <Choice
        label={label}
        value={custom ? "__custom" : value || defaults[0]}
        options={[
          ...values,
          { value: "__custom", label: `Add custom ${label.toLowerCase()}…` },
        ]}
        onChange={(v) => {
          if (v === "__custom") {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
      />
      {custom && (
        <label className="field">
          <span>Custom {label.toLowerCase()}</span>
          <input
            autoFocus
            maxLength={100}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter a ${label.toLowerCase()}`}
          />
        </label>
      )}
    </div>
  );
}

"use client";
import { Help } from "./until-help";
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
  help,
  id,
  name,
}: {
  id?: string;
  name?: string;
  help?: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  return (
    <div className="field">
      <span className="field-label">
        <span id={id ? `${id}-label` : undefined}>{label}</span>
        {help && <Help label={label} text={help} />}
      </span>
      <Select
        value={value}
        onValueChange={onChange}
        name={name}
        autoComplete={name ? "off" : undefined}
      >
        <SelectTrigger
          id={id}
          aria-label={label}
          aria-labelledby={id ? `${id}-label` : undefined}
        >
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
    </div>
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
  id,
  name,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  defaults: string[];
  customValues: string[];
}) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  const [original, setOriginal] = useState(value);
  const values = [
    ...new Set([...defaults, ...customValues, value].filter(Boolean)),
  ];
  return (
    <div>
      <Choice
        id={id}
        name={name}
        label={label}
        value={custom ? "__custom" : value || "__unset"}
        options={[
          { value: "__unset", label: `No ${label.toLowerCase()} selected` },
          ...values,
          { value: "__custom", label: `Add custom ${label.toLowerCase()}…` },
        ]}
        onChange={(v) => {
          if (v === "__custom") {
            setOriginal(value);
            setDraft("");
            setCustom(true);
          } else {
            setCustom(false);
            onChange(v === "__unset" ? "" : v);
          }
        }}
      />
      {custom && (
        <label className="field">
          <span className="field-label">Custom {label.toLowerCase()}</span>
          <input
            id={`${id}-custom`}
            name={`${name}-custom`}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoFocus
            maxLength={100}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const entered = e.target.value.trim();
              onChange(
                values.find((v) => v.toLowerCase() === entered.toLowerCase()) ||
                  entered ||
                  original,
              );
            }}
            placeholder={`Enter a ${label.toLowerCase()}`}
          />
        </label>
      )}
      {custom && (
        <button
          type="button"
          className="custom-cancel"
          onClick={() => {
            onChange(original);
            setCustom(false);
          }}
        >
          Use existing {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

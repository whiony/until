"use client";
import type { DateKind } from "@/lib/until/domain";
import { Choice } from "./until-controls";
export function DateKindField({
  value,
  onChange,
  id = "until-item-date-kind",
}: {
  value: DateKind;
  onChange: (value: DateKind) => void;
  id?: string;
}) {
  return (
    <Choice
      id={id}
      name={id}
      label="Date type"
      value={value}
      help="Choose the wording printed beside the date. Best before describes quality; Use by is the labelled use-by date. Leave unspecified when unknown."
      onChange={(v) => onChange(v as DateKind)}
      options={[
        { value: "unspecified", label: "Unspecified" },
        { value: "best before", label: "Best before" },
        { value: "use by", label: "Use by" },
      ]}
    />
  );
}

"use client";
import type { DateKind } from "@/lib/until/domain";
import { Choice } from "./until-controls";
const descriptions: Record<DateKind, string> = {
  "best before": "Best before is the quality date printed on the package.",
  "use by": "Use by is the use-by date printed on the package.",
  unspecified:
    "Unspecified means the date is known, but the printed wording is unknown.",
};
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
    <details
      className="date-wording"
      open={value !== "unspecified" || undefined}
    >
      <summary>
        Printed label wording ·{" "}
        {value === "unspecified"
          ? "Unspecified"
          : value === "best before"
            ? "Best before"
            : "Use by"}
      </summary>
      <Choice
        id={id}
        name={id}
        label="What does the label say?"
        value={value}
        onChange={(v) => onChange(v as DateKind)}
        options={[
          { value: "unspecified", label: "Unspecified" },
          { value: "best before", label: "Best before" },
          { value: "use by", label: "Use by" },
        ]}
      />
      <div className="date-wording-help">
        <p className="muted">{descriptions["best before"]}</p>
        <p className="muted">{descriptions["use by"]}</p>
        <p className="muted">{descriptions.unspecified}</p>
      </div>
    </details>
  );
}

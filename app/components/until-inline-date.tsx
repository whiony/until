"use client";
import { useState } from "react";
import {
  stamp,
  validateItem,
  type Item,
  type DateKind,
  type Records,
} from "@/lib/until/domain";
import { DateField } from "./until-date-field";
import { Choice } from "./until-controls";
export function InlineDate({
  item,
  disabled,
  onChange,
}: {
  item: Item;
  disabled: boolean;
  onChange: (fn: (r: Records) => void) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [date, setDate] = useState(""),
    [kind, setKind] = useState<DateKind>("unspecified"),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  if (!open)
    return (
      <button
        className="notice add-expiration"
        disabled={disabled}
        onClick={() => {
          setDate(item.printedDate);
          setKind(item.dateKind);
          setError("");
          setOpen(true);
        }}
      >
        Add expiration date
      </button>
    );
  return (
    <form
      className="inline-date"
      aria-label="Add expiration date"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
          await onChange((r) => {
            const current = r.items.find((i) => i.id === item.id);
            if (!current || current.updatedAt !== item.updatedAt)
              throw Error(
                "This item changed. Cancel and reopen the date form.",
              );
            if (!date) throw Error("Choose a printed expiration date.");
            const updated = {
              ...current,
              printedDate: date,
              dateKind: kind,
              updatedAt: stamp(),
            };
            validateItem(updated);
            Object.assign(current, updated);
          });
          setOpen(false);
        } catch (e) {
          setError(`Could not save expiration date. ${(e as Error).message}`);
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3>Add expiration date</h3>
      <div className="form-grid">
        <DateField
          label="Printed date"
          id="until-detail-date"
          value={date}
          onChange={setDate}
        />
        <Choice
          label="Date type"
          value={kind}
          onChange={(v) => setKind(v as DateKind)}
          options={[
            { value: "unspecified", label: "Unspecified" },
            { value: "best before", label: "Best before" },
            { value: "use by", label: "Use by" },
          ]}
        />
      </div>
      <p className="muted">
        Use the date printed on the package. Leave the type unspecified if the
        label does not say.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="inline">
        <button type="button" disabled={saving} onClick={() => setOpen(false)}>
          Cancel date
        </button>
        <button className="primary" type="submit" disabled={saving || !date}>
          {saving ? "Saving…" : "Save expiration date"}
        </button>
      </div>
    </form>
  );
}

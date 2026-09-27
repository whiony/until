"use client";
import { useState } from "react";
import { categories, locations, type Records } from "@/lib/until/domain";
import {
  addLocation,
  locationNames,
  hideLocation,
  replaceLocation,
  addCategory,
  categoryNames,
  hideCategory,
  replaceCategory,
  themes,
} from "@/lib/until/preferences";
import { Choice } from "./until-controls";
function NameManagement({
  kind,
  records,
  onChange,
}: {
  kind: "category" | "location";
  records: Records;
  onChange: (fn: (r: Records) => void) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{
    name: string;
    mode: "rename" | "delete";
  } | null>(null);
  const [replacement, setReplacement] = useState("");
  const [chosen, setChosen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(fn: (r: Records) => void, done?: () => void) {
    setBusy(true);
    setError("");
    try {
      await onChange(fn);
      done?.();
    } catch (e) {
      setError((e as Error).message || "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const location = kind === "location";
  const singular = location ? "location" : "category";
  const plural = location ? "locations" : "categories";
  const title = location ? "Locations" : "Categories";
  const names = location ? locationNames(records) : categoryNames(records);
  const builtins = location ? locations : categories;
  const rules = location
    ? records.settings.locationRules
    : records.settings.categoryRules;
  const affected = edit
    ? records.items.filter(
        (i) =>
          (location
            ? i.location
            : records.products.find((p) => p.id === i.productId)?.category) ===
          edit.name,
      ).length
    : 0;
  return (
    <>
      {!location && (
        <section aria-labelledby="themes-heading">
          <h2 id="themes-heading">Color theme</h2>
          <p className="muted">
            Choose a light palette for your shelf. Saved automatically on this
            device and synced with your account.
          </p>
          <div className="theme-options">
            {themes.map((theme) => (
              <button
                type="button"
                key={theme}
                data-theme={theme}
                aria-pressed={(records.settings.theme || "green") === theme}
                disabled={busy}
                onClick={() =>
                  save((r) => {
                    r.settings.theme = theme;
                  })
                }
              >
                <span className="theme-preview" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {theme === "green"
                  ? "Green"
                  : theme === "peach"
                    ? "Warm peach"
                    : theme === "lavender"
                      ? "Lavender"
                      : "Soft blue"}
              </button>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby={`${plural}-heading`}>
        <h2 id={`${plural}-heading`}>{title}</h2>
        <p className="muted">
          Hide built-in {plural} from new selections, or manage your custom{" "}
          {plural}. Existing items are kept.
        </p>
        <div className="category-list">
          {names.map((category) => {
            const builtin = builtins.includes(category);
            const hidden = rules?.find((c) => c.name === category)?.hidden;
            return (
              <div className="category-row" key={category}>
                <span>
                  {category}
                  <small>
                    {builtin ? "Built-in" : "Custom"}
                    {hidden ? " · Hidden from selection" : ""}
                  </small>
                </span>
                {builtin ? (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`${hidden ? "Show" : "Hide"} ${category}`}
                    onClick={() =>
                      save((r) =>
                        (location ? hideLocation : hideCategory)(
                          r,
                          category,
                          !hidden,
                        ),
                      )
                    }
                  >
                    {hidden ? "Show" : "Hide"}
                  </button>
                ) : (
                  <div className="inline">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Rename ${category}`}
                      onClick={() => {
                        setEdit({ name: category, mode: "rename" });
                        setReplacement(category);
                        setError("");
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Delete ${category}`}
                      onClick={() => {
                        setEdit({ name: category, mode: "delete" });
                        setReplacement("");
                        setChosen(false);
                        setError("");
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {edit && (
          <div
            className="category-confirm"
            role="group"
            aria-label={`${edit.mode === "delete" ? "Delete" : "Rename"} ${singular}`}
          >
            <h3>
              {edit.mode === "delete" ? "Delete" : "Rename"} {edit.name}
            </h3>
            <p>
              {affected} {affected === 1 ? "item uses" : "items use"} this{" "}
              {singular}. No items will be deleted.
            </p>
            {edit.mode === "rename" ? (
              <label className="field">
                <span>New {singular} name</span>
                <input
                  maxLength={100}
                  autoComplete="off"
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                />
              </label>
            ) : (
              <Choice
                label="Move items to"
                value={chosen ? replacement || "__none" : "__choose"}
                onChange={(v) => {
                  setChosen(true);
                  setReplacement(v === "__none" ? "" : v);
                }}
                options={[
                  { value: "__choose", label: "Choose a replacement" },
                  {
                    value: "__none",
                    label: location ? "No location" : "Uncategorized",
                  },
                  ...names.filter((n) => n !== edit.name),
                ]}
              />
            )}
            {edit.mode === "delete" && chosen && (
              <p>
                All {affected} {affected === 1 ? "item will" : "items will"}{" "}
                move to{" "}
                {replacement || (location ? "No location" : "Uncategorized")}.
                The {singular} will be removed from selection.
              </p>
            )}
            <div className="inline">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={
                  edit.mode === "delete" ? "destructive-action" : "primary"
                }
                disabled={
                  busy ||
                  (edit.mode === "delete" && !chosen) ||
                  (!replacement.trim() && edit.mode === "rename")
                }
                onClick={() =>
                  save(
                    (r) =>
                      (location ? replaceLocation : replaceCategory)(
                        r,
                        edit.name,
                        replacement,
                        edit.mode === "rename",
                      ),
                    () => setEdit(null),
                  )
                }
              >
                {edit.mode === "delete"
                  ? "Confirm deletion"
                  : `Save ${singular} name`}
              </button>
            </div>
          </div>
        )}
        <div className="category-add">
          <label className="field">
            <span>New {singular}</span>
            <input
              name={`until-new-${singular}`}
              autoComplete="off"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              save(
                (r) => (location ? addLocation : addCategory)(r, name),
                () => setName(""),
              )
            }
          >
            Add {singular}
          </button>
        </div>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}

export function AppearanceCategories(props: {
  records: Records;
  onChange: (fn: (r: Records) => void) => Promise<void>;
}) {
  return (
    <div className="settings preference-management">
      <NameManagement {...props} kind="category" />
      <NameManagement {...props} kind="location" />
    </div>
  );
}

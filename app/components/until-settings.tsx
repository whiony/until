"use client";
import { useEffect, useRef, useState } from "react";
import { Download, BellOff } from "lucide-react";
import type { Records } from "@/lib/until/domain";
import { downloadYourData, exportRecords, type SyncState } from "@/lib/until/repository";
import { notificationService } from "@/lib/until/notifications";
import { Check as CheckField } from "./until-controls";
import { AppearanceCategories, ThemeChooser } from "./until-preferences";
import { SyncPanel } from "./until-sync";

export function Settings({ records, onChange, sync, retry, syncGeneration }: {
  records: Records;
  onChange: (fn: (r: Records) => void) => Promise<void>;
  sync: SyncState;
  retry: () => void;
  syncGeneration: number;
}) {
  const [draft, setDraft] = useState(records.settings);
  const committedSettings = useRef(JSON.stringify(records.settings));
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const next = JSON.stringify(records.settings);
    if (next !== committedSettings.current) {
      const previous = JSON.parse(committedSettings.current) as Records["settings"];
      committedSettings.current = next;
      setDraft((current) => ({
        ...records.settings,
        soonDays: current.soonDays === previous.soonDays ? records.settings.soonDays : current.soonDays,
        notifications: JSON.stringify(current.notifications) === JSON.stringify(previous.notifications)
          ? records.settings.notifications
          : current.notifications,
      }));
    }
  }, [records.settings]);
  const n = draft.notifications;
  async function save(which: "soon" | "reminders") {
    setSaving(true);
    setMessage("");
    try {
      await onChange((r) => {
        if (which === "soon") r.settings.soonDays = draft.soonDays;
        else r.settings.notifications = draft.notifications;
      });
      setMessage(which === "soon" ? "Soon window saved." : "Reminder preferences saved. Delivery is not active.");
    } catch {
      setMessage("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Settings</h1>
          <p>Choose how you browse, organize, and keep a copy of your shelf.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card settings-appearance" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">Appearance & browsing</h2>
          <ThemeChooser records={records} onChange={onChange} />
          <form className="settings-soon" onSubmit={(event) => { event.preventDefault(); void save("soon"); }}>
            <label className="field">
              <span>Show dates in the next (days)</span>
              <input type="number" min={1} max={90} required value={draft.soonDays}
                onChange={(event) => setDraft({ ...draft, soonDays: event.target.valueAsNumber })} />
            </label>
            <button type="submit" disabled={saving}>Save Soon window</button>
          </form>
        </section>

        <section className="settings-card settings-organize" aria-labelledby="organize-heading">
          <h2 id="organize-heading">Organize</h2>
          <p className="muted">Manage the names available for new items. Existing items stay on your shelf.</p>
          <AppearanceCategories records={records} onChange={onChange} />
        </section>

        <section className="settings-card settings-reminders" aria-labelledby="reminders-heading">
          <h2 id="reminders-heading"><BellOff aria-hidden="true" /> Reminders</h2>
          <p className="notice">Notifications are not delivered while Until is closed. Saving a preference does not turn on alerts.</p>
          <details className="settings-disclosure">
            <summary>Preferences for future delivery</summary>
            <form onSubmit={(event) => { event.preventDefault(); void save("reminders"); }}>
              <CheckField label="Save my preference for a daily digest (delivery unavailable)" checked={n.requested}
                onChange={(value) => setDraft({ ...draft, notifications: { ...n, requested: value } })} />
              <CheckField label="Also remind me on the recorded date" checked={n.expirationDay}
                onChange={(value) => setDraft({ ...draft, notifications: { ...n, expirationDay: value } })} />
              <div className="form-grid">
                <label className="field"><span>Lead time (days)</span><input type="number" required min={0} max={90} value={n.leadDays}
                  onChange={(event) => setDraft({ ...draft, notifications: { ...n, leadDays: event.target.valueAsNumber } })} /></label>
                <label className="field"><span>Digest time</span><input type="time" required value={n.time}
                  onChange={(event) => setDraft({ ...draft, notifications: { ...n, time: event.target.value } })} /></label>
                <label className="field"><span>Quiet hours start</span><input type="time" required value={n.quietStart}
                  onChange={(event) => setDraft({ ...draft, notifications: { ...n, quietStart: event.target.value } })} /></label>
                <label className="field"><span>Quiet hours end</span><input type="time" required value={n.quietEnd}
                  onChange={(event) => setDraft({ ...draft, notifications: { ...n, quietEnd: event.target.value } })} /></label>
              </div>
              <p className="muted">Timezone: {n.timezone}. Shelf dates use your current local calendar day.</p>
              <div className="settings-actions">
                <button type="submit" disabled={saving}>Save reminder preferences</button>
                <button type="button" onClick={async () => {
                  try { setMessage((await notificationService.capability()).reason); }
                  catch (error) { setMessage((error as Error).message); }
                }}>Check reminder availability</button>
              </div>
              <p className="muted">On iPhone, delivery would require an installed Home Screen app and your permission. Permission will only be requested when delivery becomes available.</p>
            </form>
          </details>
        </section>

        <section className="settings-card settings-account" aria-labelledby="account-heading">
          <h2 id="account-heading">Account & data</h2>
          <div className="settings-account-content">
          <SyncPanel state={sync} retry={retry} generation={syncGeneration} />
          <div className="settings-data">
            <h3>Data & storage</h3>
            <p>Changes are saved on this device first. When signed in, records and photos sync with your account. Offline changes are retried after you reconnect; conflicting edits may need your review.</p>
            <p className="muted">A successful sync check is not an independent backup. Automated server backup and restoration are not yet verified for this site.</p>
            <div className="settings-actions">
              <button type="button" disabled={exporting} onClick={async () => {
                setExporting(true);
                setMessage("");
                try { await downloadYourData(); setMessage("Your data archive is ready. Keep it in a safe place."); }
                catch (error) { setMessage((error as Error).message || "Download failed. Try again."); }
                finally { setExporting(false); }
              }}><Download aria-hidden="true" /> {exporting ? "Preparing download…" : "Download your data"}</button>
              <button type="button" onClick={() => exportRecords(true).catch(() => setMessage("JSON export failed. Try again."))}>Export JSON (records only; no photos)</button>
            </div>
            <p className="muted">The ZIP includes your current records, saved recovery copies, and referenced product and packaging photos. If a photo is unavailable, no incomplete archive is downloaded.</p>
            <details className="settings-disclosure storage-details">
              <summary>Device storage</summary>
              <p>Ask this browser to keep local data when it needs space. This does not create a backup, and the browser may decline.</p>
              <button type="button" onClick={async () => {
                try {
                  const granted = await navigator.storage?.persist?.();
                  setMessage(granted ? "The browser granted persistent device storage." : "The browser manages storage automatically. Keep a separate data archive.");
                } catch {
                  setMessage("The browser could not grant persistent storage. Keep a separate data archive.");
                }
              }}>Request persistent storage</button>
            </details>
          </div>
          </div>
        </section>
      </div>
      {message && <p role="status" className="settings-message notice">{message}</p>}
      <details className="settings-about">
        <summary>About & product data credits</summary>
        <p>Suggestions from <a href="https://world.openfoodfacts.org">Open Food Facts</a>, <a href="https://world.openbeautyfacts.org">Open Beauty Facts</a>, <a href="https://world.openpetfoodfacts.org">Open Pet Food Facts</a>, and <a href="https://world.openproductsfacts.org">Open Products Facts</a>. Database: <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>; contents: DbCL; product images: <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</a>. Community suggestions can be incomplete or incorrect; confirm them before saving.</p>
      </details>
    </div>
  );
}

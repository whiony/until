"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Clock3,
  Grid2X2,
  History,
  Settings2,
  Search,
  ArrowUpRight,
  Check,
  PackageOpen,
  Trash2,
  LayoutList,
  Download,
  BellOff,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Empty, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Choice, Check as CheckField } from "./until-controls";
import { SyncPanel } from "./until-sync";
import { useVisualViewport } from "./use-visual-viewport";
import { Photo } from "./until-photo";
import { Editor, type EditorValue } from "./until-editor";
import {
  emptyRecords,
  categories,
  locations,
  today,
  deadline,
  daysLeft,
  countdown,
  urgency,
  inSoon,
  completeUnit,
  openUnit,
  type Records,
  type Item,
  type Product,
} from "@/lib/until/domain";
import {
  readRecords,
  mutate,
  syncRecords,
  exportRecords,
  type SyncState,
} from "@/lib/until/repository";
import { notificationService } from "@/lib/until/notifications";
type View = "soon" | "all" | "history" | "settings";
export default function UntilApp() {
  useVisualViewport();
  const [records, setRecords] = useState<Records>(emptyRecords);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("soon");
  const [now, setNow] = useState(today);
  const [sync, setSync] = useState<SyncState>("pending");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("any");
  const [location, setLocation] = useState("any");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState("soonest");
  const [list, setList] = useState(false);
  const [editor, setEditor] = useState<{
    item?: Item;
    product?: Product;
  } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setRecords(await readRecords());
      setReady(true);
      setLoadError("");
    } catch {
      setLoadError(
        "Until could not open device storage. Allow browser storage and reload; your entries have not been replaced.",
      );
    }
  }, []);
  const synchronize = useCallback(async () => {
    setSync(await syncRecords());
    await refresh();
  }, [refresh]);
  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          toast.error("Offline installation is unavailable in this browser."),
        );
    const tick = () => {
      setNow(today());
      refresh();
      synchronize();
    };
    window.addEventListener("online", tick);
    window.addEventListener("offline", tick);
    window.addEventListener("focus", tick);
    const foreground = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("until-records", refresh);
    const id = setInterval(foreground, 10000);
    queueMicrotask(() => {
      void synchronize();
    });
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("until-records", refresh);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", tick);
      window.removeEventListener("focus", tick);
    };
  }, [refresh, synchronize]);
  async function change(
    fn: (r: Records) => void,
    photos: Record<string, Blob> = {},
  ) {
    setRecords(await mutate(fn, photos));
    setSync("pending");
    void synchronize();
  }
  async function save(v: EditorValue) {
    await change((r) => {
      const existing = r.products.find((p) => p.id === v.product.id);
      if (existing) {
        const changed =
          JSON.stringify({ ...existing, updatedAt: "" }) !==
          JSON.stringify({ ...v.product, updatedAt: "" });
        if (changed && v.expectedProductVersion !== existing.updatedAt)
          throw Error(
            "This product changed on another device. Close and reopen before editing.",
          );
        if (changed) Object.assign(existing, v.product);
      } else r.products.push(v.product);
      const item = r.items.find((i) => i.id === v.item.id);
      if (v.editing) {
        if (!item) throw Error("Item no longer exists.");
        if (item.updatedAt !== editor?.item?.updatedAt)
          throw Error(
            "This item changed in another window. Close and reopen it before editing.",
          );
        Object.assign(item, v.item);
      } else r.items.push(v.item);
    }, v.photos);
    toast.success(v.editing ? "Changes saved" : "Added to your shelf");
  }
  async function action(fn: (r: Records) => void, message: string) {
    setBusy(true);
    try {
      await change(fn);
      toast.success(message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = records.items.filter((i) => i.status === "active");
  const soon = active.filter((i) => inSoon(i, records.settings.soonDays, now));
  const expired = active.filter(
    (i) => deadline(i).date && daysLeft(deadline(i).date, now) < 0,
  );
  const undated = active.filter((i) => !deadline(i).date);
  const products = new Map(records.products.map((p) => [p.id, p]));
  const match = (i: Item) => {
    const p = products.get(i.productId);
    return (
      p &&
      (!search ||
        `${p.name} ${p.brand} ${p.barcode} ${i.notes}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (category === "any" || p.category === category) &&
      (location === "any" || i.location === location)
    );
  };
  const order = (items: Item[]) =>
    items
      .filter(match)
      .sort((a, b) =>
        sort === "name"
          ? products
              .get(a.productId)!
              .name.localeCompare(products.get(b.productId)!.name)
          : sort === "added"
            ? b.createdAt.localeCompare(a.createdAt)
            : sort === "opened"
              ? b.openedDate.localeCompare(a.openedDate)
              : (deadline(a).date || "9999").localeCompare(
                  deadline(b).date || "9999",
                ),
      );
  function cards(items: Item[]) {
    return (
      <div className={`cards ${list ? "as-list" : ""}`}>
        {order(items).map((i) => {
          const p = products.get(i.productId)!;
          return (
            <article
              className={`item-card ${urgency(i, records.settings.soonDays, now)}`}
              key={i.id}
            >
              <button
                className="card-main"
                onClick={() => setDetail(i.id)}
                aria-label={`View ${p.name}`}
              >
                <Photo id={p.photoId} category={p.category} name={p.name} />
                <div className="card-copy">
                  <div className="eyebrow">
                    {p.category} <span>· {i.location || "No location"}</span>
                  </div>
                  <h3>{p.name}</h3>
                  <p className="muted">
                    {[p.brand, p.size].filter(Boolean).join(" · ") ||
                      `${i.quantity} ${i.quantity === 1 ? "unit" : "units"} on your shelf`}
                  </p>
                  <div className="countdown">
                    <Clock3 size={17} />
                    {i.status === "active"
                      ? countdown(i, now)
                      : i.status === "used"
                        ? "Used"
                        : "Discarded"}
                  </div>
                  <p className="date-caption">
                    {deadline(i).date || "Add a date when you have it"}
                    {i.openedDate ? " · Opened" : ""}
                  </p>
                </div>
                <ArrowUpRight className="card-arrow" size={19} />
              </button>
              <div className="card-bottom">
                <span>
                  ×{i.quantity} {i.openedDate ? "opened" : "unopened"}
                </span>
                {i.status === "active" ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(
                        (r) => completeUnit(r, i.id, "used"),
                        "One unit marked used",
                      )
                    }
                  >
                    <Check size={16} /> Used one
                  </button>
                ) : (
                  <button onClick={() => setEditor({ product: p })}>
                    <Plus size={16} /> Add again
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  }
  const selected = records.items.find((i) => i.id === detail);
  const selectedProduct = selected && products.get(selected.productId);
  return (
    <>
      <Toaster position="top-center" />
      <div className="app-shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Until home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="brand-mark"
              src="/favicon.svg"
              width="32"
              height="32"
              alt=""
            />
            until
            <span className="brand-period">.</span>
          </Link>
          <div className="top-actions">
            <button
              className="primary desktop-add"
              onClick={() => setEditor({})}
              disabled={!ready}
            >
              <Plus /> Add item
            </button>
          </div>
        </header>
        <div className="workspace">
          <aside className="rail">
            <p className="eyebrow">YOUR ITEMS</p>
            <Tabs
              value={view}
              onValueChange={(v) => {
                setView(v as View);
                setSearch("");
                setCategory("any");
                setLocation("any");
                setSort("soonest");
              }}
              orientation="vertical"
            >
              <TabsList className="nav-list">
                <TabsTrigger value="soon">
                  <Clock3 /> Soon <span>{soon.length}</span>
                </TabsTrigger>
                <TabsTrigger value="all">
                  <Grid2X2 /> All items{" "}
                  <span>{active.reduce((n, i) => n + i.quantity, 0)}</span>
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History /> History
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings2 /> Settings
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </aside>
          <main>
            {loadError ? (
              <div role="alert" className="error">
                {loadError}
                <button onClick={refresh}>Try again</button>
              </div>
            ) : !ready ? (
              <p role="status">Opening your shelf…</p>
            ) : view === "settings" ? (
              <Settings
                records={records}
                onChange={change}
                sync={sync}
                retry={synchronize}
              />
            ) : (
              <>
                {["unavailable", "conflict", "signed-out", "offline"].includes(
                  sync,
                ) && (
                  <button
                    className="sync-hint"
                    onClick={() => setView("settings")}
                  >
                    {sync === "offline"
                      ? "Offline · changes kept here"
                      : sync === "conflict"
                        ? "Sync needs review"
                        : sync === "signed-out"
                          ? "Sign in to sync"
                          : "Sync paused · retrying"}{" "}
                    <ArrowUpRight size={14} />
                  </button>
                )}
                <div className="page-heading">
                  <div>
                    <p className="eyebrow">
                      {new Date(`${now}T12:00:00`).toLocaleDateString("en", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <h1>
                      {view === "soon"
                        ? "Expiring soon"
                        : view === "all"
                          ? "All items"
                          : "History"}
                    </h1>
                    <p>
                      {view === "soon"
                        ? `What’s coming up in the next ${records.settings.soonDays} days.`
                        : view === "all"
                          ? `${active.reduce((sum, i) => sum + i.quantity, 0)} active items`
                          : "Used and discarded items"}
                    </p>
                  </div>
                </div>
                <div className="tools">
                  <div className="search">
                    <Search size={19} />
                    <input
                      aria-label="Search items"
                      placeholder="Find something on your shelf…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="filter-row">
                    <Choice
                      label="Location filter"
                      value={location}
                      onChange={setLocation}
                      options={[
                        { value: "any", label: "All locations" },
                        ...[
                          ...new Set([
                            ...locations,
                            ...records.items.map((i) => i.location),
                          ]),
                        ].filter(Boolean),
                      ]}
                    />
                    <Choice
                      label="Category filter"
                      value={category}
                      onChange={setCategory}
                      options={[
                        { value: "any", label: "All categories" },
                        ...[
                          ...new Set([
                            ...categories,
                            ...records.products.map((p) => p.category),
                          ]),
                        ].filter(Boolean),
                      ]}
                    />
                    {view === "all" && (
                      <Choice
                        label="Status filter"
                        value={status}
                        onChange={setStatus}
                        options={[
                          "active",
                          "opened",
                          "unopened",
                          "needs a date",
                          "used",
                          "discarded",
                        ].map((value) => ({
                          value,
                          label:
                            value === "needs a date"
                              ? "Needs a date"
                              : value[0].toUpperCase() + value.slice(1),
                        }))}
                      />
                    )}
                    <Choice
                      label="Sort items"
                      value={sort}
                      onChange={setSort}
                      options={[
                        { value: "soonest", label: "Soonest first" },
                        { value: "added", label: "Recently added" },
                        { value: "opened", label: "Recently opened" },
                        { value: "name", label: "Name A–Z" },
                      ]}
                    />
                    <button
                      className="icon-button"
                      aria-label={list ? "Show grid" : "Show list"}
                      onClick={() => setList(!list)}
                    >
                      {list ? <Grid2X2 /> : <LayoutList />}
                    </button>
                  </div>
                </div>
                {view === "soon" ? (
                  <>
                    <div className="section-heading">
                      <h2>Next to expire</h2>
                      <span className="pill">
                        NEXT {records.settings.soonDays} DAYS
                      </span>
                    </div>
                    {order(soon).length ? (
                      cards(soon)
                    ) : (
                      <Empty>
                        <PackageOpen size={30} />
                        <EmptyTitle>
                          {active.length ? "No upcoming dates" : "No items yet"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {active.length
                            ? "Nothing matches in the upcoming window. Try other filters or check All items."
                            : "Add an item to track its expiration date."}
                        </EmptyDescription>
                        <button
                          className="primary"
                          onClick={() => setEditor({})}
                        >
                          <Plus size={18} /> Add an item
                        </button>
                      </Empty>
                    )}
                    {order(expired).length > 0 && (
                      <section className="expired-section">
                        <div className="section-heading">
                          <h2>Past the recorded date</h2>
                          <span className="pill">
                            {order(expired).length} GROUPS
                          </span>
                        </div>
                        <p className="muted">
                          Best-before dates describe quality, not an automatic
                          safety cutoff.
                        </p>
                        {cards(expired)}
                      </section>
                    )}
                    {order(undated).length > 0 && (
                      <section className="undated-section">
                        <h2>
                          Needs a date <span>{order(undated).length}</span>
                        </h2>
                        <p className="muted">
                          A small reminder to check the label.
                        </p>
                        {cards(undated)}
                      </section>
                    )}
                  </>
                ) : (
                  <>
                    <div className="section-heading">
                      <h2>
                        {view === "history" ? "Your history" : "Your shelf"}
                      </h2>
                      <span>
                        {
                          order(
                            records.items.filter((i) =>
                              view === "history"
                                ? i.status !== "active"
                                : status === "opened"
                                  ? i.status === "active" && !!i.openedDate
                                  : status === "unopened"
                                    ? i.status === "active" && !i.openedDate
                                    : status === "needs a date"
                                      ? i.status === "active" &&
                                        !deadline(i).date
                                      : i.status === status,
                            ),
                          ).length
                        }{" "}
                        groups
                      </span>
                    </div>
                    {(() => {
                      const items = records.items.filter((i) =>
                        view === "history"
                          ? i.status !== "active"
                          : status === "opened"
                            ? i.status === "active" && !!i.openedDate
                            : status === "unopened"
                              ? i.status === "active" && !i.openedDate
                              : status === "needs a date"
                                ? i.status === "active" && !deadline(i).date
                                : i.status === status,
                      );
                      return order(items).length ? (
                        cards(items)
                      ) : (
                        <Empty>
                          <PackageOpen size={36} />
                          <EmptyTitle>
                            {view === "history"
                              ? "No history yet"
                              : "No matching items"}
                          </EmptyTitle>
                          <EmptyDescription>
                            {view === "history"
                              ? "Used and discarded items will appear here, ready to add again."
                              : "Try clearing your filters, or add something to your shelf."}
                          </EmptyDescription>
                          <button
                            onClick={() => {
                              setSearch("");
                              setCategory("any");
                              setLocation("any");
                              setStatus("active");
                            }}
                          >
                            Clear filters
                          </button>
                        </Empty>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </main>
        </div>
        <nav className="mobile-nav" aria-label="Main navigation">
          <button
            aria-current={view === "soon" ? "page" : undefined}
            onClick={() => setView("soon")}
          >
            <Clock3 />
            Soon
          </button>
          <button
            aria-current={view === "all" ? "page" : undefined}
            onClick={() => setView("all")}
          >
            <Grid2X2 />
            All
          </button>
          <button
            className="mobile-plus"
            disabled={!ready}
            onClick={() => setEditor({})}
          >
            <Plus />
            <span>Add</span>
          </button>
          <button
            aria-current={view === "history" ? "page" : undefined}
            onClick={() => setView("history")}
          >
            <History />
            History
          </button>
          <button
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => setView("settings")}
          >
            <Settings2 />
            Settings
          </button>
        </nav>
      </div>
      {editor && (
        <Editor
          records={records}
          {...editor}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
      {selected && selectedProduct && !editor && (
        <Dialog open onOpenChange={(v) => !v && setDetail(null)}>
          <DialogContent className="modal detail">
            <DialogTitle>{selectedProduct.name}</DialogTitle>
            <DialogDescription>
              {selectedProduct.brand} · {selectedProduct.category} ·{" "}
              {selected.location}
            </DialogDescription>
            <Photo
              id={selectedProduct.photoId}
              category={selectedProduct.category}
              name={selectedProduct.name}
            />
            <h2
              className={`detail-countdown ${urgency(selected, records.settings.soonDays, now)}`}
            >
              {countdown(selected, now)}
            </h2>
            <dl>
              <div>
                <dt>Printed date</dt>
                <dd>
                  {selected.printedDate || "Not recorded"} · {selected.dateKind}
                </dd>
              </div>
              <div>
                <dt>After-opening rule</dt>
                <dd>
                  {selected.rule
                    ? `${selected.rule.amount} ${selected.rule.unit}`
                    : "Not recorded"}
                </dd>
              </div>
              <div>
                <dt>Opened</dt>
                <dd>{selected.openedDate || "Unopened"}</dd>
              </div>
              <div>
                <dt>After-opening deadline</dt>
                <dd>{deadline(selected).opening || "Not applicable yet"}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>
                  {selected.quantity} · {selected.status}
                </dd>
              </div>
              {selected.purchaseDate && (
                <div>
                  <dt>Purchased</dt>
                  <dd>{selected.purchaseDate}</dd>
                </div>
              )}
              {selectedProduct.barcode && (
                <div>
                  <dt>Barcode</dt>
                  <dd>{selectedProduct.barcode}</dd>
                </div>
              )}
            </dl>
            <p className="notice">
              {deadline(selected).date
                ? `The ${deadline(selected).controls} controls this countdown because it is the earliest applicable date.`
                : "Add a date to see a countdown."}
            </p>
            {selected.dateKind === "best before" && (
              <p className="muted">
                Best before is a quality date, not an automatic safety cutoff.
              </p>
            )}
            {selectedProduct.category === "Medicine" && (
              <p className="muted">
                This is a reminder of your recorded date, not medical advice.
              </p>
            )}
            {selected.notes && <p>{selected.notes}</p>}
            {selected.packagingPhotoId && (
              <>
                <h3>Original packaging photo</h3>
                <Photo
                  id={selected.packagingPhotoId}
                  category="Label"
                  name="Original packaging label"
                />
              </>
            )}
            {selected.recognition && (
              <details>
                <summary>Confirmed label text</summary>
                <pre>{selected.recognition.text}</pre>
              </details>
            )}
            {selectedProduct.provenance && (
              <p className="muted">
                Product details:{" "}
                <a
                  href={selectedProduct.provenance.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selectedProduct.provenance.provider}
                </a>
                . Confirmed{" "}
                {selectedProduct.provenance.confirmedAt.slice(0, 10)}. Open
                Facts data: ODbL; images: CC BY-SA.
              </p>
            )}
            <div className="detail-actions">
              {selected.status === "active" && (
                <>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      action(
                        (r) => completeUnit(r, selected.id, "used"),
                        "One unit marked used",
                      )
                    }
                  >
                    <Check /> Used one
                  </button>
                  {!selected.openedDate && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        action(
                          (r) => openUnit(r, selected.id),
                          "One unit opened today",
                        )
                      }
                    >
                      <PackageOpen /> Open one
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(
                        (r) => completeUnit(r, selected.id, "discarded"),
                        "One unit marked discarded",
                      )
                    }
                  >
                    <Trash2 /> Discard one
                  </button>
                </>
              )}
              <button onClick={() => setEditor({ product: selectedProduct })}>
                <Plus /> Add another
              </button>
              <button
                onClick={() =>
                  setEditor({ product: selectedProduct, item: selected })
                }
              >
                Edit details
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
function Settings({
  records,
  onChange,
  sync,
  retry,
}: {
  records: Records;
  onChange: (fn: (r: Records) => void) => Promise<void>;
  sync: SyncState;
  retry: () => void;
}) {
  const [settings, setSettings] = useState(records.settings);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const n = settings.notifications;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PREFERENCES</p>
          <h1>Settings</h1>
          <p>Manage reminders and account storage.</p>
        </div>
      </div>
      <form
        className="settings"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await onChange((r) => {
              r.settings = settings;
            });
            setMessage("Preferences saved. Notifications are not active.");
          } catch {
            setMessage("Could not save. Please try again.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <section>
          <h2>Your Soon window</h2>
          <label className="field">
            <span>Show dates in the next (days)</span>
            <input
              type="number"
              min={1}
              max={90}
              required
              value={settings.soonDays}
              onChange={(e) =>
                setSettings({ ...settings, soonDays: e.target.valueAsNumber })
              }
            />
          </label>
        </section>
        <section>
          <h2>
            <BellOff /> Gentle reminders
          </h2>
          <p className="notice">
            Notifications are not active. The server still needs scheduled Web
            Push delivery. Saving preferences does not enable alerts.
          </p>
          <CheckField
            label="Daily digest when reminders become available"
            checked={n.requested}
            onChange={(v) =>
              setSettings({
                ...settings,
                notifications: { ...n, requested: v },
              })
            }
          />
          <CheckField
            label="Also remind me on the expiration day"
            checked={n.expirationDay}
            onChange={(v) =>
              setSettings({
                ...settings,
                notifications: { ...n, expirationDay: v },
              })
            }
          />
          <div className="form-grid">
            <label className="field">
              <span>Lead time (days)</span>
              <input
                type="number"
                required
                min={0}
                max={90}
                value={n.leadDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...n, leadDays: e.target.valueAsNumber },
                  })
                }
              />
            </label>
            <label className="field">
              <span>Digest time</span>
              <input
                type="time"
                required
                value={n.time}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...n, time: e.target.value },
                  })
                }
              />
            </label>
            <label className="field">
              <span>Quiet hours start</span>
              <input
                type="time"
                required
                value={n.quietStart}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...n, quietStart: e.target.value },
                  })
                }
              />
            </label>
            <label className="field">
              <span>Quiet hours end</span>
              <input
                type="time"
                required
                value={n.quietEnd}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: { ...n, quietEnd: e.target.value },
                  })
                }
              />
            </label>
          </div>
          <p className="muted">
            Timezone: {n.timezone}. Dates on your shelf always use your current
            local calendar day.
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                await notificationService.enable();
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Check reminder availability
          </button>
          <p className="muted">
            On iPhone, use Safari → Share → Add to Home Screen. Push reminders
            require an installed Home Screen app and your permission. We will
            only request permission when delivery is available and you choose to
            enable it.
          </p>
        </section>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <SyncPanel state={sync} retry={retry} />
        <section>
          <h2>Data & storage</h2>
          <p>
            Items and photos sync with the same signed-in account. Updates are
            checked on opening, focus, reconnect, and every 10 seconds while
            visible. Offline changes stay on this device until they can be
            uploaded.
          </p>
          <p className="muted">
            JSON export includes records and photo references, not photo files.
            Existing device-only entries migrate when that device opens this
            version. Recovery copies are kept if you choose a cloud version
            after a conflict.
          </p>
          <div className="inline">
            <button
              type="button"
              onClick={() =>
                exportRecords(true).catch(() =>
                  setMessage("Export failed. Try again."),
                )
              }
            >
              <Download /> Export JSON
            </button>
            <button type="button" onClick={retry}>
              Retry sync
            </button>
            <button
              type="button"
              onClick={async () => {
                const granted = await navigator.storage?.persist?.();
                setMessage(
                  granted
                    ? "Persistent device storage granted."
                    : "The browser manages storage automatically. Export your records regularly.",
                );
              }}
            >
              Keep device storage
            </button>
          </div>
        </section>
        <section>
          <h2>Product data credits</h2>
          <p>
            Suggestions from{" "}
            <a href="https://world.openfoodfacts.org">Open Food Facts</a>,{" "}
            <a href="https://world.openbeautyfacts.org">Open Beauty Facts</a>,{" "}
            <a href="https://world.openpetfoodfacts.org">Open Pet Food Facts</a>
            , and{" "}
            <a href="https://world.openproductsfacts.org">
              Open Products Facts
            </a>
            . Database:{" "}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>;
            contents: DbCL; product images:{" "}
            <a href="https://creativecommons.org/licenses/by-sa/3.0/">
              CC BY-SA
            </a>
            . Community suggestions can be incomplete or incorrect; confirm them
            before saving.
          </p>
        </section>
      </form>
    </>
  );
}

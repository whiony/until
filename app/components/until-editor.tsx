"use client";
import { useState, useCallback } from "react";
import { ScanBarcode, Camera, Plus, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CropPhoto } from "./until-crop";
import { Choice, Check, EditableChoice } from "./until-controls";
import { Photo } from "./until-photo";
import { Scanner } from "./until-scanner";
import {
  categories,
  locations,
  newId,
  stamp,
  validateItem,
  deadline,
  today,
  type Item,
  type Product,
  type Records,
  type Duration,
} from "@/lib/until/domain";
import { lookupProduct, type Suggestion } from "@/lib/until/lookup";
import { preparePhoto } from "@/lib/until/photos";
import { getPhoto } from "@/lib/until/repository";
import { recognizePhoto, type Recognition } from "@/lib/until/recognition";
export type EditorValue = {
  product: Product;
  item: Item;
  photos: Record<string, Blob>;
  editing: boolean;
  expectedProductVersion?: string;
};
export function Editor({
  records,
  item,
  product: initialProduct,
  onClose,
  onSave,
}: {
  records: Records;
  item?: Item;
  product?: Product;
  onClose: () => void;
  onSave: (v: EditorValue) => Promise<void>;
}) {
  const now = stamp();
  const [product, setProduct] = useState<Product>(
    initialProduct
      ? { ...initialProduct }
      : {
          id: newId(),
          name: "",
          brand: "",
          category: "Food",
          barcode: "",
          size: "",
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
        },
  );
  const [group, setGroup] = useState<Item>(
    item
      ? { ...item }
      : {
          id: newId(),
          productId: initialProduct?.id || "",
          quantity: 1,
          printedDate: "",
          dateKind: "unspecified",
          purchaseDate: "",
          openedDate: "",
          location: "Pantry",
          notes: "",
          status: "active",
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
        },
  );
  const [productVersion, setProductVersion] = useState(
    initialProduct?.updatedAt,
  );
  const [cropSource, setCropSource] = useState<Blob | null>(null);
  const [defer, setDefer] = useState(!!item && !deadline(item).date);
  const [photos, setPhotos] = useState<Record<string, Blob>>({});
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [scan, setScan] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [language, setLanguage] = useState("eng");
  const [ack, setAck] = useState(false);
  const p = (patch: Partial<Product>) =>
    setProduct((v) => ({ ...v, ...patch }));
  const g = (patch: Partial<Item>) => {
    setGroup((v) => ({ ...v, ...patch }));
    setAck(false);
  };
  async function lookup(code: string) {
    setError("");
    setInfo("");
    setLookupBusy(true);
    try {
      const result = await lookupProduct(code, records.products);
      setSuggestion(result);
      if (!result) setInfo("No match found. Add a name and date below.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }
  const scanned = useCallback((code: string) => {
    setScan(false);
    setProduct((v) => ({ ...v, barcode: code }));
    setInfo(
      "Barcode captured. Select Look up to search, or continue manually.",
    );
  }, []);
  async function accept() {
    if (!suggestion) return;
    const saved = records.products.find(
      (p) => p.id === suggestion.savedProductId,
    );
    if (saved) {
      setProduct({ ...saved });
      setProductVersion(saved.updatedAt);
    } else {
      p({
        name: suggestion.name,
        brand: suggestion.brand,
        category: suggestion.category,
        size: suggestion.size,
        barcode: suggestion.barcode,
        provenance: {
          provider: suggestion.source,
          url: suggestion.url,
          confirmedAt: stamp(),
          completeness: suggestion.completeness,
        },
      });
      if (suggestion.image) {
        try {
          const response = await fetch(suggestion.image, {
            signal: AbortSignal.timeout(7000),
          });
          if (response.ok) {
            const b = await response.blob();
            const file = new File([b], "product.jpg", { type: b.type });
            const compressed = await preparePhoto(file);
            const id = newId();
            setPhotos((v) => ({ ...v, [id]: compressed }));
            p({ photoId: id });
          }
        } catch {
          setInfo(
            "Product details added. The source photo could not be saved; you can add your own.",
          );
        }
      }
    }
    setSuggestion(null);
  }
  async function upload(file: File | undefined, packaging: boolean) {
    if (!file) return;
    setError("");
    try {
      const b = await preparePhoto(file, packaging);
      const id = newId();
      setPhotos((v) => ({ ...v, [id]: b }));
      if (packaging) {
        g({ packagingPhotoId: id, recognition: undefined });
        setRecognition(null);
      } else setCropSource(b);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function ocr() {
    setError("");
    setOcrBusy(true);
    try {
      const id = group.packagingPhotoId!;
      const blob = photos[id] || (await getPhoto(id));
      if (!blob) throw Error("Photo is missing. Please attach it again.");
      const result = await recognizePhoto(blob, language, setInfo);
      setRecognition(result);
      setInfo(
        "Review the extracted text against your photo. Nothing has been applied.",
      );
    } catch {
      setError(
        "Text recognition is unavailable. It needs language downloads on first use and may fail offline. Keep the photo and enter the date manually.",
      );
    } finally {
      setOcrBusy(false);
    }
  }
  const warning =
    !!group.printedDate &&
    !!group.openedDate &&
    group.printedDate < group.openedDate;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!product.name.trim()) throw Error("Add a product name.");
      validateItem(group);
      if (!deadline(group).date && !defer)
        throw Error(
          "Add a printed date or an opened date with a duration, or choose “Add the date later”.",
        );
      if (warning && !ack)
        throw Error(
          "Confirm the printed date is earlier than the opening date.",
        );
      setBusy(true);
      await onSave({
        product: { ...product, name: product.name.trim(), updatedAt: stamp() },
        item: { ...group, productId: product.id, updatedAt: stamp() },
        photos,
        editing: !!item,
        expectedProductVersion: productVersion,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy && !ocrBusy) onClose();
      }}
    >
      <DialogContent className="editor modal">
        <DialogTitle>
          {item ? "Edit item" : initialProduct ? "Add another" : "Add item"}
        </DialogTitle>
        <DialogDescription>
          {item
            ? "Update this group’s dates and details."
            : "A name and a date. The rest is up to you."}
        </DialogDescription>
        <form onSubmit={submit}>
          <div className="editor-fields">
            {!item && (
              <section className="scan-block">
                <div className="inline">
                  <button type="button" onClick={() => setScan(true)}>
                    <ScanBarcode /> Scan barcode
                  </button>
                  <span className="muted">or add it yourself below</span>
                </div>
                {scan && (
                  <Scanner onCode={scanned} onClose={() => setScan(false)} />
                )}
                <div className="inline">
                  <input
                    aria-label="Barcode"
                    inputMode="numeric"
                    placeholder="Enter barcode"
                    value={product.barcode}
                    onChange={(e) => p({ barcode: e.target.value })}
                  />
                  <button
                    type="button"
                    disabled={lookupBusy || !product.barcode}
                    onClick={() => lookup(product.barcode)}
                  >
                    {lookupBusy ? "Searching…" : "Look up"}
                  </button>
                </div>
                {suggestion && (
                  <div className="suggestion">
                    <strong>{suggestion.name}</strong>
                    <p>
                      {suggestion.brand} · {suggestion.size}
                    </p>
                    <p className="muted">
                      {suggestion.source} ·{" "}
                      {Math.round(suggestion.completeness * 100)}% fields
                      available. Check this is your product.
                    </p>
                    <button type="button" onClick={accept}>
                      Use these details
                    </button>{" "}
                    <button type="button" onClick={() => setSuggestion(null)}>
                      Dismiss
                    </button>
                  </div>
                )}
                <small>
                  Barcodes identify products, never this package’s expiration
                  date.
                </small>
              </section>
            )}
            <label className="field">
              <span>Product name *</span>
              <textarea
                rows={2}
                required
                maxLength={200}
                value={product.name}
                placeholder="e.g. Greek yogurt"
                onChange={(e) => p({ name: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>Printed date</span>
                <input
                  aria-label="Printed date"
                  type="date"
                  min="1900-01-01"
                  max="2200-12-31"
                  value={group.printedDate}
                  onChange={(e) => g({ printedDate: e.target.value })}
                />
              </label>
              <Choice
                label="Date on the label"
                value={group.dateKind}
                onChange={(v) => g({ dateKind: v as Item["dateKind"] })}
                options={["unspecified", "best before", "use by"]}
              />
            </div>
            <Check
              label="Add the date later · keep in Needs a date"
              checked={defer}
              onChange={setDefer}
            />
            <div className="form-grid">
              <label className="field">
                <span>Quantity</span>
                <input
                  type="number"
                  required
                  min={1}
                  max={9999}
                  value={group.quantity}
                  onChange={(e) => g({ quantity: e.target.valueAsNumber })}
                />
              </label>
              <EditableChoice
                label="Location"
                value={group.location}
                onChange={(value) => g({ location: value })}
                defaults={locations}
                customValues={records.items.map((i) => i.location)}
              />
            </div>
            <div className="form-grid">
              <EditableChoice
                label="Category"
                value={product.category}
                onChange={(value) => p({ category: value })}
                defaults={categories}
                customValues={records.products.map((p) => p.category)}
              />

              <label className="field">
                <span>Brand</span>
                <input
                  maxLength={200}
                  value={product.brand}
                  onChange={(e) => p({ brand: e.target.value })}
                />
              </label>
            </div>
            <details open={!!group.openedDate || !!group.rule}>
              <summary>
                After opening <ChevronDown />
              </summary>
              <p className="muted">
                Record the instructions on the package. Opening one unit from a
                group can be done later.
              </p>
              <label className="field">
                <span>Opened date</span>
                <input
                  type="date"
                  max={today()}
                  value={group.openedDate}
                  onChange={(e) => g({ openedDate: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Use within after opening</span>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    placeholder="No rule"
                    value={group.rule?.amount || ""}
                    onChange={(e) =>
                      g({
                        rule: e.target.value
                          ? {
                              amount: e.target.valueAsNumber,
                              unit: group.rule?.unit || "days",
                            }
                          : undefined,
                      })
                    }
                  />
                </label>
                <Choice
                  label="Duration unit"
                  value={group.rule?.unit || "days"}
                  options={["days", "weeks", "months"]}
                  onChange={(v) =>
                    g({
                      rule: {
                        amount: group.rule?.amount || 1,
                        unit: v as Duration["unit"],
                      },
                    })
                  }
                />
              </div>
              {group.quantity > 1 && group.openedDate && (
                <p className="notice">
                  All {group.quantity} units in this group will have this
                  opening date. Use “Open one” on the saved item to open just
                  one.
                </p>
              )}
            </details>
            <details open={!!group.packagingPhotoId}>
              <summary>
                Photos & label recognition <Camera />
              </summary>
              <div className="form-grid">
                <div>
                  <label className="field">
                    <span>Product photo</span>
                    <span className="photo-upload">
                      <Camera size={18} />{" "}
                      {product.photoId
                        ? "Replace photo"
                        : "Choose product photo"}
                    </span>
                    <input
                      className="file-input"
                      aria-label="Product photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => upload(e.target.files?.[0], false)}
                    />
                  </label>
                  {product.photoId && (
                    <Photo
                      id={product.photoId}
                      blob={photos[product.photoId]}
                      category={product.category}
                      name={product.name}
                    />
                  )}
                  {product.photoId && (
                    <button
                      type="button"
                      onClick={async () => {
                        const blob =
                          photos[product.photoId!] ||
                          (await getPhoto(product.photoId!));
                        if (blob) setCropSource(blob);
                        else
                          setError(
                            "Photo is unavailable. Choose a replacement.",
                          );
                      }}
                    >
                      Crop photo
                    </button>
                  )}
                </div>
                <div>
                  <label className="field">
                    <span>Packaging / date photo</span>
                    <span className="photo-upload">
                      <Camera size={18} />{" "}
                      {group.packagingPhotoId
                        ? "Replace label photo"
                        : "Choose label photo"}
                    </span>
                    <input
                      className="file-input"
                      aria-label="Packaging photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => upload(e.target.files?.[0], true)}
                    />
                  </label>
                  {group.packagingPhotoId && (
                    <Photo
                      id={group.packagingPhotoId}
                      blob={photos[group.packagingPhotoId]}
                      category="Label"
                      name="Original packaging label"
                    />
                  )}
                </div>
              </div>
              <small>
                JPEG, PNG, WebP · up to 12 MB. Product photos are compressed;
                the original packaging photo is preserved.
              </small>
              {group.packagingPhotoId && (
                <>
                  <Choice
                    label="Packaging language"
                    value={language}
                    onChange={setLanguage}
                    options={[
                      { value: "eng", label: "English" },
                      { value: "deu", label: "German" },
                      { value: "fra", label: "French" },
                      { value: "spa", label: "Spanish" },
                      { value: "hrv", label: "Croatian" },
                    ]}
                  />
                  <button type="button" disabled={ocrBusy} onClick={ocr}>
                    {ocrBusy ? "Reading photo…" : "Read date from photo"}
                  </button>
                  <p className="muted">
                    Runs on your device. The first use downloads a language
                    model. Faded print and unfamiliar languages may not be
                    recognized.
                  </p>
                </>
              )}
              {recognition && (
                <div className="recognition">
                  <label className="field">
                    <span>
                      Extracted text · {Math.round(recognition.confidence)}% OCR
                      confidence
                    </span>
                    <textarea
                      value={recognition.text}
                      onChange={(e) =>
                        setRecognition({ ...recognition, text: e.target.value })
                      }
                    />
                  </label>
                  <p>
                    These are possibilities, not confirmed dates. Numeric
                    day/month order may be ambiguous. Choose only after checking
                    the original.
                  </p>
                  {recognition.dates.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        g({
                          printedDate: d,
                          recognition: {
                            text: recognition.text,
                            confirmedAt: stamp(),
                          },
                        });
                        setInfo(`Confirmed printed date: ${d}`);
                      }}
                    >
                      Confirm {d}
                    </button>
                  ))}
                  {recognition.rules.map((r, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => {
                        g({
                          rule: r,
                          recognition: {
                            text: recognition.text,
                            confirmedAt: stamp(),
                          },
                        });
                        setInfo("After-opening rule confirmed.");
                      }}
                    >
                      Confirm {r.amount} {r.unit}
                    </button>
                  ))}
                  {!recognition.dates.length && !recognition.rules.length && (
                    <p>
                      No clear date or after-opening instruction found. Enter it
                      manually above.
                    </p>
                  )}
                </div>
              )}
            </details>
            <details>
              <summary>
                More details <Plus />
              </summary>
              <div className="form-grid">
                <label className="field">
                  <span>Purchase date</span>
                  <input
                    type="date"
                    max={today()}
                    value={group.purchaseDate}
                    onChange={(e) => g({ purchaseDate: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Package size</span>
                  <input
                    maxLength={100}
                    placeholder="20 ml, 2 × 100 g, 30 tablets"
                    value={product.size}
                    onChange={(e) => p({ size: e.target.value })}
                  />
                </label>
              </div>
              <label className="field">
                <span>Notes</span>
                <textarea
                  maxLength={5000}
                  value={group.notes}
                  onChange={(e) => g({ notes: e.target.value })}
                />
              </label>
            </details>
            {warning && (
              <div className="notice">
                <p>
                  The printed deadline is earlier than the opening date. It will
                  still control the countdown.
                </p>
                <Check
                  label="I checked these dates"
                  checked={ack}
                  onChange={setAck}
                />
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="notice">
                {info}
              </p>
            )}
          </div>
          <div className="form-footer">
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || ocrBusy}
              type="submit"
            >
              {busy ? "Saving…" : item ? "Save changes" : "Add item"}
            </button>
          </div>
        </form>
        {cropSource && (
          <CropPhoto
            blob={cropSource}
            onCancel={() => setCropSource(null)}
            onSave={(blob) => {
              const id = newId();
              setPhotos((v) => ({ ...v, [id]: blob }));
              p({ photoId: id });
              setCropSource(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

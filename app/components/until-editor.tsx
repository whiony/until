"use client";
import { useState, useCallback, useRef } from "react";
import { DateField } from "./until-date-field";
import { Disclosure } from "./until-disclosure";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogFooter,
} from "./ui/alert-dialog";
import { Help } from "./until-help";
import { ScanBarcode, Camera } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { editorIssue, type FieldIssue } from "@/lib/until/editor-validation";
import { ProductRecognition } from "./until-product-recognition";
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
          category: "",
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
          location: "",
          notes: "",
          status: "active",
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
        },
  );
  const initialValues = useRef(JSON.stringify({ product, group }));
  const [confirmClose, setConfirmClose] = useState(false);
  function requestClose() {
    if (busy || ocrBusy || lookupBusy) return;
    if (
      JSON.stringify({ product, group }) !== initialValues.current ||
      Object.keys(photos).length ||
      cropSource
    ) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }
  const [productVersion, setProductVersion] = useState(
    initialProduct?.updatedAt,
  );
  const [cropSource, setCropSource] = useState<Blob | null>(null);
  const [issue, setIssue] = useState<FieldIssue | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const invalid = (field: string) => ({
    id: field,
    name: `until-${field}`,
    autoComplete: "off",
    "aria-label": (
      {
        "product-name": "Product name *",
        "item-quantity": "Quantity",
        "printed-date": "Printed date",
        "opened-date": "Opened date",
        "purchase-date": "Purchase date",
        "opening-duration": "Use within after opening",
      } as Record<string, string>
    )[field],
    "aria-invalid": issue?.field === field || undefined,
    "aria-describedby": issue?.field === field ? `${field}-error` : undefined,
  });
  const fieldError = (field: string) =>
    issue?.field === field ? (
      <span className="field-error" id={`${field}-error`} role="alert">
        {issue.message}
      </span>
    ) : null;
  function reveal(field: string) {
    requestAnimationFrame(() => {
      const element = formRef.current?.querySelector<HTMLElement>(`#${field}`);
      if (!element) return;
      let parent = element.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "center" });
    });
  }

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
  const [dateArea, setDateArea] = useState<"whole" | "top" | "bottom">("whole");
  const [originalProduct, setOriginalProduct] = useState<Blob | null>(null);
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
      if (!result) setInfo("No match found. Add a product name below.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLookupBusy(false);
    }
  }
  const scanned = useCallback(
    (code: string) => {
      setScan(false);
      setProduct((v) => ({ ...v, barcode: code }));
      setInfo(
        "Barcode captured. Look up scanned barcode, or continue with your own details.",
      );
    },
    [setScan, setProduct, setInfo],
  );
  async function accept() {
    if (!suggestion) return;
    const saved = records.products.find(
      (p) => p.id === suggestion.savedProductId,
    );
    if (saved) {
      setOriginalProduct(null);
      setProduct({ ...saved });
      setProductVersion(saved.updatedAt);
    } else {
      p({
        name: suggestion.name || product.name,
        brand: suggestion.brand || product.brand,
        category: suggestion.category,
        size: suggestion.size || product.size,
        barcode: suggestion.barcode,
        provenance: {
          provider: suggestion.source,
          url: suggestion.url,
          confirmedAt: stamp(),
          completeness: suggestion.completeness,
        },
      });
      if (suggestion.image && !product.photoId) {
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
      } else {
        setCropSource(b);
      }
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
      const result = await recognizePhoto(
        blob,
        language,
        setInfo,
        "date",
        dateArea,
      );
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
      const problem = editorIssue(product.name, group, ack);
      setIssue(problem);
      if (problem) {
        reveal(problem.field);
        return;
      }
      validateItem(group);
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
      reveal("form-error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) requestClose();
      }}
    >
      <DialogContent className="editor modal">
        <DialogTitle>
          {item ? "Edit item" : initialProduct ? "Add another" : "Add item"}
        </DialogTitle>
        <form ref={formRef} onSubmit={submit} noValidate autoComplete="off">
          <div className="editor-fields">
            <DialogDescription>
              {item
                ? "Update this item’s dates and details."
                : "Start with a name. Add a date whenever you have it."}
            </DialogDescription>

            {error && (
              <p id="form-error" tabIndex={-1} className="error" role="alert">
                {error}
              </p>
            )}
            <label className="field">
              <span>Product name *</span>
              <input
                {...invalid("product-name")}
                type="text"
                required
                maxLength={200}
                value={product.name}
                placeholder="e.g. Greek yogurt"
                onChange={(e) => p({ name: e.target.value })}
              />
              {fieldError("product-name")}
            </label>
            {!item && (
              <section className="scan-compact">
                <div className="inline">
                  <button type="button" onClick={() => setScan(true)}>
                    <ScanBarcode /> Scan barcode
                  </button>
                  <Help
                    label="Scan barcode"
                    text="Identifies the product; you add this package’s date separately."
                  />
                </div>
                {scan && (
                  <Scanner onCode={scanned} onClose={() => setScan(false)} />
                )}
                {product.barcode && (
                  <button
                    type="button"
                    disabled={lookupBusy}
                    onClick={() => lookup(product.barcode)}
                  >
                    {lookupBusy ? "Searching…" : "Look up scanned barcode"}
                  </button>
                )}
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
              </section>
            )}
            <Disclosure
              title="Photos & label recognition"
              defaultOpen
              className="photo-section"
            >
              <div className="form-grid">
                <div>
                  <label className="field">
                    <span className="field-label">
                      Product photo
                      <Help
                        label="Product photo"
                        text="JPEG, PNG or WebP, up to 12 MB. Keep the name visible for recognition."
                      />
                    </span>
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
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void upload(file, false);
                      }}
                    />
                  </label>
                  <small className="photo-purpose">Recognize the item</small>
                  {product.photoId && (
                    <Photo
                      id={product.photoId}
                      blob={photos[product.photoId]}
                      category={product.category}
                      name={product.name}
                    />
                  )}
                  {product.photoId && (
                    <ProductRecognition
                      key={product.photoId}
                      getBlob={async () =>
                        originalProduct ||
                        photos[product.photoId!] ||
                        (await getPhoto(product.photoId!))
                      }
                      onApply={(name) => {
                        p({ name });
                        setInfo(
                          "Product name applied. You can edit it before saving.",
                        );
                      }}
                    />
                  )}
                  {product.photoId && (
                    <button
                      type="button"
                      onClick={async () => {
                        const blob =
                          originalProduct ||
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
                    <span className="field-label">
                      Label photo
                      <Help
                        label="Label photo"
                        text="JPEG, PNG or WebP, up to 12 MB. The original label photo is kept."
                      />
                    </span>
                    <span className="photo-upload">
                      <Camera size={18} />{" "}
                      {group.packagingPhotoId
                        ? "Replace label photo"
                        : "Choose label photo"}
                    </span>
                    <input
                      className="file-input"
                      aria-label="Label photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void upload(file, true);
                      }}
                    />
                  </label>
                  <small className="photo-purpose">
                    Read the date and instructions
                  </small>
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
                  <Choice
                    label="Date text area"
                    value={dateArea}
                    onChange={(v) => setDateArea(v as typeof dateArea)}
                    options={[
                      { value: "whole", label: "Whole photo" },
                      { value: "top", label: "Top half" },
                      { value: "bottom", label: "Bottom half" },
                    ]}
                  />
                  <small>
                    Choose the packaging language, independently of the app
                    language. Focus on the half containing the date if nearby
                    text gets in the way.
                  </small>
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
                    These are possibilities, not confirmed dates. Numeric date
                    order may be ambiguous. Two-digit years are shown as
                    2000–2099. Check the year and order against the original
                    before choosing.
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
            </Disclosure>
            <section className="date-section" aria-label="Optional dates">
              <h2>
                Dates <span>optional</span>
              </h2>
              <div className="form-grid">
                <DateField
                  {...invalid("printed-date")}
                  label="Printed date"
                  value={group.printedDate}
                  onChange={(value) => g({ printedDate: value })}
                  help="Optional date printed on the package. The earlier printed or after-opening date is tracked."
                  error={fieldError("printed-date")}
                />
                <Choice
                  help="Best before is a quality date; use by is the label’s expiry date. Choose unspecified when the label does not say."
                  label="Date type"
                  value={group.dateKind}
                  onChange={(v) => g({ dateKind: v as Item["dateKind"] })}
                  options={["unspecified", "best before", "use by"]}
                />
              </div>
            </section>
            <Disclosure
              title="After opening"
              defaultOpen={!!group.openedDate || !!group.rule}
            >
              <p className="muted">
                Record the instructions on the package. Opening one unit from a
                group can be done later.
              </p>
              <DateField
                {...invalid("opened-date")}
                label="Opened date"
                value={group.openedDate}
                onChange={(value) => g({ openedDate: value })}
                help="The day you opened the item. Leave empty for unopened items."
                error={fieldError("opened-date")}
              />
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">
                    Use within after opening
                    <Help
                      label="Use within after opening"
                      text="The label’s duration after opening. An opening date is needed to calculate its deadline. The earlier of this deadline and the printed date is tracked."
                    />
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    {...invalid("opening-duration")}
                    inputMode="numeric"
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
                  {fieldError("opening-duration")}
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
            </Disclosure>
            <Disclosure title="More details" defaultOpen={!!item}>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">
                    Quantity
                    <Help
                      label="Quantity"
                      text="Number of separate units with these same dates and location. Use Package size for grams, millilitres or tablets per package."
                    />
                  </span>
                  <input
                    {...invalid("item-quantity")}
                    inputMode="numeric"
                    type="number"
                    required
                    min={1}
                    max={9999}
                    value={Number.isNaN(group.quantity) ? "" : group.quantity}
                    onChange={(e) => g({ quantity: e.target.valueAsNumber })}
                  />
                  {fieldError("item-quantity")}
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
                    placeholder="e.g. Haruharu wonder"
                    name="until-product-brand"
                    autoComplete="off"
                    autoCorrect="off"
                    value={product.brand}
                    onChange={(e) => p({ brand: e.target.value })}
                  />
                </label>
              </div>

              <div className="form-grid">
                <DateField
                  {...invalid("purchase-date")}
                  label="Purchase date"
                  value={group.purchaseDate}
                  onChange={(value) => g({ purchaseDate: value })}
                  error={fieldError("purchase-date")}
                />
                <label className="field">
                  <span className="field-label">
                    Package size
                    <Help
                      label="Package size"
                      text="Amount in one package, for example 20 ml or 30 tablets. This does not change the number of units."
                    />
                  </span>
                  <input
                    maxLength={100}
                    aria-label="Package size"
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
                  placeholder="Storage instructions or anything to remember"
                  value={group.notes}
                  onChange={(e) => g({ notes: e.target.value })}
                />
              </label>
            </Disclosure>
            {warning && (
              <div className="notice">
                <p>
                  The printed deadline is earlier than the opening date. It will
                  still control the countdown.
                </p>
                <div
                  id="date-confirmation"
                  tabIndex={-1}
                  aria-describedby="date-confirmation-error"
                >
                  {fieldError("date-confirmation")}
                  <Check
                    label="I checked these dates"
                    checked={ack}
                    onChange={setAck}
                  />
                </div>
              </div>
            )}

            {info && (
              <p role="status" className="notice">
                {info}
              </p>
            )}
          </div>
          <div className="form-footer">
            <button type="button" onClick={requestClose} disabled={busy}>
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
              setOriginalProduct(cropSource);
              setCropSource(null);
            }}
          />
        )}
        <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
          <AlertDialogContent className="discard-dialog">
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved details and photos will be lost.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={onClose}>
                Discard changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { DateKindField } from "./until-date-kind";
import { categoryNames, locationNames } from "@/lib/until/preferences";
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
  displayDate,
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
  const submitting = useRef(false);
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const controlId = (field: string) =>
    field === "product-name" ? "until-product-title" : field;
  const invalid = (field: string) => ({
    id: controlId(field),
    name: field === "product-name" ? "until-product-title" : `until-${field}`,
    autoComplete: "off",
    "aria-label": (
      {
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
      const element = formRef.current?.querySelector<HTMLElement>(
        `#${controlId(field)}`,
      );
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
  const [durationUnit, setDurationUnit] = useState<Duration["unit"]>(
    group.rule?.unit || "days",
  );
  const productFile = useRef<HTMLInputElement>(null),
    labelFile = useRef<HTMLInputElement>(null);
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
    if (submitting.current) return;
    submitting.current = true;
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
      submitting.current = false;
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
      <DialogContent
        className="editor modal"
        ref={dialogRef}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          queueMicrotask(() => {
            if (
              !document.querySelector('[data-slot="dialog-content"]') &&
              returnFocus.current?.isConnected
            )
              returnFocus.current.focus({ preventScroll: true });
          });
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          dialogRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle>
          {item ? "Edit item" : initialProduct ? "Add another" : "Add item"}
        </DialogTitle>
        <form
          id="until-item-form"
          name="until-item-entry"
          ref={formRef}
          onSubmit={submit}
          noValidate
          autoComplete="off"
        >
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
            <div className="field">
              <label htmlFor="until-product-title">Product name *</label>
              <input
                {...invalid("product-name")}
                type="text"
                inputMode="text"
                autoCorrect="off"
                required
                maxLength={200}
                value={product.name}
                placeholder="e.g. Greek yogurt"
                onChange={(e) => p({ name: e.target.value })}
              />
              {fieldError("product-name")}
            </div>
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
              <div className="form-grid photo-panels">
                <section
                  className="photo-panel"
                  aria-label="Product photo tools"
                >
                  <div className="field">
                    <span className="field-label">
                      Product photo
                      <Help
                        label="Product photo"
                        text="Show the product and its name. This helps recognize it and makes it easy to spot in your shelf."
                      />
                    </span>
                    <button
                      type="button"
                      className="photo-upload"
                      aria-label={
                        product.photoId
                          ? "Replace product photo"
                          : "Choose product photo"
                      }
                      onClick={() => productFile.current?.click()}
                    >
                      <Camera size={18} />{" "}
                      {product.photoId ? "Replace photo" : "Choose photo"}
                    </button>
                    <input
                      ref={productFile}
                      tabIndex={-1}
                      className="file-input"
                      aria-label="Product photo"
                      id="until-product-photo"
                      name="until-product-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void upload(file, false);
                      }}
                    />
                  </div>
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
                </section>
                <section className="photo-panel" aria-label="Label photo tools">
                  <div className="field">
                    <span className="field-label">
                      Label photo
                      <Help
                        label="Label photo"
                        text="Show the printed date and any instructions for use after opening. Keep the text clear and readable."
                      />
                    </span>
                    <button
                      type="button"
                      className="photo-upload"
                      aria-label={
                        group.packagingPhotoId
                          ? "Replace label photo"
                          : "Choose label photo"
                      }
                      onClick={() => labelFile.current?.click()}
                    >
                      <Camera size={18} />{" "}
                      {group.packagingPhotoId
                        ? "Replace photo"
                        : "Choose photo"}
                    </button>
                    <input
                      ref={labelFile}
                      tabIndex={-1}
                      className="file-input"
                      aria-label="Label photo"
                      id="until-packaging-photo"
                      name="until-packaging-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void upload(file, true);
                      }}
                    />
                  </div>
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

                  {group.packagingPhotoId && (
                    <div className="label-recognition">
                      <details className="recognition-options">
                        <summary>Label recognition options</summary>
                        <Choice
                          label="Packaging language"
                          id="until-packaging-language"
                          name="until-packaging-language"
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
                          id="until-date-text-area"
                          name="until-date-text-area"
                          value={dateArea}
                          onChange={(v) => setDateArea(v as typeof dateArea)}
                          options={[
                            { value: "whole", label: "Whole photo" },
                            { value: "top", label: "Top half" },
                            { value: "bottom", label: "Bottom half" },
                          ]}
                        />
                        <small>
                          Choose the packaging language and the area containing
                          the date.
                        </small>
                      </details>
                      <button type="button" disabled={ocrBusy} onClick={ocr}>
                        {ocrBusy ? "Reading photo…" : "Read date from photo"}
                      </button>
                      <p className="muted">
                        Reads on this device. Check the results against the
                        label; nothing is applied automatically.
                      </p>
                    </div>
                  )}
                  {recognition && (
                    <div className="recognition">
                      <label className="field">
                        <span>
                          Extracted text · {Math.round(recognition.confidence)}%
                          OCR confidence
                        </span>
                        <textarea
                          id="until-label-extracted-text"
                          name="until-label-extracted-text"
                          autoComplete="off"
                          inputMode="text"
                          value={recognition.text}
                          onChange={(e) =>
                            setRecognition({
                              ...recognition,
                              text: e.target.value,
                            })
                          }
                        />
                      </label>
                      <p>
                        These are possibilities, not confirmed dates. Numeric
                        date order may be ambiguous. Two-digit years are shown
                        as 2000–2099. Check the year and order against the
                        original before choosing.
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
                            setInfo(
                              `Confirmed printed date: ${displayDate(d)}`,
                            );
                          }}
                        >
                          Confirm {displayDate(d)}
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
                      {!recognition.dates.length &&
                        !recognition.rules.length && (
                          <p>
                            No clear date or after-opening instruction found.
                            Enter it manually above.
                          </p>
                        )}
                    </div>
                  )}
                </section>
              </div>
            </Disclosure>
            <section className="date-section" aria-label="Dates">
              <h2>Dates</h2>
              <div className="form-grid">
                <DateField
                  {...invalid("printed-date")}
                  label="Printed date"
                  value={group.printedDate}
                  onChange={(value) => g({ printedDate: value })}
                  help="Enter the date printed on the packaging. Leave it empty if there is no date."
                  error={fieldError("printed-date")}
                />
              </div>
              <DateKindField
                value={group.dateKind}
                onChange={(dateKind) => g({ dateKind })}
              />
            </section>
            <Disclosure
              title="After opening"
              defaultOpen={!!group.openedDate || !!group.rule}
            >
              <p className="muted">
                The countdown uses the earlier of the printed date and the
                deadline after opening.
              </p>
              <DateField
                {...invalid("opened-date")}
                label="Opened date"
                value={group.openedDate}
                onChange={(value) => g({ openedDate: value })}
                help="Enter when this physical item was opened. Leave it empty while unopened."
                error={fieldError("opened-date")}
              />
              <div className="field duration-field">
                <span className="field-label">
                  <label htmlFor="opening-duration">
                    Use within after opening
                  </label>
                  <Help
                    label="Use within after opening"
                    text="Enter the duration stated on the label, such as 7 days or 6 months. You can record it before opening the item."
                  />
                </span>
                <div className="duration-controls">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    {...invalid("opening-duration")}
                    inputMode="numeric"
                    placeholder="Optional"
                    value={group.rule?.amount || ""}
                    onChange={(event) =>
                      g({
                        rule: event.target.value
                          ? {
                              amount: event.target.valueAsNumber,
                              unit: group.rule?.unit || durationUnit,
                            }
                          : undefined,
                      })
                    }
                  />
                  <Choice
                    label="Duration unit"
                    id="until-opening-duration-unit"
                    name="until-opening-duration-unit"
                    value={group.rule?.unit || durationUnit}
                    options={[
                      { value: "days", label: "Days" },
                      { value: "weeks", label: "Weeks" },
                      { value: "months", label: "Months" },
                    ]}
                    onChange={(value) => {
                      setDurationUnit(value as Duration["unit"]);
                      if (group.rule)
                        g({
                          rule: {
                            ...group.rule,
                            unit: value as Duration["unit"],
                          },
                        });
                    }}
                  />
                </div>
                {fieldError("opening-duration")}
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
                <div className="field">
                  <span className="field-label">
                    <label htmlFor="item-quantity">Quantity</label>
                    <Help
                      label="Quantity"
                      text="Count the physical items sharing these details. Enter items, not grams or millilitres."
                    />
                  </span>
                  <input
                    {...invalid("item-quantity")}
                    inputMode="numeric"
                    type="number"
                    min={1}
                    max={9999}
                    value={Number.isNaN(group.quantity) ? "" : group.quantity}
                    onChange={(e) => g({ quantity: e.target.valueAsNumber })}
                  />
                  {fieldError("item-quantity")}
                </div>
                <EditableChoice
                  label="Location"
                  id="until-item-location"
                  name="until-item-location"
                  value={group.location}
                  onChange={(value) => g({ location: value })}
                  defaults={locationNames(records, true)}
                  customValues={[]}
                />
              </div>
              <div className="form-grid">
                <EditableChoice
                  label="Category"
                  id="until-product-category"
                  name="until-product-category"
                  value={product.category}
                  onChange={(value) => p({ category: value })}
                  defaults={categoryNames(records, true)}
                  customValues={[]}
                />

                <div className="field">
                  <label htmlFor="product-brand">Brand</label>
                  <input
                    maxLength={200}
                    placeholder="Brand name"
                    id="product-brand"
                    type="text"
                    inputMode="text"
                    name="until-product-brand"
                    autoComplete="off"
                    autoCorrect="off"
                    value={product.brand}
                    onChange={(e) => p({ brand: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid">
                <DateField
                  {...invalid("purchase-date")}
                  label="Purchase date"
                  value={group.purchaseDate}
                  onChange={(value) => g({ purchaseDate: value })}
                  error={fieldError("purchase-date")}
                />
                <div className="field">
                  <span className="field-label">
                    <label htmlFor="product-size">Package size</label>
                    <Help
                      label="Package size"
                      text="Describe one package, for example 20 ml or 30 tablets. This optional text does not change Quantity."
                    />
                  </span>
                  <input
                    maxLength={100}
                    id="product-size"
                    type="text"
                    inputMode="text"
                    name="until-package-size"
                    autoComplete="off"
                    autoCorrect="off"
                    aria-label="Package size"
                    placeholder="20 ml, 2 × 100 g, 30 tablets"
                    value={product.size}
                    onChange={(e) => p({ size: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="item-notes">Notes</label>
                <textarea
                  maxLength={5000}
                  id="item-notes"
                  name="until-item-notes"
                  inputMode="text"
                  autoComplete="off"
                  placeholder="Storage instructions or anything to remember"
                  value={group.notes}
                  onChange={(e) => g({ notes: e.target.value })}
                />
              </div>
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

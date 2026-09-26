"use client";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
export type Crop = { zoom: number; x: number; y: number };
export async function cropPhoto(blob: Blob, crop: Crop) {
  const image = await createImageBitmap(blob);
  try {
    const side = Math.min(image.width, image.height) / crop.zoom;
    const x = ((image.width - side) * crop.x) / 100,
      y = ((image.height - side) * crop.y) / 100;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.min(1000, Math.round(side));
    canvas
      .getContext("2d")!
      .drawImage(image, x, y, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("Could not crop this photo."))),
        "image/jpeg",
        0.88,
      ),
    );
  } finally {
    image.close();
  }
}
export function CropPhoto({
  blob,
  onSave,
  onCancel,
}: {
  blob: Blob;
  onSave: (b: Blob) => void;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 50, y: 50 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  useEffect(() => {
    let live = true;
    createImageBitmap(blob)
      .then((b) => {
        if (!live) {
          b.close();
          return;
        }
        bitmap.current = b;
        setReady(true);
      })
      .catch(() => setError("Could not open the photo. Choose another image."));
    return () => {
      live = false;
      bitmap.current?.close();
      bitmap.current = null;
    };
  }, [blob]);
  useEffect(() => {
    const image = bitmap.current,
      view = canvas.current;
    if (!image || !view) return;
    const side = Math.min(image.width, image.height) / crop.zoom;
    view
      .getContext("2d")!
      .drawImage(
        image,
        ((image.width - side) * crop.x) / 100,
        ((image.height - side) * crop.y) / 100,
        side,
        side,
        0,
        0,
        600,
        600,
      );
  }, [crop, ready]);
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent className="modal crop-dialog">
        <DialogTitle>Crop product photo</DialogTitle>
        <DialogDescription>
          Drag to position, or use the controls below. Your packaging photo
          stays unchanged.
        </DialogDescription>
        <canvas
          role="img"
          aria-label="Product photo crop preview"
          ref={canvas}
          width={600}
          height={600}
          className="crop-preview"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, crop };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d)
              setCrop({
                ...d.crop,
                x: Math.max(0, Math.min(100, d.crop.x - (e.clientX - d.x) / 2)),
                y: Math.max(0, Math.min(100, d.crop.y - (e.clientY - d.y) / 2)),
              });
          }}
          onPointerUp={() => (drag.current = null)}
        />
        {(["zoom", "x", "y"] as const).map((key) => (
          <label className="crop-control" key={key}>
            <span>
              {key === "zoom"
                ? "Zoom"
                : key === "x"
                  ? "Horizontal position"
                  : "Vertical position"}
            </span>
            <Slider
              aria-label={
                key === "zoom"
                  ? "Zoom"
                  : key === "x"
                    ? "Horizontal position"
                    : "Vertical position"
              }
              min={key === "zoom" ? 1 : 0}
              max={key === "zoom" ? 3 : 100}
              step={key === "zoom" ? 0.05 : 1}
              value={[crop[key]]}
              onValueChange={(v) => setCrop({ ...crop, [key]: v[0] })}
            />
          </label>
        ))}
        {error && <p role="alert">{error}</p>}
        <div className="form-footer">
          <button disabled={busy} onClick={onCancel}>
            Cancel crop
          </button>
          <button
            className="primary"
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              try {
                onSave(await cropPhoto(blob, crop));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Use crop
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

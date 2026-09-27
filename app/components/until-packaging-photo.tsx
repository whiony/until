"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { ZoomIn, ZoomOut, Expand } from "lucide-react";
import { getPhoto } from "@/lib/until/repository";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Photo } from "./until-photo";

export function PackagingPhoto({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const pan = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const previous = useRef({ width: 0, height: 0 });
  useEffect(() => {
    if (!open) return;
    let active = true;
    let objectUrl = "";
    // Fetch the saved packaging blob directly. Never substitute the product crop.
    void getPhoto(id)
      .then((blob) => {
        if (!active) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, id]);
  const observer = useRef<ResizeObserver | null>(null);
  const attachPan = useCallback((element: HTMLDivElement | null) => {
    pan.current = element;
    observer.current?.disconnect();
    if (!element) return;
    const measure = () =>
      setBounds({ width: element.clientWidth, height: element.clientHeight });
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(element);
  }, []);
  const scale =
    size.width && size.height
      ? Math.min(bounds.width / size.width, bounds.height / size.height)
      : 0;
  const width = size.width * scale * zoom;
  const height = size.height * scale * zoom;
  const stageWidth = Math.max(bounds.width, width);
  const stageHeight = Math.max(bounds.height, height);
  useLayoutEffect(() => {
    const element = pan.current;
    if (element && previous.current.width) {
      element.scrollLeft += (stageWidth - previous.current.width) / 2;
      element.scrollTop += (stageHeight - previous.current.height) / 2;
    }
    previous.current = { width: stageWidth, height: stageHeight };
  }, [stageWidth, stageHeight]);
  const ready = !!url && !!size.width && !failed;
  const changeZoom = (value: number) =>
    setZoom(Math.max(1, Math.min(6, value)));
  return (
    <section className="packaging-photo">
      <h3>Original packaging photo</h3>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) {
            setFailed(false);
            setUrl("");
            setZoom(1);
            setSize({ width: 0, height: 0 });
            previous.current = { width: 0, height: 0 };
          }
        }}
      >
        <DialogTrigger asChild>
          <button
            className="packaging-preview"
            aria-label="View original packaging photo"
          >
            <Photo id={id} category="Label" name="Original packaging label" />
            <span>
              <Expand size={18} aria-hidden="true" /> View full photo
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="photo-viewer modal">
          <DialogTitle>Original packaging photo</DialogTitle>
          <DialogDescription>
            Zoom to read the label. Drag or scroll to pan; use arrow keys when
            the photo is focused.
          </DialogDescription>
          <div
            ref={attachPan}
            className="photo-pan"
            tabIndex={0}
            role="region"
            aria-label="Packaging photo, arrow keys to pan"
            style={{ touchAction: zoom > 1 ? "none" : "auto" }}
            onKeyDown={(event) => {
              const steps: Record<string, [number, number]> = {
                ArrowLeft: [-80, 0],
                ArrowRight: [80, 0],
                ArrowUp: [0, -80],
                ArrowDown: [0, 80],
              };
              const step = steps[event.key];
              if (step) {
                event.preventDefault();
                event.currentTarget.scrollBy(...step);
              }
            }}
            onPointerDown={(event) => {
              if (zoom <= 1 || event.button !== 0) return;
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                left: event.currentTarget.scrollLeft,
                top: event.currentTarget.scrollTop,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (drag.current) {
                event.currentTarget.scrollLeft =
                  drag.current.left + drag.current.x - event.clientX;
                event.currentTarget.scrollTop =
                  drag.current.top + drag.current.y - event.clientY;
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          >
            {failed ? (
              <p role="status">
                This packaging photo is unavailable. Try again when you are
                connected.
              </p>
            ) : !url ? (
              <p role="status">Loading original photo…</p>
            ) : (
              <div
                className="photo-stage"
                style={{ width: stageWidth, height: stageHeight }}
              >
                {/* The object URL contains the original bytes; sizing only changes the view. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Full original packaging label"
                  draggable={false}
                  style={{ width, height }}
                  onError={() => setFailed(true)}
                  onLoad={(event) =>
                    setSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                />
              </div>
            )}
          </div>
          <div className="photo-zoom-controls" aria-label="Photo zoom controls">
            <button
              disabled={!ready || zoom === 1}
              aria-label="Zoom out"
              onClick={() => changeZoom(zoom - 0.5)}
            >
              <ZoomOut aria-hidden="true" />
            </button>
            <label className="photo-zoom-slider">
              Zoom{" "}
              <input
                aria-label="Photo zoom"
                type="range"
                min="1"
                max="6"
                step=".25"
                disabled={!ready}
                value={zoom}
                onChange={(event) => changeZoom(Number(event.target.value))}
              />
            </label>
            <button
              disabled={!ready || zoom === 6}
              aria-label="Zoom in"
              onClick={() => changeZoom(zoom + 0.5)}
            >
              <ZoomIn aria-hidden="true" />
            </button>
            <button disabled={!ready} onClick={() => changeZoom(1)}>
              Fit
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

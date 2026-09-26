"use client";
import { useEffect, useRef, useState } from "react";
import { supportsTorch, setTorch, releaseCamera } from "@/lib/until/camera";
export function Scanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    track = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState(""),
    [available, setAvailable] = useState(false),
    [lit, setLit] = useState(false),
    [changing, setChanging] = useState(false);
  useEffect(() => {
    const element = video.current;
    let stopped = false,
      done = false,
      controls: { stop: () => void } | undefined;
    const release = () => {
      const stream = element?.srcObject as MediaStream | null;
      void releaseCamera(stream).finally(() => controls?.stop());
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Camera unavailable");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      controls = await new BrowserMultiFormatReader().decodeFromConstraints(
        { video: { facingMode: "environment" }, audio: false },
        element!,
        (result) => {
          if (result && !done && !stopped) {
            done = true;
            release();
            onCode(result.getText());
          }
        },
      );
      if (stopped || done) {
        release();
        controls.stop();
        return;
      }
      track.current =
        (element?.srcObject as MediaStream | null)?.getVideoTracks()[0] || null;
      setAvailable(supportsTorch(track.current || undefined));
    })().catch(() => {
      if (!stopped)
        setError(
          "Camera could not start. Check camera permission, retry, or enter the product name yourself.",
        );
    });
    return () => {
      stopped = true;
      release();
      track.current = null;
    };
  }, [onCode]);
  return (
    <div className="scanner">
      <video ref={video} muted playsInline autoPlay />
      <p role="status">
        {error || "Hold one retail barcode inside the camera view."}
      </p>
      {available && (
        <button
          type="button"
          aria-pressed={lit}
          disabled={changing}
          onClick={async () => {
            if (!track.current) return;
            setChanging(true);
            try {
              await setTorch(track.current, !lit);
              setLit(!lit);
            } catch {
              setError(
                "Camera light is unavailable. Continue scanning in good light.",
              );
              setAvailable(false);
            } finally {
              setChanging(false);
            }
          }}
        >
          {lit ? "Turn light off" : "Turn light on"}
        </button>
      )}
      <button type="button" onClick={onClose}>
        Stop camera
      </button>
    </div>
  );
}

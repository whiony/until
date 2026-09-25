"use client";
import { useEffect, useRef, useState } from "react";
export function Scanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const videoElement = video.current;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    let done = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "No camera is available in this browser. Enter the barcode below.",
        );
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" }, audio: false },
        videoElement!,
        (result) => {
          if (result && !done && !stopped) {
            done = true;
            controls?.stop();
            onCode(result.getText());
          }
        },
      );
      if (stopped || done) controls.stop();
    })().catch(() => {
      if (!stopped)
        setError(
          "Camera could not start. Check camera permission or enter the barcode below.",
        );
    });
    return () => {
      stopped = true;
      controls?.stop();
      const stream = videoElement?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);
  return (
    <div className="scanner">
      <video ref={video} muted playsInline autoPlay />
      <p role="status">
        {error || "Hold one retail barcode inside the camera view."}
      </p>
      <button type="button" onClick={onClose}>
        Stop camera · enter manually
      </button>
    </div>
  );
}

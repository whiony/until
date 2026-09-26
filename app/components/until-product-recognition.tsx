"use client";
import { useRef, useState, useEffect } from "react";
import { Choice } from "./until-controls";
import { recognizePhoto, productTextCandidates } from "@/lib/until/recognition";
export function ProductRecognition({
  getBlob,
  onApply,
}: {
  getBlob: () => Promise<Blob | undefined>;
  onApply: (name: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [text, setText] = useState(""),
    [name, setName] = useState(""),
    [language, setLanguage] = useState("eng");
  const attempt = useRef(0);
  useEffect(
    () => () => {
      attempt.current++;
    },
    [],
  );
  async function recognize() {
    const current = ++attempt.current;
    setBusy(true);
    setMessage("Reading product text…");
    setText("");
    setName("");
    try {
      const blob = await getBlob();
      if (!blob) throw Error("Missing photo");
      const result = await recognizePhoto(blob, language, () => {}, "product");
      if (current !== attempt.current) return;
      setText(result.text);
      const candidates = productTextCandidates(result.text, result.confidence);
      setName(candidates[0] || "");
      setMessage(
        candidates.length
          ? "Suggested from visible text. Check and edit before applying."
          : "No clear product name found. Type the name manually; your photo is kept.",
      );
    } catch {
      if (current === attempt.current)
        setMessage(
          "Recognition unavailable. Type the name manually; your photo is kept. A language download may need an internet connection.",
        );
    } finally {
      if (current === attempt.current) setBusy(false);
    }
  }
  return (
    <section
      className="product-recognition"
      aria-label="Product name recognition"
    >
      <Choice
        label="Product label language"
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
      <button type="button" onClick={recognize} disabled={busy}>
        {busy ? "Reading product…" : "Recognize product"}
      </button>
      {busy && (
        <button
          type="button"
          onClick={() => {
            attempt.current++;
            setBusy(false);
            setMessage("Recognition canceled. Continue manually.");
          }}
        >
          Continue manually
        </button>
      )}
      <small>
        Reads text on this device. No paid service or photo upload for
        recognition. You choose what to apply.
      </small>
      {message && <p role="status">{message}</p>}
      {text && (
        <details open>
          <summary>Recognized product text</summary>
          <pre>{text}</pre>
        </details>
      )}
      {text && (
        <>
          <label className="field">
            <span>Suggested product name</span>
            <input
              autoComplete="off"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onApply(name.trim())}
          >
            Use suggested name
          </button>
        </>
      )}
    </section>
  );
}

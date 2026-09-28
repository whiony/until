"use client";
import { useEffect, useState } from "react";
import {
  getSyncInfo,
  downloadYourData,
  adoptCloudCopy,
  type SyncState,
} from "@/lib/until/repository";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
export function SyncPanel({
  state,
  retry,
  generation,
}: {
  state: SyncState;
  retry: () => void;
  generation: number;
}) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getSyncInfo>>>({
    lastSync: undefined,
    lastUpload: undefined,
    pending: false,
    conflict: undefined,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    getSyncInfo().then(setInfo);
  }, [state, generation]);
  return (
    <div className="sync-panel">
      <h3>Account sync</h3>
      <p role="status">
        {state === "saved"
          ? info.lastSync
            ? `Last checked ${new Date(info.lastSync).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}. Device and account copies matched at that check.`
            : "Account and device copies matched at the last check."
          : state === "offline"
            ? "Offline. Your changes are kept here until you reconnect."
            : state === "signed-out"
              ? "Sign in to sync with your other devices."
              : state === "conflict"
                ? "The same record changed on two devices. Sync is paused; both copies are preserved."
                : state === "pending"
                  ? "Checking for changes…"
                  : "Could not reach your account. Local changes are safe; we’ll retry automatically."}
      </p>
      {info.pending && state !== "saved" && <p>Local changes are waiting to sync.</p>}
      {info.lastUpload && <p className="muted">Last upload from this device: {new Date(info.lastUpload).toLocaleString("en")}.</p>}
      {state === "signed-out" ? (
        <a href="/signin-with-chatgpt?return_to=/" target="_top">
          Sign in with ChatGPT
        </a>
      ) : (
        <button type="button" onClick={retry}>
          Check now
        </button>
      )}
      {state === "conflict" && (
        <>
          <p>
            {info.conflict?.fields.length || 1} overlapping record(s). Download
            your local copy before choosing the cloud version.
          </p>
          <button type="button" onClick={() => downloadYourData().catch(() => setError("Could not download the local data archive. Reconnect and try again."))}>
            Download local data
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button">Use cloud copy…</button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Use the cloud version?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your current device version will be kept in recovery storage,
                  available in your data archive. The cloud
                  version will become your active shelf. No cloud records will
                  be overwritten.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    try {
                      await adoptCloudCopy();
                      retry();
                    } catch {
                      setError(
                        "Could not download the cloud copy. Nothing was replaced.",
                      );
                    }
                  }}
                >
                  Use cloud copy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

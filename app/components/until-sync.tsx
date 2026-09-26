"use client";
import { useEffect, useState } from "react";
import {
  getSyncInfo,
  exportRecords,
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
}: {
  state: SyncState;
  retry: () => void;
}) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getSyncInfo>>>({
    lastSync: undefined,
    conflict: undefined,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    getSyncInfo().then(setInfo);
  }, [state]);
  return (
    <section className="sync-panel">
      <h2>Account sync</h2>
      <p role="status">
        {state === "saved"
          ? info.lastSync
            ? `Last checked ${new Date(info.lastSync).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}. No pending changes.`
            : "No pending changes."
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
          <button type="button" onClick={() => exportRecords(true)}>
            Download local copy
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
                  available through Export JSON with recovery copies. The cloud
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
    </section>
  );
}

export function supportsTorch(track?: MediaStreamTrack): boolean {
  try {
    return (
      !!track &&
      (track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean })
        .torch === true
    );
  } catch {
    return false;
  }
}
export async function setTorch(track: MediaStreamTrack, on: boolean) {
  await track.applyConstraints({
    advanced: [{ torch: on } as MediaTrackConstraintSet],
  });
}
export async function releaseCamera(stream: MediaStream | null) {
  await Promise.all(
    (stream?.getTracks() || []).map(async (track) => {
      try {
        if (supportsTorch(track)) await setTorch(track, false);
      } catch {
      } finally {
        track.stop();
      }
    }),
  );
}

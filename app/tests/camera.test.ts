import { it, expect, vi } from "vitest";
import { supportsTorch, setTorch, releaseCamera } from "../lib/until/camera";
import { interpretText } from "../lib/until/recognition";
import { lookupProduct, OpenFactsProvider } from "../lib/until/lookup";
it("only advertises supported torch and releases tracks even if torch-off fails", async () => {
  const stop = vi.fn(),
    applyConstraints = vi.fn().mockResolvedValue(undefined);
  const track = {
    getCapabilities: () => ({ torch: true }),
    applyConstraints,
    stop,
  } as unknown as MediaStreamTrack;
  expect(supportsTorch(track)).toBe(true);
  expect(
    supportsTorch({ getCapabilities: () => ({}) } as MediaStreamTrack),
  ).toBe(false);
  await setTorch(track, true);
  expect(applyConstraints).toHaveBeenCalledWith({
    advanced: [{ torch: true }],
  });
  applyConstraints.mockRejectedValueOnce(Error("closed"));
  await releaseCamera({ getTracks: () => [track] } as MediaStream);
  expect(stop).toHaveBeenCalledOnce();
  expect(applyConstraints).toHaveBeenLastCalledWith({
    advanced: [{ torch: false }],
  });
});
it("keeps short-year date ambiguity and rejects impossible numeric dates", () => {
  expect(interpretText("noise 20-06-27 B1 NLD0311", 23).dates).toEqual([
    "2027-06-20",
    "2020-06-27",
  ]);
  expect(interpretText("03/04/27").dates).toEqual([
    "2027-04-03",
    "2027-03-04",
    "2003-04-27",
  ]);
  expect(interpretText("99-99-99").dates).toEqual([]);
});
it("keeps exact leading-zero codes and distinguishes provider failures from missing results", async () => {
  vi.stubGlobal("navigator", { onLine: true });
  const provider = { lookup: vi.fn().mockResolvedValue(null) };
  expect(await lookupProduct("0123456789012", [], provider)).toBeNull();
  expect(provider.lookup).toHaveBeenCalledWith("0123456789012");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
  await expect(new OpenFactsProvider().lookup("0123456789012")).rejects.toThrow(
    "unavailable",
  );
  vi.unstubAllGlobals();
});

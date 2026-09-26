import { describe, it, expect } from "vitest";
import { cloudPhoto } from "../lib/until/image-metadata";
describe("cloud photo privacy", () => {
  it("removes JPEG EXIF and comments without modifying scan bytes or local original", async () => {
    const input = new Uint8Array([
      255, 216, 255, 225, 0, 6, 71, 80, 83, 0, 255, 254, 0, 4, 65, 66, 255, 218,
      0, 2, 17, 18, 255, 217,
    ]);
    const original = new Blob([input], { type: "image/jpeg" });
    const output = await cloudPhoto(original);
    expect([...new Uint8Array(await output.arrayBuffer())]).toEqual([
      255, 216, 255, 218, 0, 2, 17, 18, 255, 217,
    ]);
    expect([...new Uint8Array(await original.arrayBuffer())]).toEqual([
      ...input,
    ]);
  });
  it("removes PNG location/text chunks while retaining image chunks", async () => {
    const chunk = (type: string, data: number[]) => {
      const b = new Uint8Array(12 + data.length);
      new DataView(b.buffer).setUint32(0, data.length);
      b.set(new TextEncoder().encode(type), 4);
      b.set(data, 8);
      return b;
    };
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      pixels = chunk("IDAT", [1, 2, 3]),
      end = chunk("IEND", []);
    const output = await cloudPhoto(
      new Blob(
        [
          signature,
          chunk("eXIf", [71, 80, 83]),
          chunk("tEXt", [65]),
          pixels,
          end,
        ],
        { type: "image/png" },
      ),
    );
    expect([...new Uint8Array(await output.arrayBuffer())]).toEqual([
      ...signature,
      ...pixels,
      ...end,
    ]);
  });
  it("rejects a malformed metadata length", async () => {
    await expect(
      cloudPhoto(
        new Blob([new Uint8Array([255, 216, 255, 225, 255, 255])], {
          type: "image/jpeg",
        }),
      ),
    ).rejects.toThrow("Invalid JPEG");
  });
});

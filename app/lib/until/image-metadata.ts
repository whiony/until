// Strip optional metadata segments without decoding/re-encoding image pixels.
// Packaging originals remain untouched in IndexedDB; cloud copies omit location metadata.
export async function cloudPhoto(blob: Blob): Promise<Blob> {
  const b = new Uint8Array(await blob.arrayBuffer());
  const parts: Uint8Array[] = [];
  if (blob.type === "image/jpeg") {
    parts.push(b.slice(0, 2));
    let p = 2;
    while (p < b.length) {
      if (b[p] !== 255) throw Error("Invalid JPEG");
      const marker = b[p + 1];
      if (marker === 218 || marker === 217) {
        parts.push(b.slice(p));
        break;
      }
      if (p + 4 > b.length) throw Error("Invalid JPEG");
      const length = (b[p + 2] << 8) + b[p + 3];
      if (length < 2 || p + 2 + length > b.length) throw Error("Invalid JPEG");
      if (![225, 237, 254].includes(marker))
        parts.push(b.slice(p, p + 2 + length));
      p += 2 + length;
    }
  } else if (blob.type === "image/png") {
    parts.push(b.slice(0, 8));
    let p = 8;
    while (p + 12 <= b.length) {
      const length = new DataView(b.buffer).getUint32(p);
      const end = p + 12 + length;
      if (end > b.length) throw Error("Invalid PNG");
      const type = new TextDecoder().decode(b.slice(p + 4, p + 8));
      if (!["eXIf", "tEXt", "zTXt", "iTXt"].includes(type))
        parts.push(b.slice(p, end));
      p = end;
    }
  } else if (blob.type === "image/webp") {
    const chunks: Uint8Array[] = [];
    let p = 12;
    while (p + 8 <= b.length) {
      const type = new TextDecoder().decode(b.slice(p, p + 4));
      const length = new DataView(b.buffer).getUint32(p + 4, true);
      const end = p + 8 + length + (length % 2);
      if (end > b.length) throw Error("Invalid WebP");
      if (!["EXIF", "XMP "].includes(type)) {
        const chunk = b.slice(p, end);
        if (type === "VP8X") chunk[8] &= ~12;
        chunks.push(chunk);
      }
      p = end;
    }
    const header = b.slice(0, 12);
    new DataView(header.buffer).setUint32(
      4,
      4 + chunks.reduce((n, c) => n + c.length, 0),
      true,
    );
    parts.push(header, ...chunks);
  } else throw Error("Unsupported image");
  return new Blob(parts as BlobPart[], { type: blob.type });
}

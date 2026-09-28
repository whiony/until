import { photoIds } from "./merge";
import type { Records } from "./domain";

export type PortableData = {
  format: "until-portable-v1";
  exportedAt: string;
  records: Records;
  recovery: Records[];
};
type PhotoFile = { id: string; blob: Blob };
const encoder = new TextEncoder();
const uuid = /^[a-f0-9]{8}-[a-f0-9-]{27}$/;

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function numberAt(view: DataView, offset: number, value: number, size: 2 | 4) {
  if (size === 2) view.setUint16(offset, value, true);
  else view.setUint32(offset, value, true);
}
async function digest(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function extension(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  throw Error("An image has an unsupported format.");
}

// Store-only ZIP is broadly readable and avoids a new compression dependency.
export async function createPortableArchive(data: PortableData, photos: PhotoFile[]) {
  const expected = new Set([data.records, ...data.recovery].flatMap(photoIds));
  const byId = new Map(photos.map((photo) => [photo.id, photo.blob]));
  if ([...expected].some((id) => !uuid.test(id) || !byId.has(id)))
    throw Error("A referenced photo is missing. The download was not created.");
  const entries: { name: string; bytes: Uint8Array; type?: string }[] = [];
  const recordsBytes = encoder.encode(JSON.stringify(data, null, 2));
  entries.push({
    name: "records.json",
    bytes: recordsBytes,
  });
  const files: { id: string; path: string; size: number; sha256: string; type: string }[] = [];
  for (const id of [...expected].sort()) {
    const blob = byId.get(id)!;
    const path = `photos/${id}.${extension(blob.type)}`;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    files.push({ id, path, size: bytes.length, sha256: await digest(bytes), type: blob.type });
    entries.push({ name: path, bytes, type: blob.type });
  }
  entries.push({
    name: "manifest.json",
    bytes: encoder.encode(JSON.stringify({ format: data.format, recordsSha256: await digest(recordsBytes), files }, null, 2)),
  });
  const parts: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.bytes.length;
    if (size > 0xffffffff || offset + size > 0xffffffff)
      throw Error("The archive is too large for ZIP. Export fewer photos at a time.");
    const crc = crc32(entry.bytes);
    const header = new Uint8Array(30);
    const local = new DataView(header.buffer);
    numberAt(local, 0, 0x04034b50, 4);
    numberAt(local, 4, 20, 2);
    numberAt(local, 14, crc, 4);
    numberAt(local, 18, size, 4);
    numberAt(local, 22, size, 4);
    numberAt(local, 26, name.length, 2);
    parts.push(header, name, new Uint8Array(entry.bytes));
    const central = new Uint8Array(46);
    const view = new DataView(central.buffer);
    numberAt(view, 0, 0x02014b50, 4);
    numberAt(view, 4, 20, 2);
    numberAt(view, 6, 20, 2);
    numberAt(view, 16, crc, 4);
    numberAt(view, 20, size, 4);
    numberAt(view, 24, size, 4);
    numberAt(view, 28, name.length, 2);
    numberAt(view, 42, offset, 4);
    directory.push(central, name);
    offset += header.length + name.length + size;
  }
  const centralSize = directory.reduce((n, part) => n + (part as Uint8Array).length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  numberAt(view, 0, 0x06054b50, 4);
  numberAt(view, 8, entries.length, 2);
  numberAt(view, 10, entries.length, 2);
  numberAt(view, 12, centralSize, 4);
  numberAt(view, 16, offset, 4);
  return new Blob([...parts, ...directory, end], { type: "application/zip" });
}

export async function verifyPortableArchive(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameSize = view.getUint16(offset + 26, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameSize));
    const start = offset + 30 + nameSize;
    const body = bytes.slice(start, start + size);
    if (body.length !== size || crc32(body) !== view.getUint32(offset + 14, true))
      throw Error("Archive entry is damaged.");
    if (entries.has(name) || name.includes("..") || name.startsWith("/"))
      throw Error("Archive contains an unsafe entry.");
    entries.set(name, body);
    offset = start + size;
  }
  const recordsBytes = entries.get("records.json");
  const manifestBytes = entries.get("manifest.json");
  if (!recordsBytes || !manifestBytes) throw Error("Archive is incomplete.");
  const data = JSON.parse(new TextDecoder().decode(recordsBytes)) as PortableData;
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    format: string;
    recordsSha256: string;
    files: { id: string; path: string; size: number; sha256: string; type: string }[];
  };
  if (data.format !== "until-portable-v1" || manifest.format !== data.format)
    throw Error("Archive format is unsupported.");
  if ((await digest(recordsBytes)) !== manifest.recordsSha256)
    throw Error("Archive records are damaged.");
  for (const record of [data.records, ...data.recovery]) {
    const products = new Set(record.products.map((product) => product.id));
    if (record.items.some((item) => !products.has(item.productId)))
      throw Error("Archive item and product associations are incomplete.");
  }
  const expected = new Set([data.records, ...data.recovery].flatMap(photoIds));
  if (manifest.files.length !== expected.size) throw Error("Archive photo list is incomplete.");
  if (entries.size !== manifest.files.length + 2)
    throw Error("Archive contains unexpected files.");
  for (const file of manifest.files) {
    const photo = entries.get(file.path);
    if (!expected.delete(file.id) || !photo || photo.length !== file.size ||
        (await digest(photo)) !== file.sha256)
      throw Error("Archive photo is missing or damaged.");
  }
  if (expected.size) throw Error("Archive photo associations are incomplete.");
  return { data, entries };
}

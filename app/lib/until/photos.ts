export async function preparePhoto(
  file: File,
  original = false,
): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "Choose a JPEG, PNG, or WebP photo. Convert HEIC to JPEG first.",
    );
  if (file.size > 12 * 1024 * 1024)
    throw Error("Choose a photo smaller than 12 MB.");
  if (original) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(Error("Photo could not be processed.")),
        "image/jpeg",
        0.82,
      ),
    );
  } finally {
    bitmap.close();
  }
}

export async function cropSquareImage(file: File, zoom = 1): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const base = Math.min(bitmap.width, bitmap.height);
  const cropSize = Math.max(1, base / Math.max(1, zoom));
  const sx = Math.max(0, (bitmap.width - cropSize) / 2);
  const sy = Math.max(0, (bitmap.height - cropSize) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image cropping is not supported in this browser.");
  ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, 512, 512);
  bitmap.close();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not crop image.")), type, 0.9);
  });
  const extension = type === "image/png" ? "png" : "jpg";
  return new File([blob], `avatar-${Date.now()}.${extension}`, { type });
}

function imageBitmapFromBlob(blob) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

export async function computeAverageHashFromBlob(blob, size = 16) {
  const bitmap = await imageBitmapFromBlob(blob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.drawImage(bitmap, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const values = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    values.push(luma);
  }

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.map((v) => (v >= avg ? "1" : "0")).join("");
}

export async function computeCenteredAverageHashFromBlob(
  blob,
  size = 16,
  targetRatio = 2 / 3
) {
  const bitmap = await imageBitmapFromBlob(blob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const sourceRatio = bitmap.width / bitmap.height;
  let sx = 0;
  let sy = 0;
  let sWidth = bitmap.width;
  let sHeight = bitmap.height;

  // Center-crop the photo to a card-like rectangle before hashing.
  if (sourceRatio > targetRatio) {
    sWidth = bitmap.height * targetRatio;
    sx = (bitmap.width - sWidth) / 2;
  } else {
    sHeight = bitmap.width / targetRatio;
    sy = (bitmap.height - sHeight) / 2;
  }

  ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const values = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    values.push(luma);
  }

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.map((v) => (v >= avg ? "1" : "0")).join("");
}

export async function computeAverageHashFromUrl(url, size = 16) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not fetch image");
  const blob = await res.blob();
  return computeAverageHashFromBlob(blob, size);
}

export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) d += 1;
  }
  return d;
}

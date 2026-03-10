function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function cropImageFileToBlob(file, cropState, outType = "image/jpeg") {
  const previewUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageFromUrl(previewUrl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const outW = 900;
    const outH = 1350;
    canvas.width = outW;
    canvas.height = outH;

    const zoom = Number(cropState?.zoom || 1);
    const offsetX = Number(cropState?.offsetX || 0);
    const offsetY = Number(cropState?.offsetY || 0);

    const baseScale = Math.max(outW / img.width, outH / img.height);
    const scale = baseScale * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;

    const dx = (outW - drawW) / 2 + offsetX;
    const dy = (outH - drawH) / 2 + offsetY;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Could not create cropped image"));
      }, outType, 0.92);
    });

    return blob;
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

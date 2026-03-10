export const DEFAULT_CARD_THUMB_SIZE = "300x400";

export function buildResizedPath(path, size = DEFAULT_CARD_THUMB_SIZE) {
  const p = String(path || "").trim();
  if (!p) return "";
  const dot = p.lastIndexOf(".");
  if (dot < 0) return `${p}_${size}`;
  return `${p.slice(0, dot)}_${size}${p.slice(dot)}`;
}

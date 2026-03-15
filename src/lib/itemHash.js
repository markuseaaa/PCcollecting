export function buildItemHashPayload(item, idOverride = "") {
  const source = item || {};
  const id = String(idOverride || source.id || "").trim();
  return {
    id,
    imgHash: source.imgHash || "",
    group: source.group || "",
    createdAt: source.createdAt || 0,
  };
}

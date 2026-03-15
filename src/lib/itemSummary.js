export function buildItemSummaryPayload(item, idOverride = "") {
  const source = item || {};
  const id = String(idOverride || source.id || "").trim();
  return {
    id,
    title: source.title || "",
    group: source.group || "",
    member: source.member || "",
    album: source.album || "",
    rarity: source.rarity || "",
    version: source.version || "",
    sourceName: source.sourceName || "",
    thumbPath: source.thumbPath || "",
    imagePath: source.imagePath || "",
    createdAt: source.createdAt || 0,
  };
}

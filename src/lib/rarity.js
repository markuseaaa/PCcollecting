export function formatRarityLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  if (raw === "pob") return "POB";
  if (raw === "lucky-draw") return "Lucky Draw";
  if (raw === "album") return "Album";
  if (raw === "event") return "Event";
  if (raw === "broadcast") return "Broadcast";

  return raw
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}


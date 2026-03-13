export function formatRarityLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  if (raw === "pob") return "POB";
  if (raw === "lucky-draw") return "Lucky Draw";
  if (raw === "concert") return "Concert/Tour";
  if (raw === "pop-up" || raw === "event") return "Pop-Up";
  if (raw === "seasons-greetings") return "Seasons Greetings";
  if (raw === "fanclub") return "Fanclub";
  if (raw === "collaboration") return "Collaboration";
  if (raw === "merchandise") return "Merchandise";
  if (raw === "others") return "Others";
  if (raw === "album") return "Album";
  if (raw === "broadcast") return "Broadcast";

  return raw
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

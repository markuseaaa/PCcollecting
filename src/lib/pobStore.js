const STORE_CANONICAL_MAP = {
  makestar: "MAKESTAR",
  applemusic: "applemusic",
  withmuu: "withmuu",
  yes24: "YES24",
  hello82: "Hello82",
  minirecords: "minirecords",
};

export const DEFAULT_POB_STORES = [
  "MAKESTAR",
  "applemusic",
  "withmuu",
  "YES24",
  "Hello82",
  "minirecords",
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function formatPobStoreName(value) {
  const raw = normalize(value);
  if (!raw) return "";
  return STORE_CANONICAL_MAP[raw] || String(value || "").trim();
}


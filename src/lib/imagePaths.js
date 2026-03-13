export const DEFAULT_CARD_THUMB_SIZE = "200x300";

function normalizePathSegment(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function normalizeImageExtension(ext, fallback = "jpg") {
  const clean = String(ext || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
  return clean || fallback;
}

export function buildPhotocardImagePath(uid, itemId, ext) {
  const safeUid = normalizePathSegment(uid);
  const safeId = normalizePathSegment(itemId);
  const safeExt = normalizeImageExtension(ext, "jpg");
  return `uploads/${safeUid}/photocards/${safeId}.${safeExt}`;
}

export function buildCollectionCoverImagePath(uid, collectionId, ext) {
  const safeUid = normalizePathSegment(uid);
  const safeCollectionId = normalizePathSegment(collectionId);
  const safeExt = normalizeImageExtension(ext, "jpg");
  return `uploads/${safeUid}/collections/${safeCollectionId}/cover.${safeExt}`;
}

export function buildProfileAvatarImagePath(uid, ext) {
  const safeUid = normalizePathSegment(uid);
  const safeExt = normalizeImageExtension(ext, "jpg");
  return `uploads/${safeUid}/profile/avatar.${safeExt}`;
}

export function buildResizedPath(path, size = DEFAULT_CARD_THUMB_SIZE) {
  const p = String(path || "").trim();
  if (!p) return "";

  // New storage layout for photocards:
  // originals: uploads/{uid}/image.ext
  // thumbs:    thumbs/{uid}/image_{size}.webp
  if (p.startsWith("uploads/")) {
    const relative = p.slice("uploads/".length);
    const dot = relative.lastIndexOf(".");
    const base = dot < 0 ? relative : relative.slice(0, dot);
    return `thumbs/${base}_${size}.webp`;
  }

  // Legacy fallback: keep same folder and extension.
  const dot = p.lastIndexOf(".");
  if (dot < 0) return `${p}_${size}`;
  return `${p.slice(0, dot)}_${size}${p.slice(dot)}`;
}

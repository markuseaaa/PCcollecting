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

  // Canonical storage layout:
  // originals: uploads/{uid}/...
  // thumbs:    thumbs/{uid}/..._{size}.webp
  const relative = p.startsWith("uploads/") ? p.slice("uploads/".length) : p;
  const dot = relative.lastIndexOf(".");
  const base = dot < 0 ? relative : relative.slice(0, dot);
  return `thumbs/${base}_${size}.webp`;
}

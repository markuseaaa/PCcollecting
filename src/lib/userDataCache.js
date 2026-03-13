const DEFAULT_MAX_AGE_MS = 60_000;

const collectionItemsCache = new Map();
const collectionsCache = new Map();

function isFresh(entry, maxAgeMs) {
  if (!entry) return false;
  return Date.now() - Number(entry.updatedAt || 0) <= maxAgeMs;
}

export function getCachedCollectionItems(uid, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const key = String(uid || "");
  if (!key) return null;
  const entry = collectionItemsCache.get(key);
  if (!isFresh(entry, maxAgeMs)) return null;
  return Array.isArray(entry.items) ? entry.items : null;
}

export function setCachedCollectionItems(uid, items) {
  const key = String(uid || "");
  if (!key) return;
  collectionItemsCache.set(key, {
    updatedAt: Date.now(),
    items: Array.isArray(items) ? items : [],
  });
}

export function appendCachedCollectionItem(uid, item) {
  const key = String(uid || "");
  if (!key || !item) return;
  const current = collectionItemsCache.get(key);
  const prev = Array.isArray(current?.items) ? current.items : [];
  const itemId = String(item.id || "");
  const without = itemId ? prev.filter((entry) => String(entry.id || "") !== itemId) : prev;
  setCachedCollectionItems(key, [item, ...without]);
}

export function removeCachedCollectionItem(uid, itemId) {
  const key = String(uid || "");
  if (!key || !itemId) return;
  const current = collectionItemsCache.get(key);
  if (!Array.isArray(current?.items)) return;
  const next = current.items.filter((entry) => String(entry.id || "") !== String(itemId));
  setCachedCollectionItems(key, next);
}

export function getCachedCollections(uid, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const key = String(uid || "");
  if (!key) return null;
  const entry = collectionsCache.get(key);
  if (!isFresh(entry, maxAgeMs)) return null;
  return Array.isArray(entry.collections) ? entry.collections : null;
}

export function setCachedCollections(uid, collections) {
  const key = String(uid || "");
  if (!key) return;
  collectionsCache.set(key, {
    updatedAt: Date.now(),
    collections: Array.isArray(collections) ? collections : [],
  });
}

export function upsertCachedCollection(uid, collection) {
  const key = String(uid || "");
  const nextCollection = collection || null;
  if (!key || !nextCollection?.id) return;
  const current = collectionsCache.get(key);
  const prev = Array.isArray(current?.collections) ? current.collections : [];
  const next = [
    nextCollection,
    ...prev.filter((entry) => String(entry.id || "") !== String(nextCollection.id)),
  ];
  setCachedCollections(key, next);
}

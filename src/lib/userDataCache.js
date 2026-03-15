import { get, ref } from "firebase/database";
import { db } from "../../firebase-config";

const DEFAULT_MAX_AGE_MS = 60_000;
const SUMMARY_DEFAULT_MAX_AGE_MS = 10 * 60_000;

const collectionItemsCache = new Map();
const collectionsCache = new Map();
const ownedRefsCache = new Map();
const itemSummariesCache = new Map();
const collectionsInFlight = new Map();
const ownedRefsInFlight = new Map();
const itemSummaryInFlight = new Map();

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

export function getCachedOwnedRefs(uid, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const key = String(uid || "");
  if (!key) return null;
  const entry = ownedRefsCache.get(key);
  if (!isFresh(entry, maxAgeMs)) return null;
  return entry.value || {};
}

export function setCachedOwnedRefs(uid, value) {
  const key = String(uid || "");
  if (!key) return;
  ownedRefsCache.set(key, {
    updatedAt: Date.now(),
    value: value && typeof value === "object" ? value : {},
  });
}

export async function fetchUserCollections(uid, options = {}) {
  const key = String(uid || "");
  if (!key) return [];
  const maxAgeMs = Number(options?.maxAgeMs || DEFAULT_MAX_AGE_MS);
  const force = Boolean(options?.force);
  if (!force) {
    const cached = getCachedCollections(key, maxAgeMs);
    if (cached) return cached;
  }

  if (collectionsInFlight.has(key)) {
    return collectionsInFlight.get(key);
  }

  const promise = get(ref(db, `users/${key}/collections`))
    .then((snap) => {
      const val = snap.exists() ? snap.val() : {};
      const list = Object.keys(val || {})
        .filter((k) => !k.startsWith("_"))
        .map((k) => ({ id: k, ...val[k] }))
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
      setCachedCollections(key, list);
      return list;
    })
    .finally(() => {
      collectionsInFlight.delete(key);
    });

  collectionsInFlight.set(key, promise);
  return promise;
}

export async function fetchUserOwnedRefs(uid, options = {}) {
  const key = String(uid || "");
  if (!key) return {};
  const maxAgeMs = Number(options?.maxAgeMs || DEFAULT_MAX_AGE_MS);
  const force = Boolean(options?.force);
  if (!force) {
    const cached = getCachedOwnedRefs(key, maxAgeMs);
    if (cached) return cached;
  }

  if (ownedRefsInFlight.has(key)) {
    return ownedRefsInFlight.get(key);
  }

  const promise = get(ref(db, `users/${key}/ownedItems`))
    .then((snap) => {
      const val = snap.exists() ? snap.val() : {};
      setCachedOwnedRefs(key, val);
      return val;
    })
    .finally(() => {
      ownedRefsInFlight.delete(key);
    });

  ownedRefsInFlight.set(key, promise);
  return promise;
}

export function getCachedItemSummary(itemId, maxAgeMs = SUMMARY_DEFAULT_MAX_AGE_MS) {
  const key = String(itemId || "");
  if (!key) return null;
  const entry = itemSummariesCache.get(key);
  if (!isFresh(entry, maxAgeMs)) return null;
  return entry.value || null;
}

export function setCachedItemSummary(itemId, summary) {
  const key = String(itemId || "");
  if (!key || !summary) return;
  itemSummariesCache.set(key, {
    updatedAt: Date.now(),
    value: summary,
  });
}

export function getCachedItemSummaries(itemIds, maxAgeMs = SUMMARY_DEFAULT_MAX_AGE_MS) {
  const ids = Array.isArray(itemIds) ? itemIds : [];
  const byId = new Map();
  const missingIds = [];

  for (const rawId of ids) {
    const id = String(rawId || "").trim();
    if (!id) continue;
    const hit = getCachedItemSummary(id, maxAgeMs);
    if (hit) byId.set(id, hit);
    else missingIds.push(id);
  }

  return { byId, missingIds };
}

async function fetchSingleItemSummary(itemId) {
  const id = String(itemId || "").trim();
  if (!id) return null;

  const cached = getCachedItemSummary(id);
  if (cached) return cached;

  if (itemSummaryInFlight.has(id)) {
    return itemSummaryInFlight.get(id);
  }

  const promise = get(ref(db, `itemSummaries/${id}`))
    .then((snap) => {
      if (!snap?.exists()) return null;
      const value = snap.val() || {};
      setCachedItemSummary(id, value);
      return value;
    })
    .finally(() => {
      itemSummaryInFlight.delete(id);
    });

  itemSummaryInFlight.set(id, promise);
  return promise;
}

export async function fetchItemSummariesByIds(itemIds, maxAgeMs = SUMMARY_DEFAULT_MAX_AGE_MS) {
  const { byId, missingIds } = getCachedItemSummaries(itemIds, maxAgeMs);
  if (!missingIds.length) return byId;

  const uniqueMissing = Array.from(new Set(missingIds.map((id) => String(id || "").trim()).filter(Boolean)));
  const fetched = await Promise.all(uniqueMissing.map((id) => fetchSingleItemSummary(id)));
  uniqueMissing.forEach((id, index) => {
    const value = fetched[index];
    if (!value) return;
    byId.set(id, value);
  });
  return byId;
}

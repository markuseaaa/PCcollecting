function clean(value) {
  return String(value || "").trim();
}

export function resolveSourceItemId(itemLike, fallbackId = "") {
  const source = clean(itemLike?.sourceItemId);
  if (source) return source;
  return clean(itemLike?.id || fallbackId);
}

export function buildOwnershipAssignmentUpdates({
  uid,
  itemId,
  nextCollectionId = "",
  previousCollectionId = "",
  createdAt,
  updatedAt,
}) {
  const userId = clean(uid);
  const sourceItemId = clean(itemId);
  const next = clean(nextCollectionId);
  const prev = clean(previousCollectionId);
  if (!userId || !sourceItemId) return {};

  const updates = {};
  const base = `users/${userId}/ownedItems/${sourceItemId}`;
  updates[`${base}/itemId`] = sourceItemId;
  updates[`${base}/collectionId`] = next;
  if (createdAt !== undefined) updates[`${base}/createdAt`] = createdAt;
  if (updatedAt !== undefined) updates[`${base}/updatedAt`] = updatedAt;

  if (prev && prev !== next) {
    updates[`users/${userId}/collections/${prev}/itemIds/${sourceItemId}`] = null;
  }

  if (next) {
    updates[`users/${userId}/collections/${next}/itemIds/${sourceItemId}`] = true;
  } else if (prev) {
    updates[`users/${userId}/collections/${prev}/itemIds/${sourceItemId}`] = null;
  }

  return updates;
}

export function buildOwnershipRemovalUpdates({
  uid,
  itemId,
  collectionId = "",
}) {
  const userId = clean(uid);
  const sourceItemId = clean(itemId);
  const collection = clean(collectionId);
  if (!userId || !sourceItemId) return {};

  const updates = {
    [`users/${userId}/ownedItems/${sourceItemId}`]: null,
  };
  if (collection) {
    updates[`users/${userId}/collections/${collection}/itemIds/${sourceItemId}`] = null;
  }
  return updates;
}

// Bookkeeping for already-synced item IDs (history/bookmarks/downloads),
// stored as arrays in browser.storage.local.

// Cap each synced-ID set so storage.local can't grow toward its quota
// indefinitely; oldest entries are dropped first. Re-uploading an old,
// trimmed entry is harmless compared to unbounded growth.
export const MAX_SYNCED_ITEMS = 20000;

export async function getSyncedItems(key: string): Promise<Set<string>> {
  const result = await browser.storage.local.get(key);

  return new Set((result[key] as string[] | undefined) ?? []);
}

export async function addSyncedItem(
  key: string,
  itemId: string,
): Promise<void> {
  await addSyncedItems(key, [itemId]);
}

// Batch variant: one storage read/write per call instead of per item, which
// matters when marking hundreds of history entries after a bulk upload
export async function addSyncedItems(
  key: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) {
    return;
  }

  const syncedItems = await getSyncedItems(key);
  for (const itemId of itemIds) {
    syncedItems.add(itemId);
  }

  // Sets iterate in insertion order, so slicing from the end keeps the
  // most recently synced IDs
  let items = Array.from(syncedItems);
  if (items.length > MAX_SYNCED_ITEMS) {
    items = items.slice(-MAX_SYNCED_ITEMS);
  }

  await browser.storage.local.set({ [key]: items });
}

export async function isItemSynced(
  key: string,
  itemId: string,
): Promise<boolean> {
  const syncedItems = await getSyncedItems(key);

  return syncedItems.has(itemId);
}

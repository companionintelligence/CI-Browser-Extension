import {
  getSyncedItems,
  addSyncedItem,
  addSyncedItems,
  isItemSynced,
  MAX_SYNCED_ITEMS,
} from "./syncedItems";

// Map-backed in-memory storage so the helpers run against real get/set
// semantics instead of bare jest.fn() stubs
const memory = new Map<string, unknown>();
let storageSetMock: jest.Mock;

beforeEach(() => {
  memory.clear();
  (global as { browser?: unknown }).browser = {
    storage: {
      local: {
        get: jest.fn(async (key: string) => {
          return memory.has(key) ? { [key]: memory.get(key) } : {};
        }),
        set: (storageSetMock = jest.fn(
          async (items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) {
              memory.set(k, v);
            }
          },
        )),
      },
    },
  };
});

describe("syncedItems", () => {
  it("starts empty", async () => {
    expect((await getSyncedItems("k")).size).toBe(0);
    expect(await isItemSynced("k", "a")).toBe(false);
  });

  it("adds and finds single items", async () => {
    await addSyncedItem("k", "a");
    expect(await isItemSynced("k", "a")).toBe(true);
    expect(await isItemSynced("k", "b")).toBe(false);
  });

  it("adds batches with a single storage write", async () => {
    await addSyncedItems("k", ["a", "b", "c"]);
    const set = await getSyncedItems("k");
    expect(set.size).toBe(3);

    expect(storageSetMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates items", async () => {
    await addSyncedItems("k", ["a", "a", "b"]);
    await addSyncedItem("k", "a");
    expect((await getSyncedItems("k")).size).toBe(2);
  });

  it("does not write when given an empty batch", async () => {
    await addSyncedItems("k", []);
    expect(storageSetMock).not.toHaveBeenCalled();
  });

  it("caps stored items at MAX_SYNCED_ITEMS, dropping oldest first", async () => {
    const ids = Array.from({ length: MAX_SYNCED_ITEMS }, (_, i) => `id-${i}`);
    await addSyncedItems("k", ids);
    await addSyncedItems("k", ["newest-1", "newest-2"]);

    const set = await getSyncedItems("k");
    expect(set.size).toBe(MAX_SYNCED_ITEMS);
    expect(set.has("newest-1")).toBe(true);
    expect(set.has("newest-2")).toBe(true);
    // The two oldest were trimmed to make room
    expect(set.has("id-0")).toBe(false);
    expect(set.has("id-1")).toBe(false);
    expect(set.has("id-2")).toBe(true);
  });
});

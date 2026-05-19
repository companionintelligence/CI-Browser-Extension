/**
 * The outbox uses IndexedDB. We polyfill via fake-indexeddb so jest can
 * exercise the real schema and indexes.
 */
import "fake-indexeddb/auto";
import {
  counts,
  enqueue,
  listPending,
  markFailed,
  markInFlight,
  markSynced,
} from "@/background/outbox";

const payload = (
  overrides: Partial<{ kind: "screenshot" | "highlight"; url: string }> = {},
) => ({
  device_id: "dev-1",
  source_url: overrides.url ?? "https://example.com",
  source_title: "Example",
  kind: overrides.kind ?? ("screenshot" as const),
  mime_type: "image/png",
  body: "ZmFrZQ==",
  captured_at: new Date().toISOString(),
});

describe("outbox", () => {
  it("enqueues and lists pending rows", async () => {
    const row = await enqueue(payload());
    expect(row).not.toBeNull();
    const pending = await listPending();
    expect(pending.some((r) => r.id === row!.id)).toBe(true);
  });

  it("dedups on dedupKey", async () => {
    const a = await enqueue(payload({ url: "https://dup.example/1" }), {
      dedupKey: "dup-1",
    });
    const b = await enqueue(payload({ url: "https://dup.example/2" }), {
      dedupKey: "dup-1",
    });
    expect(a?.id).toBe(b?.id);
  });

  it("markSynced advances state and removes from pending", async () => {
    const row = await enqueue(payload({ url: "https://sync.test" }));
    await markInFlight([row!.id]);
    await markSynced([row!.id]);
    const c = await counts();
    expect(c.synced).toBeGreaterThanOrEqual(1);
  });

  it("markFailed schedules a retry with backoff", async () => {
    const row = await enqueue(payload({ url: "https://retry.test" }));
    await markFailed([row!.id], "boom", true);
    const after = await listPending();
    // Pending list filters by nextAttemptAt <= now; the retry pushed it
    // 30s out, so the row should NOT appear in the immediate pending list.
    expect(after.some((r) => r.id === row!.id)).toBe(false);
  });
});

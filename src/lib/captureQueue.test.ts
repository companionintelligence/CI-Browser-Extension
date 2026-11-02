import {
  CAPTURE_QUEUE_KEY,
  MAX_CAPTURE_ATTEMPTS,
  QUEUE_LIMITS,
  boundQueue,
  drainCaptureQueue,
  enqueueCaptures,
  getQueuedCaptures,
} from "./captureQueue";
import type { BrowserActivity } from "@/services/browserActivity";

// Map-backed in-memory storage so the queue runs against real get/set
// semantics, matching the approach in syncedItems.test.ts
const memory = new Map<string, unknown>();

beforeEach(() => {
  memory.clear();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  (global as { browser?: unknown }).browser = {
    storage: {
      local: {
        get: jest.fn(async (key: string) =>
          memory.has(key) ? { [key]: memory.get(key) } : {},
        ),
        set: jest.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) {
            memory.set(k, v);
          }
        }),
      },
    },
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

function activity(url: string): BrowserActivity {
  return {
    time: "2026-07-29T00:00:00.000Z",
    device_id: "11111111-2222-4333-8444-555555555555",
    url,
    action_type: "visit",
  };
}

describe("captureQueue", () => {
  it("starts empty and ignores an empty enqueue", async () => {
    expect(await getQueuedCaptures()).toEqual([]);

    await enqueueCaptures([]);
    expect(memory.has(CAPTURE_QUEUE_KEY)).toBe(false);
  });

  it("queues captures with a zero attempt count and a queue time", async () => {
    jest.spyOn(Date, "now").mockReturnValue(7_000);
    await enqueueCaptures([activity("https://a.test")]);

    const queued = await getQueuedCaptures();
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBe(0);
    expect(queued[0].queuedAt).toBe(7_000);
    expect(queued[0].activity.url).toBe("https://a.test");
  });

  it("tolerates a non-array value under the queue key", async () => {
    memory.set(CAPTURE_QUEUE_KEY, "corrupted");

    expect(await getQueuedCaptures()).toEqual([]);
  });

  it("gives an entry queued before queuedAt existed an age from its first read", async () => {
    jest.spyOn(Date, "now").mockReturnValue(5_000);
    memory.set(CAPTURE_QUEUE_KEY, [
      { activity: activity("https://old.test"), attempts: 0 },
    ]);

    const queued = await getQueuedCaptures();
    expect(queued[0].queuedAt).toBe(5_000);
  });

  it("drops the oldest entries past the count cap, with one warning and no URLs", async () => {
    await enqueueCaptures(
      Array.from({ length: QUEUE_LIMITS.maxEntries + 5 }, (_, i) =>
        activity(`https://a.test/${i}`),
      ),
    );

    const queued = await getQueuedCaptures();
    expect(queued).toHaveLength(QUEUE_LIMITS.maxEntries);
    // Newest survive: entry 0..4 are the ones dropped
    expect(queued[0].activity.url).toBe("https://a.test/5");
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("trimmed 5 entries"),
    );
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("https://a.test/"),
    );
  });

  it("drops captures older than the age limit on the next write", async () => {
    const start = 1_700_000_000_000;
    const clock = jest.spyOn(Date, "now").mockReturnValue(start);
    await enqueueCaptures([activity("https://old.test")]);

    clock.mockReturnValue(start + QUEUE_LIMITS.maxAgeMs + 1);
    await enqueueCaptures([activity("https://new.test")]);

    const urls = (await getQueuedCaptures()).map((e) => e.activity.url);
    expect(urls).toEqual(["https://new.test"]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("1 past the age limit"),
    );
  });

  it("drains to the sender and empties on success", async () => {
    await enqueueCaptures([
      activity("https://a.test"),
      activity("https://b.test"),
    ]);

    const sent: BrowserActivity[][] = [];
    const send = jest.fn(async (batch: BrowserActivity[]) => {
      sent.push(batch);
    });
    const result = await drainCaptureQueue(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(sent[0]).toHaveLength(2);
    expect(sent[0].map((a) => a.url)).toEqual([
      "https://a.test",
      "https://b.test",
    ]);
    expect(result).toEqual({ sent: 2, requeued: 0, dropped: 0 });
    expect(await getQueuedCaptures()).toEqual([]);
  });

  it("is a no-op when nothing is queued", async () => {
    const send = jest.fn(async () => {});

    expect(await drainCaptureQueue(send)).toEqual({
      sent: 0,
      requeued: 0,
      dropped: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("counts a server rejection of the record as an attempt", async () => {
    await enqueueCaptures([activity("https://a.test")]);

    const result = await drainCaptureQueue(async () => {
      throw new Error("CI-Server https://ci.test failed: HTTP 422");
    });

    expect(result).toEqual({ sent: 0, requeued: 1, dropped: 0 });
    const queued = await getQueuedCaptures();
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBe(1);
  });

  it("does not count an outage or an expired session against the attempt limit", async () => {
    await enqueueCaptures([activity("https://a.test")]);
    const failures = [
      "CI-Server https://ci.test failed: HTTP 530",
      "TypeError: Failed to fetch",
      "CI-Server https://ci.test failed: HTTP 401",
      "CI-Server https://ci.test failed: HTTP 429",
    ];

    for (let i = 0; i < MAX_CAPTURE_ATTEMPTS + 2; i++) {
      const message = failures[i % failures.length];
      const result = await drainCaptureQueue(async () => {
        throw new Error(message);
      });
      expect(result).toEqual({ sent: 0, requeued: 1, dropped: 0 });
    }

    const queued = await getQueuedCaptures();
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBe(0);
  });

  it("drops an entry once the server has rejected it past the limit", async () => {
    await enqueueCaptures(
      [activity("https://a.test")],
      MAX_CAPTURE_ATTEMPTS - 1,
    );

    const result = await drainCaptureQueue(async () => {
      throw new Error("CI-Server https://ci.test failed: HTTP 422");
    });

    expect(result).toEqual({ sent: 0, requeued: 0, dropped: 1 });
    expect(await getQueuedCaptures()).toEqual([]);
  });

  it("keeps a capture that arrives while a failing drain is in flight", async () => {
    await enqueueCaptures([activity("https://old.test")]);

    const result = await drainCaptureQueue(async () => {
      // A live capture fails and queues itself mid-drain
      await enqueueCaptures([activity("https://new.test")]);
      throw new Error("offline");
    });

    expect(result.requeued).toBe(1);
    const urls = (await getQueuedCaptures()).map((e) => e.activity.url);
    expect(urls).toContain("https://new.test");
    expect(urls).toContain("https://old.test");
  });
});

describe("boundQueue", () => {
  const limits = { maxAgeMs: 10_000, maxEntries: 10, maxBytes: 1_000_000 };

  function entry(url: string, queuedAt: number) {
    return { activity: activity(url), attempts: 0, queuedAt };
  }

  it("drops entries past the age limit before the count cap", () => {
    const entries = [
      entry("https://a.test/1", 1),
      entry("https://a.test/6", 6),
      entry("https://a.test/9", 9),
    ];

    const result = boundQueue(entries, 10, {
      ...limits,
      maxAgeMs: 5,
      maxEntries: 1,
    });

    expect(result.entries.map((e) => e.queuedAt)).toEqual([9]);
    expect(result.droppedByAge).toBe(1);
    expect(result.droppedByCount).toBe(1);
    expect(result.droppedByBytes).toBe(0);
  });

  it("orders by queuedAt, so an older capture requeued after a newer one is trimmed first", () => {
    const entries = [
      entry("https://new.test", 2_000),
      entry("https://old.test", 1_000),
    ];

    const result = boundQueue(entries, 2_000, { ...limits, maxEntries: 1 });

    expect(result.entries.map((e) => e.activity.url)).toEqual([
      "https://new.test",
    ]);
    expect(result.droppedByCount).toBe(1);
  });

  it("keeps the newest entries that fit under the byte cap", () => {
    const entries = [0, 1, 2, 3].map((i) =>
      entry(`https://a.test/${i}`, 1_000 + i),
    );
    const oneEntry = new Blob([JSON.stringify(entries[0])]).size;

    const result = boundQueue(entries, 1_003, {
      ...limits,
      maxBytes: oneEntry * 2 + Math.floor(oneEntry / 2),
    });

    expect(result.entries.map((e) => e.activity.url)).toEqual([
      "https://a.test/2",
      "https://a.test/3",
    ]);
    expect(result.droppedByBytes).toBe(2);
  });
});

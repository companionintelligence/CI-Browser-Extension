import {
  CAPTURE_QUEUE_KEY,
  MAX_CAPTURE_ATTEMPTS,
  MAX_QUEUED_CAPTURES,
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

  it("queues captures with a zero attempt count", async () => {
    await enqueueCaptures([activity("https://a.test")]);

    const queued = await getQueuedCaptures();
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBe(0);
    expect(queued[0].activity.url).toBe("https://a.test");
  });

  it("tolerates a non-array value under the queue key", async () => {
    memory.set(CAPTURE_QUEUE_KEY, "corrupted");

    expect(await getQueuedCaptures()).toEqual([]);
  });

  it("drops the oldest entries past the cap", async () => {
    await enqueueCaptures(
      Array.from({ length: MAX_QUEUED_CAPTURES + 5 }, (_, i) =>
        activity(`https://a.test/${i}`),
      ),
    );

    const queued = await getQueuedCaptures();
    expect(queued).toHaveLength(MAX_QUEUED_CAPTURES);
    // Newest survive: entry 0..4 are the ones dropped
    expect(queued[0].activity.url).toBe("https://a.test/5");
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

  it("re-queues with an incremented attempt count when the send fails", async () => {
    await enqueueCaptures([activity("https://a.test")]);

    const result = await drainCaptureQueue(async () => {
      throw new Error("offline");
    });

    expect(result).toEqual({ sent: 0, requeued: 1, dropped: 0 });
    const queued = await getQueuedCaptures();
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBe(1);
  });

  it("drops an entry once it exhausts its attempts", async () => {
    await enqueueCaptures(
      [activity("https://a.test")],
      MAX_CAPTURE_ATTEMPTS - 1,
    );

    const result = await drainCaptureQueue(async () => {
      throw new Error("still offline");
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

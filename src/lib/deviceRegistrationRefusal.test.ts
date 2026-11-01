/**
 * @jest-environment node
 */
// The token digest needs crypto.subtle, which jsdom does not provide.
import { webcrypto } from "node:crypto";

import {
  clearRegistrationRefusal,
  isRegistrationRefused,
  isRegistrationRefusal,
  recordRegistrationRefusal,
} from "./deviceRegistrationRefusal";

Object.defineProperty(globalThis, "crypto", { value: webcrypto });

const MEMORY = "https://memory.example";

let stored: Record<string, unknown>;

beforeEach(() => {
  stored = {};
  (global as { browser?: unknown }).browser = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: stored[key] }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(stored, items);
        },
        remove: async (key: string) => {
          delete stored[key];
        },
      },
    },
  };
});

describe("isRegistrationRefusal", () => {
  it("matches a device registration the Memory refused with 401 or 403", () => {
    expect(
      isRegistrationRefusal(
        new Error("Failed to create device (HTTP 401): Unauthorized"),
      ),
    ).toBe(true);
    expect(
      isRegistrationRefusal(
        new Error("Failed to create device (HTTP 403): Forbidden"),
      ),
    ).toBe(true);
  });

  it("does not match outages, other server errors or local failures", () => {
    expect(
      isRegistrationRefusal(
        new Error("Failed to create device (HTTP 530): Request failed"),
      ),
    ).toBe(false);
    expect(
      isRegistrationRefusal(
        new Error("Failed to create device (HTTP 500): Server error"),
      ),
    ).toBe(false);
    expect(
      isRegistrationRefusal(
        new Error("Failed to create device: Network Error"),
      ),
    ).toBe(false);
  });
});

describe("registration refusal storage", () => {
  it("is not refused until a refusal is recorded", async () => {
    await expect(isRegistrationRefused(MEMORY, "token-1")).resolves.toBe(false);
  });

  it("stays refused for the same token and server", async () => {
    await recordRegistrationRefusal(MEMORY, "token-1");

    await expect(isRegistrationRefused(MEMORY, "token-1")).resolves.toBe(true);
    await expect(isRegistrationRefused(MEMORY, "token-2")).resolves.toBe(false);
    await expect(
      isRegistrationRefused("https://other.example", "token-1"),
    ).resolves.toBe(false);
  });

  it("does not store the token itself", async () => {
    await recordRegistrationRefusal(MEMORY, "token-1");

    expect(JSON.stringify(stored)).not.toContain("token-1");
  });

  it("is cleared", async () => {
    await recordRegistrationRefusal(MEMORY, "token-1");
    await clearRegistrationRefusal();

    await expect(isRegistrationRefused(MEMORY, "token-1")).resolves.toBe(false);
  });
});

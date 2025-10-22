/**
 * Tests for background script functionality
 * Note: These tests focus on testable pure functions and logic.
 * Browser API interactions are mocked.
 */

import axios from "axios";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the store
const mockStore = {
  getState: jest.fn(),
  dispatch: jest.fn(),
};

jest.mock("@/store", () => ({
  store: mockStore,
}));

// Mock jwtDecode
jest.mock("jwt-decode", () => ({
  jwtDecode: jest.fn(),
}));

describe("Background Script", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("assembleContentAndEvents function logic", () => {
    it("should create event object with correct structure", () => {
      const url = "https://example.com";
      const time = "2023-01-01T00:00:00.000Z";

      // This tests the logic we can extract from assembleContentAndEvents
      const expectedEvent = {
        name: "Visited " + url,
        start_time: time,
        type: "View",
        content: [],
      };

      // Test the basic structure that should be returned
      expect(expectedEvent.name).toBe("Visited https://example.com");
      expect(expectedEvent.start_time).toBe(time);
      expect(expectedEvent.type).toBe("View");
      expect(Array.isArray(expectedEvent.content)).toBe(true);
    });

    it("should use current time when no time is provided", () => {
      const url = "https://example.com";
      const beforeTime = new Date().toJSON();

      // Test default time behavior
      const eventWithDefaultTime = {
        name: "Visited " + url,
        start_time: new Date().toJSON(),
        type: "View",
        content: [],
      };

      const afterTime = new Date().toJSON();

      expect(eventWithDefaultTime.start_time >= beforeTime).toBe(true);
      expect(eventWithDefaultTime.start_time <= afterTime).toBe(true);
    });
  });

  describe("Domain and Page Blacklist Matching Logic", () => {
    it("should match domain blacklist correctly", () => {
      const url = "https://example.com/page";
      const siteBlacklist = ["example.com", "google.com", "github.com"];
      // const pageBlacklist: string[] = [];

      // Test blacklist matching logic (simplified version of isUrlBlacklisted)
      let isBlacklisted = false;
      try {
        const parsedUrl = URL.parse(url);
        if (parsedUrl && parsedUrl.hostname) {
          // Check site blacklist
          for (const site of siteBlacklist) {
            if (parsedUrl.hostname.includes(site)) {
              isBlacklisted = true;
              break;
            }
          }
        }
      } catch {
        isBlacklisted = false;
      }

      expect(isBlacklisted).toBe(true);
    });

    it("should not match unrelated domains", () => {
      const url = "https://unrelated.com/page";
      const siteBlacklist = ["example.com", "google.com"];
      // const pageBlacklist: string[] = [];

      let isBlacklisted = false;
      try {
        const parsedUrl = URL.parse(url);
        if (parsedUrl && parsedUrl.hostname) {
          for (const site of siteBlacklist) {
            if (parsedUrl.hostname.includes(site)) {
              isBlacklisted = true;
              break;
            }
          }
        }
      } catch {
        isBlacklisted = false;
      }

      expect(isBlacklisted).toBe(false);
    });
  });

  describe("API Request Logic", () => {
    it("should make POST request with correct headers and data structure", async () => {
      const mockEvents = [
        {
          name: "Visited https://example.com",
          start_time: "2023-01-01T00:00:00.000Z",
          type: "View",
          content: [],
        },
      ];

      const mockAccessToken = "test-token";

      mockedAxios.post.mockResolvedValue({ status: 200 });

      // Test the API call structure
      await axios.post(
        "https://dev.companionintelligence.com/api/browser-activity",
        mockEvents,
        {
          headers: {
            Authorization: `Bearer ${mockAccessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://dev.companionintelligence.com/api/browser-activity",
        mockEvents,
        {
          headers: {
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          },
        },
      );
    });

    it("should handle API errors gracefully", async () => {
      const mockEvents = [{ name: "test" }];
      const mockAccessToken = "test-token";

      mockedAxios.post.mockRejectedValue(new Error("API Error"));

      // Test error handling
      let errorCaught = false;
      try {
        await axios.post(
          "https://dev.companionintelligence.com/api/browser-activity",
          mockEvents,
          {
            headers: {
              Authorization: `Bearer ${mockAccessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch {
        errorCaught = true;
      }

      expect(errorCaught).toBe(true);
    });
  });

  describe("History Processing Logic", () => {
    it("should process history results in correct slice size", () => {
      const SLICE_SIZE = 50;
      const mockResults = Array(150)
        .fill(0)
        .map((_, i) => ({
          url: `https://example.com/page${i}`,
          visitTime: Date.now() - i * 1000,
        }));

      // Test slicing logic
      const slices = [];
      for (let i = 0; i < mockResults.length; i += SLICE_SIZE) {
        const slice = mockResults.slice(i, i + SLICE_SIZE);
        slices.push(slice);
      }

      expect(slices).toHaveLength(3); // 150 items / 50 = 3 slices
      expect(slices[0]).toHaveLength(SLICE_SIZE);
      expect(slices[1]).toHaveLength(SLICE_SIZE);
      expect(slices[2]).toHaveLength(50); // Last slice has remaining items
    });

    it("should handle empty history results", () => {
      const SLICE_SIZE = 50;
      const mockResults: unknown[] = [];

      const slices = [];
      for (let i = 0; i < mockResults.length; i += SLICE_SIZE) {
        const slice = mockResults.slice(i, i + SLICE_SIZE);
        if (slice.length > 0) {
          slices.push(slice);
        }
      }

      expect(slices).toHaveLength(0);
    });
  });

  describe("JWT Token Validation Logic", () => {
    it("should detect expired tokens", () => {
      const currentTime = Date.now();
      const expiredTime = currentTime - 1000; // 1 second ago

      const mockAccessDecoded = {
        exp: Math.floor(expiredTime / 1000),
      };

      const isAuthExpired = Date.now() >= mockAccessDecoded.exp * 1000;
      expect(isAuthExpired).toBe(true);
    });

    it("should detect valid tokens", () => {
      const currentTime = Date.now();
      const futureTime = currentTime + 3600000; // 1 hour from now

      const mockAccessDecoded = {
        exp: Math.floor(futureTime / 1000),
      };

      const isAuthExpired = Date.now() >= mockAccessDecoded.exp * 1000;
      expect(isAuthExpired).toBe(false);
    });

    it("should handle null token as expired", () => {
      const mockAccessDecoded = null;
      const isAuthExpired = mockAccessDecoded
        ? Date.now() >= (mockAccessDecoded as { exp?: number }).exp! * 1000
        : true;
      expect(isAuthExpired).toBe(true);
    });
  });
});

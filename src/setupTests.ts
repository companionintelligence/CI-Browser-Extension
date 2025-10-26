import "@testing-library/jest-dom";

// Mock browser APIs
(global as { browser?: unknown }).browser = {
  tabs: {
    query: jest.fn(),
  },
  history: {
    search: jest.fn(),
    getVisits: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  runtime: {
    getURL: jest.fn(),
  },
};

// Mock URL for Node.js environment - this needs to be before any other imports
const originalURL = global.URL;

// Create a proper URL constructor mock
(global as { URL?: unknown }).URL = class MockURL {
  href: string;

  hash: string = "";

  constructor(url: string, base?: string) {
    this.href = base ? new originalURL(url, base).href : url;
  }

  toString() {
    return this.href;
  }

  static parse = jest.fn().mockReturnValue({
    hash: "",
    toString: () => "https://example.com/page",
  });
};

// Ensure the original URL is available for actual URL parsing needs
(global as { URL?: { originalURL?: unknown } }).URL!.originalURL = originalURL;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

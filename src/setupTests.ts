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

// jsdom 26+ (bundled with jest-environment-jsdom 30) implements URL and
// URL.parse natively, so the real implementation is used in tests.

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

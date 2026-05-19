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

// Use jsdom's native URL — do not mock. Tests should construct URLs with
// `new URL(...)` and read `.hostname` etc. directly.

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

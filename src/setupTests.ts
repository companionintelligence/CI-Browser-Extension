import "@testing-library/jest-dom";

// fake-indexeddb's clone path uses structuredClone, which Node 18 has but
// jest's jsdom env doesn't expose. Polyfill with the simplest possible shim.
if (typeof globalThis.structuredClone !== "function") {
  (globalThis as { structuredClone?: unknown }).structuredClone = (
    value: unknown,
  ) => {
    if (value === undefined) {
      return value;
    }

    return JSON.parse(JSON.stringify(value));
  };
}

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

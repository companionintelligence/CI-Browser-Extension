import '@testing-library/jest-dom';

// Mock browser APIs
(global as any).browser = {
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

// Mock URL.parse method specifically for the browser extension usage
(global as any).URL = {
  ...URL,
  parse: jest.fn(),
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};
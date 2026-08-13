// Deno-specific Jest config used by `deno task test` / `deno task test:coverage`.
//
// Why this file exists (and isn't just jest.config.js): the Node config uses
// `preset: "ts-jest/presets/default-esm"` + `extensionsToTreatAsEsm`, which
// makes Jest load test files through Node's experimental `vm.SourceTextModule`
// ESM runner. Deno's Node-compat `node:vm` shim (`ext:deno_node/vm.js`) does
// not implement that runner the same way Node does: globals that Jest injects
// into the module context (`jest`, `expect`, etc.) never reach the module,
// so every suite fails immediately with `ReferenceError: jest is not defined`
// — confirmed via `deno run -A npm:jest`, see PR description.
//
// The fix is not a source change: per this repo's own jest.config.js comment,
// ts-jest's transform already emits CommonJS regardless of the ESM preset
// ("Contains `import.meta`, which this suite cannot parse: the transform
// emits CommonJS"). So dropping the ESM preset/loader and letting Jest use
// its default CommonJS module loader produces the exact same transformed
// output, but goes through the require() path Deno's compat layer handles
// correctly. Everything else (setup file, moduleNameMapper, coverage
// thresholds, test matching) is identical to jest.config.js.
//
// This repo has no jest.mock()/vi.mock() module-mocking in its test suite
// (grepped for jest.mock/jest.doMock/vi.mock — none found; the only
// jest.spyOn usage is `jest.spyOn(console, "warn")`, not module mocking), so
// Deno's lack of a jest.mock() equivalent (module records are immutable) is
// not a live blocker here. If module mocking is added later, it will not
// work under this Deno config and would need documenting as a gap at that
// point.
export default {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/setupTests.ts",
    "!src/lib/telemetry/buildEnv.ts",
    // Same reasoning as buildEnv.ts above, extended to the other two files
    // with real `import.meta.env.*` usage (not just a comment mentioning it):
    // the CommonJS transform this config forces (see file header) can't
    // parse `import.meta`, so instrumenting these for coverage throws
    // TS1343 and aborts collection for the file rather than reporting 0%.
    // Verified by diffing `deno run -A npm:jest --coverage` output against
    // the Node `jest --coverage` baseline — every other file's coverage
    // numbers match exactly; only these two differ (dropped vs. 0%-covered).
    // Known consequence: the *global* coverage percentage this config
    // reports is HIGHER than CI's Node run, because ~2,800 always-uncovered
    // lines are removed from the denominator instead of counting as misses.
    // The coverageThreshold below still gates real regressions in the files
    // that remain, but it is not an apples-to-apples number with CI's.
    "!src/entrypoints/background.ts",
    "!src/entrypoints/popup/main.tsx",
  ],
  coverageThreshold: {
    global: {
      statements: 31,
      branches: 28,
      functions: 31,
      lines: 31,
    },
  },
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.{ts,tsx}",
    "<rootDir>/src/**/*.{test,spec}.{ts,tsx}",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          strict: false,
          skipLibCheck: true,
        },
      },
    ],
  },
};

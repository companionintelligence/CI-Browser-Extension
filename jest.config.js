export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
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
  ],
  // A ratchet, not a target. Set below the numbers CI measures so coverage
  // cannot silently erode; raise it as suites land. The headline figure stays
  // low mainly because background.ts (the largest file by far) is not directly
  // testable — `defineBackground` can't be imported under jest — so the real
  // lever is continuing to move logic out of it into src/lib and src/services,
  // which are at 93% and 92%.
  //
  // Calibrate these against a CI run, not a local one: CI's istanbul counts
  // module-level import lines as uncovered statements (an untested file reports
  // `1-2300` there but `37-2300` locally), so the same tree measures ~1 point
  // lower on CI than it does here.
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
        useESM: true,
        tsconfig: {
          jsx: "react-jsx",
          strict: false,
          skipLibCheck: true,
        },
      },
    ],
  },
};

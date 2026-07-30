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
  // A ratchet, not a target. Set just under the measured numbers so coverage
  // cannot silently erode; raise it as suites land. The headline figure stays
  // low mainly because background.ts (the largest file by far) is not directly
  // testable — `defineBackground` can't be imported under jest — so the real
  // lever is continuing to move logic out of it into src/lib and src/services,
  // which are at 93% and 92%.
  coverageThreshold: {
    global: {
      statements: 23,
      branches: 21,
      functions: 23,
      lines: 23,
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

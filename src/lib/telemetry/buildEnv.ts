/**
 * Build-time telemetry configuration.
 *
 * Isolated in its own module for one reason: `import.meta` is the only thing in
 * the telemetry code that cannot be evaluated under jest (the suite transpiles
 * to CommonJS, where `import.meta` is a syntax error). Keeping it here leaves
 * `./index` and `./settings` importable by tests and by the gate probe, which is
 * what lets the four gate conditions be exercised for real instead of asserted
 * about.
 *
 * A browser extension has no runtime environment, so these are baked into the
 * artifact at build time:
 *
 *   WXT_SENTRY_DSN=…            enables reporting (absent ⇒ nothing initialises)
 *   WXT_CI_TELEMETRY=off        compile a build that never reports
 *   WXT_CI_LOCAL_ONLY=true      same, for local-only distributions
 *   WXT_SENTRY_ENV=…            defaults to "production"
 *   WXT_SENTRY_RELEASE=…        defaults to ci-browser-extension@<manifest version>
 *
 * They control what ships. They cannot help a user who already installed a build
 * that has a DSN — for that, see ./userSetting.
 */

import type { TelemetryEnv } from "./settings";

export const BUILD_TELEMETRY_ENV: TelemetryEnv = {
  SENTRY_DSN: import.meta.env.WXT_SENTRY_DSN,
  SENTRY_ENV: import.meta.env.WXT_SENTRY_ENV,
  SENTRY_RELEASE: import.meta.env.WXT_SENTRY_RELEASE,
  CI_TELEMETRY: import.meta.env.WXT_CI_TELEMETRY,
  CI_LOCAL_ONLY: import.meta.env.WXT_CI_LOCAL_ONLY,
};

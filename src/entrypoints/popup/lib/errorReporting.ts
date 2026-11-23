import { BUILD_TELEMETRY_ENV } from "@/lib/telemetry/buildEnv";
import { resolveTelemetrySettings } from "@/lib/telemetry/settings";

/**
 * Whether this build ships error reporting at all, independent of the user's
 * switch (see @/lib/telemetry/userSetting). A DSN-less build has no reporting
 * to switch off, so it renders no telemetry switch and no first-run disclosure.
 */
export const ERROR_REPORTING_COMPILED_IN = resolveTelemetrySettings(
  BUILD_TELEMETRY_ENV,
  { component: "popup", userEnabled: true },
).enabled;

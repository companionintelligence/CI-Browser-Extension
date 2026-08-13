/**
 * Telemetry (Sentry) settings resolution for the browser extension.
 *
 * Error reporting is **opt-out** — on wherever a DSN is configured, and the
 * user turns it off. Without a DSN nothing is initialised and no network call
 * is ever made.
 *
 * ## Why this gate is shaped differently from the appliance's
 *
 * The canonical gate (CI-Server `common/telemetry/settings.ts`) reads
 * `CI_TELEMETRY` / `CI_LOCAL_ONLY` from `process.env`. **A browser extension has
 * no environment.** It is a signed bundle a store hands to a browser; there is
 * no container, no shell, no `docker run -e`. So the env vars survive here only
 * in the one place they can mean anything — **build time**, as
 * `WXT_CI_TELEMETRY` / `WXT_CI_LOCAL_ONLY`, which decide what gets compiled into
 * the artifact. They let a distributor ship a provably telemetry-free build.
 * They cannot help a user who already installed one.
 *
 * That matters more here than anywhere else in the fleet, because **a DSN baked
 * into a published extension cannot be revoked without a store update** — days
 * of review on Chrome, Firefox and Safari, and only for users who take the
 * update. The build-time switches are therefore necessary but not sufficient.
 * The authoritative kill switch is `userEnabled`: an extension setting, read
 * from `browser.storage.local` and surfaced in the popup, which the user can
 * flip at any moment and which takes effect immediately in every extension
 * context (see ./userSetting and the `beforeSend` guard in ./index). An
 * extension-settings toggle is the only real control, so it is the one that
 * outranks a baked-in DSN.
 *
 * Precedence: local-only > build-time opt-out > user opt-out > no DSN. The
 * first three are all explicit choices by someone; "no DSN" is the absence of
 * one, so it is reported last.
 */

export type TelemetryDisabledReason =
  | "no-dsn"
  | "opt-out"
  | "local-only"
  | "user-disabled"
  | "unsupported-context";

/**
 * The canonical env names, decoupled from how they are spelled in a build.
 * `BUILD_TELEMETRY_ENV` in ./buildEnv maps `import.meta.env.WXT_*` onto these.
 */
export interface TelemetryEnv {
  SENTRY_DSN?: string;
  SENTRY_ENV?: string;
  SENTRY_RELEASE?: string;
  CI_TELEMETRY?: string;
  CI_LOCAL_ONLY?: string;
}

export interface TelemetryResolveOptions {
  /** Which extension context is initialising: background, popup, … */
  component: string;
  /** The user-facing kill switch (see ./userSetting). Opt-out: true by default. */
  userEnabled: boolean;
  /** `browser.runtime.getManifest().version`, used to build a release name. */
  extensionVersion?: string | null;
  /**
   * False in any context where reporting is categorically unsafe — content
   * scripts. See the header of ./index for why.
   */
  contextSupported?: boolean;
}

export interface TelemetrySettings {
  enabled: boolean;
  disabledReason: TelemetryDisabledReason | null;
  dsn: string | null;
  environment: string;
  release: string | undefined;
  component: string;
  extensionVersion: string | null;
}

const FALSEY = new Set(["off", "false", "0", "no", "disabled"]);
const TRUTHY = new Set(["on", "true", "1", "yes", "enabled"]);

function read(env: TelemetryEnv, key: keyof TelemetryEnv): string | null {
  const value = env[key]?.trim();

  return value ? value : null;
}

/** `CI_TELEMETRY=off` (any falsey spelling) opts out; anything else leaves the DSN in charge. */
export function isTelemetryOptedOut(env: TelemetryEnv): boolean {
  const value = read(env, "CI_TELEMETRY")?.toLowerCase();

  return value != null && FALSEY.has(value);
}

/** Local-only mode forbids all egress, telemetry included. */
export function isLocalOnly(env: TelemetryEnv): boolean {
  const value = read(env, "CI_LOCAL_ONLY")?.toLowerCase();

  return value != null && TRUTHY.has(value);
}

export function resolveTelemetrySettings(
  env: TelemetryEnv,
  options: TelemetryResolveOptions,
): TelemetrySettings {
  const dsn = read(env, "SENTRY_DSN");
  const {
    component,
    userEnabled,
    extensionVersion = null,
    contextSupported = true,
  } = options;

  const base = {
    dsn,
    component,
    extensionVersion,
    environment: read(env, "SENTRY_ENV") ?? "production",
    release:
      read(env, "SENTRY_RELEASE") ??
      (extensionVersion
        ? `ci-browser-extension@${extensionVersion}`
        : undefined),
  };

  // A content script is never eligible, whatever else is configured — the page
  // it runs in IS the user's private data.
  if (!contextSupported) {
    return { ...base, enabled: false, disabledReason: "unsupported-context" };
  }

  if (isLocalOnly(env)) {
    return { ...base, enabled: false, disabledReason: "local-only" };
  }

  if (isTelemetryOptedOut(env)) {
    return { ...base, enabled: false, disabledReason: "opt-out" };
  }

  // The user's own switch beats a baked-in DSN. It is checked ahead of the DSN
  // so `disabledReason` names the actual decision rather than its absence.
  if (!userEnabled) {
    return { ...base, enabled: false, disabledReason: "user-disabled" };
  }

  if (!dsn) {
    return { ...base, enabled: false, disabledReason: "no-dsn" };
  }

  return { ...base, enabled: true, disabledReason: null };
}

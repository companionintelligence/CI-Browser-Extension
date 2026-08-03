// Build-time telemetry vars, merged into WXT's generated `ImportMetaEnv`.
// See src/lib/telemetry/buildEnv.ts and .env.example.
interface ImportMetaEnv {
  readonly WXT_SENTRY_DSN?: string;
  readonly WXT_SENTRY_ENV?: string;
  readonly WXT_SENTRY_RELEASE?: string;
  readonly WXT_CI_TELEMETRY?: string;
  readonly WXT_CI_LOCAL_ONLY?: string;
}

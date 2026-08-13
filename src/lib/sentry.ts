import * as Sentry from '@sentry/browser';

let initialized = false;

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi,
  /(?:api[-_ ]?key|token|password|secret|authorization|cookie|jwt)[\s=:"']+[^\s"',}]+/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/gi,
];

function scrubString(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, '[Filtered]');
  output = output.replace(/[?#].*$/, '');
  return output.length > 4000 ? `${output.slice(0, 4000)}… [truncated]` : output;
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]';
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((entry) => scrubValue(entry, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/token|password|secret|authorization|cookie|api[-_ ]?key|email|username|user|bookmark|history|url|title|description/i.test(key)) {
      output[key] = '[Filtered]';
    } else {
      output[key] = scrubValue(nested, depth + 1);
    }
  }
  return output;
}

export function initExtensionSentry(component: 'background' | 'popup'): void {
  if (initialized || !import.meta.env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    enableMetrics: import.meta.env.VITE_SENTRY_ENABLE_METRICS !== 'false',
    enableLogs: import.meta.env.VITE_SENTRY_ENABLE_LOGS !== 'false',
    sendDefaultPii: false,
    beforeSend(event) {
      event.request = undefined;
      event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
        ...breadcrumb,
        message: breadcrumb.message ? scrubString(breadcrumb.message) : breadcrumb.message,
        data: breadcrumb.data ? (scrubValue(breadcrumb.data) as Record<string, unknown>) : breadcrumb.data,
      }));
      return scrubValue(event) as Sentry.ErrorEvent;
    },
  });

  initialized = true;
  Sentry.setTag('component', `ci-browser-extension-${component}`);
}

export { Sentry };

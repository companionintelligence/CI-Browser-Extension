/**
 * The error-reporting kill switch.
 *
 * A DSN compiled into a published extension **cannot be revoked**. Chrome,
 * Firefox and Safari each take days to review a store update, and only users who
 * take that update get the change. So the switch that actually protects someone
 * has to live inside the installed extension, and it has to be theirs.
 *
 * This is that switch: one boolean in `browser.storage.local`, shared by every
 * extension context (background, popup) — the same store the scrape opt-in uses
 * (see @/lib/scrapeSettings) — surfaced in the popup and watchable, so flipping
 * it takes effect immediately rather than on the next service-worker restart.
 *
 * Opt-out posture: a missing key means ON.
 *
 * Reads fail CLOSED. If storage is unreadable we cannot know whether the user
 * turned reporting off, and reporting against a consent decision we could not
 * read is the worse failure.
 */

export const ERROR_REPORTING_KEY = "errorReportingEnabled";

/** Opt-out: absent means enabled. Only an explicit `false` disables. */
export async function isErrorReportingEnabled(): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(ERROR_REPORTING_KEY);

    return stored[ERROR_REPORTING_KEY] !== false;
  } catch {
    return false;
  }
}

export async function setErrorReportingEnabled(
  enabled: boolean,
): Promise<void> {
  await browser.storage.local.set({ [ERROR_REPORTING_KEY]: enabled });
}

/**
 * Call `listener` whenever the switch changes in any context.
 *
 * Returns a disposer. No-ops where `storage.onChanged` is unavailable (older
 * Safari wrappers), which only costs the live update — the value is still read
 * on every init.
 */
export function watchErrorReporting(
  listener: (enabled: boolean) => void,
): () => void {
  const onChanged = browser.storage?.onChanged;

  if (!onChanged?.addListener) {
    return () => undefined;
  }

  const handler = (changes: Record<string, { newValue?: unknown }>) => {
    if (!(ERROR_REPORTING_KEY in changes)) {
      return;
    }

    listener(changes[ERROR_REPORTING_KEY]?.newValue !== false);
  };

  onChanged.addListener(handler);

  return () => onChanged.removeListener?.(handler);
}

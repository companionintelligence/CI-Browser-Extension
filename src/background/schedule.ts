/**
 * Cross-browser periodic-task scheduling.
 *
 * In Chromium MV3 the service worker can be suspended after ~30s of idle
 * time. `setInterval` does not survive that, so anything that must keep
 * firing — auto-sync, device heartbeat, content-cache drain — has to run
 * off `browser.alarms`.
 *
 * Firefox MV2 has a persistent background page, so its `setInterval` works
 * fine. We could use alarms there too, but their resolution is in minutes
 * which is worse. So: alarms when `browser.alarms` exists, plain timers
 * otherwise.
 *
 * Call `schedulePeriodic(name, intervalMs, handler)` for each task. The
 * function is idempotent on `name` so it's safe to call on every SW
 * cold start.
 *
 * See planning/02-mv3-lifecycle.md.
 */

import { logger, errMessage } from "@/lib/log";

export interface PeriodicTask {
  name: string;
  intervalMs: number;
  handler: () => Promise<void> | void;
}

const ALARM_NAME_PREFIX = "ci.";
const registered = new Map<string, PeriodicTask>();
let alarmListenerInstalled = false;

function supportsAlarms(): boolean {
  return (
    typeof browser !== "undefined" &&
    typeof browser.alarms?.create === "function"
  );
}

function installAlarmListener(): void {
  if (alarmListenerInstalled || !supportsAlarms()) {
    return;
  }

  browser.alarms.onAlarm.addListener(async ({ name }) => {
    if (!name.startsWith(ALARM_NAME_PREFIX)) {
      return;
    }

    const taskName = name.slice(ALARM_NAME_PREFIX.length);
    const task = registered.get(taskName);
    if (!task) {
      return;
    }

    try {
      await task.handler();
    } catch (err) {
      logger.warn("schedule.alarmHandlerFailed", {
        name: taskName,
        err: errMessage(err),
      });
    }
  });
  alarmListenerInstalled = true;
}

export function schedulePeriodic(task: PeriodicTask): void {
  registered.set(task.name, task);

  if (supportsAlarms()) {
    installAlarmListener();
    // Chrome enforces a 30-second minimum periodInMinutes in prod builds;
    // anything shorter silently rounds up. We never schedule < 1 min anyway.
    const periodInMinutes = Math.max(task.intervalMs / 60_000, 0.5);
    browser.alarms.create(`${ALARM_NAME_PREFIX}${task.name}`, {
      periodInMinutes,
    });
    logger.debug("schedule.installed", {
      name: task.name,
      periodInMinutes,
      transport: "alarms",
    });

    return;
  }

  // Firefox MV2 / non-extension test contexts.
  setInterval(() => {
    void Promise.resolve(task.handler()).catch((err) =>
      logger.warn("schedule.intervalHandlerFailed", {
        name: task.name,
        err: errMessage(err),
      }),
    );
  }, task.intervalMs);
  logger.debug("schedule.installed", {
    name: task.name,
    intervalMs: task.intervalMs,
    transport: "setInterval",
  });
}

/**
 * Subscribe to changes on cookies under the given domain. Used by the auth
 * subsystem to drive token refresh off cookie writes instead of a 1 Hz poll.
 *
 * Caller is responsible for handling debounce — Chrome emits paired
 * `removed: true` / `removed: false` events for every cookie rotation.
 */
export function watchCookies(
  match: (cookie: { name: string; domain: string }) => boolean,
  handler: () => Promise<void> | void,
): void {
  if (typeof browser?.cookies?.onChanged?.addListener !== "function") {
    logger.debug("schedule.cookieWatchUnsupported");

    return;
  }

  browser.cookies.onChanged.addListener(async ({ cookie }) => {
    if (!match(cookie)) {
      return;
    }

    try {
      await handler();
    } catch (err) {
      logger.warn("schedule.cookieHandlerFailed", { err: errMessage(err) });
    }
  });
  logger.debug("schedule.cookieWatch.installed");
}

export function isAlarmTransport(): boolean {
  return supportsAlarms();
}

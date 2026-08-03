import { useEffect, useState } from "react";
import { Field, Checkbox, Label } from "@ci/shadcn";
import { BUILD_TELEMETRY_ENV } from "@/lib/telemetry/buildEnv";
import { resolveTelemetrySettings } from "@/lib/telemetry/settings";
import {
  isErrorReportingEnabled,
  setErrorReportingEnabled,
  watchErrorReporting,
} from "@/lib/telemetry/userSetting";

/**
 * The error-reporting kill switch.
 *
 * This control matters more than its size suggests. A Sentry DSN compiled into a
 * published extension cannot be revoked — turning reporting off for everyone
 * would mean a new build through three store review queues, reaching only the
 * users who take the update. There is no environment variable to set, no
 * container to restart, no config file to edit. **An extension setting is the
 * only real control**, so this is it: one checkbox, effective immediately in
 * every extension context, no restart.
 *
 * Rendered only when the installed build actually has reporting compiled in.
 * Offering a switch that governs nothing would be worse than offering none.
 */
export default function TelemetrySettings() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void isErrorReportingEnabled().then((value) => {
      if (active) {
        setEnabled(value);
        setLoaded(true);
      }
    });

    // Another context (or another popup window) may flip it.
    const stop = watchErrorReporting((value) => {
      if (active) {
        setEnabled(value);
      }
    });

    return () => {
      active = false;
      stop();
    };
  }, []);

  // Resolved against the build only: `userEnabled` is what this control sets, so
  // feeding it back in here would hide the switch the moment it was turned off.
  const compiledIn = resolveTelemetrySettings(BUILD_TELEMETRY_ENV, {
    component: "popup",
    userEnabled: true,
  }).enabled;

  if (!compiledIn) {
    return null;
  }

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    void setErrorReportingEnabled(checked);
  };

  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg bg-primary/5 text-left">
      <Field orientation="horizontal">
        <Checkbox
          id="error-reporting-enabled"
          name="error-reporting-enabled"
          checked={enabled}
          disabled={!loaded}
          onCheckedChange={handleToggle}
          className="w-[18px] h-[18px] cursor-pointer accent-primary"
        />
        <Label htmlFor="error-reporting-enabled">Send error reports</Label>
      </Field>
      <p className="m-0 text-[0.75em] text-muted-foreground">
        Crash reports only — never page addresses, page contents, bookmarks,
        history or anything you have captured.
      </p>
    </div>
  );
}

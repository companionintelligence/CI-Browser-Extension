import { useState } from "react";
import { Button, Spinner } from "@ci/shadcn";
import { ExternalLink } from "@ci/shadcn/icons";
import { copy } from "../copy";
import { hostFromUrl } from "../lib/formatters";
import { friendlyError } from "../lib/friendlyErrors";
import { useCiState } from "../hooks/useCiState";
import { SectionCard } from "./SectionCard";
import { Banner } from "./Banner";
import { StatusDot, type DotTone } from "./StatusDot";

/** Where this browser saves to. The whole row opens the Memory in a tab. */
export function MemoryStatusCard({ authError }: { authError: string | null }) {
  const { serverURL, deviceId, deviceName, deviceSetupError } = useCiState();
  const [retrying, setRetrying] = useState(false);

  // Registration failing is not a transient blip to hide behind a spinner:
  // every capture path calls getDeviceId(), which throws without one.
  const failed = !deviceId && !!deviceSetupError;
  const tone: DotTone = authError || failed ? "err" : deviceId ? "ok" : "warn";
  const host = hostFromUrl(serverURL) ?? serverURL;

  const retry = async () => {
    setRetrying(true);
    try {
      await browser.runtime.sendMessage({ action: "SETUP_DEVICE" });
    } catch (error) {
      console.error(error);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SectionCard kicker={copy.home.kickerMemory}>
      <button
        type="button"
        onClick={() => window.open(serverURL, "_blank")}
        aria-label={copy.home.openMemory}
        title={serverURL}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md text-left hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <StatusDot tone={tone} pulse={tone === "warn"} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {host}
        </span>
        <ExternalLink
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
      </button>

      {deviceId ? (
        <p className="mt-1 ml-4 text-xs text-muted-foreground">
          {copy.home.thisBrowser(deviceName || "this browser")}
        </p>
      ) : failed ? (
        <Banner tone="destructive" className="mt-2">
          <div className="min-w-0">
            <p className="font-semibold">{copy.home.registerFailed}</p>
            <p className="text-muted-foreground">
              {friendlyError(deviceSetupError!)}
            </p>
            <p
              className="mt-0.5 line-clamp-2 font-mono text-xxs break-all text-muted-foreground"
              title={deviceSetupError!}
            >
              {deviceSetupError}
            </p>
            <p className="mt-1 text-muted-foreground">
              {copy.home.registerFailedHelp}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 px-2.5 text-xs"
              disabled={retrying}
              onClick={retry}
            >
              {retrying && <Spinner className="size-3.5 shrink-0" />}
              {copy.home.registerRetry}
            </Button>
          </div>
        </Banner>
      ) : (
        <p className="mt-1 ml-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3 shrink-0" />
          {copy.home.registering}
        </p>
      )}
    </SectionCard>
  );
}

import { Spinner } from "@ci/shadcn";
import { ExternalLink } from "@ci/shadcn/icons";
import { copy } from "../copy";
import { hostFromUrl } from "../lib/formatters";
import { useCiState } from "../hooks/useCiState";
import { SectionCard } from "./SectionCard";
import { StatusDot, type DotTone } from "./StatusDot";

/** Where this browser saves to. The whole row opens the Memory in a tab. */
export function MemoryStatusCard({ authError }: { authError: string | null }) {
  const { serverURL, deviceId, deviceName } = useCiState();

  const tone: DotTone = authError ? "err" : deviceId ? "ok" : "warn";
  const host = hostFromUrl(serverURL) ?? serverURL;

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
      <p className="mt-1 ml-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        {deviceId ? (
          copy.home.thisBrowser(deviceName || "this browser")
        ) : (
          <>
            <Spinner className="size-3 shrink-0" />
            {copy.home.registering}
          </>
        )}
      </p>
    </SectionCard>
  );
}

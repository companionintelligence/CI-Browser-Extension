import {
  Badge,
  Button,
  Progress,
  Select,
  Spinner,
  Tooltip,
  cn,
} from "@ci/shadcn";
import { CloudUpload, Pause, Play, RefreshCw } from "@ci/shadcn/icons";
import { hasHistoryApi } from "@/lib/browserCapabilities";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { useCiState } from "../hooks/useCiState";
import { useSyncActions } from "../hooks/useSyncActions";
import { SectionCard } from "./SectionCard";
import { StatusDot } from "./StatusDot";
import { Banner } from "./Banner";
import { BrandButton } from "./BrandButton";

const HISTORY_API_AVAILABLE = hasHistoryApi();
const PERIOD_VALUES = ["1", "7", "30", "90", "365"];

export function SyncNowCard({ queued }: { queued: number }) {
  const { push } = useRouter();
  const { autoSyncEnabled, deviceId } = useCiState();
  const {
    period,
    setPeriod,
    syncNow,
    togglePause,
    paused,
    inProgress,
    progress,
  } = useSyncActions();

  const queuePill =
    queued > 0 ? (
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Badge variant="secondary" className="gap-1 text-xxs">
            <CloudUpload className="size-3" strokeWidth={1.75} />
            {copy.sync.queuePill(queued)}
          </Badge>
        </Tooltip.Trigger>
        <Tooltip.Content className="max-w-[240px]">
          {copy.sync.queueTip(queued)}
        </Tooltip.Content>
      </Tooltip>
    ) : undefined;

  return (
    <SectionCard kicker={copy.home.kickerSync} kickerRight={queuePill}>
      {HISTORY_API_AVAILABLE ? (
        <div className="flex gap-2">
          <Select
            value={period}
            onValueChange={setPeriod}
            disabled={inProgress}
          >
            <Select.Trigger
              className="w-[120px] shrink-0"
              aria-label={copy.sync.periodLabel}
            >
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {PERIOD_VALUES.map((value) => (
                <Select.Item key={value} value={value}>
                  {copy.sync.periods[value]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          {!deviceId && !inProgress ? (
            <Tooltip>
              <Tooltip.Trigger asChild>
                <span className="flex-1">
                  <BrandButton disabled className="w-full">
                    <RefreshCw className="size-4" strokeWidth={1.75} />
                    {copy.sync.now}
                  </BrandButton>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>{copy.sync.needsSetup}</Tooltip.Content>
            </Tooltip>
          ) : (
            <BrandButton
              loading={inProgress}
              className="flex-1"
              onClick={syncNow}
            >
              {!inProgress && (
                <RefreshCw className="size-4" strokeWidth={1.75} />
              )}
              {inProgress ? copy.sync.syncing : copy.sync.now}
            </BrandButton>
          )}
        </div>
      ) : (
        <Banner tone="info">{copy.sync.safari}</Banner>
      )}

      {inProgress &&
        (progress.current !== null && progress.total !== null ? (
          <div className="mt-2.5">
            <Progress
              value={(progress.current / Math.max(1, progress.total)) * 100}
              aria-label="Sync progress"
              className="h-1.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              {copy.sync.progressUploading(progress.current, progress.total)}
              {progress.ignored
                ? copy.sync.progressIgnored(progress.ignored)
                : null}
            </p>
          </div>
        ) : (
          progress.raw && (
            <p
              className="mt-2.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"
              title={progress.raw}
            >
              <Spinner className="size-3 shrink-0" />
              <span className="truncate">{progress.raw}</span>
            </p>
          )
        ))}

      <div className="mt-2 flex items-center justify-between gap-2">
        {/* Safari hides this: the toggle it links to doesn't exist there (the
            info banner above already explains the 10-minute auto-upload). */}
        {HISTORY_API_AVAILABLE ? (
          <button
            type="button"
            onClick={() => push("settings")}
            className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {autoSyncEnabled ? (
              <>
                <StatusDot tone="ok" className="size-1.5" />
                <span className="truncate">{copy.sync.autoOn}</span>
              </>
            ) : (
              <span className="truncate underline underline-offset-2">
                {copy.sync.autoOff}
              </span>
            )}
          </button>
        ) : (
          <span />
        )}
        {!inProgress && (
          <Tooltip>
            <Tooltip.Trigger asChild>
              {/* Design's small-button metrics (28px tall, 11px label, 13px
                  glyph) — the stock sm size is a form control, too heavy for
                  a secondary action sitting next to a link. */}
              <Button
                variant={paused ? "outline" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 gap-1.5 px-2.5 text-xs",
                  !paused && "text-muted-foreground",
                )}
                onClick={togglePause}
              >
                {paused ? (
                  <Play className="size-3.5" strokeWidth={1.75} />
                ) : (
                  <Pause className="size-3.5" strokeWidth={1.75} />
                )}
                {paused ? copy.sync.resume : copy.sync.pause}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-[240px]">
              {paused ? copy.sync.resumeTip : copy.sync.pauseTip}
            </Tooltip.Content>
          </Tooltip>
        )}
      </div>
    </SectionCard>
  );
}

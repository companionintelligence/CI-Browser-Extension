import { Button, Tooltip } from "@ci/shadcn";
import { History, Settings } from "@ci/shadcn/icons";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { useCiState } from "../hooks/useCiState";
import { usePopupStatus } from "../hooks/usePopupStatus";
import { PopupShell } from "../components/PopupShell";
import { StatusVerdict } from "../components/StatusVerdict";
import { MemoryStatusCard } from "../components/MemoryStatusCard";
import { CurrentTabCard } from "../components/CurrentTabCard";
import { SyncNowCard } from "../components/SyncNowCard";

/** The attention dot clears when Activity is opened (ActivityScreen stamps this). */
export const ACTIVITY_SEEN_KEY = "ci-activity-seen";

export function HomeScreen({
  queued,
  authError,
}: {
  queued: number;
  authError: string | null;
}) {
  const { push } = useRouter();
  const { syncHistoryLogs } = useCiState();
  const status = usePopupStatus({ queued, authError });

  const latest = syncHistoryLogs[0];
  const activityAttention =
    latest?.status === "failed" &&
    localStorage.getItem(ACTIVITY_SEEN_KEY) !== String(latest.id);

  return (
    <PopupShell
      title={copy.app.title}
      status={status.tone}
      headerRight={
        <>
          <Tooltip>
            <Tooltip.Trigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={copy.home.activityLabel}
                onClick={() => push("activity")}
                className="relative"
              >
                <History className="size-4" strokeWidth={1.75} />
                {activityAttention && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 right-1 size-1.5 rounded-full bg-warning"
                  />
                )}
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{copy.home.activityLabel}</Tooltip.Content>
          </Tooltip>
          <Tooltip>
            <Tooltip.Trigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={copy.home.settingsLabel}
                onClick={() => push("settings")}
              >
                <Settings className="size-4" strokeWidth={1.75} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>{copy.home.settingsLabel}</Tooltip.Content>
          </Tooltip>
        </>
      }
    >
      <StatusVerdict status={status} />
      <MemoryStatusCard authError={authError} />
      <CurrentTabCard />
      <SyncNowCard queued={queued} />
    </PopupShell>
  );
}

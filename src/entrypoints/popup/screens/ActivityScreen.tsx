import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { AlertDialog, Button, DropdownMenu, useToast, cn } from "@ci/shadcn";
import {
  ChevronDown,
  CloudUpload,
  EllipsisVertical,
  History,
} from "@ci/shadcn/icons";
import { clearSyncHistoryLogs, saveUserSettings } from "@/store/ciStateSlice";
import { hasHistoryApi } from "@/lib/browserCapabilities";
import { copy } from "../copy";
import { durationSeconds, relativeTime } from "../lib/formatters";
import { friendlyError } from "../lib/friendlyErrors";
import { useCiState, type SyncHistoryLog } from "../hooks/useCiState";
import { ACTIVITY_SEEN_KEY } from "./HomeScreen";
import { PopupShell } from "../components/PopupShell";
import { SectionRule } from "../components/SectionRule";
import { StatusDot, type DotTone } from "../components/StatusDot";

const STATUS_TONE: Record<string, DotTone> = {
  success: "ok",
  partial: "warn",
  failed: "err",
};

const HISTORY_API_AVAILABLE = hasHistoryApi();

function rangeLabel(timeRange: number | undefined): string | null {
  if (typeof timeRange !== "number") {
    return null;
  }

  // Sub-day ranges floor to 0 in the log entry (the auto-sync 24h window).
  if (timeRange === 0) {
    return copy.sync.periods["1"];
  }

  return copy.sync.periods[String(timeRange)] ?? `Last ${timeRange} days`;
}

function logTitle(log: SyncHistoryLog): { text: string; muted: boolean } {
  if (log.status === "failed") {
    return { text: copy.activity.failed, muted: false };
  }

  if (log.status === "partial") {
    return {
      text: copy.activity.partial(
        log.uploadedEntries ?? 0,
        log.totalEntries ?? 0,
      ),
      muted: false,
    };
  }

  if (!log.uploadedEntries) {
    return { text: copy.activity.nothing, muted: true };
  }

  return { text: copy.activity.synced(log.uploadedEntries), muted: false };
}

function dayLabel(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return copy.activity.today;
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return copy.activity.yesterday;
  }

  return date.toLocaleDateString();
}

function LogRow({ log }: { log: SyncHistoryLog }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = !!log.error;
  const title = logTitle(log);
  const range = rangeLabel(log.timeRange);
  const duration = durationSeconds(log.duration);
  const subParts = [range, duration].filter(Boolean).join(" · ");
  const uploadedLine =
    (log.status === "partial" || log.status === "failed") &&
    typeof log.uploadedEntries === "number" &&
    typeof log.totalEntries === "number"
      ? copy.activity.uploadedOf(log.uploadedEntries, log.totalEntries)
      : null;

  const row = (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <StatusDot tone={STATUS_TONE[log.status] ?? "off"} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm",
            title.muted ? "text-muted-foreground" : "font-medium",
          )}
        >
          {title.text}
        </p>
        {log.error && (
          <p className="text-xs text-muted-foreground">
            {friendlyError(log.error)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {subParts}
          {uploadedLine ? `${subParts ? " · " : ""}${uploadedLine}` : null}
        </p>
      </div>
      <span
        className="shrink-0 text-xs text-muted-foreground tabular-nums"
        title={new Date(log.timestamp).toLocaleString()}
      >
        {relativeTime(log.timestamp)}
      </span>
      {expandable && (
        <ChevronDown
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
          strokeWidth={1.75}
        />
      )}
    </div>
  );

  if (!expandable) {
    return <div className="px-1 py-2">{row}</div>;
  }

  return (
    <div className="px-1 py-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer rounded-md text-left focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {row}
      </button>
      {expanded && (
        <p className="mt-2 ml-4 rounded-md bg-muted p-2 font-mono text-xs break-words">
          {log.error}
        </p>
      )}
    </div>
  );
}

/** "Logs", humanized: day groups, plain-language rows, full untruncated errors. */
export function ActivityScreen({ queued }: { queued: number }) {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { syncHistoryLogs, autoSyncEnabled } = useCiState();
  const [confirmClear, setConfirmClear] = useState(false);

  // Opening this screen clears Home's attention dot.
  useEffect(() => {
    if (syncHistoryLogs[0]) {
      localStorage.setItem(ACTIVITY_SEEN_KEY, String(syncHistoryLogs[0].id));
    }
  }, [syncHistoryLogs]);

  const groups = useMemo(() => {
    const byDay = new Map<string, SyncHistoryLog[]>();
    for (const log of syncHistoryLogs) {
      const label = dayLabel(log.timestamp);
      const bucket = byDay.get(label);
      if (bucket) {
        bucket.push(log);
      } else {
        byDay.set(label, [log]);
      }
    }

    return [...byDay.entries()];
  }, [syncHistoryLogs]);

  const exportLogs = () => {
    const dataStr = JSON.stringify(syncHistoryLogs, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
    const link = document.createElement("a");
    link.setAttribute("href", dataUri);
    link.setAttribute("download", "sync_activity.json");
    link.click();
    toast(copy.activity.exported);
  };

  const clear = () => {
    dispatch(clearSyncHistoryLogs());
    dispatch(saveUserSettings());
    setConfirmClear(false);
    toast(copy.activity.cleared);
  };

  return (
    <PopupShell
      title={copy.activity.title}
      back
      headerRight={
        syncHistoryLogs.length > 0 ? (
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={copy.site.more}
              >
                <EllipsisVertical className="size-4" strokeWidth={1.75} />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Item onClick={exportLogs}>
                {copy.activity.export}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                variant="destructive"
                onClick={() => setConfirmClear(true)}
              >
                {copy.activity.clear}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
        <CloudUpload
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {queued > 0
              ? copy.activity.queueWaiting(queued)
              : copy.activity.queueOk}
          </p>
          <p className="text-xs text-muted-foreground">
            {queued > 0
              ? copy.activity.queueWaitingSub
              : !HISTORY_API_AVAILABLE
                ? copy.settings.autoSyncSafari
                : autoSyncEnabled
                  ? copy.activity.queueOkSubOn
                  : copy.activity.queueOkSubOff}
          </p>
        </div>
      </div>

      {syncHistoryLogs.length === 0 ? (
        <div className="py-10 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-muted">
            <History
              className="size-7 text-muted-foreground"
              strokeWidth={1.75}
            />
          </span>
          <p className="mt-3 text-sm font-medium">{copy.activity.empty}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {copy.activity.emptySub}
          </p>
        </div>
      ) : (
        groups.map(([label, logs]) => (
          <section key={label}>
            <SectionRule label={label} />
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </section>
        ))
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>{copy.activity.clearTitle}</AlertDialog.Title>
            <AlertDialog.Description>
              {copy.activity.clearBody}
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>{copy.common.cancel}</AlertDialog.Cancel>
            <AlertDialog.Action
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={clear}
            >
              {copy.activity.clearConfirm}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </PopupShell>
  );
}

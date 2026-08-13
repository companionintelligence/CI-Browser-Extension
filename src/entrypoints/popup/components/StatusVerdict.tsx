import type { PopupStatus } from "../hooks/usePopupStatus";
import { StatusDot } from "./StatusDot";

/** Home's one-line "am I OK" answer, fed by usePopupStatus. */
export function StatusVerdict({ status }: { status: PopupStatus }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <StatusDot tone={status.tone} pulse={status.pulse} />
      <p className="min-w-0 truncate">
        <span className="text-sm font-semibold">{status.headline}</span>
        {status.detail && (
          <span
            className="text-xs text-muted-foreground tabular-nums"
            title={status.detailTitle ?? undefined}
          >
            {" · "}
            {status.detail}
          </span>
        )}
      </p>
    </div>
  );
}

import { cn } from "@ci/shadcn";

export type DotTone = "ok" | "busy" | "warn" | "err" | "off";

const TONE_CLASS: Record<DotTone, string> = {
  ok: "bg-success",
  busy: "bg-info",
  warn: "bg-warning",
  err: "bg-destructive",
  off: "bg-muted-foreground/50",
};

export function StatusDot({
  tone,
  pulse,
  className,
}: {
  tone: DotTone;
  /** busy always pulses; others only when asked (e.g. provisioning). */
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        TONE_CLASS[tone],
        (pulse || tone === "busy") && "motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

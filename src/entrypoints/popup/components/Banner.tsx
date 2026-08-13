import type { ReactNode } from "react";
import { cn } from "@ci/shadcn";
import { CircleCheck, Info, TriangleAlert, X } from "@ci/shadcn/icons";

type Tone = "destructive" | "warning" | "info" | "success";

const TONE_CLASS: Record<Tone, string> = {
  destructive: "bg-destructive/10 border-destructive/30 text-destructive",
  warning: "bg-warning/10 border-warning/30 text-warning",
  info: "bg-info/10 border-info/30 text-info",
  success: "bg-success/10 border-success/30 text-success",
};

const TONE_ICON: Record<Tone, typeof Info> = {
  destructive: TriangleAlert,
  warning: TriangleAlert,
  info: Info,
  success: CircleCheck,
};

export function Banner({
  tone,
  children,
  onDismiss,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon = TONE_ICON[tone];

  return (
    <div
      role={tone === "destructive" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border p-2.5 text-xs leading-snug motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 text-left">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 cursor-pointer rounded-sm opacity-70 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { Toaster, Tooltip, cn } from "@ci/shadcn";
import { PopupHeader } from "./PopupHeader";
import type { DotTone } from "./StatusDot";

/**
 * The one frame every screen renders in: sticky header, the ONLY scroll
 * region, optional footer, and the single Toaster mount.
 */
export function PopupShell({
  title,
  back,
  status,
  headerRight,
  footer,
  children,
  bodyClassName,
}: {
  title: string;
  back?: boolean;
  status?: DotTone;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex min-h-0 flex-1 flex-col">
        <PopupHeader
          title={title}
          back={back}
          status={status}
          right={headerRight}
        />
        <main
          className={cn(
            "min-h-0 flex-1 space-y-3 overflow-y-auto p-3",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
            back && "motion-safe:slide-in-from-right-4",
            bodyClassName,
          )}
        >
          {children}
        </main>
        {footer && (
          <footer className="shrink-0 border-t px-3 py-2">{footer}</footer>
        )}
        <Toaster position="bottom-center" duration={2500} />
      </div>
    </Tooltip.Provider>
  );
}

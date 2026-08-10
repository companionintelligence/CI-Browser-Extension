import type { ReactNode } from "react";
import { cn } from "@ci/shadcn";

/** Home-screen card: kicker header row + content, on the card surface. */
export function SectionCard({
  kicker,
  kickerRight,
  children,
  className,
}: {
  kicker?: string;
  kickerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border bg-card p-3 shadow-sm", className)}
    >
      {kicker && (
        <header className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {kicker}
          </h2>
          {kickerRight}
        </header>
      )}
      {children}
    </section>
  );
}

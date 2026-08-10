import type { ReactNode } from "react";
import { cn } from "@ci/shadcn";
import { ChevronRight } from "@ci/shadcn/icons";
import type { LucideIcon } from "@ci/shadcn/icons";

/** Tappable list row: leading icon tile, two truncated lines, trailing slot. */
export function RowLink({
  icon: Icon,
  title,
  titleAttr,
  sub,
  trailing,
  onClick,
  className,
}: {
  icon: LucideIcon;
  title: string;
  titleAttr?: string;
  sub?: string;
  trailing?: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={titleAttr}>
          {title}
        </span>
        {sub && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
      {trailing}
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
    </button>
  );
}

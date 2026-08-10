import { Skeleton } from "@ci/shadcn";

/**
 * Rendered immediately by main.tsx — before the proxy store even connects —
 * and kept until settings hydrate. Mirrors Home's geometry so the real screen
 * lands without a layout jump. No spinner, no text.
 */
export function LoadingScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2">
        <Skeleton className="ml-1 size-5 rounded-sm" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="min-h-[360px] space-y-3 p-3">
        <div className="flex items-center gap-2 px-1">
          <Skeleton className="size-2 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="space-y-2 rounded-lg border bg-card p-3 shadow-sm">
          <Skeleton className="h-2.5 w-10" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-[120px]" />
            <Skeleton className="h-9 flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The kicker + hairline that separates sections on the scrolling screens
 * (Settings groups, Activity day groups, the Ignored list).
 *
 * Deliberately not sticky: a translucent, blurred bar scrolling over the
 * aurora body wash reads as a grey band sitting behind the label rather than
 * as part of the page.
 */
export function SectionRule({
  label,
  count,
}: {
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <h2 className="text-xxs font-bold tracking-[0.11em] text-muted-foreground uppercase">
        {label}
      </h2>
      {count !== undefined && (
        <span className="text-xxs text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

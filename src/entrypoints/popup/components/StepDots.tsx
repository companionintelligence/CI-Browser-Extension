import { cn } from "@ci/shadcn";

/** Onboarding progress: 1 Sign in · 2 Choose Memory · 3 Done. */
export function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex justify-center gap-1.5" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn(
            "h-1.5 rounded-full transition-all",
            n < step && "w-1.5 bg-primary/60",
            n === step && "w-4 bg-primary",
            n > step && "w-1.5 bg-border",
          )}
        />
      ))}
    </div>
  );
}

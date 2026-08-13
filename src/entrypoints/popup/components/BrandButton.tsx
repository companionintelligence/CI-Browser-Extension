import type { ReactNode } from "react";
import { Button, LoadingButton, cn } from "@ci/shadcn";

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * The gradient CTA (`.btn-brand`, tokens-only). Rule: at most ONE per screen —
 * Welcome "Sign in", Connect "Check again", Home "Sync now".
 */
export function BrandButton({
  className,
  loading,
  children,
  ...props
}: ButtonProps & { loading?: boolean; children: ReactNode }) {
  if (loading !== undefined) {
    return (
      <LoadingButton
        loading={loading}
        {...props}
        className={cn("btn-brand", className)}
      >
        {children}
      </LoadingButton>
    );
  }

  return (
    <Button {...props} className={cn("btn-brand", className)}>
      {children}
    </Button>
  );
}

import { useCallback, useState } from "react";
import { useToast } from "@ci/shadcn";
import { copy } from "../copy";

/**
 * Forced Memory re-discovery. "Check again" and "Find my Memory" report their
 * outcome as toasts. A quiet check (Connect's re-check on open and focus) stays
 * silent and leaves `discovering` alone, so the screen never flickers into a
 * spinner. Either way the background updates Redux (choices or a fresh hint),
 * and the proxy store re-renders the resolver with the outcome.
 */
export function useDiscovery() {
  const { toast } = useToast();
  const [discovering, setDiscovering] = useState(false);

  const recheck = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}): Promise<number> => {
      if (!quiet) {
        setDiscovering(true);
      }

      try {
        const response: { success?: boolean; found?: number } | undefined =
          await browser.runtime.sendMessage({ action: "DISCOVER_MEMORY" });

        if (!quiet && response?.success && response.found === 0) {
          toast(copy.connect.stillNone);
        }

        if (!quiet && response && response.success === false) {
          toast.error(copy.errors.portalUnreachable);
        }

        return response?.found ?? 0;
      } catch {
        if (!quiet) {
          toast.error(copy.errors.portalUnreachable);
        }

        return 0;
      } finally {
        if (!quiet) {
          setDiscovering(false);
        }
      }
    },
    [toast],
  );

  return { discovering, recheck };
}

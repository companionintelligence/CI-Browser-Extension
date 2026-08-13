import { useCallback, useState } from "react";
import { useToast } from "@ci/shadcn";
import { copy } from "../copy";

/**
 * Forced Memory re-discovery ("Check again" / "Find my Memory"). The
 * background updates Redux (choices or a fresh hint); the proxy store
 * re-renders the resolver with the outcome — failures surface as toasts
 * instead of dying in the console.
 */
export function useDiscovery() {
  const { toast } = useToast();
  const [discovering, setDiscovering] = useState(false);

  const recheck = useCallback(async (): Promise<number> => {
    setDiscovering(true);
    try {
      const response: { success?: boolean; found?: number } | undefined =
        await browser.runtime.sendMessage({ action: "DISCOVER_MEMORY" });

      if (response?.success && response.found === 0) {
        toast(copy.connect.stillNone);
      }

      if (response && response.success === false) {
        toast.error(copy.errors.portalUnreachable);
      }

      return response?.found ?? 0;
    } catch {
      toast.error(copy.errors.portalUnreachable);

      return 0;
    } finally {
      setDiscovering(false);
    }
  }, [toast]);

  return { discovering, recheck };
}

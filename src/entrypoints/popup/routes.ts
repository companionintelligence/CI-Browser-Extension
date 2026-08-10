import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Pushed screens only. Root screens (welcome / connect / pick / home) are
 * DERIVED from state by the resolver in App.tsx, not routed — they auto-advance
 * and have no back button.
 */
export type Route = "settings" | "ignored" | "activity" | "dev";

interface RouterValue {
  stack: Route[];
  top: Route | null;
  push: (route: Route) => void;
  pop: () => void;
  reset: () => void;
}

const RouterContext = createContext<RouterValue | null>(null);

/** Max depth 2: home → settings → ignored. */
const MAX_DEPTH = 2;

export function RouterProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([]);

  const push = useCallback((route: Route) => {
    setStack((current) => {
      if (current[current.length - 1] === route) {
        return current;
      }

      return [...current.slice(0, MAX_DEPTH - 1), route];
    });
  }, []);

  const pop = useCallback(() => {
    setStack((current) => current.slice(0, -1));
  }, []);

  const reset = useCallback(() => {
    setStack([]);
  }, []);

  const value = useMemo<RouterValue>(
    () => ({
      stack,
      top: stack[stack.length - 1] ?? null,
      push,
      pop,
      reset,
    }),
    [stack, push, pop, reset],
  );

  return createElement(RouterContext.Provider, { value }, children);
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("useRouter must be used inside RouterProvider");
  }

  return value;
}

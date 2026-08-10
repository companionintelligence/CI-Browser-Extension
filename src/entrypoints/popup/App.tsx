import { useEffect } from "react";
import { useToast } from "@ci/shadcn";
import "@/theme.css";
import { NO_MEMORY_HINT } from "@/services/portalApps";
import { copy } from "./copy";
import { RouterProvider, useRouter } from "./routes";
import { useCiState } from "./hooks/useCiState";
import { useAuth } from "./hooks/useAuth";
import { useQueueStatus } from "./hooks/useQueueStatus";
import { LoadingScreen } from "./screens/LoadingScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { ConnectScreen } from "./screens/ConnectScreen";
import { PickMemoryScreen } from "./screens/PickMemoryScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { IgnoredSitesScreen } from "./screens/IgnoredSitesScreen";
import { ActivityScreen } from "./screens/ActivityScreen";
import { DevPanelScreen } from "./screens/DevPanelScreen";

/**
 * Screen resolver: root screens (Welcome → Connect/Pick → Home) are DERIVED
 * from state and auto-advance; pushed screens (Settings, Activity, Ignored,
 * Dev) sit on an explicit stack. Priority order matters — first match wins:
 *
 * - Settings resolves before the token check so its signed-out variant keeps
 *   the telemetry kill switch reachable pre-onboarding (a consent requirement).
 * - Dev resolves before the token check because Portal-environment switching
 *   is a signed-out use case.
 * - Pick Memory takes over the WHOLE popup, even when connected — the memory
 *   picker and the dashboard can never render together.
 * - A user with no serverURL can never land on Home; connected users with a
 *   non-sentinel discovery hint stay on Home (the hint shows in Settings).
 */
function AppInner() {
  const { toast } = useToast();
  const { top, pop, push, reset } = useRouter();
  const ciState = useCiState();
  const auth = useAuth();
  const queued = useQueueStatus();

  const {
    accessToken,
    serverURL,
    discoveryHint,
    memoryAppChoices,
    settingsLoaded,
  } = ciState;

  useEffect(() => {
    browser.runtime
      .sendMessage({ action: "CHECK_AUTH_STATUS" })
      .catch(() => undefined);
  }, [settingsLoaded, serverURL]);

  // Escape pops one level (an empty stack lets the browser close the popup);
  // Alt+Shift+Period opens the hidden dev panel from anywhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pop();
      }

      if (e.altKey && e.shiftKey && (e.key === "." || e.code === "Period")) {
        e.preventDefault();
        toast(copy.dev.unlocked);
        push("dev");
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pop, push, toast]);

  // Signing out clears stale pushed screens — except Settings and Dev, which
  // have signed-out variants and must survive in place.
  useEffect(() => {
    if (!accessToken && top !== null && top !== "settings" && top !== "dev") {
      reset();
    }
  }, [accessToken, top, reset]);

  if (!settingsLoaded) {
    return <LoadingScreen />;
  }

  if (top === "settings") {
    return <SettingsScreen auth={auth} />;
  }

  if (top === "dev") {
    return <DevPanelScreen queued={queued} />;
  }

  if (!accessToken) {
    return (
      <WelcomeScreen
        authorizing={auth.authorizing}
        authError={auth.authError}
        onAuthorize={auth.authorize}
        onCancel={auth.cancelAuthorize}
        onDismissError={auth.dismissAuthError}
      />
    );
  }

  if (memoryAppChoices && memoryAppChoices.length > 0) {
    return <PickMemoryScreen />;
  }

  if (!serverURL) {
    if (discoveryHint === NO_MEMORY_HINT) {
      return <ConnectScreen variant="none" queued={queued} />;
    }

    if (discoveryHint) {
      return <ConnectScreen variant="error" queued={queued} />;
    }

    return <ConnectScreen variant="searching" queued={queued} />;
  }

  if (top === "ignored") {
    return <IgnoredSitesScreen />;
  }

  if (top === "activity") {
    return <ActivityScreen queued={queued} />;
  }

  return <HomeScreen queued={queued} authError={auth.authError} />;
}

export default function App() {
  return (
    <RouterProvider>
      <AppInner />
    </RouterProvider>
  );
}

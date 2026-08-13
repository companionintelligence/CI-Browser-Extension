import { getQueuedCaptures } from "@/lib/captureQueue";

/**
 * Toolbar badge: "!" on a persisted auth failure, the retry-queue depth while
 * signed in with a backlog, empty otherwise. Self-contained (reads storage
 * itself) so callers just fire-and-forget it after anything that could change
 * auth or queue state.
 *
 * The badge API takes literal colors, not CSS variables — these are the
 * tokens' destructive (#ee3533) and phthalo (#0a6358) hexes, the only raw hex
 * in the extension outside CSS.
 */
export async function updateActionBadge(): Promise<void> {
  // MV3 exposes browser.action, MV2 (Firefox/Safari) browser.browserAction.
  const action = browser.action ?? browser.browserAction;
  if (!action?.setBadgeText) {
    return;
  }

  try {
    const stored = await browser.storage.local.get([
      "oidcLastAuthError",
      "oidcTokens",
    ]);
    const authError = (stored.oidcLastAuthError as { message?: string } | null)
      ?.message;
    const signedIn = !!stored.oidcTokens;

    if (authError) {
      await action.setBadgeBackgroundColor({ color: "#ee3533" });
      await action.setBadgeText({ text: "!" });

      return;
    }

    if (signedIn) {
      const queued = (await getQueuedCaptures()).length;
      if (queued > 0) {
        await action.setBadgeBackgroundColor({ color: "#0a6358" });
        await action.setBadgeText({
          text: queued > 99 ? "99+" : String(queued),
        });

        return;
      }
    }

    await action.setBadgeText({ text: "" });
  } catch (error) {
    console.warn("Badge update failed:", error);
  }
}

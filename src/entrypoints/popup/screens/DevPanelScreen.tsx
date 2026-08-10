import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Field, Input, Select } from "@ci/shadcn";
import { FlaskConical } from "@ci/shadcn/icons";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl } from "@/utils";
import {
  PORTAL_ENVIRONMENTS,
  CUSTOM_PORTAL_ID,
  portalEnvironmentForUrl,
} from "@/lib/portalEnvironments";
import { copy } from "../copy";
import { useCiState } from "../hooks/useCiState";
import { PopupShell } from "../components/PopupShell";
import { Banner } from "../components/Banner";

/** Hidden panel (7 title clicks / Alt+Shift+Period); reachable signed out. */
export function DevPanelScreen({ queued }: { queued: number }) {
  const dispatch = useDispatch();
  const { portalUrl, serverURL, serverURLSource, deviceId, accessToken } =
    useCiState();

  const activePreset = portalEnvironmentForUrl(portalUrl);
  const [selectedPortalId, setSelectedPortalId] = useState(
    activePreset?.id ?? CUSTOM_PORTAL_ID,
  );
  const [customPortalUrl, setCustomPortalUrl] = useState(
    activePreset ? "" : portalUrl,
  );
  const [tokenExpiry, setTokenExpiry] = useState<string | null>(null);

  useEffect(() => {
    browser.storage.local
      .get("oidcTokens")
      .then((stored) => {
        const tokens = stored.oidcTokens as { expiresAt?: number } | undefined;
        if (typeof tokens?.expiresAt === "number") {
          setTokenExpiry(new Date(tokens.expiresAt).toLocaleString());
        }
      })
      .catch(() => undefined);
  }, []);

  const applyPortalUrl = async (nextUrl: string) => {
    const normalized = normalizeServerUrl(nextUrl);

    if (!normalized || normalized === portalUrl) {
      return;
    }

    if (accessToken && !window.confirm("Switch Portal and sign out?")) {
      setSelectedPortalId(activePreset?.id ?? CUSTOM_PORTAL_ID);

      return;
    }

    if (accessToken) {
      try {
        await browser.runtime.sendMessage({ action: "SIGN_OUT" });
      } catch (error) {
        console.error("Sign-out on portal switch failed:", error);
      }
    }

    // The Memory address came from the OLD Portal's app discovery, so it means
    // nothing under the new one — and a "manual" source (any explicit pick on
    // the Choose-your-Memory screen) is never overwritten by later discovery,
    // which would silently pin the new session to the old Portal's server.
    // Same reset switchAccount performs.
    dispatch(
      setState({
        portalUrl: normalized,
        discoveryHint: null,
        serverURL: "",
        serverURLSource: null,
        memoryAppChoices: null,
      }),
    );
    dispatch(saveUserSettings());
  };

  const handlePortalSelect = (id: string) => {
    setSelectedPortalId(id);

    const preset = PORTAL_ENVIRONMENTS.find((env) => env.id === id);
    if (preset) {
      void applyPortalUrl(preset.url);
    }
  };

  return (
    <PopupShell
      title={copy.dev.title}
      back
      headerRight={
        <FlaskConical
          className="mr-1 size-4 text-muted-foreground"
          strokeWidth={1.75}
        />
      }
    >
      <Banner tone="warning">{copy.dev.warning}</Banner>

      <Field>
        <Field.Label className="text-sm">{copy.dev.portalEnv}</Field.Label>
        <Select value={selectedPortalId} onValueChange={handlePortalSelect}>
          <Select.Trigger className="w-full">
            <Select.Value placeholder={copy.dev.portalEnv} />
          </Select.Trigger>
          <Select.Content>
            {PORTAL_ENVIRONMENTS.map((env) => (
              <Select.Item key={env.id} value={env.id}>
                {env.label} — {env.url.replace(/^https?:\/\//, "")}
              </Select.Item>
            ))}
            <Select.Item value={CUSTOM_PORTAL_ID}>
              {copy.dev.custom}
            </Select.Item>
          </Select.Content>
        </Select>
        {selectedPortalId === CUSTOM_PORTAL_ID && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={customPortalUrl}
              onChange={(e) => setCustomPortalUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void applyPortalUrl(customPortalUrl);
                }
              }}
              placeholder="https://hub.example.com"
              className="flex-1"
            />
            <Button
              size="sm"
              className="h-9"
              onClick={() => void applyPortalUrl(customPortalUrl)}
            >
              {copy.settings.saveAddress}
            </Button>
          </div>
        )}
      </Field>

      <div className="space-y-1 rounded-lg border bg-card p-3 font-mono text-xs text-muted-foreground shadow-sm">
        <p className="break-all">portal: {portalUrl}</p>
        <p className="break-all">server: {serverURL || "(none)"}</p>
        <p>source: {serverURLSource ?? "(none)"}</p>
        <p className="break-all">device: {deviceId ?? "(none)"}</p>
        <p>queue: {queued}</p>
        <p>token expiry: {tokenExpiry ?? "(unknown)"}</p>
      </div>
    </PopupShell>
  );
}

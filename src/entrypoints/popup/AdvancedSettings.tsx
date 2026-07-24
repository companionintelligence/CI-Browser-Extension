import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl } from "@/utils";
import {
  PORTAL_ENVIRONMENTS,
  CUSTOM_PORTAL_ID,
  portalEnvironmentForUrl,
} from "@/lib/portalEnvironments";
import { Button, Field, Input, Select } from "@ci/shadcn";

// The two connection settings, visually twinned: which Portal to sign in
// through (normally prod; presets + free text for dev work) and where Memory
// lives (normally discovered from the Portal after sign-in; manual override
// for older portals or unusual setups).
export default function AdvancedSettings() {
  const dispatch = useDispatch();
  const { portalUrl, serverURL, serverURLSource, accessToken } = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    portalUrl: string;
    serverURL: string;
    serverURLSource: "auto" | "manual" | null;
    accessToken: string | null;
  };

  const activePreset = portalEnvironmentForUrl(portalUrl);
  const [selectedPortalId, setSelectedPortalId] = useState(
    activePreset?.id ?? CUSTOM_PORTAL_ID,
  );
  const [customPortalUrl, setCustomPortalUrl] = useState(
    activePreset ? "" : portalUrl,
  );
  const [serverUrlDraft, setServerUrlDraft] = useState(serverURL);

  useEffect(() => {
    setServerUrlDraft(serverURL);
  }, [serverURL]);

  // Switching the Portal invalidates the current session — tokens from the
  // old issuer must not be presented to the new one.
  const applyPortalUrl = async (nextUrl: string) => {
    const normalized = normalizeServerUrl(nextUrl);

    if (!normalized || normalized === portalUrl) {
      return;
    }

    if (
      accessToken &&
      !window.confirm("Switching Portal signs you out. Continue?")
    ) {
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

    dispatch(setState({ portalUrl: normalized, discoveryHint: null }));
    dispatch(saveUserSettings());
  };

  const handlePortalSelect = (id: string) => {
    setSelectedPortalId(id);

    const preset = PORTAL_ENVIRONMENTS.find((env) => env.id === id);

    if (preset) {
      applyPortalUrl(preset.url);
    }
  };

  const saveCustomPortalUrl = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    applyPortalUrl(customPortalUrl);
  };

  const saveServerUrl = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    const normalized = normalizeServerUrl(serverUrlDraft);
    setServerUrlDraft(normalized);
    dispatch(
      setState({
        serverURL: normalized,
        serverURLSource: normalized ? "manual" : null,
        discoveryHint: null,
      }),
    );
    dispatch(saveUserSettings());
  };

  return (
    <div className="flex flex-col gap-4 mt-2 p-3 rounded-lg bg-primary/5 text-left">
      <Field>
        <Field.Label className="text-[0.9em]">Portal</Field.Label>
        <Select value={selectedPortalId} onValueChange={handlePortalSelect}>
          <Select.Trigger className="w-full min-h-[36px] text-sm">
            <Select.Value placeholder="Select a Portal" />
          </Select.Trigger>
          <Select.Content>
            {PORTAL_ENVIRONMENTS.map((env) => (
              <Select.Item key={env.id} value={env.id} className="text-sm">
                {env.label} — {env.url.replace(/^https?:\/\//, "")}
              </Select.Item>
            ))}
            <Select.Item value={CUSTOM_PORTAL_ID} className="text-sm">
              Custom…
            </Select.Item>
          </Select.Content>
        </Select>
        {selectedPortalId === CUSTOM_PORTAL_ID && (
          <div className="flex items-center gap-2 mt-2">
            <Input
              value={customPortalUrl}
              onChange={(e) => setCustomPortalUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  saveCustomPortalUrl(e);
                }
              }}
              placeholder="https://hub.example.com"
              className="flex-1 min-h-[36px] text-sm"
            />
            <Button
              onClick={saveCustomPortalUrl}
              className="min-h-[36px] text-sm"
            >
              Save
            </Button>
          </div>
        )}
        <Field.Description className="text-[0.8em] text-muted-foreground">
          Where you sign in with your Companion account
        </Field.Description>
      </Field>

      <Field>
        <Field.Label className="text-[0.9em]">Memory server URL</Field.Label>
        <div className="flex items-center gap-2">
          <Input
            value={serverUrlDraft}
            onChange={(e) => setServerUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                saveServerUrl(e);
              }
            }}
            placeholder="https://memory.example.com"
            className="flex-1 min-h-[36px] text-sm"
          />
          <Button onClick={saveServerUrl} className="min-h-[36px] text-sm">
            Save
          </Button>
        </div>
        <Field.Description className="text-[0.8em] text-muted-foreground">
          {serverURLSource === "auto"
            ? "Set automatically from your Companion account"
            : "Normally set automatically from your Companion account after sign-in"}
        </Field.Description>
      </Field>
    </div>
  );
}

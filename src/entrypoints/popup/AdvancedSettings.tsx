import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl } from "@/utils";
import {
  PORTAL_ENVIRONMENTS,
  CUSTOM_PORTAL_ID,
  portalEnvironmentForUrl,
} from "@/lib/portalEnvironments";
import { Button, Field, Input, Select } from "@ci/shadcn";

/** Hidden developer panel: Portal (Hub cloud) only. */
export default function AdvancedSettings() {
  const dispatch = useDispatch();
  const { portalUrl, accessToken } = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    portalUrl: string;
    accessToken: string | null;
  };

  const activePreset = portalEnvironmentForUrl(portalUrl);
  const [selectedPortalId, setSelectedPortalId] = useState(
    activePreset?.id ?? CUSTOM_PORTAL_ID,
  );
  const [customPortalUrl, setCustomPortalUrl] = useState(
    activePreset ? "" : portalUrl,
  );

  const applyPortalUrl = async (nextUrl: string) => {
    const normalized = normalizeServerUrl(nextUrl);

    if (!normalized || normalized === portalUrl) {
      return;
    }

    if (
      accessToken &&
      !window.confirm("Switch Portal and sign out?")
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

  return (
    <div className="flex flex-col gap-3 mt-2 p-3 rounded-lg bg-primary/5 text-left">
      <p className="m-0 text-[0.7em] uppercase tracking-wide text-muted-foreground">
        Developer
      </p>
      <Field>
        <Field.Label className="text-[0.9em]">Portal</Field.Label>
        <Select value={selectedPortalId} onValueChange={handlePortalSelect}>
          <Select.Trigger className="w-full min-h-[36px] text-sm cursor-pointer">
            <Select.Value placeholder="Portal" />
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
      </Field>
    </div>
  );
}

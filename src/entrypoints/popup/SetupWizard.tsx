/**
 * First-run wizard. Picks a CI-Server environment (curated or custom),
 * probes it via `/api/health`, then writes `serverURL` +
 * `serverEnvironmentId` to the store.
 *
 * See planning/03-configurable-server.md.
 */

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Input } from "@ci/shadcn";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl } from "@/utils";
import {
  ENVIRONMENTS,
  probeServer,
  type EnvironmentId,
  type HealthResult,
} from "@/lib/environments";

interface SetupWizardProps {
  /**
   * Fires when the user finishes the wizard (either skipped or chose an env).
   * The popup shell uses this to swap back to the main view.
   */
  onComplete: () => void;
  /**
   * Lets the user bail out and finish setting up later. The popup defaults
   * to the wizard until env is set, so "Skip" effectively means "keep
   * showing me the wizard."
   */
  onSkip: () => void;
}

export default function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const dispatch = useDispatch();
  const [selectedId, setSelectedId] = useState<EnvironmentId>("prod");
  const [customUrl, setCustomUrl] = useState("");
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<HealthResult | null>(null);

  // Reset probe whenever the selection changes.
  useEffect(() => {
    setProbe(null);
  }, [selectedId, customUrl]);

  const effectiveUrl = (() => {
    if (selectedId === "custom") {
      return normalizeServerUrl(customUrl);
    }

    return ENVIRONMENTS.find((e) => e.id === selectedId)?.url ?? "";
  })();

  const canTest = effectiveUrl.length > 0 && !probing;

  const testConnection = async () => {
    if (!canTest) {
      return;
    }

    setProbing(true);
    setProbe(null);
    try {
      const result = await probeServer(effectiveUrl);
      setProbe(result);
    } finally {
      setProbing(false);
    }
  };

  const acceptUrl = () => {
    dispatch(
      setState({
        serverURL: effectiveUrl,
        serverEnvironmentId: selectedId,
      }),
    );
    dispatch(saveUserSettings());
    onComplete();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-primary text-base font-semibold m-0">
          Welcome to Companion Intelligence
        </h2>
        <p className="text-[0.9em] text-muted-foreground m-0 mt-1">
          Pick the CI-Server this extension should sync to. You can change it
          later under Settings.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="sr-only">Server environment</legend>
        {ENVIRONMENTS.map((env) => (
          <label
            key={env.id}
            className={`flex items-start gap-2 p-2 rounded border cursor-pointer ${
              selectedId === env.id
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/60"
            }`}
          >
            <input
              type="radio"
              name="environment"
              value={env.id}
              checked={selectedId === env.id}
              onChange={() => setSelectedId(env.id)}
              className="mt-1 accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">
                {env.label}
              </div>
              <div className="text-[0.8em] text-muted-foreground">
                {env.description}
              </div>
              <div className="text-[0.75em] text-muted-foreground font-mono">
                {env.url}
              </div>
            </div>
          </label>
        ))}

        <label
          className={`flex items-start gap-2 p-2 rounded border cursor-pointer ${
            selectedId === "custom"
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/60"
          }`}
        >
          <input
            type="radio"
            name="environment"
            value="custom"
            checked={selectedId === "custom"}
            onChange={() => setSelectedId("custom")}
            className="mt-1 accent-primary"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">
              Custom URL
            </div>
            <div className="text-[0.8em] text-muted-foreground">
              Self-hosted CI-Server
            </div>
            {selectedId === "custom" && (
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://myci.example.com"
                className="mt-2 w-full"
                aria-label="Custom server URL"
              />
            )}
          </div>
        </label>
      </fieldset>

      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={testConnection}
          disabled={!canTest}
          variant="outline"
          className="text-xs"
        >
          {probing ? "Testing…" : "Test connection"}
        </Button>
        <Button
          onClick={acceptUrl}
          disabled={!effectiveUrl}
          className="text-xs"
        >
          Use this server
        </Button>
        <Button onClick={onSkip} variant="outline" className="text-xs ml-auto">
          Skip for now
        </Button>
      </div>

      {probe && (
        <div
          className={`p-2 rounded text-[0.85em] border ${
            probe.ok
              ? "border-primary text-primary"
              : "border-destructive text-destructive"
          }`}
        >
          {probe.ok ? (
            <>
              ✓ Reachable in {probe.latencyMs} ms (HTTP {probe.status})
              {probe.version && ` — version ${probe.version}`}
            </>
          ) : (
            <>
              ✗ {probe.error ?? `HTTP ${probe.status}`} (in {probe.latencyMs}{" "}
              ms)
              <div className="text-[0.8em] text-muted-foreground mt-1 font-mono">
                {effectiveUrl}
              </div>
            </>
          )}
        </div>
      )}

      {selectedId === "local" && (
        <p className="text-[0.8em] text-muted-foreground m-0">
          ℹ️ Local development requires importing the nginx self-signed cert
          (see the README) before the extension can connect.
        </p>
      )}
    </div>
  );
}

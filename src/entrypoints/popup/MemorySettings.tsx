import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl } from "@/utils";
import { Button, Field, Input } from "@ci/shadcn";

/** User-facing Memory (CI-Server) URL override + Portal re-discovery. */
export default function MemorySettings({ onBack }: { onBack: () => void }) {
  const dispatch = useDispatch();
  const { serverURL, serverURLSource, accessToken } = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    serverURL: string;
    serverURLSource: "auto" | "manual" | null;
    accessToken: string | null;
  };

  const [draft, setDraft] = useState(serverURL);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(serverURL);
  }, [serverURL]);

  const save = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    const normalized = normalizeServerUrl(draft);
    setDraft(normalized);
    dispatch(
      setState({
        serverURL: normalized,
        serverURLSource: normalized ? "manual" : null,
        discoveryHint: null,
        memoryAppChoices: null,
      }),
    );
    dispatch(saveUserSettings());
    browser.runtime
      .sendMessage({ action: "CHECK_AUTH_STATUS" })
      .catch(console.error);
  };

  // Ask the Portal which Memories this account has; found choices (or the
  // "no Memory" panel) render in the main popup view, so navigate back.
  const findMyMemory = async () => {
    setFinding(true);
    setFindError(null);
    try {
      const response = await browser.runtime.sendMessage({
        action: "DISCOVER_MEMORY",
      });
      if (response && response.success === false) {
        setFindError(response.error || "Discovery failed");

        return;
      }

      onBack();
    } catch (error) {
      setFindError(error instanceof Error ? error.message : String(error));
    } finally {
      setFinding(false);
    }
  };

  const clearManual = () => {
    setDraft("");
    dispatch(
      setState({
        serverURL: "",
        serverURLSource: null,
        discoveryHint: null,
        memoryAppChoices: null,
      }),
    );
    dispatch(saveUserSettings());
  };

  return (
    <div className="flex flex-col gap-3 text-left">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs text-muted-foreground bg-transparent border-0 p-0 cursor-pointer hover:text-primary"
      >
        ← Back
      </button>
      <Field>
        <Field.Label className="text-[0.9em]">Memory URL</Field.Label>
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                save(e);
              }
            }}
            placeholder="https://memory.example.com"
            className="flex-1 min-h-[36px] text-sm"
          />
          <Button onClick={save} className="min-h-[36px] text-sm">
            Save
          </Button>
        </div>
        <Field.Description className="text-[0.75em] text-muted-foreground">
          {serverURLSource === "manual"
            ? "Manual — discovery won't overwrite"
            : "Usually set after sign-in"}
        </Field.Description>
      </Field>
      {serverURLSource === "manual" && (
        <Button
          variant="outline"
          onClick={clearManual}
          className="text-xs min-h-[36px]"
        >
          Clear manual URL
        </Button>
      )}
      {accessToken && (
        <div className="mt-1 pt-3 border-t border-border flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={findMyMemory}
            disabled={finding}
            className="text-sm min-h-[36px]"
          >
            {finding ? "Asking Portal…" : "Find my Memory"}
          </Button>
          <p className="m-0 text-[0.75em] text-muted-foreground">
            Lists the Memory apps on your account so you can pick which one this
            browser syncs with.
          </p>
          {findError && (
            <p className="m-0 text-[0.8em] text-destructive">{findError}</p>
          )}
        </div>
      )}
    </div>
  );
}

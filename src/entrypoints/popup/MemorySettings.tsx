import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl } from "@/utils";
import { Button, Field, Input } from "@ci/shadcn";

/** User-facing Memory (CI-Server) URL override. */
export default function MemorySettings({ onBack }: { onBack: () => void }) {
  const dispatch = useDispatch();
  const { serverURL, serverURLSource } = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    serverURL: string;
    serverURLSource: "auto" | "manual" | null;
  };

  const [draft, setDraft] = useState(serverURL);

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
    </div>
  );
}

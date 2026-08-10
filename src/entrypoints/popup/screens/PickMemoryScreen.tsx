import { useState } from "react";
import { useDispatch } from "react-redux";
import { Badge, Button, Spinner, useToast } from "@ci/shadcn";
import { ChevronRight, Database } from "@ci/shadcn/icons";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { parseUrl } from "@/utils";
import { copy } from "../copy";
import { useCiState } from "../hooks/useCiState";
import { PopupShell } from "../components/PopupShell";
import { StepDots } from "../components/StepDots";

type Choice = {
  slug: string;
  url: string;
  deviceName?: string;
  deviceSlug?: string;
};

const choiceTitle = (choice: Choice) =>
  choice.deviceName ??
  choice.deviceSlug ??
  parseUrl(choice.url)?.host ??
  choice.url;

/**
 * Full-screen takeover whenever memoryAppChoices is non-empty — never stacked
 * on top of the dashboard. Single-choice rediscovery renders the same screen
 * with one row.
 */
export function PickMemoryScreen() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { memoryAppChoices, serverURL } = useCiState();
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  const choices = [...(memoryAppChoices ?? [])].sort((a, b) => {
    if (a.url === serverURL) {
      return -1;
    }

    if (b.url === serverURL) {
      return 1;
    }

    return choiceTitle(a).localeCompare(choiceTitle(b));
  });

  // An explicit user choice is saved as "manual" so later discoveries never
  // silently switch it.
  const choose = (choice: Choice) => {
    setSavingUrl(choice.url);
    try {
      dispatch(
        setState({
          serverURL: choice.url,
          serverURLSource: "manual",
          memoryAppChoices: null,
          discoveryHint: null,
        }),
      );
      dispatch(saveUserSettings());
      browser.runtime
        .sendMessage({ action: "CHECK_AUTH_STATUS" })
        .catch(console.error);
      toast(copy.pick.connected(parseUrl(choice.url)?.host ?? choice.url));
    } catch {
      setSavingUrl(null);
      toast.error(copy.pick.failed);
    }
  };

  const keepCurrent = () => {
    dispatch(setState({ memoryAppChoices: null }));
  };

  const currentHost = serverURL
    ? (parseUrl(serverURL)?.host ?? serverURL)
    : null;

  return (
    <PopupShell
      title={copy.app.title}
      status="warn"
      footer={
        currentHost ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={keepCurrent}
          >
            <span className="truncate">{copy.pick.keep(currentHost)}</span>
          </Button>
        ) : undefined
      }
      bodyClassName="min-h-[360px]"
    >
      <h2 className="text-lg leading-tight font-semibold">{copy.pick.title}</h2>
      <p className="text-xs text-muted-foreground">{copy.pick.body}</p>

      <div className="flex flex-col gap-2">
        {choices.map((choice) => {
          const isCurrent = choice.url === serverURL;
          const host = parseUrl(choice.url)?.host ?? choice.url;

          return (
            <Button
              key={choice.url}
              variant="outline"
              onClick={() => choose(choice)}
              disabled={savingUrl !== null}
              className="h-auto w-full justify-start gap-3 overflow-hidden px-3 py-2.5 text-left"
            >
              {savingUrl === choice.url ? (
                <Spinner className="size-4 shrink-0 text-primary" />
              ) : (
                <Database
                  className="size-4 shrink-0 text-primary"
                  strokeWidth={1.75}
                />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-sm leading-snug font-medium"
                  title={choiceTitle(choice)}
                >
                  {choiceTitle(choice)}
                </span>
                <span
                  className="block truncate text-xs leading-snug text-muted-foreground"
                  title={choice.url}
                >
                  {host}
                </span>
              </span>
              {isCurrent ? (
                <Badge variant="secondary">{copy.pick.current}</Badge>
              ) : (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                />
              )}
            </Button>
          );
        })}
      </div>

      <StepDots step={2} />
    </PopupShell>
  );
}

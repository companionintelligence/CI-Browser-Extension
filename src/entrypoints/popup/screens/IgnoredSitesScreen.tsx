import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Field, Input, Tabs, Tooltip, useToast } from "@ci/shadcn";
import { Plus, Trash2 } from "@ci/shadcn/icons";
import {
  addSiteBlacklist,
  removeSiteBlacklist,
  addPageBlacklist,
  removePageBlacklist,
  saveUserSettings,
} from "@/store/ciStateSlice";
import { parseUrl, siteRegex } from "@/utils";
import { copy } from "../copy";
import {
  escapeRegex,
  isCapturableUrl,
  urlWithoutHash,
} from "../lib/formatters";
import { useCiState } from "../hooks/useCiState";
import { PopupShell } from "../components/PopupShell";

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function EntryList({
  entries,
  onRemove,
}: {
  entries: string[];
  onRemove: (entry: string) => void;
}) {
  return (
    <ul>
      {entries.map((entry) => (
        <li
          key={entry}
          className="flex min-h-10 items-center gap-2 rounded-md px-2 hover:bg-accent/40"
        >
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs"
            title={entry}
          >
            {entry}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copy.ignored.removeLabel(entry)}
            className="text-destructive hover:text-destructive"
            onClick={() => onRemove(entry)}
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Replaces BlacklistManager (and its 369-line CSS file) with stock components. */
export function IgnoredSitesScreen() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { siteBlacklist, pageBlacklist } = useCiState();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"sites" | "pages">("sites");
  const [tabUrl, setTabUrl] = useState<string | null>(null);

  useEffect(() => {
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setTabUrl(tabs[0]?.url ?? null))
      .catch(() => setTabUrl(null));
  }, []);

  const entries = tab === "sites" ? siteBlacklist : pageBlacklist;
  const capturable = isCapturableUrl(tabUrl);
  const currentHostname = capturable
    ? (parseUrl(tabUrl!)?.hostname ?? null)
    : null;
  const currentPage = capturable ? urlWithoutHash(tabUrl!) : null;

  const currentAlready =
    tab === "sites"
      ? !!currentHostname &&
        (siteBlacklist.includes(currentHostname) ||
          siteBlacklist.includes(escapeRegex(currentHostname)))
      : !!currentPage && pageBlacklist.includes(currentPage);

  const persist = () => dispatch(saveUserSettings());

  // Quick-adds escape what they insert; hand-typed input is stored verbatim
  // (entries match as patterns — see isUrlBlacklisted).
  const addCurrent = () => {
    if (tab === "sites" && currentHostname) {
      dispatch(addSiteBlacklist(escapeRegex(currentHostname)));
      persist();
      toast(copy.site.ignoredToast(currentHostname));
    } else if (tab === "pages" && currentPage) {
      dispatch(addPageBlacklist(currentPage));
      persist();
      toast(copy.site.ignoredToast(currentPage));
    }
  };

  const addDraft = () => {
    const value = draft.trim();
    if (!value) {
      return;
    }

    if (entries.includes(value)) {
      setError(copy.ignored.duplicate);

      return;
    }

    if (tab === "sites") {
      try {
        new RegExp(value);
      } catch {
        setError(copy.ignored.invalid);

        return;
      }

      dispatch(addSiteBlacklist(value));
    } else {
      if (!siteRegex.test(value)) {
        setError(copy.ignored.invalid);

        return;
      }

      dispatch(addPageBlacklist(value));
    }

    persist();
    setError(null);
    setDraft("");
  };

  const remove = (entry: string) => {
    dispatch(
      tab === "sites" ? removeSiteBlacklist(entry) : removePageBlacklist(entry),
    );
    persist();
    toast(copy.ignored.removed);
  };

  const addCurrentDisabled = !capturable || currentAlready;

  return (
    <PopupShell title={copy.ignored.title} back>
      <p className="text-xs text-muted-foreground">{copy.ignored.lead}</p>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as "sites" | "pages");
          setDraft("");
          setError(null);
        }}
      >
        <Tabs.List className="w-full">
          <Tabs.Trigger value="sites" className="flex-1">
            {copy.ignored.tabSites(siteBlacklist.length)}
          </Tabs.Trigger>
          <Tabs.Trigger value="pages" className="flex-1">
            {copy.ignored.tabPages(pageBlacklist.length)}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>

      <Tooltip>
        <Tooltip.Trigger asChild>
          <span className="block w-full">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={addCurrentDisabled}
              onClick={addCurrent}
            >
              <Plus className="size-4" strokeWidth={1.75} />
              {tab === "sites" ? copy.ignored.addSite : copy.ignored.addPage}
            </Button>
          </span>
        </Tooltip.Trigger>
        {addCurrentDisabled && (
          <Tooltip.Content>
            {currentAlready ? copy.ignored.already : copy.ignored.cantIgnore}
          </Tooltip.Content>
        )}
      </Tooltip>

      <Field>
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addDraft();
              }
            }}
            placeholder={
              tab === "sites"
                ? copy.ignored.placeholder
                : copy.manual.placeholder
            }
            aria-label={copy.common.add}
            aria-invalid={!!error || undefined}
            className="flex-1"
          />
          <Button
            size="icon"
            variant="outline"
            aria-label={copy.common.add}
            onClick={addDraft}
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
        {error ? (
          <Field.Error className="text-xs">{error}</Field.Error>
        ) : (
          tab === "sites" && (
            <Field.Description className="text-xxs">
              {copy.ignored.patternHelp}
            </Field.Description>
          )
        )}
      </Field>

      <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/85 py-1.5 backdrop-blur-sm">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {copy.ignored.title}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {entries.length}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {entries.length === 0 ? (
        tab === "sites" ? (
          <EmptyState
            title={copy.ignored.emptySites}
            sub={copy.ignored.emptySitesSub}
          />
        ) : (
          <EmptyState
            title={copy.ignored.emptyPages}
            sub={copy.ignored.emptyPagesSub}
          />
        )
      ) : (
        <EntryList entries={entries} onRemove={remove} />
      )}
    </PopupShell>
  );
}

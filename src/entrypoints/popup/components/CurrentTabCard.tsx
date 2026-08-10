import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Badge, Button, DropdownMenu, Tooltip, useToast } from "@ci/shadcn";
import { EllipsisVertical, EyeOff } from "@ci/shadcn/icons";
import {
  addSiteBlacklist,
  removeSiteBlacklist,
  addPageBlacklist,
  saveUserSettings,
} from "@/store/ciStateSlice";
import { isUrlBlacklisted, parseUrl } from "@/utils";
import { profileForDomain } from "@/scrape/profiles";
import { copy } from "../copy";
import { useRouter } from "../routes";
import {
  escapeRegex,
  isCapturableUrl,
  isExactHostEntry,
  urlWithoutHash,
} from "../lib/formatters";
import { useCiState } from "../hooks/useCiState";
import { SectionCard } from "./SectionCard";
import { StatusDot, type DotTone } from "./StatusDot";

/**
 * Live status for the active tab: capturing / ignored / paused / can't
 * capture. The card never disappears — no layout jump between states.
 */
export function CurrentTabCard() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { push } = useRouter();
  const { siteBlacklist, pageBlacklist, historySyncEnabled } = useCiState();
  const [tabUrl, setTabUrl] = useState<string | null>(null);

  useEffect(() => {
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setTabUrl(tabs[0]?.url ?? null))
      .catch(() => setTabUrl(null));
  }, []);

  const capturable = isCapturableUrl(tabUrl);
  const hostname = capturable ? (parseUrl(tabUrl!)?.hostname ?? null) : null;
  const ignored =
    capturable && isUrlBlacklisted(tabUrl!, siteBlacklist, pageBlacklist);
  const enhanced = capturable && !!profileForDomain(tabUrl!);

  let tone: DotTone;
  let sub: string;
  if (!capturable) {
    tone = "off";
    sub = copy.site.cantCapture;
  } else if (ignored) {
    tone = "off";
    sub = copy.site.ignored;
  } else if (!historySyncEnabled) {
    tone = "warn";
    sub = copy.site.paused;
  } else {
    tone = "ok";
    sub = copy.site.capturing;
  }

  const ignoreSite = () => {
    if (!hostname) {
      return;
    }

    const entry = escapeRegex(hostname);
    dispatch(addSiteBlacklist(entry));
    dispatch(saveUserSettings());
    toast(copy.site.ignoredToast(hostname), {
      action: {
        label: copy.site.undo,
        onClick: () => {
          dispatch(removeSiteBlacklist(entry));
          dispatch(saveUserSettings());
        },
      },
    });
  };

  // Pattern-aware: only an entry that is exactly this hostname is removable
  // in one tap; a broader pattern must be managed in Ignored sites.
  const stopIgnoring = () => {
    if (!hostname) {
      return;
    }

    const exact = siteBlacklist.filter((entry) =>
      isExactHostEntry(entry, hostname),
    );
    if (exact.length > 0) {
      for (const entry of exact) {
        dispatch(removeSiteBlacklist(entry));
      }

      dispatch(saveUserSettings());
    } else {
      toast(copy.site.patternToast, {
        action: { label: copy.site.view, onClick: () => push("ignored") },
      });
    }
  };

  const ignorePage = () => {
    if (!tabUrl) {
      return;
    }

    const stripped = urlWithoutHash(tabUrl);
    if (!stripped) {
      return;
    }

    dispatch(addPageBlacklist(stripped));
    dispatch(saveUserSettings());
    toast(copy.site.ignoredToast(stripped));
  };

  return (
    <SectionCard kicker={copy.home.kickerSite}>
      <div className="flex min-w-0 items-center gap-2">
        <StatusDot tone={tone} />
        <span
          className="min-w-0 truncate text-sm font-medium"
          title={tabUrl ?? undefined}
        >
          {capturable ? hostname : copy.site.cantCaptureTitle}
        </span>
        {enhanced && (
          <Tooltip>
            <Tooltip.Trigger asChild>
              <Badge variant="secondary">{copy.site.enhanced}</Badge>
            </Tooltip.Trigger>
            <Tooltip.Content className="max-w-[240px]">
              {copy.site.enhancedTip}
            </Tooltip.Content>
          </Tooltip>
        )}
        <span className="flex-1" />
        {capturable && ignored && (
          <Button variant="outline" size="sm" onClick={stopIgnoring}>
            {copy.site.stopIgnoring}
          </Button>
        )}
        {capturable && !ignored && (
          <>
            <Tooltip>
              <Tooltip.Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy.site.ignoreSite}
                  onClick={ignoreSite}
                >
                  <EyeOff className="size-4" strokeWidth={1.75} />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>{copy.site.ignoreSite}</Tooltip.Content>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy.site.more}
                >
                  <EllipsisVertical className="size-4" strokeWidth={1.75} />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item onClick={ignorePage}>
                  {copy.site.ignorePage}
                </DropdownMenu.Item>
                <DropdownMenu.Item onClick={() => push("ignored")}>
                  {copy.site.openIgnored}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </>
        )}
      </div>
      <p className="mt-1 ml-4 truncate text-xs text-muted-foreground">{sub}</p>
    </SectionCard>
  );
}

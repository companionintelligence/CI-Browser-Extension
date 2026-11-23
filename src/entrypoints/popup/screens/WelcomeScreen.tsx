import { useEffect, useState } from "react";
import { Button, Tooltip } from "@ci/shadcn";
import {
  Bookmark,
  Clock3,
  LogIn,
  Settings,
  ShieldCheck,
} from "@ci/shadcn/icons";
import logo from "@/assets/logo.png";
import { shouldUseTabAuthFlow } from "@/services/oidcAuth";
import { hasBookmarksApi, hasDownloadsApi } from "@/lib/browserCapabilities";
import { isErrorReportingEnabled } from "@/lib/telemetry/userSetting";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { useCiState } from "../hooks/useCiState";
import { friendlyError } from "../lib/friendlyErrors";
import { ERROR_REPORTING_COMPILED_IN } from "../lib/errorReporting";
import { PopupShell } from "../components/PopupShell";
import { BrandButton } from "../components/BrandButton";
import { Banner } from "../components/Banner";
import { StepDots } from "../components/StepDots";

const BOOKMARKS_BULLET = hasBookmarksApi() || hasDownloadsApi();

export function WelcomeScreen({
  authorizing,
  authError,
  onAuthorize,
  onCancel,
  onDismissError,
}: {
  authorizing: boolean;
  authError: string | null;
  onAuthorize: () => void;
  onCancel: () => void;
  onDismissError: () => void;
}) {
  const { push } = useRouter();
  const { portalUrl } = useCiState();
  // The raw error sits behind "Show details". Keying the open state to the
  // error text means every new error starts collapsed.
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const detailsOpen = authError !== null && detailsFor === authError;
  // Stays null in builds without error reporting, and until the switch is read.
  const [reportsOn, setReportsOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ERROR_REPORTING_COMPILED_IN) {
      return;
    }

    let active = true;
    void isErrorReportingEnabled().then((value) => {
      if (active) {
        setReportsOn(value);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <PopupShell
      title={copy.app.title}
      status={authError ? "err" : authorizing ? "busy" : undefined}
      // Onboarding carries no footer chrome: the version belongs in Settings
      // (which prints it at the bottom), and Settings is reached by the same
      // header gear Home uses rather than a footer link.
      headerRight={
        <Tooltip>
          <Tooltip.Trigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.welcome.privacyLink}
              onClick={() => push("settings")}
            >
              <Settings className="size-4" strokeWidth={1.75} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{copy.welcome.privacyLink}</Tooltip.Content>
        </Tooltip>
      }
      bodyClassName="flex min-h-[360px] flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <img
        src={logo}
        alt=""
        className="size-14 rounded-xl shadow-sm"
        draggable={false}
      />

      {authorizing ? (
        <>
          <h2 className="text-lg leading-tight font-semibold">
            {copy.auth.finishing}
          </h2>
          <p className="max-w-[260px] text-sm text-muted-foreground">
            {shouldUseTabAuthFlow()
              ? copy.auth.helperSafari
              : copy.auth.helperWindow}
          </p>
          <BrandButton loading disabled className="h-10 w-full">
            {copy.auth.waiting}
          </BrandButton>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={onCancel}
          >
            {copy.common.cancel}
          </Button>
        </>
      ) : (
        <>
          <h2 className="text-lg leading-tight font-semibold">
            {copy.welcome.headline}
          </h2>
          <p className="max-w-[260px] text-sm text-muted-foreground">
            {copy.welcome.body}
          </p>

          <ul className="mt-1 w-full max-w-[260px] space-y-2 text-left">
            <li className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <Clock3
                className="mt-px size-4 shrink-0 text-primary"
                strokeWidth={1.75}
              />
              {copy.welcome.bulletPages}
            </li>
            {BOOKMARKS_BULLET && (
              <li className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <Bookmark
                  className="mt-px size-4 shrink-0 text-primary"
                  strokeWidth={1.75}
                />
                {copy.welcome.bulletBookmarks}
              </li>
            )}
            <li className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <ShieldCheck
                className="mt-px size-4 shrink-0 text-primary"
                strokeWidth={1.75}
              />
              {copy.welcome.bulletPrivacy}
            </li>
          </ul>

          <p className="max-w-[280px] text-xs text-muted-foreground">
            {copy.welcome.needs}
          </p>

          {authError && (
            <Banner
              tone="destructive"
              onDismiss={onDismissError}
              className="w-full"
            >
              <p className="font-semibold">{copy.auth.errorTitle}</p>
              <p className="text-muted-foreground">
                {friendlyError(authError)}
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-destructive"
                aria-expanded={detailsOpen}
                onClick={() => setDetailsFor(detailsOpen ? null : authError)}
              >
                {detailsOpen
                  ? copy.welcome.hideDetails
                  : copy.welcome.showDetails}
              </Button>
              {detailsOpen && (
                <p className="mt-0.5 font-mono text-xxs break-all text-muted-foreground">
                  {authError}
                </p>
              )}
            </Banner>
          )}

          <BrandButton className="h-10 w-full" onClick={onAuthorize}>
            <LogIn className="size-4" strokeWidth={1.75} />
            {authError ? copy.welcome.ctaRetry : copy.welcome.cta}
          </BrandButton>
          <p className="text-xs text-muted-foreground">{copy.welcome.helper}</p>

          <div className="flex flex-wrap items-center justify-center gap-x-1">
            <Button
              variant="link"
              size="sm"
              className="px-2 text-xs text-muted-foreground"
              onClick={() => window.open(portalUrl, "_blank")}
            >
              {copy.welcome.createAccount}
            </Button>
            <Button
              variant="link"
              size="sm"
              className="px-2 text-xs text-muted-foreground"
              onClick={() => push("memory")}
            >
              {copy.memoryAddress.ownMemory}
            </Button>
          </div>

          {reportsOn !== null && (
            <p className="max-w-[280px] text-xs text-muted-foreground">
              {reportsOn ? copy.welcome.reportsOn : copy.welcome.reportsOff}{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 align-baseline text-xs text-muted-foreground"
                onClick={() => push("settings")}
              >
                {copy.welcome.privacyLink}
              </Button>
            </p>
          )}
        </>
      )}

      <StepDots step={1} />
    </PopupShell>
  );
}

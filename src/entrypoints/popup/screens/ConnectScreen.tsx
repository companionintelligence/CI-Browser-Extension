import { useEffect, useRef, useState } from "react";
import { Button, Spinner, Tooltip } from "@ci/shadcn";
import { CloudUpload, ExternalLink, SearchX, Settings } from "@ci/shadcn/icons";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { useCiState } from "../hooks/useCiState";
import { useDiscovery } from "../hooks/useDiscovery";
import { PopupShell } from "../components/PopupShell";
import { BrandButton } from "../components/BrandButton";
import { Banner } from "../components/Banner";
import { StepDots } from "../components/StepDots";

/** Quiet re-checks closer together than this count as one, so open + focus is one call. */
const QUIET_RECHECK_GAP_MS = 3_000;

export function ConnectScreen({
  variant,
  queued,
}: {
  variant: "searching" | "none" | "error";
  queued: number;
}) {
  const { push } = useRouter();
  const { portalUrl, discoveryHint } = useCiState();
  const { discovering, recheck } = useDiscovery();
  const [searchTimedOut, setSearchTimedOut] = useState(false);
  const lastQuietCheck = useRef(0);

  // Discovery can return silently with no hint (e.g. a dead refresh token) —
  // never leave the user on an actionless spinner forever.
  useEffect(() => {
    if (variant !== "searching") {
      setSearchTimedOut(false);

      return;
    }

    const timer = setTimeout(() => setSearchTimedOut(true), 10_000);

    return () => clearTimeout(timer);
  }, [variant]);

  // A Memory installed in another tab appears here without a button press:
  // re-check quietly when the popup opens and whenever it regains focus.
  useEffect(() => {
    if (variant !== "none") {
      return;
    }

    const checkQuietly = () => {
      const now = Date.now();
      if (now - lastQuietCheck.current < QUIET_RECHECK_GAP_MS) {
        return;
      }

      lastQuietCheck.current = now;
      void recheck({ quiet: true });
    };

    checkQuietly();
    window.addEventListener("focus", checkQuietly);

    return () => window.removeEventListener("focus", checkQuietly);
  }, [variant, recheck]);

  const busy = (variant === "searching" && !searchTimedOut) || discovering;
  // A timed-out search renders the actions block with an explanatory banner,
  // exactly like a discovery error.
  const showErrorBanner =
    (variant === "error" && !!discoveryHint) ||
    (variant === "searching" && searchTimedOut);

  // "none" leads with the next step, which is in CI-Portal; "error" leads with
  // a retry, because the Portal could not be reached at all.
  const portalFirst = variant === "none";
  const openPortalButton = portalFirst ? (
    <BrandButton
      className="w-full"
      onClick={() => window.open(portalUrl, "_blank")}
    >
      {copy.connect.openPortal}
      <ExternalLink className="size-4" strokeWidth={1.75} />
    </BrandButton>
  ) : (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => window.open(portalUrl, "_blank")}
    >
      {copy.connect.openPortal}
      <ExternalLink className="size-4" strokeWidth={1.75} />
    </Button>
  );
  const checkButton = portalFirst ? (
    <Button variant="outline" className="w-full" onClick={() => void recheck()}>
      {copy.connect.check}
    </Button>
  ) : (
    <BrandButton className="w-full" onClick={() => void recheck()}>
      {copy.connect.check}
    </BrandButton>
  );

  return (
    <PopupShell
      title={copy.app.title}
      status="warn"
      headerRight={
        <Tooltip>
          <Tooltip.Trigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={copy.home.settingsLabel}
              onClick={() => push("settings")}
            >
              <Settings className="size-4" strokeWidth={1.75} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{copy.home.settingsLabel}</Tooltip.Content>
        </Tooltip>
      }
      footer={
        queued > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CloudUpload className="size-3.5 shrink-0" strokeWidth={1.75} />
            {copy.connect.queueFooter(queued)}
          </p>
        ) : undefined
      }
      bodyClassName="flex min-h-[360px] flex-col items-center justify-center gap-3 px-4 text-center"
    >
      {busy ? (
        <>
          <Spinner className="size-6 text-primary" />
          <p className="text-sm font-medium">{copy.connect.searching}</p>
          <p className="text-xs text-muted-foreground">
            {copy.connect.searchingSub}
          </p>
        </>
      ) : (
        <>
          <span className="grid size-16 place-items-center rounded-full bg-muted">
            <SearchX
              className="size-7 text-muted-foreground"
              strokeWidth={1.75}
            />
          </span>
          <p className="text-sm font-semibold">
            {portalFirst ? copy.connect.noneTitle : copy.connect.errorHeading}
          </p>

          {portalFirst && (
            <>
              <p className="max-w-[260px] text-xs text-muted-foreground">
                {copy.connect.noneBody}
              </p>
              <ol className="w-full max-w-[260px] list-decimal space-y-1.5 pl-4 text-left text-xs text-muted-foreground">
                {copy.connect.noneSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </>
          )}

          {showErrorBanner && (
            <Banner tone="warning" className="w-full">
              <p>{copy.connect.errorTitle}</p>
              {discoveryHint && (
                <p className="mt-0.5 text-xxs text-muted-foreground">
                  {discoveryHint}
                </p>
              )}
            </Banner>
          )}

          <div className="flex w-full flex-col gap-2">
            {portalFirst ? openPortalButton : checkButton}
            {portalFirst ? checkButton : openPortalButton}
          </div>

          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground"
            onClick={() => push("memory")}
          >
            {copy.memoryAddress.ownMemory}
          </Button>
        </>
      )}

      <StepDots step={2} />
    </PopupShell>
  );
}

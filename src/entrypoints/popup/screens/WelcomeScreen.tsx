import { Button } from "@ci/shadcn";
import { Bookmark, Clock3, LogIn, ShieldCheck } from "@ci/shadcn/icons";
import logo from "@/assets/logo.png";
import { shouldUseTabAuthFlow } from "@/services/oidcAuth";
import { hasBookmarksApi, hasDownloadsApi } from "@/lib/browserCapabilities";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { friendlyError } from "../lib/friendlyErrors";
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

  return (
    <PopupShell
      title={copy.app.title}
      status={authError ? "err" : authorizing ? "busy" : undefined}
      footer={
        <div className="flex items-center justify-between">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => push("settings")}
          >
            {copy.welcome.privacyLink}
          </Button>
          <span className="text-xxs text-muted-foreground">
            v{browser.runtime.getManifest().version}
          </span>
        </div>
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
              <p
                className="mt-0.5 line-clamp-3 font-mono text-xxs break-all text-muted-foreground"
                title={authError}
              >
                {authError}
              </p>
            </Banner>
          )}

          <BrandButton className="h-10 w-full" onClick={onAuthorize}>
            <LogIn className="size-4" strokeWidth={1.75} />
            {authError ? copy.welcome.ctaRetry : copy.welcome.cta}
          </BrandButton>
          <p className="text-xs text-muted-foreground">{copy.welcome.helper}</p>
        </>
      )}

      <StepDots step={1} />
    </PopupShell>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { useDispatch } from "react-redux";
import { useTheme } from "next-themes";
import {
  Badge,
  Button,
  Field,
  Input,
  LoadingButton,
  ToggleGroup,
  useToast,
} from "@ci/shadcn";
import {
  ArrowRightLeft,
  Database,
  EyeOff,
  LogOut,
  Monitor,
  Moon,
  Sun,
} from "@ci/shadcn/icons";
import {
  setState,
  saveUserSettings,
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
} from "@/store/ciStateSlice";
import { normalizeServerUrl, parseUrl } from "@/utils";
import {
  hasBookmarksApi,
  hasDownloadsApi,
  hasHistoryApi,
} from "@/lib/browserCapabilities";
import { NO_MEMORY_HINT } from "@/services/portalApps";
import { BUILD_TELEMETRY_ENV } from "@/lib/telemetry/buildEnv";
import { resolveTelemetrySettings } from "@/lib/telemetry/settings";
import {
  isErrorReportingEnabled,
  setErrorReportingEnabled,
  watchErrorReporting,
} from "@/lib/telemetry/userSetting";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { hostFromUrl, relativeTime } from "../lib/formatters";
import { useCiState } from "../hooks/useCiState";
import { useDiscovery } from "../hooks/useDiscovery";
import type { useAuth } from "../hooks/useAuth";
import { PopupShell } from "../components/PopupShell";
import { SectionRule } from "../components/SectionRule";
import { SettingRow } from "../components/SettingRow";
import { RowLink } from "../components/RowLink";
import { Banner } from "../components/Banner";

const HISTORY_API = hasHistoryApi();
const BOOKMARKS_API = hasBookmarksApi();
const DOWNLOADS_API = hasDownloadsApi();

// Whether this build ships error reporting at all (independent of the user's
// toggle) — a DSN-less build renders no telemetry switch and, signed out, no
// PRIVACY section around it.
const TELEMETRY_COMPILED_IN = resolveTelemetrySettings(BUILD_TELEMETRY_ENV, {
  component: "popup",
  userEnabled: true,
}).enabled;

function syncedDescription(base: string, rel: string | null): string {
  return `${base} · ${rel ? copy.settings.lastSynced(rel) : copy.settings.neverSynced}`;
}

/**
 * The error-reporting kill switch. A Sentry DSN compiled into a published
 * extension cannot be revoked — this setting is the only real control, so it
 * must stay reachable when signed out (Welcome → "Privacy & settings").
 * Rendered only when the installed build has reporting compiled in.
 */
function TelemetryRow() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void isErrorReportingEnabled().then((value) => {
      if (active) {
        setEnabled(value);
        setLoaded(true);
      }
    });

    const stop = watchErrorReporting((value) => {
      if (active) {
        setEnabled(value);
      }
    });

    return () => {
      active = false;
      stop();
    };
  }, []);

  if (!TELEMETRY_COMPILED_IN) {
    return null;
  }

  return (
    <SettingRow
      id="error-reporting-enabled"
      title={copy.settings.telemetry}
      description={copy.settings.telemetrySub}
      checked={enabled}
      disabled={!loaded}
      onCheckedChange={(checked) => {
        setEnabled(checked);
        void setErrorReportingEnabled(checked);
      }}
    />
  );
}

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <SectionRule label={copy.settings.kickerAppearance} />
      <ToggleGroup
        type="single"
        value={theme ?? "system"}
        onValueChange={(value: string) => {
          if (value) {
            setTheme(value);
          }
        }}
        className="w-full"
      >
        <ToggleGroup.Item value="light" className="h-8 flex-1 gap-1.5 text-xs">
          <Sun className="size-4" strokeWidth={1.75} />
          {copy.settings.themeLight}
        </ToggleGroup.Item>
        <ToggleGroup.Item value="dark" className="h-8 flex-1 gap-1.5 text-xs">
          <Moon className="size-4" strokeWidth={1.75} />
          {copy.settings.themeDark}
        </ToggleGroup.Item>
        <ToggleGroup.Item value="system" className="h-8 flex-1 gap-1.5 text-xs">
          <Monitor className="size-4" strokeWidth={1.75} />
          {copy.settings.themeSystem}
        </ToggleGroup.Item>
      </ToggleGroup>
    </>
  );
}

function MemorySection({ signedIn }: { signedIn: boolean }) {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { pop } = useRouter();
  const { serverURL, serverURLSource, discoveryHint } = useCiState();
  const { discovering, recheck } = useDiscovery();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(serverURL);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(serverURL);
  }, [serverURL]);

  const host = hostFromUrl(serverURL);

  const save = () => {
    const normalized = normalizeServerUrl(draft);
    if (normalized && !parseUrl(normalized)) {
      setInvalid(true);

      return;
    }

    setInvalid(false);
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
    toast(copy.settings.addressSaved);
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

  // Returned choices render as the Pick Memory takeover, which sits BELOW the
  // settings route in the resolver — pop back so the user actually sees it.
  const find = async () => {
    const found = await recheck();
    if (found > 0) {
      pop();
    }
  };

  return (
    <>
      <SectionRule label={copy.settings.kickerMemory} />
      {discoveryHint && discoveryHint !== NO_MEMORY_HINT && (
        <Banner tone="warning">{discoveryHint}</Banner>
      )}
      <RowLink
        icon={Database}
        title={host ?? copy.settings.memoryNone}
        titleAttr={serverURL || undefined}
        sub={copy.settings.memorySub}
        trailing={
          serverURL ? (
            <Badge variant="outline">
              {serverURLSource === "manual"
                ? copy.settings.memoryManual
                : copy.settings.memoryAuto}
            </Badge>
          ) : undefined
        }
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="space-y-2 px-2 pb-2">
          <Field>
            <Field.Label htmlFor="settings-memory-address" className="text-sm">
              {copy.manual.label}
            </Field.Label>
            <div className="flex items-center gap-2">
              <Input
                id="settings-memory-address"
                inputMode="url"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    save();
                  }
                }}
                placeholder={copy.manual.placeholder}
                aria-invalid={invalid || undefined}
                className="flex-1"
              />
              <Button size="sm" className="h-9" onClick={save}>
                {copy.settings.saveAddress}
              </Button>
            </div>
            {invalid && (
              <Field.Error className="text-xs">
                {copy.manual.invalid}
              </Field.Error>
            )}
          </Field>
          {serverURLSource === "manual" && (
            <>
              <p className="text-xs text-muted-foreground">
                {copy.settings.manualNote}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={clearManual}
              >
                {copy.settings.clearManual}
              </Button>
            </>
          )}
          {signedIn && (
            <LoadingButton
              variant="outline"
              size="sm"
              className="w-full"
              loading={discovering}
              onClick={find}
            >
              {discovering ? copy.settings.finding : copy.settings.find}
            </LoadingButton>
          )}
        </div>
      )}
    </>
  );
}

export function SettingsScreen({
  auth,
}: {
  auth: Pick<ReturnType<typeof useAuth>, "signOut" | "switchAccount">;
}) {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { push, reset } = useRouter();
  const {
    accessToken,
    portalUrl,
    lastHistorySync,
    historySyncEnabled,
    bookmarkSyncEnabled,
    downloadSyncEnabled,
    autoSyncEnabled,
    siteBlacklist,
    pageBlacklist,
  } = useCiState();

  const signedIn = !!accessToken;
  const [switching, setSwitching] = useState(false);
  const [lastSyncTimes, setLastSyncTimes] = useState<{
    bookmarks: number | null;
    downloads: number | null;
  }>({ bookmarks: null, downloads: null });

  // Stored on every bookmark/download sync but never previously displayed.
  useEffect(() => {
    browser.storage.local
      .get(["lastBookmarkSync", "lastDownloadSync"])
      .then((stored) => {
        setLastSyncTimes({
          bookmarks:
            typeof stored.lastBookmarkSync === "number"
              ? stored.lastBookmarkSync
              : null,
          downloads:
            typeof stored.lastDownloadSync === "number"
              ? stored.lastDownloadSync
              : null,
        });
      })
      .catch(() => undefined);
  }, []);

  const toggle = (action: () => { type: string }) => () => {
    dispatch(action());
    dispatch(saveUserSettings());
  };

  const signOut = async () => {
    await auth.signOut();
    // Land on Welcome rather than the signed-out Settings variant — that
    // variant exists for Welcome's gear, not as a post-sign-out destination.
    reset();
    toast(copy.settings.signedOut);
  };

  const switchAccount = async () => {
    setSwitching(true);
    reset();
    await auth.switchAccount();
  };

  let body: ReactNode;
  if (signedIn) {
    body = (
      <>
        <SectionRule label={copy.settings.kickerSaved} />
        {HISTORY_API && (
          <SettingRow
            id="history-sync-enabled"
            title={copy.settings.history}
            description={syncedDescription(
              copy.settings.historySub,
              relativeTime(lastHistorySync),
            )}
            checked={historySyncEnabled}
            onCheckedChange={toggle(toggleHistorySync)}
          />
        )}
        {BOOKMARKS_API && (
          <SettingRow
            id="bookmark-sync-enabled"
            title={copy.settings.bookmarks}
            description={syncedDescription(
              copy.settings.bookmarksSub,
              relativeTime(lastSyncTimes.bookmarks),
            )}
            checked={bookmarkSyncEnabled}
            onCheckedChange={toggle(toggleBookmarkSync)}
          />
        )}
        {DOWNLOADS_API && (
          <SettingRow
            id="download-sync-enabled"
            title={copy.settings.downloads}
            description={syncedDescription(
              copy.settings.downloadsSub,
              relativeTime(lastSyncTimes.downloads),
            )}
            checked={downloadSyncEnabled}
            onCheckedChange={toggle(toggleDownloadSync)}
          />
        )}

        <SectionRule label={copy.settings.kickerSync} />
        {HISTORY_API ? (
          <SettingRow
            id="auto-sync-enabled"
            title={copy.settings.autoSync}
            description={copy.settings.autoSyncSub}
            checked={autoSyncEnabled}
            onCheckedChange={toggle(toggleAutoSync)}
          />
        ) : (
          <p className="py-2 text-xs text-muted-foreground">
            {copy.settings.autoSyncSafari}
          </p>
        )}

        <SectionRule label={copy.settings.kickerPrivacy} />
        <RowLink
          icon={EyeOff}
          title={copy.settings.ignoredRow}
          sub={copy.settings.ignoredRowSub}
          trailing={
            <Badge variant="secondary">
              {siteBlacklist.length + pageBlacklist.length}
            </Badge>
          }
          onClick={() => push("ignored")}
        />
        <TelemetryRow />

        <MemorySection signedIn />

        <SectionRule label={copy.settings.kickerAccount} />
        <p className="text-xs text-muted-foreground">
          {copy.settings.signedInVia(hostFromUrl(portalUrl) ?? portalUrl)}
        </p>
        <div className="flex gap-2 pt-1">
          <LoadingButton
            variant="outline"
            size="sm"
            className="flex-1"
            loading={switching}
            onClick={switchAccount}
          >
            {!switching && (
              <ArrowRightLeft className="size-4" strokeWidth={1.75} />
            )}
            {copy.settings.switch}
          </LoadingButton>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={signOut}
          >
            <LogOut className="size-4" strokeWidth={1.75} />
            {copy.settings.signOut}
          </Button>
        </div>

        <ThemeSection />
      </>
    );
  } else {
    // Pre-onboarding: privacy (the legal telemetry path), manual Memory
    // address, and appearance only — no capture/sync/account jargon.
    body = (
      <>
        {TELEMETRY_COMPILED_IN && (
          <>
            <SectionRule label={copy.settings.kickerPrivacy} />
            <TelemetryRow />
          </>
        )}
        <MemorySection signedIn={false} />
        <ThemeSection />
      </>
    );
  }

  return (
    <PopupShell
      title={copy.settings.title}
      back
      footer={
        <p className="text-center text-xxs text-muted-foreground">
          {copy.app.title} v{browser.runtime.getManifest().version}
        </p>
      }
    >
      {body}
    </PopupShell>
  );
}

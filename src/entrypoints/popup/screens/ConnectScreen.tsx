import { useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Field, Input, Spinner, Tooltip, useToast } from "@ci/shadcn";
import { CloudUpload, ExternalLink, SearchX, Settings } from "@ci/shadcn/icons";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl, parseUrl } from "@/utils";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { useCiState } from "../hooks/useCiState";
import { useDiscovery } from "../hooks/useDiscovery";
import { PopupShell } from "../components/PopupShell";
import { BrandButton } from "../components/BrandButton";
import { Banner } from "../components/Banner";
import { StepDots } from "../components/StepDots";

export function ConnectScreen({
  variant,
  queued,
}: {
  variant: "searching" | "none" | "error";
  queued: number;
}) {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const { push } = useRouter();
  const { portalUrl, discoveryHint } = useCiState();
  const { discovering, recheck } = useDiscovery();
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const connectManual = () => {
    const normalized = normalizeServerUrl(draft);
    if (!normalized || !parseUrl(normalized)) {
      setInvalid(true);

      return;
    }

    setInvalid(false);
    dispatch(
      setState({
        serverURL: normalized,
        serverURLSource: "manual",
        discoveryHint: null,
        memoryAppChoices: null,
      }),
    );
    dispatch(saveUserSettings());
    browser.runtime
      .sendMessage({ action: "CHECK_AUTH_STATUS" })
      .catch(console.error);
    toast(copy.pick.connected(parseUrl(normalized)?.host ?? normalized));
  };

  const busy = variant === "searching" || discovering;

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
          <p className="text-sm font-semibold">{copy.connect.noneTitle}</p>
          <p className="max-w-[240px] text-xs text-muted-foreground">
            {copy.connect.noneBody}
          </p>

          {variant === "error" && discoveryHint && (
            <Banner tone="warning" className="w-full">
              <p>{copy.connect.errorTitle}</p>
              <p className="mt-0.5 text-xxs text-muted-foreground">
                {discoveryHint}
              </p>
            </Banner>
          )}

          <BrandButton className="w-full" onClick={recheck}>
            {copy.connect.check}
          </BrandButton>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(portalUrl, "_blank")}
          >
            {copy.connect.openPortal}
            <ExternalLink className="size-4" strokeWidth={1.75} />
          </Button>

          {manualOpen ? (
            <Field className="w-full text-left">
              <Field.Label htmlFor="memory-address" className="text-sm">
                {copy.manual.label}
              </Field.Label>
              <Input
                id="memory-address"
                inputMode="url"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    connectManual();
                  }
                }}
                placeholder={copy.manual.placeholder}
                aria-invalid={invalid || undefined}
              />
              {invalid ? (
                <Field.Error className="text-xs">
                  {copy.manual.invalid}
                </Field.Error>
              ) : (
                <Field.Description className="text-xs">
                  {copy.manual.helper}
                </Field.Description>
              )}
              <Button className="w-full" onClick={connectManual}>
                {copy.manual.cta}
              </Button>
            </Field>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setManualOpen(true)}
            >
              {copy.connect.manualLink}
            </Button>
          )}
        </>
      )}

      <StepDots step={2} />
    </PopupShell>
  );
}

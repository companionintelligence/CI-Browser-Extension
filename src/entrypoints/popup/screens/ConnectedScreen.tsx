import { useDispatch } from "react-redux";
import { Button, Tooltip } from "@ci/shadcn";
import { CircleCheck, Settings } from "@ci/shadcn/icons";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { useSyncActions } from "../hooks/useSyncActions";
import { PopupShell } from "../components/PopupShell";
import { BrandButton } from "../components/BrandButton";
import { StepDots } from "../components/StepDots";

/**
 * Onboarding step 3, shown once: after a first sign-in ends with a Memory
 * connected, before the dashboard. It says what gets saved and where the
 * controls live. "Got it" clears `firstRunPending`, which is persisted, so the
 * card does not come back.
 */
export function ConnectedScreen() {
  const dispatch = useDispatch();
  const { push } = useRouter();
  const { paused, togglePause } = useSyncActions();

  const finish = () => {
    dispatch(setState({ firstRunPending: false }));
    dispatch(saveUserSettings());
  };

  return (
    <PopupShell
      title={copy.app.title}
      status="ok"
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
        <BrandButton className="w-full" onClick={finish}>
          {copy.connected.done}
        </BrandButton>
      }
    >
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success/10">
          <CircleCheck className="size-7 text-success" strokeWidth={1.75} />
        </span>
        <h2 className="text-lg leading-tight font-semibold">
          {copy.connected.title}
        </h2>
        <p className="popup-copy text-sm text-muted-foreground">
          {copy.connected.body}
        </p>
      </div>

      <div className="divide-y rounded-md border">
        <div className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium">{copy.connected.pauseTitle}</p>
            <p className="text-xs text-muted-foreground">
              {paused ? copy.connected.pauseOff : copy.connected.pauseOn}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="popup-hit"
            onClick={togglePause}
          >
            {paused ? copy.sync.resume : copy.sync.pause}
          </Button>
        </div>

        <div className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1 text-left">
            <p className="text-sm font-medium">{copy.connected.ignoreTitle}</p>
            <p className="text-xs text-muted-foreground">
              {copy.connected.ignoreSub}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="popup-hit"
            onClick={() => push("ignored")}
          >
            {copy.connected.ignoreCta}
          </Button>
        </div>
      </div>

      <StepDots step={3} />
    </PopupShell>
  );
}

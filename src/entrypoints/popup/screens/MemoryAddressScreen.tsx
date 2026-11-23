import { useState } from "react";
import { useDispatch } from "react-redux";
import { Field, Input } from "@ci/shadcn";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { normalizeServerUrl, parseUrl } from "@/utils";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { useCiState } from "../hooks/useCiState";
import { PopupShell } from "../components/PopupShell";
import { BrandButton } from "../components/BrandButton";
import { Banner } from "../components/Banner";

/**
 * "I run my own Memory": a pushed screen that saves a manual address. It opens
 * from Welcome (before sign-in) and from Connect (when no Memory was found).
 * Saving stays on this screen and says so inline, then "Done" pops back. A
 * toast would not survive the screen change, because the popup's Toaster is
 * part of the screen being left. Sign-in still goes through CI-Portal, so this
 * only chooses where a signed-in browser saves.
 */
export function MemoryAddressScreen() {
  const dispatch = useDispatch();
  const { pop } = useRouter();
  const { accessToken, serverURL } = useCiState();
  const signedIn = !!accessToken;
  const [draft, setDraft] = useState(serverURL);
  const [invalid, setInvalid] = useState(false);
  const [savedAddress, setSavedAddress] = useState<string | null>(null);

  const save = () => {
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
    setSavedAddress(normalized);
  };

  const savedHost = savedAddress
    ? (parseUrl(savedAddress)?.host ?? savedAddress)
    : null;

  return (
    <PopupShell title={copy.memoryAddress.title} back>
      <p className="text-sm text-muted-foreground">
        {signedIn ? copy.memoryAddress.lead : copy.memoryAddress.leadSignIn}
      </p>

      <Field>
        <Field.Label htmlFor="memory-address" className="text-sm">
          {copy.manual.label}
        </Field.Label>
        <Input
          id="memory-address"
          inputMode="url"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSavedAddress(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              save();
            }
          }}
          className="popup-hit"
          placeholder={copy.manual.placeholder}
          aria-invalid={invalid || undefined}
        />
        {invalid ? (
          <Field.Error className="text-xs">{copy.manual.invalid}</Field.Error>
        ) : (
          <Field.Description className="text-xs">
            {copy.manual.helper}
          </Field.Description>
        )}
      </Field>

      {savedHost ? (
        <>
          <Banner tone="success" className="w-full">
            {signedIn
              ? copy.pick.connected(savedHost)
              : copy.memoryAddress.savedSignIn}
          </Banner>
          <BrandButton className="w-full" onClick={pop}>
            {copy.memoryAddress.done}
          </BrandButton>
        </>
      ) : (
        <BrandButton className="w-full" onClick={save}>
          {copy.settings.saveAddress}
        </BrandButton>
      )}
    </PopupShell>
  );
}

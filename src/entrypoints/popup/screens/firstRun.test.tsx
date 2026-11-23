/**
 * First-run screens: the Welcome error disclosure, the no-Memory re-check, the
 * one-time connected step, and the manual Memory address. Each renders the
 * real screen against a real store, with only the extension APIs stubbed.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import type { ReactElement } from "react";
import ciStateReducer from "@/store/ciStateSlice";
import { NO_MEMORY_HINT } from "@/services/portalApps";
import { copy } from "../copy";
import { RouterProvider } from "../routes";
import { ConnectScreen } from "./ConnectScreen";
import { ConnectedScreen } from "./ConnectedScreen";
import { MemoryAddressScreen } from "./MemoryAddressScreen";
import { WelcomeScreen } from "./WelcomeScreen";

// The build-time telemetry env reads import.meta, which this Jest setup cannot
// parse; the screens only need it to decide whether to show the disclosure.
jest.mock("@/lib/telemetry/buildEnv", () => ({ BUILD_TELEMETRY_ENV: {} }));
jest.mock("@/assets/logo.png", () => "logo.png");
// @ci/shadcn re-exports every component, including one built on an ESM-only
// panel library that Jest cannot parse. No first-run screen uses it.
jest.mock("react-resizable-panels", () => ({}));

// jsdom has no matchMedia; the toaster (sonner) asks it for the colour scheme.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

const sendMessage = jest.fn();
const storageSet = jest.fn();

function renderWithStore(
  ui: ReactElement,
  ciState: Partial<Record<string, unknown>> = {},
) {
  const base = ciStateReducer(undefined, { type: "test/init" });
  const store = configureStore({
    reducer: { ciState: ciStateReducer },
    preloadedState: {
      ciState: { ...base, settingsLoaded: true, ...ciState },
    },
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <RouterProvider>{ui}</RouterProvider>
      </Provider>,
    ),
  };
}

function discoveryCalls(): number {
  return sendMessage.mock.calls.filter(
    ([message]) => message?.action === "DISCOVER_MEMORY",
  ).length;
}

beforeEach(() => {
  sendMessage.mockReset().mockResolvedValue({ success: true, found: 0 });
  storageSet.mockReset().mockResolvedValue(undefined);
  (globalThis as { browser?: unknown }).browser = {
    runtime: {
      sendMessage,
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
      getManifest: () => ({ version: "0.0.0" }),
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: storageSet,
        remove: jest.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  };
});

describe("Connect: no Memory found", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("re-checks quietly on open and on focus, no more than once per gap", () => {
    renderWithStore(<ConnectScreen variant="none" queued={0} />, {
      accessToken: "token",
      serverURL: "",
      discoveryHint: NO_MEMORY_HINT,
    });

    expect(discoveryCalls()).toBe(1);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(discoveryCalls()).toBe(1);

    act(() => {
      jest.advanceTimersByTime(3_000);
      window.dispatchEvent(new Event("focus"));
    });
    expect(discoveryCalls()).toBe(2);
  });

  it("keeps a quiet check silent, while a manual check says what it found", async () => {
    renderWithStore(<ConnectScreen variant="none" queued={0} />, {
      accessToken: "token",
      serverURL: "",
      discoveryHint: NO_MEMORY_HINT,
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText(copy.connect.stillNone)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.connect.check }));
    });
    await waitFor(() =>
      expect(screen.getByText(copy.connect.stillNone)).toBeTruthy(),
    );
  });

  it("leads with CI-Portal, and offers a manual address", () => {
    renderWithStore(<ConnectScreen variant="none" queued={0} />, {
      accessToken: "token",
      serverURL: "",
      discoveryHint: NO_MEMORY_HINT,
    });

    expect(
      screen.getByRole("button", { name: copy.connect.openPortal }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: copy.memoryAddress.ownMemory }),
    ).toBeTruthy();
  });
});

describe("Connected step", () => {
  it("'Got it' clears the first-run flag and persists it", () => {
    const { store } = renderWithStore(<ConnectedScreen />, {
      accessToken: "token",
      serverURL: "https://memory.example.com",
      firstRunPending: true,
    });

    fireEvent.click(screen.getByRole("button", { name: copy.connected.done }));

    expect(store.getState().ciState.firstRunPending).toBe(false);
    expect(storageSet).toHaveBeenCalledWith(
      expect.objectContaining({ firstRunPending: false }),
    );
  });

  it("pauses saving from the card and says so", () => {
    const { store } = renderWithStore(<ConnectedScreen />, {
      accessToken: "token",
      serverURL: "https://memory.example.com",
      firstRunPending: true,
      historySyncEnabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: copy.sync.pause }));

    expect(store.getState().ciState.historySyncEnabled).toBe(false);
    expect(screen.getByRole("button", { name: copy.sync.resume })).toBeTruthy();
    expect(screen.getByText(copy.connected.pauseOff)).toBeTruthy();
  });
});

describe("Welcome", () => {
  it("keeps the raw sign-in error behind Show details", () => {
    renderWithStore(
      <WelcomeScreen
        authorizing={false}
        authError="HTTP 502 Bad Gateway"
        onAuthorize={jest.fn()}
        onCancel={jest.fn()}
        onDismissError={jest.fn()}
      />,
    );

    expect(screen.queryByText("HTTP 502 Bad Gateway")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: copy.welcome.showDetails }),
    );
    expect(screen.getByText("HTTP 502 Bad Gateway")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: copy.welcome.hideDetails }),
    );
    expect(screen.queryByText("HTTP 502 Bad Gateway")).toBeNull();
  });
});

describe("Memory address", () => {
  it("rejects an empty address, then confirms a saved one inline", () => {
    const { store } = renderWithStore(<MemoryAddressScreen />, {
      accessToken: null,
      serverURL: "",
    });

    fireEvent.click(
      screen.getByRole("button", { name: copy.settings.saveAddress }),
    );
    expect(screen.getByText(copy.manual.invalid)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(copy.manual.label), {
      target: { value: "memory.example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: copy.settings.saveAddress }),
    );

    expect(store.getState().ciState.serverURL).toBe(
      "https://memory.example.com",
    );
    expect(store.getState().ciState.serverURLSource).toBe("manual");
    expect(screen.getByText(copy.memoryAddress.savedSignIn)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: copy.memoryAddress.done }),
    ).toBeTruthy();
  });
});

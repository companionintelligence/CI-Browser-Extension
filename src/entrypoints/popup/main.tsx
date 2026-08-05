import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./style.css";
// Self-hosted Manrope (bundled by Vite → MV3 CSP-safe, no CDN/Google Fonts).
// Weights match the CI canonical stack: 400 / 500 / 600 / 700.
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import { Provider } from "react-redux";
import { Store } from "webext-redux";
import { initTelemetry } from "@/lib/telemetry";
import { BUILD_TELEMETRY_ENV } from "@/lib/telemetry/buildEnv";

// Before the store connects: a popup that fails to reach the background is one
// of the failures worth hearing about. Not awaited — reporting never gates the UI.
//
// The `import.meta.env` guard is a BUNDLE optimisation, not the gate — the gate
// is resolveTelemetrySettings, which runs regardless. Read here rather than
// through BUILD_TELEMETRY_ENV so the expression is statically replaced at build
// time and a DSN-less build drops the whole SDK instead of shipping it dead.
if (import.meta.env.WXT_SENTRY_DSN) {
  void initTelemetry({ component: "popup", env: BUILD_TELEMETRY_ENV });
}

const store = new Store();

store.ready().then(() => {
  return ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider
        attribute="class"
        storageKey="vite-ui-theme"
        defaultTheme="system"
      >
        <Provider store={store}>
          <App />
        </Provider>
      </ThemeProvider>
    </React.StrictMode>,
  );
});

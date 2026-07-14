import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./style.css";
// Self-hosted Montserrat (bundled by Vite → MV3 CSP-safe, no CDN/Google Fonts).
// Weights match the CI canonical stack: 200 / 400 / 500 / 600 / 700.
import "@fontsource/montserrat/200.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import { Provider } from "react-redux";
import { Store } from "webext-redux";

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

// Captures the real popup of the BUILT extension, with no account, no server
// and no fixture: a signed-out browser shows the Welcome screen, and that is
// all this script films. Screens behind sign-in (Home, Sync activity, Ignored
// sites) need a Memory to talk to and are deliberately NOT captured here.
//
//   yarn build                                   # -> .output/chrome-mv3
//   cd video && npm i --no-save playwright@1.62.1   # exact pin: see README
//   node capture-popup.mjs [path/to/chrome-mv3]
//
// Output: assets/shots/popup-welcome.png and popup-welcome-dark.png, 350x480
// CSS px at 4x. The popup honours prefers-color-scheme, so the dark one is the
// same screen under the OS dark setting, not a second design.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(process.argv[2] ?? join(here, "..", ".output", "chrome-mv3"));

for (const [scheme, name] of [["light", "popup-welcome"], ["dark", "popup-welcome-dark"]]) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "ci-ext-shot-")), {
    channel: "chromium",
    headless: true,
    colorScheme: scheme,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 350, height: 480 },
    deviceScaleFactor: 4,
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`, { waitUntil: "domcontentloaded" });
  await page.getByText("Remember everything you browse").waitFor();
  await page.getByRole("button", { name: /Sign in with CI-Portal/ }).waitFor();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(here, "assets", "shots", `${name}.png`) });
  await ctx.close();
}

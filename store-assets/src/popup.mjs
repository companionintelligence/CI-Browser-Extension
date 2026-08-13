// Faithful SVG reproduction of the CI-Browser-Extension popup, built from the
// real App.tsx layout, copy, and design-system tokens. The app renders the
// popup with next-themes; these mocks use the DARK theme, so colors are the
// resolved .dark token values from theme.css (canonical CI teal, v0.2.0):
//   --primary #abd4d8 (teal-200) · --primary-foreground #041620 ·
//   --background #020618 · --card #0f172b · --muted-foreground #90a1b9 ·
//   --destructive #ff6467 · --success #4ade80 · --warning #fbbf24.
// The primary CTA uses --gradient-brand (#0f717a → #00a9a7). Rendered to PNG
// for the demo GIF and store screenshots.
import { LOGO_B64 } from "./logo.mjs";

export const T = {
  // Brand constants (theme-independent) — CTA gradient + marketing chrome.
  gradFrom: "#0f717a", // teal-600 / --primary (light)
  gradTo: "#00a9a7", // aqua
  brandLight: "#72ddd4", // aqua-light — headline gradient start
  brandMid: "#1c8791", // teal-500 — ambient glow
  // Dark-theme UI tokens (what the popup renders in dark mode).
  teal: "#abd4d8", // --primary (dark) → headings, accents, primary button fill
  primaryFg: "#041620", // --primary-foreground (dark) → text on primary buttons
  tealHover: "#7fbcc2", // teal-300
  bg: "#020618", // --background (dark)
  panel: "#0f172b", // --card (dark)
  secondary: "#1d293d", // --secondary/--muted (dark)
  panelAccent: "rgba(171,212,216,0.06)", // bg-primary/5-ish tint
  border: "rgba(255,255,255,0.10)", // --border (dark)
  text: "#f8fafc", // --foreground (dark)
  muted: "#90a1b9", // --muted-foreground (dark)
  faint: "#64748b",
  success: "#4ade80", // --success (dark)
  warn: "#fbbf24", // --warning (dark)
  fail: "#ff6467", // --destructive (dark)
  white: "#ffffff",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

// Brand-gradient def for the primary CTA (matches --gradient-brand, 135deg).
// Included in standalone popup SVGs (wrap) and in the store defs(); framedPopup
// strips the popup-body copy when compositing so there is one def per file.
export const BRAND_GRAD_DEF = `<linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.gradFrom}"/><stop offset="1" stop-color="${T.gradTo}"/></linearGradient>`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function txt(x, y, s, { size = 13, fill = T.text, weight = 400, anchor = "start", family = T.font, opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${esc(s)}</text>`;
}
function rrect(x, y, w, h, r, fill, { stroke = "none", sw = 1, opacity = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
}
function checkbox(x, y, checked) {
  const box = rrect(x, y, 17, 17, 4, checked ? T.teal : "transparent", { stroke: checked ? T.teal : T.muted, sw: 1.6 });
  // Dark tick on the light-teal (accent-primary) box, matching the dark theme.
  const tick = checked
    ? `<path d="M ${x + 3.5} ${y + 9} L ${x + 7} ${y + 12.5} L ${x + 13.5} ${y + 4.5}" stroke="${T.primaryFg}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
  return box + tick;
}
function button(x, y, w, h, label, { fill = T.teal, color = T.primaryFg, size = 14, weight = 600, disabled = false, stroke = "none", gradient = false } = {}) {
  const bg = disabled ? T.secondary : gradient ? "url(#brandGrad)" : fill;
  const fg = disabled ? T.muted : gradient ? T.white : color;
  return rrect(x, y, w, h, 9, bg, { stroke, sw: 1 }) + txt(x + w / 2, y + h / 2 + size * 0.35, label, { size, fill: fg, weight, anchor: "middle" });
}

const W = 360;

// section header with top divider, returns {svg, y}
function sectionHeader(y, label) {
  return { svg: `<line x1="16" y1="${y}" x2="${W - 16}" y2="${y}" stroke="${T.border}" stroke-width="1"/>` + txt(16, y + 24, label, { size: 16, fill: T.teal, weight: 600 }), y: y + 36 };
}

function header() {
  // brand strip
  return `<image href="${LOGO_B64}" x="16" y="16" width="30" height="30"/>` +
    txt(54, 30, "Companion", { size: 13, fill: T.text, weight: 700 }) +
    txt(54, 45, "Intelligence", { size: 13, fill: T.teal, weight: 700 });
}

// Signed-out headline. The popup leads with the product name and promise —
// there is no server field here any more: sign-in comes first and the Memory
// server is discovered from the Portal afterwards.
function signedOutIntro(y) {
  let s = txt(W / 2, y + 14, "Companion Intelligence", { size: 17, fill: T.teal, weight: 600, anchor: "middle" });
  s += txt(W / 2, y + 36, "Sync your browsing to your Companion memory.", { size: 12.5, fill: T.muted, anchor: "middle" });
  return { svg: s, y: y + 52 };
}

function loginBar(y, loggedIn) {
  if (loggedIn) {
    // Tinted status banner (bg-primary/10) — "Authorized with Companion Intelligence".
    let s = rrect(16, y, W - 32, 40, 9, "rgba(171,212,216,0.12)", { stroke: "rgba(171,212,216,0.25)", sw: 1 });
    s += `<circle cx="34" cy="${y + 20}" r="4" fill="${T.success}"/>`;
    s += txt(48, y + 25, "Authorized with Companion Intelligence", { size: 13, fill: T.teal, weight: 500 });
    return { svg: s, y: y + 52 };
  }
  // Primary CTA — the OIDC sign-in button (--gradient-brand).
  const s = button(16, y, W - 32, 40, "Sign in with Companion account", { gradient: true, size: 13.5 });
  return { svg: s, y: y + 52 };
}

// The unobtrusive Advanced disclosure at the foot of the popup — where the
// Portal and Memory server URLs live now that neither is part of the main flow.
function advancedRow(y) {
  return { svg: txt(W / 2, y + 14, "Advanced", { size: 12.5, fill: T.muted, anchor: "middle" }), y: y + 26 };
}

function autoSyncCard(y, checked) {
  let s = rrect(16, y, W - 32, 64, 10, T.panelAccent, { stroke: "rgba(171,212,216,0.12)", sw: 1 });
  s += checkbox(28, y + 14, checked);
  s += txt(54, y + 27, "Auto-sync all browser history", { size: 13.5, fill: T.text, weight: 500 });
  s += txt(54, y + 48, "Excludes ignored sites and pages", { size: 11.5, fill: T.muted });
  return { svg: s, y: y + 76 };
}

function deviceLine(y) {
  return { svg: txt(16, y + 14, "Device: Chrome on macOS", { size: 12.5, fill: T.teal }), y: y + 28 };
}

function timeRange(y) {
  let s = txt(16, y + 14, "Sync time range:", { size: 12.5, fill: T.muted, weight: 500 });
  s += rrect(140, y, 150, 34, 7, "transparent", { stroke: T.border, sw: 1 });
  s += txt(152, y + 22, "Last 7 days", { size: 12.5, fill: T.text });
  s += `<path d="M ${272} ${y + 13} l 5 6 l 5 -6" stroke="${T.muted}" stroke-width="1.5" fill="none"/>`;
  return { svg: s, y: y + 46 };
}

function statusLine(y, text, tone = "muted") {
  const bg = "rgba(171,212,216,0.10)";
  let s = rrect(16, y, W - 32, 32, 6, bg);
  const color = tone === "success" ? T.success : tone === "syncing" ? T.teal : T.muted;
  s += txt(16 + (W - 32) / 2, y + 20, text, { size: 11.8, fill: color, anchor: "middle", weight: 500 });
  return { svg: s, y: y + 40 };
}

// Chrome/Firefox store screenshots only — Safari hides Bookmarks/Downloads in
// the real popup (those APIs are unimplemented). Regenerate a Safari variant
// here if App Store listing assets need to match.
function togglesRow(y) {
  let s = rrect(16, y, W - 32, 48, 10, T.panelAccent, { stroke: "rgba(171,212,216,0.12)", sw: 1 });
  const cols = [["History", true], ["Bookmarks", true], ["Downloads", false]];
  let cx = 30;
  for (const [label, on] of cols) {
    s += checkbox(cx, y + 16, on);
    s += txt(cx + 24, y + 29, label, { size: 12, fill: T.text });
    cx += 110;
  }
  return { svg: s, y: y + 60 };
}

// The opt-in gate on sensitive scrape profiles (brokerage holdings and order
// history). Drawn UNCHECKED on purpose: off by default is the product promise,
// and a store screenshot showing it enabled would misrepresent the default.
function sensitiveRow(y) {
  let s = checkbox(28, y, false);
  s += txt(54, y + 13, "Include financial accounts", { size: 12.5, fill: T.text, weight: 500 });
  s += txt(54, y + 31, "Off by default", { size: 11, fill: T.muted });
  return { svg: s, y: y + 46 };
}

function ignoredButton(y, sites, pages) {
  // Secondary (neutral) button — bg-secondary / text-secondary-foreground.
  let s = button(16, y, W - 32, 44, "Ignored Pages and Sites", { fill: T.secondary, color: T.text, weight: 600, size: 13.5 });
  s += rrect(16, y + 52, W - 32, 30, 6, "rgba(255,255,255,0.04)");
  s += txt(110, y + 71, `Sites: ${sites}`, { size: 12, fill: T.muted, anchor: "middle" });
  s += txt(250, y + 71, `Pages: ${pages}`, { size: 12, fill: T.muted, anchor: "middle" });
  return { svg: s, y: y + 90 };
}

// ---- Full popup states ----
export const POPUP_W = W;
function wrap(innerH, inner) {
  const H = innerH;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${BRAND_GRAD_DEF}</defs>
  <rect width="${W}" height="${H}" rx="0" fill="${T.bg}"/>
  ${inner}
</svg>`;
}

// Returns {w,h,body} so the popup can be composited (with frame/shadow) into
// larger store canvases without a PNG round-trip.
export function popupParts(state) {
  const svg = state === "ignored" ? renderIgnored() : renderPopup(state);
  const h = parseInt(svg.match(/height="(\d+)"/)[1], 10);
  const body = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return { w: W, h, body };
}

// Composite a popup as a framed "window" at (x,y) scaled, with rounded corners,
// a title bar with traffic-light dots, and a soft drop shadow.
export function framedPopup(state, x, y, scale, idPrefix) {
  const { w, h } = popupParts(state);
  // Strip the popup's own brandGrad def when compositing — the enclosing store
  // SVG provides it via defs(), so we avoid a duplicate id in the same file.
  const { body: rawBody } = popupParts(state);
  const body = rawBody.replace(/<defs>[\s\S]*?<\/defs>/, "");
  const barH = 30;
  const totalH = h + barH;
  const clip = `clip-${idPrefix}`;
  return `
  <g transform="translate(${x},${y}) scale(${scale})">
    <rect x="-1" y="-1" width="${w + 2}" height="${totalH + 2}" rx="14" fill="#000" opacity="0.0"/>
    <g filter="url(#winShadow)">
      <rect x="0" y="0" width="${w}" height="${totalH}" rx="13" fill="${T.bg}"/>
    </g>
    <clipPath id="${clip}"><rect x="0" y="0" width="${w}" height="${totalH}" rx="13"/></clipPath>
    <g clip-path="url(#${clip})">
      <rect x="0" y="0" width="${w}" height="${barH}" fill="#0b1120"/>
      <circle cx="20" cy="${barH / 2}" r="5" fill="#ff5f57"/>
      <circle cx="38" cy="${barH / 2}" r="5" fill="#febc2e"/>
      <circle cx="56" cy="${barH / 2}" r="5" fill="#28c840"/>
      <text x="${w / 2}" y="${barH / 2 + 4}" font-family="${T.font}" font-size="12" fill="${T.muted}" text-anchor="middle">Companion Intelligence</text>
      <g transform="translate(0,${barH})">${body}</g>
      <rect x="0.5" y="0.5" width="${w - 1}" height="${totalH - 1}" rx="13" fill="none" stroke="rgba(255,255,255,0.08)"/>
    </g>
  </g>`;
}

export function renderPopup(state) {
  let y = 60;
  let s = header();
  if (state === "loggedOut") {
    const i = signedOutIntro(y); s += i.svg; y = i.y;
    const b = loginBar(y, false); s += b.svg; y = b.y;
    const ad = advancedRow(y); s += ad.svg; y = ad.y + 8;
    return wrap(y, s);
  }
  // logged-in family
  const b = loginBar(y, true); s += b.svg; y = b.y + 6;
  const h = sectionHeader(y, "Browser History Sync"); s += h.svg; y = h.y;
  const ac = autoSyncCard(y, true); s += ac.svg; y = ac.y;
  const dl = deviceLine(y); s += dl.svg; y = dl.y;
  const tr = timeRange(y); s += tr.svg; y = tr.y + 4;

  if (state === "syncing") {
    s += button(16, y, W - 32, 44, "Syncing…", { disabled: true, size: 14 }); y += 52;
    const st = statusLine(y, "Uploading 642/1000 visits to CI-Server…", "syncing"); s += st.svg; y = st.y;
  } else if (state === "synced") {
    s += button(16, y, W - 32, 44, "Start History Sync", { size: 14 }); y += 52;
    const st = statusLine(y, "Successfully synced 1000 visits to CI-Server.", "success"); s += st.svg; y = st.y;
    s += txt(W / 2, y + 8, "Last sync: 6/10/2026, 4:21:08 PM", { size: 11.5, fill: T.muted, anchor: "middle" }); y += 22;
  } else {
    s += button(16, y, W - 32, 44, "Start History Sync", { size: 14 }); y += 52;
  }
  const tg = togglesRow(y); s += tg.svg; y = tg.y;
  const sr = sensitiveRow(y); s += sr.svg; y = sr.y;
  const ib = ignoredButton(y, 3, 5); s += ib.svg; y = ib.y + 4;
  const ad = advancedRow(y); s += ad.svg; y = ad.y + 8;
  return wrap(y, s);
}

export function renderIgnored() {
  let y = 24;
  let s = `<path d="M 30 ${y + 6} l -8 8 l 8 8 M 22 ${y + 14} h 14" stroke="${T.text}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  s += txt(48, y + 20, "Ignored Pages and Sites", { size: 17, fill: T.text, weight: 700 });
  y += 44;
  s += txt(16, y + 12, "These sites and pages will be excluded from", { size: 12, fill: T.muted });
  s += txt(16, y + 28, "automatic browser history sync.", { size: 12, fill: T.muted });
  y += 48;
  // tabs
  s += rrect(16, y, (W - 32) / 2, 36, 8, "rgba(171,212,216,0.15)", { stroke: T.teal, sw: 1 });
  s += txt(16 + (W - 32) / 4, y + 23, "Ignored Sites (3)", { size: 12.5, fill: T.teal, anchor: "middle", weight: 600 });
  s += txt(16 + (W - 32) * 0.75, y + 23, "Ignored Pages (5)", { size: 12.5, fill: T.muted, anchor: "middle" });
  y += 48;
  s += button(16, y, W - 32, 38, "Add Current Site", { size: 13 }); y += 50;
  // input + add
  s += rrect(16, y, W - 32 - 44, 38, 8, "#0b1220", { stroke: T.border, sw: 1 });
  s += txt(28, y + 24, "example.com", { size: 12.5, fill: T.faint, family: T.mono });
  s += button(W - 16 - 38, y, 38, 38, "+", { size: 20, weight: 700 });
  y += 52;
  const entries = ["accounts.google.com", "mail.proton.me", "online.bank.example"];
  for (const e of entries) {
    s += rrect(16, y, W - 32, 38, 8, "rgba(255,255,255,0.03)", { stroke: T.border, sw: 1 });
    s += txt(28, y + 24, e, { size: 12.5, fill: T.text, family: T.mono });
    s += `<text x="${W - 30}" y="${y + 25}" font-family="${T.font}" font-size="18" fill="${T.muted}" text-anchor="middle">×</text>`;
    y += 46;
  }
  y += 6;
  return wrap(y, s);
}

// Faithful SVG reproduction of the CI-Browser-Extension popup, built from the
// real App.tsx layout, copy, and color tokens (brand teal #4ba7a6, dark theme).
// Rendered to PNG for the demo GIF and store screenshots.
import { LOGO_B64 } from "./logo.mjs";

export const T = {
  teal: "#4ba7a6",
  tealHover: "#2f6b7e",
  tealDeep: "#14505d",
  tealBright: "#2cb6b6",
  bg: "#1a1a1a",
  panel: "#202022",
  panelAccent: "rgba(75,167,166,0.06)",
  border: "#333333",
  text: "#f4f4f5",
  muted: "#8a8a8f",
  faint: "#6c6c70",
  success: "#28a745",
  warn: "#ffc107",
  fail: "#dc3545",
  white: "#ffffff",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function txt(x, y, s, { size = 13, fill = T.text, weight = 400, anchor = "start", family = T.font, opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${esc(s)}</text>`;
}
function rrect(x, y, w, h, r, fill, { stroke = "none", sw = 1, opacity = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"/>`;
}
function checkbox(x, y, checked) {
  const box = rrect(x, y, 17, 17, 4, checked ? T.teal : "transparent", { stroke: checked ? T.teal : T.muted, sw: 1.6 });
  const tick = checked
    ? `<path d="M ${x + 3.5} ${y + 9} L ${x + 7} ${y + 12.5} L ${x + 13.5} ${y + 4.5}" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
  return box + tick;
}
function button(x, y, w, h, label, { fill = T.teal, color = "#fff", size = 14, weight = 600, disabled = false, stroke = "none" } = {}) {
  const bg = disabled ? "#2a2a2c" : fill;
  const fg = disabled ? T.muted : color;
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

function serverSection(y) {
  let s = txt(16, y + 14, "CI Server URL", { size: 16, fill: T.teal, weight: 600 });
  s += txt(16, y + 34, "Enter the domain of your CI server", { size: 12, fill: T.muted });
  s += rrect(16, y + 46, 230, 40, 8, "#161618", { stroke: T.border, sw: 1 });
  s += txt(28, y + 71, "my-ci.companionintelligence.com", { size: 12.5, fill: T.text, family: T.mono });
  s += button(254, y + 46, W - 16 - 254, 40, "Save", { size: 14 });
  return { svg: s, y: y + 104 };
}

function loginBar(y, loggedIn) {
  const label = loggedIn ? "Logged in to Companion Intelligence" : "Log in to continue";
  const fill = loggedIn ? "rgba(75,167,166,0.12)" : "rgba(75,167,166,0.10)";
  const color = loggedIn ? T.teal : T.text;
  let s = rrect(16, y, W - 32, 40, 9, fill, { stroke: "rgba(75,167,166,0.25)", sw: 1 });
  if (loggedIn) s += `<circle cx="34" cy="${y + 20}" r="4" fill="${T.success}"/>`;
  s += txt(loggedIn ? 48 : W / 2, y + 25, label, { size: 13, fill: color, weight: 500, anchor: loggedIn ? "start" : "middle" });
  return { svg: s, y: y + 52 };
}

function autoSyncCard(y, checked) {
  let s = rrect(16, y, W - 32, 64, 10, T.panelAccent, { stroke: "rgba(75,167,166,0.12)", sw: 1 });
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
  const bg = "rgba(75,167,166,0.10)";
  let s = rrect(16, y, W - 32, 32, 6, bg);
  const color = tone === "success" ? T.success : tone === "syncing" ? T.teal : T.muted;
  s += txt(16 + (W - 32) / 2, y + 20, text, { size: 11.8, fill: color, anchor: "middle", weight: 500 });
  return { svg: s, y: y + 40 };
}

function togglesRow(y) {
  let s = rrect(16, y, W - 32, 48, 10, T.panelAccent, { stroke: "rgba(75,167,166,0.12)", sw: 1 });
  const cols = [["History", true], ["Bookmarks", true], ["Downloads", false]];
  let cx = 30;
  for (const [label, on] of cols) {
    s += checkbox(cx, y + 16, on);
    s += txt(cx + 24, y + 29, label, { size: 12, fill: T.text });
    cx += 110;
  }
  return { svg: s, y: y + 60 };
}

function ignoredButton(y, sites, pages) {
  let s = button(16, y, W - 32, 44, "Ignored Pages and Sites", { fill: "#3a3a3d", weight: 600, size: 13.5 });
  s += rrect(16, y + 52, W - 32, 30, 6, "rgba(0,0,0,0.25)");
  s += txt(110, y + 71, `Sites: ${sites}`, { size: 12, fill: T.muted, anchor: "middle" });
  s += txt(250, y + 71, `Pages: ${pages}`, { size: 12, fill: T.muted, anchor: "middle" });
  return { svg: s, y: y + 90 };
}

// ---- Full popup states ----
export const POPUP_W = W;
function wrap(innerH, inner) {
  const H = innerH;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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
  const { body } = popupParts(state);
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
      <rect x="0" y="0" width="${w}" height="${barH}" fill="#0e0e10"/>
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
    const a = serverSection(y); s += a.svg; y = a.y;
    const b = loginBar(y, false); s += b.svg; y = b.y + 8;
    return wrap(y, s);
  }
  // logged-in family
  const a = serverSection(y); s += a.svg; y = a.y;
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
  const ib = ignoredButton(y, 3, 5); s += ib.svg; y = ib.y + 8;
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
  s += rrect(16, y, (W - 32) / 2, 36, 8, "rgba(75,167,166,0.15)", { stroke: T.teal, sw: 1 });
  s += txt(16 + (W - 32) / 4, y + 23, "Ignored Sites (3)", { size: 12.5, fill: T.teal, anchor: "middle", weight: 600 });
  s += txt(16 + (W - 32) * 0.75, y + 23, "Ignored Pages (5)", { size: 12.5, fill: T.muted, anchor: "middle" });
  y += 48;
  s += button(16, y, W - 32, 38, "Add Current Site", { size: 13 }); y += 50;
  // input + add
  s += rrect(16, y, W - 32 - 44, 38, 8, "#161618", { stroke: T.border, sw: 1 });
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

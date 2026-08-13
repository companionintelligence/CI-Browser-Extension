import bowser from "bowser";

let mobile: boolean | null = null;

/** Single mobile detection for the popup (replaces per-component bowser calls). */
export function isMobilePopup(): boolean {
  if (mobile === null) {
    mobile =
      bowser.getParser(window.navigator.userAgent).getPlatformType() ===
      "mobile";
  }

  return mobile;
}

/**
 * Marks the document before first render so style.css can restyle the popup as
 * a full-width sheet on mobile Safari (the only host that renders it as one).
 */
export function initPlatform(): void {
  if (isMobilePopup()) {
    document.documentElement.classList.add("popup-mobile");
  }
}

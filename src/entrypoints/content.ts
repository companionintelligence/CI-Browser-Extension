import bowser from "bowser";

export default defineContentScript({
  matches: ["*://*.google.com/*"],
  main() {
    // Detect mobile environment
    const browser_info = bowser.getParser(window.navigator.userAgent);
    const isMobile = browser_info.getPlatformType() === "mobile";
    const browserName = browser_info.getBrowserName();

    if (isMobile) {
      console.log(`CI Extension: Running on mobile ${browserName}`);
    } else {
      console.log("CI Extension: Running on desktop");
    }

    console.log("Hello content.");
  },
});

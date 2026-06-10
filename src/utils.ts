export const domainRegex = /^(([a-zA-Z0-9]+)\.)+[a-zA-Z0-9]+$/;
export const siteRegex =
  /^(http(s)?:\/\/)?([a-zA-Z0-9]+\.)+[a-zA-Z0-9]+(\/([.a-zA-Z0-9_-~!$&'()*+,;=:@])+)*\/?/;

// URL.parse() requires Chrome/Firefox 126+, but the manifest supports
// Chrome 88+, so use a try/catch around the constructor instead
export function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isUrlBlacklisted(
  url: string,
  siteBlacklist: string[],
  pageBlacklist: string[],
): boolean {
  try {
    const parsedUrl = parseUrl(url);
    if (!parsedUrl || !parsedUrl.hostname) {
      return false;
    }

    for (const site of siteBlacklist) {
      const siteRegex = new RegExp(site);
      if (siteRegex.test(parsedUrl.hostname)) {
        return true;
      }
    }

    parsedUrl.hash = "";
    const urlWithoutHash = parsedUrl.toString();
    for (const page of pageBlacklist) {
      const pageRegex = new RegExp(page.replace("?", "\\?"));
      if (pageRegex.test(urlWithoutHash)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking if URL is blacklisted:", error);

    return false;
  }
}

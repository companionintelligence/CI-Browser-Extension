export interface ScrapeProfile {
  domain: string;
  name: string;
  description: string;
  targetUrl: string | string[];
  dataSelectors: {
    [key: string]: {
      container: string;
      fields: {
        [fieldName: string]: {
          selector: string;
          type: "text" | "attribute" | "html";
          attribute?: string;
          transform?: string;
        };
      };
    };
  };
  dataTypes: Array<{
    name: string;
    description: string;
    personalDataType: string;
  }>;
}

export interface ScrapeResult {
  profileName: string;
  domain: string;
  url: string;
  timestamp: string;
  data: {
    [key: string]: any[];
  };
}

import netflixProfileData from "./scrapeProfiles/netflix.json";
import huluProfileData from "./scrapeProfiles/hulu.json";
import disneyProfileData from "./scrapeProfiles/disney.json";
import slashdotProfileData from "./scrapeProfiles/slashdot.json";
import githubProfileData from "./scrapeProfiles/github.json";

export class DomainScraper {
  private profiles: { [key: string]: ScrapeProfile } = {};

  private profileNames: { [key: string]: string } = {};

  constructor() {
    this.loadProfiles();
  }

  private loadProfiles() {
    try {
      this.profiles["netflix.com"] = netflixProfileData as ScrapeProfile;
      this.profileNames["netflix.com"] = netflixProfileData.name;
    } catch (error) {
      console.warn("Failed to load Netflix scrape profile:", error);
    }

    try {
      this.profiles["hulu.com"] = huluProfileData as ScrapeProfile;
      this.profileNames["hulu.com"] = huluProfileData.name;
    } catch (error) {
      console.warn("Failed to load Hulu scrape profile:", error);
    }

    try {
      this.profiles["disneyplus.com"] = disneyProfileData as ScrapeProfile;
      this.profileNames["disneyplus.com"] = disneyProfileData.name;
    } catch (error) {
      console.warn("Failed to load Disney+ scrape profile:", error);
    }

    try {
      this.profiles["slashdot.org"] = slashdotProfileData as ScrapeProfile;
      this.profileNames["slashdot.org"] = slashdotProfileData.name;
    } catch (error) {
      console.warn("Failed to load Slashdot scrape profile:", error);
    }

    try {
      this.profiles["github.com"] = githubProfileData as ScrapeProfile;
      this.profileNames["github.com"] = githubProfileData.name;
    } catch (error) {
      console.warn("Failed to load GitHub scrape profile:", error);
    }
  }

  public getAllProfiles(): { [key: string]: ScrapeProfile } {
    return { ...this.profiles };
  }

  public getSupportedDomains(): string[] {
    return Object.keys(this.profiles);
  }

  public getProfile(domain: string): ScrapeProfile | undefined {
    return this.profiles[domain];
  }

  public canScrape(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace("www.", "");

      return domain in this.profiles;
    } catch {
      return false;
    }
  }

  public getProfileForUrl(url: string): ScrapeProfile | undefined {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace("www.", "");
      const profile = this.profiles[domain];

      if (!profile) {
        return undefined;
      }

      if (this.urlMatchesProfile(url, profile)) {
        return profile;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  public scrape(document: Document, url: string): ScrapeResult | null {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace("www.", "");
      const profile = this.profiles[domain];

      if (!profile) {
        return null;
      }

      if (!this.urlMatchesProfile(url, profile)) {
        return null;
      }

      const result: ScrapeResult = {
        profileName: profile.name,
        domain: profile.domain,
        url: url,
        timestamp: new Date().toISOString(),
        data: {},
      };

      for (const selectorName of Object.keys(profile.dataSelectors)) {
        const selectorConfig = profile.dataSelectors[selectorName];
        const containers = document.querySelectorAll(selectorConfig.container);
        const items: any[] = [];

        containers.forEach((container) => {
          const item: any = {};

          for (const fieldName of Object.keys(selectorConfig.fields)) {
            const fieldConfig = selectorConfig.fields[fieldName];
            const element = container.querySelector(fieldConfig.selector);

            if (element) {
              let value: string;

              switch (fieldConfig.type) {
                case "text":
                  value = element.textContent || "";
                  break;
                case "attribute":
                  value =
                    element.getAttribute(fieldConfig.attribute || "") || "";
                  break;
                case "html":
                  value = element.innerHTML || "";
                  break;
                default:
                  value = element.textContent || "";
              }

              if (fieldConfig.transform) {
                value = this.applyTransform(value, fieldConfig.transform, url);
              }

              item[fieldName] = value;
            }
          }

          if (Object.keys(item).length > 0) {
            items.push(item);
          }
        });

        result.data[selectorName] = items;
      }

      return result;
    } catch (error) {
      console.error("Error scraping data:", error);

      return null;
    }
  }

  private urlMatchesProfile(url: string, profile: ScrapeProfile): boolean {
    const targetUrls = Array.isArray(profile.targetUrl)
      ? profile.targetUrl
      : [profile.targetUrl];

    return targetUrls.some((pattern) => this.urlMatches(url, pattern));
  }

  private urlMatches(url: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\*/g, ".*");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
  }

  private applyTransform(
    value: string,
    transform: string,
    baseUrl: string,
  ): string {
    switch (transform) {
      case "trim":
        return value.trim();
      case "absoluteUrl":
        try {
          return new URL(value, baseUrl).href;
        } catch {
          return value;
        }

      case "parseDate":
        try {
          const dateParts = value.trim().split("/");
          if (dateParts.length === 3) {
            const [month, day, year] = dateParts;
            let fullYear = year;
            if (year.length === 2) {
              const currentYear = new Date().getFullYear() % 100;
              const century = parseInt(year) <= currentYear ? 2000 : 1900;
              fullYear = `${century + parseInt(year)}`;
            }

            return new Date(`${month}/${day}/${fullYear}`).toISOString();
          }
        } catch {
          // Fall through to return original value
        }

        return value;
      default:
        return value;
    }
  }
}

export const domainScraper = new DomainScraper();

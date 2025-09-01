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

import { profileManager } from "./profileManager";

export class DomainScraper {
  constructor() {
    // ProfileManager handles all profile loading
  }

  public getAllProfiles(): { [key: string]: ScrapeProfile } {
    const allProfiles: { [key: string]: ScrapeProfile } = {};
    const registry = profileManager.getAllProfiles();

    for (const categoryProfiles of Object.values(registry)) {
      Object.assign(allProfiles, categoryProfiles);
    }

    return allProfiles;
  }

  public getSupportedDomains(): string[] {
    return profileManager.getSupportedDomains();
  }

  public getProfile(domain: string): ScrapeProfile | undefined {
    return profileManager.getProfile(domain);
  }

  public canScrape(url: string): boolean {
    return profileManager.canScrape(url);
  }

  public getProfileForUrl(url: string): ScrapeProfile | undefined {
    return profileManager.getProfileForUrl(url);
  }

  public scrape(document: Document, url: string): ScrapeResult | null {
    try {
      const profile = profileManager.getProfileForUrl(url);

      if (!profile) {
        return null;
      }

      // Check if URL matches target pattern(s)
      if (!profileManager.urlMatchesProfile(url, profile)) {
        return null;
      }

      const result: ScrapeResult = {
        profileName: profile.name,
        domain: profile.domain,
        url: url,
        timestamp: new Date().toISOString(),
        data: {},
      };

      // Process each data selector
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

              // Apply transforms
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
        // Handle Netflix date format (e.g., "6/25/25")
        try {
          const dateParts = value.trim().split("/");
          if (dateParts.length === 3) {
            const [month, day, year] = dateParts;
            // Dynamically determine century for two-digit years using current year as pivot
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

// Export singleton instance
export const domainScraper = new DomainScraper();

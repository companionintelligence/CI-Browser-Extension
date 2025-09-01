export interface ScrapeProfile {
  domain: string;
  name: string;
  description: string;
  targetUrl: string;
  dataSelectors: {
    [key: string]: {
      container: string;
      fields: {
        [fieldName: string]: {
          selector: string;
          type: 'text' | 'attribute' | 'html';
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

// Import Netflix profile statically to avoid runtime import issues
import netflixProfileData from './scrapeProfiles/netflix.json';

export class DomainScraper {
  private profiles: { [key: string]: ScrapeProfile } = {};

  constructor() {
    this.loadProfiles();
  }

  private loadProfiles() {
    // Load Netflix profile
    try {
      this.profiles['netflix.com'] = netflixProfileData as ScrapeProfile;
    } catch (error) {
      console.warn('Failed to load Netflix scrape profile:', error);
    }
  }

  public getProfile(domain: string): ScrapeProfile | undefined {
    return this.profiles[domain];
  }

  public canScrape(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '') in this.profiles;
    } catch {
      return false;
    }
  }

  public scrape(document: Document, url: string): ScrapeResult | null {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const profile = this.profiles[domain];

      if (!profile) {
        return null;
      }

      // Check if URL matches target pattern
      if (!this.urlMatches(url, profile.targetUrl)) {
        return null;
      }

      const result: ScrapeResult = {
        profileName: profile.name,
        domain: profile.domain,
        url: url,
        timestamp: new Date().toISOString(),
        data: {}
      };

      // Process each data selector
      for (const selectorName of Object.keys(profile.dataSelectors)) {
        const selectorConfig = profile.dataSelectors[selectorName];
        const containers = document.querySelectorAll(selectorConfig.container);
        const items: any[] = [];

        containers.forEach(container => {
          const item: any = {};
          
          for (const fieldName of Object.keys(selectorConfig.fields)) {
            const fieldConfig = selectorConfig.fields[fieldName];
            const element = container.querySelector(fieldConfig.selector);
            
            if (element) {
              let value: string;
              
              switch (fieldConfig.type) {
                case 'text':
                  value = element.textContent || '';
                  break;
                case 'attribute':
                  value = element.getAttribute(fieldConfig.attribute || '') || '';
                  break;
                case 'html':
                  value = element.innerHTML || '';
                  break;
                default:
                  value = element.textContent || '';
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
      console.error('Error scraping data:', error);
      return null;
    }
  }

  private urlMatches(url: string, pattern: string): boolean {
    // Convert pattern to regex (simple wildcard support)
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\\\*/g, '.*'); // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
  }

  private applyTransform(value: string, transform: string, baseUrl: string): string {
    switch (transform) {
      case 'trim':
        return value.trim();
      case 'absoluteUrl':
        try {
          return new URL(value, baseUrl).href;
        } catch {
          return value;
        }
      case 'parseDate':
        // Handle Netflix date format (e.g., "6/25/25")
        try {
          const dateParts = value.trim().split('/');
          if (dateParts.length === 3) {
            const [month, day, year] = dateParts;
            const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
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
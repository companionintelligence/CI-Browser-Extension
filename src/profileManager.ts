/**
 * Profile Registry - Manages scrape profiles organized by category
 */

import type { ScrapeProfile } from "./domainScraper";

// Streaming profiles
import netflixProfile from "./scrapeProfiles/streaming/netflix.json";
import huluProfile from "./scrapeProfiles/streaming/hulu.json";
import disneyProfile from "./scrapeProfiles/streaming/disney.json";
import maxProfile from "./scrapeProfiles/streaming/max.json";
import primevideoProfile from "./scrapeProfiles/streaming/primevideo.json";
import paramountProfile from "./scrapeProfiles/streaming/paramount.json";

// Social media profiles
import quoraProfile from "./scrapeProfiles/social-media/quora.json";

// News profiles
import cnnProfile from "./scrapeProfiles/news/cnn.json";

export interface ProfileRegistry {
  [category: string]: {
    [domain: string]: ScrapeProfile;
  };
}

export class ProfileManager {
  private profiles: ProfileRegistry = {};

  private domainToProfile: Map<string, ScrapeProfile> = new Map();

  constructor() {
    this.loadAllProfiles();
  }

  private loadAllProfiles() {
    // Load streaming profiles
    this.loadCategoryProfiles("streaming", {
      "netflix.com": netflixProfile as ScrapeProfile,
      "hulu.com": huluProfile as ScrapeProfile,
      "disneyplus.com": disneyProfile as ScrapeProfile,
      "max.com": maxProfile as ScrapeProfile,
      "primevideo.com": primevideoProfile as ScrapeProfile,
      "paramountplus.com": paramountProfile as ScrapeProfile,
    });

    // Load social media profiles
    this.loadCategoryProfiles("social-media", {
      "quora.com": quoraProfile as ScrapeProfile,
    });

    // Load news profiles
    this.loadCategoryProfiles("news", {
      "cnn.com": cnnProfile as ScrapeProfile,
    });

    // Build domain to profile map for quick lookup
    this.buildDomainMap();
  }

  private loadCategoryProfiles(
    category: string,
    profiles: Record<string, ScrapeProfile>,
  ) {
    if (!this.profiles[category]) {
      this.profiles[category] = {};
    }

    for (const [domain, profile] of Object.entries(profiles)) {
      try {
        this.profiles[category][domain] = profile;
        console.log(
          `Loaded ${category} profile for ${domain}: ${profile.name}`,
        );
      } catch (error) {
        console.warn(
          `Failed to load ${category} profile for ${domain}:`,
          error,
        );
      }
    }
  }

  private buildDomainMap() {
    this.domainToProfile.clear();

    for (const categoryProfiles of Object.values(this.profiles)) {
      for (const [domain, profile] of Object.entries(categoryProfiles)) {
        this.domainToProfile.set(domain, profile);
      }
    }
  }

  public getAllProfiles(): ProfileRegistry {
    return { ...this.profiles };
  }

  public getProfilesByCategory(
    category: string,
  ): Record<string, ScrapeProfile> {
    return { ...(this.profiles[category] || {}) };
  }

  public getSupportedDomains(): string[] {
    return Array.from(this.domainToProfile.keys());
  }

  public getProfile(domain: string): ScrapeProfile | undefined {
    return this.domainToProfile.get(domain);
  }

  public getProfileForUrl(url: string): ScrapeProfile | undefined {
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname.replace("www.", "").replace("secure.", "");

      // Handle special cases for Amazon Prime Video
      if (domain === "amazon.com" && url.includes("/gp/video/")) {
        domain = "primevideo.com";
      }

      return this.getProfile(domain);
    } catch {
      return undefined;
    }
  }

  public canScrape(url: string): boolean {
    return this.getProfileForUrl(url) !== undefined;
  }

  public getProfileStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const [category, categoryProfiles] of Object.entries(this.profiles)) {
      stats[category] = Object.keys(categoryProfiles).length;
    }

    stats.total = this.domainToProfile.size;

    return stats;
  }

  public getCategories(): string[] {
    return Object.keys(this.profiles);
  }

  public urlMatchesProfile(url: string, profile: ScrapeProfile): boolean {
    const targetUrls = Array.isArray(profile.targetUrl)
      ? profile.targetUrl
      : [profile.targetUrl];

    return targetUrls.some((pattern) => this.urlMatches(url, pattern));
  }

  private urlMatches(url: string, pattern: string): boolean {
    // Convert pattern to regex (simple wildcard support)
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
      .replace(/\\\*/g, ".*"); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(url);
  }
}

// Export singleton instance
export const profileManager = new ProfileManager();

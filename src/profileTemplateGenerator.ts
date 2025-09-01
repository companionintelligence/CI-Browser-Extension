/**
 * Profile Template Generator
 * Provides templates and utilities for creating new scrape profiles
 */

export interface ProfileTemplate {
  category: string;
  description: string;
  commonSelectors: {
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
  personalDataTypes: string[];
}

export const PROFILE_TEMPLATES: Record<string, ProfileTemplate> = {
  streaming: {
    category: "Streaming & Entertainment",
    description: "Template for video/audio streaming services",
    commonSelectors: {
      watchlist: {
        container: ".watchlist-item, .saved-item, .title-card, .content-tile",
        fields: {
          title: {
            selector: ".title, h1, h2, h3, .content-title",
            type: "text",
            transform: "trim",
          },
          titleUrl: {
            selector: "a",
            type: "attribute",
            attribute: "href",
            transform: "absoluteUrl",
          },
          imageUrl: {
            selector: "img, .thumbnail",
            type: "attribute",
            attribute: "src",
            transform: "absoluteUrl",
          },
          description: {
            selector: ".description, .synopsis, .summary, p",
            type: "text",
            transform: "trim",
          },
        },
      },
      viewingHistory: {
        container: ".history-item, .continue-watching-item, .recently-watched",
        fields: {
          title: {
            selector: ".title, h1, h2, h3",
            type: "text",
            transform: "trim",
          },
          titleUrl: {
            selector: "a",
            type: "attribute",
            attribute: "href",
            transform: "absoluteUrl",
          },
          progress: {
            selector: ".progress, .watch-progress, .progress-bar",
            type: "text",
            transform: "trim",
          },
          lastWatched: {
            selector: ".date, .timestamp, .last-watched",
            type: "text",
            transform: "trim",
          },
        },
      },
    },
    personalDataTypes: ["entertainment_preferences", "viewing_history"],
  },

  socialMedia: {
    category: "Social Media",
    description: "Template for social media platforms",
    commonSelectors: {
      posts: {
        container: ".post, .tweet, .status, .update, article",
        fields: {
          content: {
            selector: ".content, .text, .message, p",
            type: "text",
            transform: "trim",
          },
          author: {
            selector: ".author, .username, .user, .handle",
            type: "text",
            transform: "trim",
          },
          timestamp: {
            selector: ".timestamp, .date, time, .posted-time",
            type: "text",
            transform: "trim",
          },
          likes: {
            selector: ".likes, .like-count, .reactions",
            type: "text",
            transform: "trim",
          },
          shares: {
            selector: ".shares, .retweets, .share-count",
            type: "text",
            transform: "trim",
          },
        },
      },
      profile: {
        container: ".profile, .user-info, .account-info",
        fields: {
          username: {
            selector: ".username, .handle, .user-name",
            type: "text",
            transform: "trim",
          },
          displayName: {
            selector: ".display-name, .full-name, .name",
            type: "text",
            transform: "trim",
          },
          bio: {
            selector: ".bio, .description, .about",
            type: "text",
            transform: "trim",
          },
          followers: {
            selector: ".followers, .follower-count",
            type: "text",
            transform: "trim",
          },
        },
      },
    },
    personalDataTypes: [
      "social_activity",
      "social_connections",
      "user_profile",
    ],
  },

  news: {
    category: "News & Media",
    description: "Template for news and media websites",
    commonSelectors: {
      articles: {
        container: ".article, .story, .news-item, article, .card",
        fields: {
          headline: {
            selector: ".headline, .title, h1, h2, h3",
            type: "text",
            transform: "trim",
          },
          articleUrl: {
            selector: "a",
            type: "attribute",
            attribute: "href",
            transform: "absoluteUrl",
          },
          summary: {
            selector: ".summary, .excerpt, .description, .lead, p",
            type: "text",
            transform: "trim",
          },
          author: {
            selector: ".author, .byline, .writer",
            type: "text",
            transform: "trim",
          },
          publishDate: {
            selector: ".publish-date, .date, time, .timestamp",
            type: "text",
            transform: "trim",
          },
          category: {
            selector: ".category, .section, .topic, .tag",
            type: "text",
            transform: "trim",
          },
        },
      },
    },
    personalDataTypes: ["news_consumption", "reading_history"],
  },

  ecommerce: {
    category: "E-commerce",
    description: "Template for shopping and e-commerce sites",
    commonSelectors: {
      orders: {
        container: ".order, .purchase, .order-item, .transaction",
        fields: {
          orderNumber: {
            selector: ".order-number, .order-id, .transaction-id",
            type: "text",
            transform: "trim",
          },
          productName: {
            selector: ".product-name, .item-name, .title",
            type: "text",
            transform: "trim",
          },
          price: {
            selector: ".price, .cost, .amount",
            type: "text",
            transform: "trim",
          },
          orderDate: {
            selector: ".order-date, .purchase-date, .date",
            type: "text",
            transform: "trim",
          },
          status: {
            selector: ".status, .order-status, .delivery-status",
            type: "text",
            transform: "trim",
          },
        },
      },
      wishlist: {
        container: ".wishlist-item, .saved-item, .favorite",
        fields: {
          productName: {
            selector: ".product-name, .title, h3, h4",
            type: "text",
            transform: "trim",
          },
          productUrl: {
            selector: "a",
            type: "attribute",
            attribute: "href",
            transform: "absoluteUrl",
          },
          price: {
            selector: ".price, .cost",
            type: "text",
            transform: "trim",
          },
          imageUrl: {
            selector: "img",
            type: "attribute",
            attribute: "src",
            transform: "absoluteUrl",
          },
        },
      },
    },
    personalDataTypes: ["purchase_history", "shopping_preferences", "wishlist"],
  },
};

/**
 * Generate a profile template for a specific site
 */
export function generateProfileTemplate(
  domain: string,
  siteName: string,
  category: keyof typeof PROFILE_TEMPLATES,
  targetUrls: string[],
): any {
  const template = PROFILE_TEMPLATES[category];
  if (!template) {
    throw new Error(`Unknown profile category: ${category}`);
  }

  return {
    domain,
    name: `${siteName} Data Scraper`,
    description: `Scrapes ${siteName} ${template.description.toLowerCase()}`,
    targetUrl: targetUrls,
    dataSelectors: template.commonSelectors,
    dataTypes: template.personalDataTypes.map((dataType) => ({
      name: dataType,
      description: `${siteName} ${dataType.replace("_", " ")} data`,
      personalDataType: dataType,
    })),
  };
}

/**
 * Get available profile categories
 */
export function getProfileCategories(): string[] {
  return Object.keys(PROFILE_TEMPLATES);
}

/**
 * Get template for a category
 */
export function getProfileTemplate(
  category: string,
): ProfileTemplate | undefined {
  return PROFILE_TEMPLATES[category];
}

/**
 * Generate profiles for high-priority sites without APIs
 */
export function generateHighPriorityProfiles(): Record<string, any> {
  const profiles: Record<string, any> = {};

  // Streaming sites without APIs
  const streamingSites = [
    {
      domain: "peacocktv.com",
      name: "Peacock",
      urls: ["https://www.peacocktv.com/*"],
    },
    {
      domain: "crunchyroll.com",
      name: "Crunchyroll",
      urls: ["https://www.crunchyroll.com/*"],
    },
    {
      domain: "sling.com",
      name: "Sling TV",
      urls: ["https://www.sling.com/*"],
    },
  ];

  for (const site of streamingSites) {
    profiles[`streaming/${site.domain}`] = generateProfileTemplate(
      site.domain,
      site.name,
      "streaming",
      site.urls,
    );
  }

  // News sites without APIs
  const newsSites = [
    {
      domain: "wsj.com",
      name: "Wall Street Journal",
      urls: ["https://www.wsj.com/*"],
    },
    {
      domain: "washingtonpost.com",
      name: "Washington Post",
      urls: ["https://www.washingtonpost.com/*"],
    },
    {
      domain: "aljazeera.com",
      name: "Al Jazeera",
      urls: ["https://www.aljazeera.com/*"],
    },
    { domain: "axios.com", name: "Axios", urls: ["https://www.axios.com/*"] },
    {
      domain: "politico.com",
      name: "Politico",
      urls: ["https://www.politico.com/*"],
    },
    {
      domain: "dailymail.co.uk",
      name: "Daily Mail",
      urls: ["https://www.dailymail.co.uk/*"],
    },
  ];

  for (const site of newsSites) {
    profiles[`news/${site.domain}`] = generateProfileTemplate(
      site.domain,
      site.name,
      "news",
      site.urls,
    );
  }

  return profiles;
}

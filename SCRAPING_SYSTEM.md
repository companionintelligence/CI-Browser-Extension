# Site Scrape Template System

This system provides a comprehensive, scalable framework for scraping data from major websites that don't offer public APIs.

## Overview

The scraping system is organized into categories based on website types:

- **Streaming & Entertainment** - Video/audio streaming platforms
- **Social Media & Messaging** - Social platforms and messaging services
- **News & Media** - News websites and media outlets
- **E-commerce & Marketplaces** - Shopping and marketplace sites
- **Travel & Mobility** - Travel booking and transportation services
- **Gaming & Game Platforms** - Gaming platforms and stores
- **Finance, Banking & Investing** - Financial services and trading platforms
- **Health, Fitness & Genomics** - Health and fitness tracking services
- **Education, Productivity & Developer Tools** - Learning and productivity platforms
- **Cloud, Creative & Storage** - Cloud services and creative tools

## Architecture

### Core Components

1. **ProfileManager** (`src/profileManager.ts`) - Manages all scrape profiles
2. **DomainScraper** (`src/domainScraper.ts`) - Executes scraping based on profiles
3. **Profile Templates** (`src/profileTemplateGenerator.ts`) - Templates for creating new profiles
4. **Content Script** (`src/entrypoints/domainScraper.content.ts`) - Runs on supported sites

### Profile Structure

Each scrape profile is a JSON file with the following structure:

```json
{
  "domain": "example.com",
  "name": "Example Site Scraper",
  "description": "Scrapes data from Example site",
  "targetUrl": ["https://www.example.com/path/*"],
  "dataSelectors": {
    "selectorGroup": {
      "container": ".container-selector",
      "fields": {
        "fieldName": {
          "selector": ".field-selector",
          "type": "text|attribute|html",
          "attribute": "href",
          "transform": "trim|absoluteUrl|parseDate"
        }
      }
    }
  },
  "dataTypes": [
    {
      "name": "data_type",
      "description": "Description of the data",
      "personalDataType": "category"
    }
  ]
}
```

## Currently Supported Sites

### Streaming & Entertainment
- **Netflix** (`netflix.com`) - Viewing history, watchlist, recommendations
- **Hulu** (`hulu.com`) - Account info, watch history, watchlist
- **Disney+** (`disneyplus.com`) - Watchlist, continue watching, recommendations
- **Max/HBO** (`max.com`) - Watchlist, viewing history, recommendations
- **Prime Video** (`primevideo.com`) - Watchlist, continue watching, recommendations
- **Paramount+** (`paramountplus.com`) - Watchlist, continue watching

### Social Media & Messaging
- **Quora** (`quora.com`) - Questions, answers, following

### News & Media
- **CNN** (`cnn.com`) - Articles, breaking news, headlines

## Adding New Sites

### Method 1: Use Profile Templates

The system includes templates for common site types:

```typescript
import { generateProfileTemplate } from './profileTemplateGenerator';

const profile = generateProfileTemplate(
  'example.com',
  'Example Site',
  'streaming', // or 'socialMedia', 'news', 'ecommerce'
  ['https://www.example.com/*']
);
```

### Method 2: Create Custom Profile

1. Create a new JSON file in the appropriate category folder:
   - `src/scrapeProfiles/streaming/` for streaming sites
   - `src/scrapeProfiles/social-media/` for social media
   - `src/scrapeProfiles/news/` for news sites
   - etc.

2. Use the profile structure above with site-specific selectors

3. Add the profile to `src/profileManager.ts`:
   ```typescript
   import newSiteProfile from "./scrapeProfiles/category/newsite.json";
   
   // In loadAllProfiles():
   this.loadCategoryProfiles("category", {
     "newsite.com": newSiteProfile as ScrapeProfile,
   });
   ```

4. Add the domain to the content script matches in `src/entrypoints/domainScraper.content.ts`

## High-Priority Sites (No Public APIs)

Based on the site analysis, these are the highest priority sites to add scraping support for:

### Streaming & Entertainment
- Max (HBO) ✅ 
- Prime Video ✅
- Paramount+ ✅
- Peacock
- Crunchyroll
- Sling TV

### Social Media & Messaging
- Quora ✅
- Signal

### News & Media
- CNN ✅
- Wall Street Journal
- Washington Post
- Al Jazeera
- Axios
- Politico
- Daily Mail

### E-commerce & Marketplaces
- Temu
- Robinhood

### Travel & Mobility
- Airbnb

### Gaming & Game Platforms
- Nintendo

### Finance, Banking & Investing
- JPMorgan Chase
- Bank of America
- Wells Fargo
- Venmo

### Health, Fitness & Genomics
- 23andMe
- Ancestry

## Data Types & Privacy

The system categorizes scraped data into personal data types:

- `entertainment_preferences` - Movie/TV viewing preferences
- `social_activity` - Social media posts and interactions
- `social_connections` - Following/friends data
- `news_consumption` - News reading habits
- `purchase_history` - Shopping and transaction data
- `user_profile` - Account and profile information

## Testing

Use the test page `test-multi-domain-scraper.html` to test scraping functionality across multiple domains.

## Transforms

The system supports several data transforms:

- `trim` - Remove whitespace
- `absoluteUrl` - Convert relative URLs to absolute
- `parseDate` - Parse dates into ISO format

## Future Enhancements

- Dynamic profile discovery
- Visual profile builder UI
- Automatic selector optimization
- Rate limiting and respectful scraping
- Profile validation and testing tools
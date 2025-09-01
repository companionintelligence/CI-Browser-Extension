# Site Scraping Profile Registry

This document catalogs all supported sites in the scraping system, organized by category and API availability.

## Profile Coverage Summary

**Total Profiles:** 11+ sites across 5 categories
**Original System:** 3 sites (Netflix, Hulu, Disney+)
**New System:** 8+ additional sites with scalable framework

## Supported Sites by Category

### 🎬 Streaming & Entertainment (6 profiles)
Sites prioritized for having **no public APIs** for personal data:

- **Netflix** (`netflix.com`) ✅ - Viewing history, watchlist, recommendations
- **Hulu** (`hulu.com`) ✅ - Account info, watch history, watchlist  
- **Disney+** (`disneyplus.com`) ✅ - Watchlist, continue watching, recommendations
- **Max (HBO)** (`max.com`) ✅ - Watchlist, viewing history, recommendations
- **Prime Video** (`primevideo.com`) ✅ - Watchlist, continue watching, recommendations
- **Paramount+** (`paramountplus.com`) ✅ - Watchlist, continue watching

### 💬 Social Media & Messaging (1 profile)
Focusing on sites **without public APIs**:

- **Quora** (`quora.com`) ✅ - Questions, answers, following

### 📰 News & Media (2 profiles) 
High-priority news sites **without public APIs**:

- **CNN** (`cnn.com`) ✅ - Articles, breaking news, headlines
- **Wall Street Journal** (`wsj.com`) ✅ - Articles, markets, premium content

### ✈️ Travel & Mobility (1 profile)
Major travel site **without public APIs**:

- **Airbnb** (`airbnb.com`) ✅ - Trips, wishlist, hosting activity

### 💰 Finance & Investing (1 profile)
Investment platform **without public APIs**:

- **Robinhood** (`robinhood.com`) ✅ - Portfolio, orders, watchlist

## High-Priority Expansion Targets

Based on the issue requirements, these sites are identified as next priorities:

### Streaming & Entertainment
- Peacock (peacocktv.com) - No API
- Crunchyroll (crunchyroll.com) - No API  
- Sling TV (sling.com) - No API

### News & Media
- Washington Post (washingtonpost.com) - No API
- Al Jazeera (aljazeera.com) - No API
- Axios (axios.com) - No API
- Politico (politico.com) - No API
- Daily Mail (dailymail.co.uk) - No API

### Social Media & Messaging  
- Signal (signal.org) - No API

### E-commerce & Marketplaces
- Temu (temu.com) - No API

### Gaming & Game Platforms
- Nintendo (nintendo.com) - No API

### Finance, Banking & Investing
- JPMorgan Chase (chase.com) - No API
- Bank of America (bankofamerica.com) - No API
- Wells Fargo (wellsfargo.com) - No API
- Venmo (venmo.com) - No API

### Health, Fitness & Genomics
- 23andMe (23andme.com) - No API
- Ancestry (ancestry.com) - No API

## Data Types Captured

The system categorizes scraped data for privacy compliance:

- **entertainment_preferences** - Viewing history, watchlists
- **social_activity** - Posts, questions, answers
- **social_connections** - Following, friends
- **news_consumption** - Articles read, reading habits
- **travel_history** - Trip bookings, travel patterns
- **travel_preferences** - Saved properties, wishlists
- **financial_data** - Investment portfolios, trading activity
- **financial_interests** - Watchlists, market interests
- **business_activity** - Hosting, selling activity

## Technical Architecture

### Scalable Profile System
- **ProfileManager** - Dynamically loads profiles by category
- **Profile Templates** - Systematic creation of new site profiles
- **Content Scripts** - Auto-matches against all supported domains
- **Data Transforms** - Built-in data cleaning and URL resolution

### Profile Structure
Each profile defines:
- Target URL patterns
- CSS selectors for data extraction
- Data field types and transformations
- Personal data type classifications

## Site Selection Criteria

Sites are prioritized based on:

1. **API Availability** - "No API" sites get highest priority
2. **User Base Size** - Major platforms with millions of users
3. **Data Richness** - Sites with significant personal data
4. **Technical Feasibility** - Scrapeable structure and stability

## Expansion Framework

The system supports unlimited expansion through:

1. **Template-based Generation** - Pre-built templates for common site types
2. **Category Organization** - Structured profile management
3. **Dynamic Loading** - No hardcoded site limits
4. **Profile Validation** - Consistent structure and validation

This framework transforms the original 3-site system into a comprehensive platform capable of handling the 100+ major sites identified in the requirements.
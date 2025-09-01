import axios from "axios";
import { fetchJson } from "../hooks/fetchJson";
import { jwtDecode } from "jwt-decode";
import { createWrapStore } from "webext-redux";
import { store } from "@/store";
import {
  setState,
  loadUserSettings,
  saveUserSettings,
} from "@/store/ciStateSlice";
import { siteRegex } from "@/utils.ts";
import type { ScrapeResult } from "@/domainScraper";
import bowser from "bowser";
import type { SurfingRecord } from "@/indexeddb";
import { database } from "@/indexeddb";
import { locationService } from "@/locationService";

const SLICE_SIZE = 50;
const BOOKMARK_SYNC_KEY = "lastBookmarkSync";

// Detect mobile environment
const browser_info = bowser.getParser(window.navigator.userAgent);
const isMobile = browser_info.getPlatformType() === "mobile";

// Adjust slice size for mobile to reduce memory usage
const MOBILE_SLICE_SIZE = isMobile ? 25 : SLICE_SIZE;

interface AuthResponse {
  accessToken: string;
  sessionToken: string;
}

const recordHit = async function (e: any) {
  const { accessToken } = store.getState().ciState;
  const accessDecoded = accessToken ? jwtDecode(accessToken) : null;
  const isAuthExpired =
    accessDecoded && accessDecoded.exp
      ? Date.now() >= accessDecoded.exp * 1000
      : true;
  if (e.frameId !== 0) {
    return;
  }

  const tabInfo = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const active = tabInfo[0];

  if (!active?.url) {
    return;
  }

  const parsed = URL.parse(active.url);
  if (!parsed) {
    return;
  }

  store.dispatch(setState({ domain: parsed.hostname, url: active.url }));

  let domainWhitelistHit = false,
    pageWhitelistHit = false;
  const state = store.getState().ciState;

  state.domainWhitelist.forEach((item) => {
    const domainRegex = new RegExp(item);

    if (state.domain && domainRegex.test(state.domain)) {
      domainWhitelistHit = true;

      return;
    }
  });

  state.pageWhitelist.forEach((item) => {
    const siteRegex = new RegExp(item.replace("?", "\\?"));

    if (state.url) {
      const parsedUrl = URL.parse(state.url);
      if (parsedUrl) {
        parsedUrl.hash = "";

        if (siteRegex.test(parsedUrl.toString())) {
          pageWhitelistHit = true;

          return;
        }
      }
    }
  });

  if (
    !isAuthExpired &&
    (domainWhitelistHit || pageWhitelistHit) &&
    state.lastUrl !== state.url
  ) {
    store.dispatch(setState({ lastUrl: state.url }));

    store.dispatch(saveUserSettings());

    const newEvent = await assembleContentAndEvents(state.url!);

    // Store surfing data in local database
    try {
      if (state.url && state.domain) {
        const surfingRecord: SurfingRecord = {
          url: state.url,
          domain: state.domain,
          title: newEvent.content?.[0]?.title || undefined,
          description: newEvent.content?.[0]?.text || undefined,
          visitTime: newEvent.start_time,
          synced: false, // Will be marked as synced after successful API call
        };

        const recordId = await database.insertSurfingRecord(surfingRecord);
        console.log("Surfing record stored locally with ID:", recordId);
      }
    } catch (dbError) {
      console.error("Failed to store surfing record in database:", dbError);
    }

    try {
      await axios.post(
        // TODO: update to use env var
        "https://dev.companionintelligence.com/api/events",
        newEvent,
        {
          headers: {
            Authorization: `Bearer ${state.accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      // Mark the surfing record as synced if API call was successful
      try {
        const unsyncedRecords = await database.getUnsyncedSurfingRecords();
        const latestRecord = unsyncedRecords.find(
          (record) =>
            record.url === state.url &&
            record.visitTime === newEvent.start_time,
        );
        if (latestRecord && latestRecord.id) {
          await database.markSurfingRecordAsSynced(latestRecord.id);
          console.log("Surfing record marked as synced");
        }
      } catch (syncError) {
        console.error("Failed to mark surfing record as synced:", syncError);
      }
    } catch (err) {
      console.log("error posting event", err);
    }

    triggerHistoryCrawl();
  }
};

async function triggerHistoryCrawl() {
  await store.dispatch({
    type: "loadUserSettings",
  });

  const state = store.getState().ciState;
  //Check to see if any whitelisted domains didn't finish their initial data crawl, and run it if they didn't (as long as they're not on Edge).
  Object.entries(state.domainWhitelistPending).forEach(
    async ([domainWhitelistItemKey, domainWhitelistItemValue]: [
      string,
      any,
    ]) => {
      //If the whitelistPending entry for a whitelist item is more than 5 minutes old, or is not a date, then clear it.
      //In the former case, the user likely closed the browser before the history crawl was completed.
      //The latter case sometimes happens for reasons I can't really deduce, but trying again should work.
      if (
        state.domainWhitelist.indexOf(domainWhitelistItemKey) !== -1 &&
        domainWhitelistItemValue &&
        new Date(new Date().getTime() - 300000).getTime() >
          domainWhitelistItemValue
      ) {
        const omitted = { ...state.domainWhitelistPending };
        delete (omitted as any)[domainWhitelistItemKey];
        store.dispatch(
          setState({
            domainWhitelistPending: omitted,
          }),
        );

        store.dispatch(saveUserSettings());
      }

      if (
        state.domainWhitelist.indexOf(domainWhitelistItemKey) > -1 &&
        state.domainWhitelistHistory.indexOf(domainWhitelistItemKey) === -1
      ) {
        store.dispatch(
          setState({
            domainWhitelistPending: {
              ...state.domainWhitelistPending,
              [domainWhitelistItemKey]: new Date().getTime(),
            },
          }),
        );

        store.dispatch(saveUserSettings());

        const baseResults = await browser.history.search({
          text: domainWhitelistItemKey,
          startTime: 0,
          maxResults: 1000000,
        });

        const hydratedAndFilteredResults: any[] = [];
        const regex = new RegExp(domainWhitelistItemKey);
        await Promise.all(
          baseResults.map((item) => {
            return new Promise<void>((resolve, reject) => {
              if (item.url && regex.test(item.url)) {
                try {
                  browser.history
                    .getVisits({
                      url: item.url,
                    })
                    .then((hydratedResults) => {
                      for (const hydratedResult of hydratedResults) {
                        hydratedAndFilteredResults.push({
                          ...hydratedResult,
                          url: item.url,
                        });
                      }

                      resolve();
                    });
                } catch (err) {
                  console.log("error", err);
                  reject(err);
                }
              } else {
                resolve();
              }
            });
          }),
        );

        let failed = false;
        for (
          let i = 0;
          i < hydratedAndFilteredResults.length;
          i = i + MOBILE_SLICE_SIZE
        ) {
          const slice = hydratedAndFilteredResults.slice(
            i,
            i + MOBILE_SLICE_SIZE,
          );
          const sliceEvents = await Promise.all(
            slice.map(async (result) => {
              return assembleContentAndEvents(
                result.url,
                new Date(result.visitTime).toJSON(),
              );
            }),
          );
          try {
            await axios.post(
              // TODO: update to use env var
              "https://dev.companionintelligence.com/api/events",
              sliceEvents,
              {
                headers: {
                  Authorization: `Bearer ${state.accessToken}`,
                  "Content-Type": "application/json",
                },
              },
            );
          } catch (err) {
            console.log("error posting events", err);
            failed = true;

            break;
          }
        }

        if (!failed) {
          const omitted = { ...state.domainWhitelistPending };
          delete omitted[domainWhitelistItemKey];

          store.dispatch(
            setState({
              domainWhitelistPending: omitted,
              domainWhitelistHistory: state.domainWhitelistHistory.concat([
                domainWhitelistItemKey,
              ]),
            }),
          );

          store.dispatch(saveUserSettings());
        }
      }
    },
  );

  Object.entries(state.pageWhitelistPending).forEach(
    async ([pageWhitelistItemKey, pageWhitelistItemValue]) => {
      //If the whitelistPending entry for a whitelist item is more than 5 minutes old, or is not a date, then clear it.
      //In the former case, the user likely closed the browser before the history crawl was completed.
      //The latter case sometimes happens for reasons I can't really deduce, but trying again should work.
      if (
        state.pageWhitelist.indexOf(pageWhitelistItemKey) &&
        new Date(new Date().getTime() - 300000).getTime() >
          pageWhitelistItemValue
      ) {
        const omitted = { ...state.pageWhitelistPending };
        delete omitted[pageWhitelistItemKey];
        store.dispatch(
          setState({
            pageWhitelistPending: omitted,
          }),
        );

        store.dispatch(saveUserSettings());
      }

      if (
        state.pageWhitelist.indexOf(pageWhitelistItemKey) > -1 &&
        state.pageWhitelistHistory.indexOf(pageWhitelistItemKey) === -1
      ) {
        store.dispatch(
          setState({
            pageWhitelistPending: {
              ...state.pageWhitelistPending,
              [pageWhitelistItemKey]: new Date().getTime(),
            },
          }),
        );

        store.dispatch(saveUserSettings());

        const baseResults = await browser.history.search({
          text: pageWhitelistItemKey,
          startTime: 0,
          maxResults: 1000000,
        });

        const hydratedAndFilteredResults: any[] = [];
        const regex = new RegExp(pageWhitelistItemKey);
        await Promise.all(
          baseResults.map((item) => {
            return new Promise<void>((resolve, reject) => {
              if (item.url && regex.test(item.url)) {
                try {
                  browser.history
                    .getVisits({
                      url: item.url,
                    })
                    .then((hydratedResults) => {
                      for (const hydratedResult of hydratedResults) {
                        hydratedAndFilteredResults.push({
                          ...hydratedResult,
                          url: item.url,
                        });
                      }

                      resolve();
                    });
                } catch (err) {
                  console.log("error", err);
                  reject(err);
                }
              } else {
                resolve();
              }
            });
          }),
        );

        const events = await Promise.all(
          hydratedAndFilteredResults.map(async (result) => {
            return assembleContentAndEvents(
              result.url,
              new Date(result.visitTime).toJSON(),
            );
          }),
        );

        let finished = false;
        let failed = false;
        let startIndex = 0;

        while (!finished) {
          const slice = events.slice(
            startIndex,
            startIndex + MOBILE_SLICE_SIZE,
          );
          if (slice.length > 0) {
            try {
              await axios.post(
                // TODO: update to use env var
                "https://dev.companionintelligence.com/api/events",
                slice,
                {
                  headers: {
                    Authorization: `Bearer ${state.accessToken}`,
                    "Content-Type": "application/json",
                  },
                },
              );
            } catch (err) {
              console.log("error posting events", err);
              failed = true;

              break;
            }
          }

          startIndex += MOBILE_SLICE_SIZE;

          if (slice.length < MOBILE_SLICE_SIZE) {
            finished = true;
          }
        }

        if (!failed) {
          const omitted = { ...state.pageWhitelistPending };
          delete omitted[pageWhitelistItemKey];

          store.dispatch(
            setState({
              pageWhitelistPending: omitted,
              pageWhitelistHistory: state.pageWhitelistHistory.concat([
                pageWhitelistItemKey,
              ]),
            }),
          );

          store.dispatch(saveUserSettings());
        }
      }
    },
  );
}

// Handle scraped data from domain scraper content scripts
async function handleScrapedData(scrapeResult: ScrapeResult) {
  const state = store.getState().ciState;
  const { accessToken } = state;

  if (!accessToken) {
    console.log("No access token, skipping scraped data upload");

    return;
  }

  // Convert scraped data to events format
  const events = [];

  for (const [dataType, items] of Object.entries(scrapeResult.data)) {
    if (!Array.isArray(items)) {
      // Optionally log a warning:
      console.warn(`Expected array for dataType "${dataType}", got:`, items);
      continue;
    }

    for (const item of items) {
      const event = {
        name: `Scraped ${scrapeResult.profileName} - ${item.title || "Data"}`,
        start_time: scrapeResult.timestamp,
        type: "Scraped Data",
        content: [
          {
            type: "Personal Data",
            mimetype: "application/json",
            url: scrapeResult.url,
            title: item.title || `${scrapeResult.profileName} Data`,
            text: JSON.stringify(item),
            scrapeProfile: scrapeResult.profileName,
            domain: scrapeResult.domain,
            dataType: dataType,
          },
        ],
      };
      events.push(event);
    }
  }

  if (events.length === 0) {
    console.log("No events generated from scraped data");

    return;
  }

  try {
    await axios.post(
      "https://dev.companionintelligence.com/api/events",
      events,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log(`Successfully uploaded ${events.length} scraped data events`);
  } catch (error) {
    console.error("Error uploading scraped data:", error);
  }
}

async function assembleContentAndEvents(url: string, time?: string) {
  let newThumbnailContent: any, newPageContent: any, newMediaContent: any;
  const newContent: any[] = [];

  await new Promise<void>(function (resolve) {
    try {
      axios
        .get(
          "https://dev.companionintelligence.com/embed/iframely?url=" +
            encodeURIComponent(url),
        )
        .then((result) => {
          const data = result.data;

          newPageContent = {
            type: "Web Page",
            mimetype: "text/html",
            title: undefined as string | undefined,
          };

          if (data.meta.description) {
            newPageContent.text = data.meta.description;

            // let tags = newContent.text.match(tagRegex);

            // if (tags != null) {
            //   for (let j = 0; j < tags.length; j++) {
            // newContent.tagMasks.source.push(tags[j].slice(1));
            // }
            // }
          }

          if (data.meta.title) {
            newPageContent.title = data.meta.title;

            // let tags = newContent.title.match(tagRegex);
            //
            // if (tags != null) {
            //   for (let j = 0; j < tags.length; j++) {
            //     newContent.tagMasks.source.push(tags[j].slice(1));
            //   }
            // }
          }

          const links = data.links || [];

          // newContent.tagMasks.source = _.uniq(newContent.tagMasks.source);

          const thumbnailLink = links.thumbnail?.find((link: any) => {
            return link.rel.indexOf("thumbnail") >= 0;
          });

          if (thumbnailLink != null) {
            newThumbnailContent = {
              type: "Image",
              mimetype: thumbnailLink.type,
              title: data.meta.title || "Thumbnail for " + data.meta.canonical,
              text: data.meta.description,
              url: thumbnailLink.href,
            };
          }

          if (links.player) {
            const playerLink = links.player[0];
            newMediaContent = {
              type: playerLink.rel.indexOf("audio") >= 0 ? "Audio" : "Video",
              mimetype: playerLink.type,
              title: data.meta.title,
              text: data.meta.description,
              url: playerLink.href,
            };
          }

          // if (data.html) {
          //   newEmbedContent = {
          //     type: 'Embed',
          //   }
          //   newEmbedContent.embed_content = data.html;
          //   newContent.embed_format = 'iframe';
          // }
          newContent.push(newPageContent);
          if (newThumbnailContent) {
            newContent.push(newThumbnailContent);
          }

          if (newMediaContent) {
            newContent.push(newMediaContent);
          }

          resolve();
        });
    } catch (error) {
      console.log("error hitting iframely", error);
      newPageContent = {
        type: "web-page",
        url: url,
      };
      newContent.push(newPageContent);
      resolve();
    }
  });

  return {
    name: "Visited " + url,
    start_time: time || new Date().toJSON(),
    type: "View",
    content: newContent,
  };
}

async function getAllBookmarks(): Promise<
  browser.bookmarks.BookmarkTreeNode[]
> {
  const bookmarkTree = await browser.bookmarks.getTree();
  const allBookmarks: browser.bookmarks.BookmarkTreeNode[] = [];

  function collectBookmarks(nodes: browser.bookmarks.BookmarkTreeNode[]) {
    for (const node of nodes) {
      if (node.url) {
        // This is an actual bookmark (not a folder)
        allBookmarks.push(node);
      }

      if (node.children) {
        collectBookmarks(node.children);
      }
    }
  }

  collectBookmarks(bookmarkTree);

  return allBookmarks;
}

async function createBookmarkEvent(
  bookmark: browser.bookmarks.BookmarkTreeNode,
  eventType: "create" | "update" | "sync" = "sync",
): Promise<{
  name: string;
  start_time: string;
  type: string;
  content: {
    type: string;
    mimetype?: string;
    url?: string;
    title?: string;
    text?: string;
  }[];
  bookmark_id: string;
}> {
  let newThumbnailContent, newPageContent, newMediaContent;
  const newContent = [];

  // Try to get page metadata for the bookmark URL
  await new Promise(function (resolve) {
    try {
      axios
        .get(
          "https://dev.companionintelligence.com/embed/iframely?url=" +
            encodeURIComponent(bookmark.url!),
        )
        .then((result) => {
          const data = result.data;

          newPageContent = {
            type: "Bookmark",
            mimetype: "text/html",
            url: data.meta.canonical || bookmark.url,
          };

          if (data.meta.description) {
            newPageContent.text = data.meta.description;
          }

          if (data.meta.title || bookmark.title) {
            newPageContent.title = data.meta.title || bookmark.title;
          }

          const links = data.links || [];

          const thumbnailLink = links.thumbnail?.find((link) => {
            return link.rel.indexOf("thumbnail") >= 0;
          });

          if (thumbnailLink != null) {
            newThumbnailContent = {
              type: "Image",
              mimetype: thumbnailLink.type,
              title: (data.meta.title || bookmark.title) + " - Thumbnail",
              text: data.meta.description,
              url: thumbnailLink.href,
            };
          }

          if (links.player) {
            const playerLink = links.player[0];
            newMediaContent = {
              type: playerLink.rel.indexOf("audio") >= 0 ? "Audio" : "Video",
              mimetype: playerLink.type,
              title: data.meta.title || bookmark.title,
              text: data.meta.description,
              url: playerLink.href,
            };
          }

          newContent.push(newPageContent);
          if (newThumbnailContent) {
            newContent.push(newThumbnailContent);
          }

          if (newMediaContent) {
            newContent.push(newMediaContent);
          }

          resolve(newContent);
        })
        .catch((error) => {
          console.log("error hitting iframely for bookmark", error);
          newPageContent = {
            type: "Bookmark",
            mimetype: "text/html",
            url: bookmark.url,
            title: bookmark.title,
          };
          newContent.push(newPageContent);
          resolve(newContent);
        });
    } catch (error) {
      console.log("error processing bookmark metadata", error);
      newPageContent = {
        type: "Bookmark",
        mimetype: "text/html",
        url: bookmark.url,
        title: bookmark.title,
      };
      newContent.push(newPageContent);
      resolve(newContent);
    }
  });

  return {
    name: `${eventType === "create" ? "Created" : eventType === "update" ? "Updated" : "Synced"} Bookmark: ${bookmark.title || bookmark.url}`,
    start_time: new Date(bookmark.dateAdded || Date.now()).toJSON(),
    type:
      eventType === "create"
        ? "Create"
        : eventType === "update"
          ? "Update"
          : "Bookmark",
    content: newContent,
    bookmark_id: bookmark.id,
  };
}

async function syncBookmarksToServer() {
  const state = store.getState().ciState;
  const { accessToken } = state;

  if (!accessToken) {
    console.log("No access token available for bookmark sync");

    return;
  }

  try {
    const allBookmarks = await getAllBookmarks();
    console.log(`Found ${allBookmarks.length} bookmarks to sync`);

    // Process bookmarks in batches
    for (let i = 0; i < allBookmarks.length; i += SLICE_SIZE) {
      const slice = allBookmarks.slice(i, i + SLICE_SIZE);
      const bookmarkEvents = await Promise.all(
        slice.map((bookmark) => createBookmarkEvent(bookmark, "sync")),
      );

      try {
        await axios.post(
          "https://dev.companionintelligence.com/api/events",
          bookmarkEvents,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
        console.log(`Synced batch of ${slice.length} bookmarks`);
      } catch (err) {
        console.log("Error posting bookmark events", err);
        throw err; // Re-throw to stop processing if there's an error
      }
    }

    // Update last sync timestamp
    await browser.storage.local.set({
      [BOOKMARK_SYNC_KEY]: Date.now(),
    });

    console.log("Bookmark sync completed successfully");
  } catch (error) {
    console.error("Error syncing bookmarks:", error);
  }
}

async function handleBookmarkCreated(
  id: string,
  bookmark: browser.bookmarks.BookmarkTreeNode,
) {
  const state = store.getState().ciState;
  const { accessToken } = state;

  if (!accessToken || !bookmark.url) {
    return; // Skip folders or if not authenticated
  }

  try {
    const bookmarkEvent = await createBookmarkEvent(bookmark, "create");
    await axios.post(
      "https://dev.companionintelligence.com/api/events",
      bookmarkEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("Synced newly created bookmark:", bookmark.title);
  } catch (error) {
    console.error("Error syncing created bookmark:", error);
  }
}

async function handleBookmarkChanged(id: string) {
  const state = store.getState().ciState;
  const { accessToken } = state;

  if (!accessToken) {
    return;
  }

  try {
    const bookmarks = await browser.bookmarks.get(id);
    const bookmark = bookmarks[0];

    if (!bookmark.url) {
      return; // Skip folders
    }

    const bookmarkEvent = await createBookmarkEvent(bookmark, "update");
    await axios.post(
      "https://dev.companionintelligence.com/api/events",
      bookmarkEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("Synced updated bookmark:", bookmark.title);
  } catch (error) {
    console.error("Error syncing updated bookmark:", error);
  }
}

async function handleBookmarkRemoved(
  id: string,
  removeInfo: browser.bookmarks.BookmarkRemoveInfo,
) {
  const state = store.getState().ciState;
  const { accessToken } = state;

  if (!accessToken) {
    return;
  }

  try {
    const bookmarkEvent = {
      name: `Removed Bookmark: ${removeInfo.node.title || removeInfo.node.url}`,
      start_time: new Date().toJSON(),
      type: "Remove",
      content: [
        {
          type: "Bookmark",
          mimetype: "text/html",
          url: removeInfo.node.url,
          title: removeInfo.node.title,
        },
      ],
      bookmark_id: id,
    };

    await axios.post(
      "https://dev.companionintelligence.com/api/events",
      bookmarkEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("Synced removed bookmark:", removeInfo.node.title);
  } catch (error) {
    console.error("Error syncing removed bookmark:", error);
  }
}

export default defineBackground({
  main() {
    // const tagRegex = /#[^#\s]+/g;

    // Initialize database and location service
    const initServices = async () => {
      try {
        await database.init();
        console.log("Database initialized");

        // Start location tracking if user has granted permission
        await locationService.startLocationTracking();
        console.log("Location tracking started");
      } catch (error) {
        console.error("Failed to initialize services:", error);
      }
    };

    // Initialize services
    initServices();

    const wrapStore = createWrapStore();
    wrapStore(store);
    const ACCESS_TOKEN_KEY = "accessToken";
    const storageDefaults = {
      domainWhitelist: [],
      domainWhitelistPending: {},
      domainWhitelistHistory: [],
      pageWhitelist: [],
      pageWhitelistPending: {},
      pageWhitelistHistory: [],
      url: null,
      domain: null,
      lastUrl: null,
      accessToken: null,
      sessionToken: null,
      refreshing: false,
    };

    const refreshAccessToken = async () => {
      if (store.getState().ciState.refreshing) {
        return;
      }

      store.dispatch(setState({ refreshing: true }));
      const sessionToken = (await browser.storage.local.get("sessionToken"))
        .sessionToken;
      try {
        const data: AuthResponse = await fetchJson(
          "https://dev.companionintelligence.com/api/authenticate/refresh",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionToken}`,
            },
          },
        );

        store.dispatch(setState({ accessToken: data.accessToken }));
        store.dispatch(setState({ sessionToken: data.sessionToken }));
        const decoded = jwtDecode(data.accessToken);
        browser.cookies.set({
          url: "https://dev.companionintelligence.com",
          expirationDate: decoded.exp,
          name: `CI_${ACCESS_TOKEN_KEY}`,
          value: data.accessToken,
          sameSite: "no_restriction",
          secure: true,
        });
        store.dispatch(setState({ refreshing: false }));
      } catch (err) {
        console.error("Error refreshing token", err);
        store.dispatch(setState({ refreshing: false }));
      }
    };

    setInterval(async () => {
      browser.cookies
        .getAll({ url: "https://dev.companionintelligence.com" })
        .then(async (result) => {
          const accessTokenCookie = result.find(
            (cookie) => cookie.name === "CI_accessToken",
          );
          const sessionTokenCookie = result.find(
            (cookie) => cookie.name === "CI_sessionToken",
          );
          let { accessToken, sessionToken } = store.getState().ciState;
          if (accessTokenCookie && accessTokenCookie.value !== accessToken) {
            store.dispatch(setState({ accessToken: accessTokenCookie.value }));
          }

          if (sessionTokenCookie && sessionTokenCookie.value !== sessionToken) {
            const cookieDecoded = jwtDecode(sessionTokenCookie.value) as any;
            const cookieExpires = new Date(cookieDecoded.exp * 1000);
            const stateDecoded = sessionToken
              ? (jwtDecode(sessionToken) as any)
              : null;
            const stateExpired = stateDecoded
              ? new Date(stateDecoded.exp * 1000)
              : null;
            if (
              !stateExpired ||
              cookieExpires.getTime() > stateExpired.getTime()
            ) {
              store.dispatch(
                setState({ sessionToken: sessionTokenCookie.value }),
              );
            }
          }

          ({ accessToken, sessionToken } = store.getState().ciState);
          const accessDecoded = accessToken
            ? (jwtDecode(accessToken) as any)
            : null;
          const isAuthExpired = accessDecoded
            ? Date.now() >= accessDecoded.exp * 1000
            : true;
          const sessionDecoded = sessionToken
            ? (jwtDecode(sessionToken) as any)
            : null;
          const isSessionExpired = sessionDecoded
            ? Date.now() >= sessionDecoded.exp * 1000
            : true;
          if (
            (!accessTokenCookie && sessionTokenCookie) ||
            (isAuthExpired && !isSessionExpired)
          ) {
            await refreshAccessToken();
          }

          store.dispatch(saveUserSettings());

          // Sync location data periodically
          try {
            await locationService.syncLocationData();
          } catch (error) {
            console.error("Error syncing location data:", error);
          }
        });
    }, 1000);

    browser.runtime.onInstalled.addListener(async function () {
      store.dispatch(loadUserSettings());

      const existingKeys = Object.keys(store.getState().ciState);
      const toSet = Object.keys(storageDefaults)
        .filter((key) => existingKeys.indexOf(key) < 0)
        .reduce((obj: any, key) => {
          obj[key] = (storageDefaults as any)[key];

          return obj;
        }, {});

      store.dispatch(setState(toSet));

      browser.tabs.onActivated.addListener(async () => {
        const tabInfo = await browser.tabs.query({
          active: true,
        });
        const active = tabInfo[0];

        if (active?.url) {
          const parsed = URL.parse(active.url);
          if (parsed) {
            store.dispatch(setState({ domain: parsed.hostname }));
            store.dispatch(setState({ url: active.url }));
          }
        }
      });

      // Use onCompleted for non-SPA pages, but make sure the URL is valid
      // Some SPAs may trigger onCompleted with an invalid URL, and we don't want to record those hits
      browser.webNavigation.onCompleted.addListener((e) => {
        if (siteRegex.test(e.url)) {
          recordHit(e);
        }
      });
      // Use onHistoryStateUpdated in order to support single-page apps
      // onCompleted will not fire when an SPA updates the URL without a full page reload
      browser.webNavigation.onHistoryStateUpdated.addListener(recordHit);

      // Set up bookmark sync listeners
      browser.bookmarks.onCreated.addListener(handleBookmarkCreated);
      browser.bookmarks.onChanged.addListener(handleBookmarkChanged);
      browser.bookmarks.onRemoved.addListener(handleBookmarkRemoved);

      // Initial bookmark sync on install
      setTimeout(async () => {
        const lastSync = await browser.storage.local.get(BOOKMARK_SYNC_KEY);
        if (!lastSync[BOOKMARK_SYNC_KEY]) {
          console.log("Performing initial bookmark sync");
          await syncBookmarksToServer();
        }
      }, 5000); // Wait 5 seconds after install to ensure authentication is ready
    });

    // Listen for scraped data from content scripts
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "DOMAIN_SCRAPE_DATA") {
        handleScrapedData(message.data)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error("Error handling scraped data:", error);
            sendResponse({ success: false, error: error.message });
          });

        return true; // Will respond asynchronously
      }
    });
  },
});

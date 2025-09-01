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

const SLICE_SIZE = 50;

const recordHit = async function (e) {
  const { accessToken } = store.getState().ciState;
  const accessDecoded = accessToken ? jwtDecode(accessToken) : null;
  const isAuthExpired = accessDecoded
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

  const parsed = URL.parse(active.url);
  if (!parsed) {
    return;
  }

  store.dispatch(setState({ domain: parsed.hostname, url: active.url }));

  let domainWhitelistHit,
    pageWhitelistHit = false;
  const state = store.getState().ciState;

  state.domainWhitelist.forEach((item) => {
    const domainRegex = new RegExp(item);

    if (domainRegex.test(state.domain)) {
      domainWhitelistHit = true;

      return;
    }
  });

  state.pageWhitelist.forEach((item) => {
    const siteRegex = new RegExp(item.replace("?", "\\?"));

    const parsedUrl = URL.parse(state.url);

    parsedUrl.hash = "";

    if (siteRegex.test(parsedUrl.toString())) {
      pageWhitelistHit = true;

      return;
    }
  });

  if (
    !isAuthExpired &&
    (domainWhitelistHit || pageWhitelistHit) &&
    state.lastUrl !== state.url
  ) {
    store.dispatch(setState({ lastUrl: state.url }));

    store.dispatch(saveUserSettings());

    const newEvent = await assembleContentAndEvents(state.url);

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
    async ([domainWhitelistItemKey, domainWhitelistItemValue]) => {
      //If the whitelistPending entry for a whitelist item is more than 5 minutes old, or is not a date, then clear it.
      //In the former case, the user likely closed the browser before the history crawl was completed.
      //The latter case sometimes happens for reasons I can't really deduce, but trying again should work.
      if (
        state.domainWhitelist.indexOf(domainWhitelistItemKey) &&
        new Date(new Date().getTime() - 300000).getTime() >
          domainWhitelistItemValue
      ) {
        const omitted = { ...state.domainWhitelistPending };
        delete omitted[domainWhitelistItemKey];
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

        const hydratedAndFilteredResults = [];
        const regex = new RegExp(domainWhitelistItemKey);
        await Promise.all(
          baseResults.map((item) => {
            return new Promise((resolve, reject) => {
              if (regex.test(URL.parse(item.url).hostname)) {
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

                      resolve(true);
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
          i = i + SLICE_SIZE
        ) {
          const slice = hydratedAndFilteredResults.slice(i, i + SLICE_SIZE);
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

        const hydratedAndFilteredResults = [];
        const regex = new RegExp(pageWhitelistItemKey);
        await Promise.all(
          baseResults.map((item) => {
            return new Promise((resolve, reject) => {
              if (regex.test(item.url)) {
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

                      resolve(true);
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
          const slice = events.slice(startIndex, startIndex + SLICE_SIZE);
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

          startIndex += SLICE_SIZE;

          if (slice.length < SLICE_SIZE) {
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

// OAuth configuration
const OAUTH_CONFIG = {
  clientId: "ci-browser-extension",
  authUrl: "https://dev.companionintelligence.com/oauth/authorize",
  tokenUrl: "https://dev.companionintelligence.com/oauth/token",
  redirectUrl: browser.identity.getRedirectURL(),
  scope: "read write capture",
};

// OAuth helper functions
async function initiateOAuthFlow() {
  try {
    const authUrl = `${OAUTH_CONFIG.authUrl}?client_id=${OAUTH_CONFIG.clientId}&redirect_uri=${encodeURIComponent(OAUTH_CONFIG.redirectUrl)}&response_type=code&scope=${encodeURIComponent(OAUTH_CONFIG.scope)}`;

    const redirectUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    const url = new URL(redirectUrl);
    const code = url.searchParams.get("code");

    if (code) {
      const tokenResponse = await axios.post(OAUTH_CONFIG.tokenUrl, {
        grant_type: "authorization_code",
        client_id: OAUTH_CONFIG.clientId,
        code: code,
        redirect_uri: OAUTH_CONFIG.redirectUrl,
      });

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      const expiryTime = Date.now() + expires_in * 1000;

      store.dispatch(
        setState({
          oauthAccessToken: access_token,
          oauthRefreshToken: refresh_token,
          oauthTokenExpiry: expiryTime,
        }),
      );

      store.dispatch(saveUserSettings());

      return { success: true };
    } else {
      throw new Error("No authorization code received");
    }
  } catch (error) {
    console.error("OAuth flow failed:", error);

    return { success: false, error: error.message };
  }
}

async function refreshOAuthToken() {
  try {
    const state = store.getState().ciState;
    const { oauthRefreshToken } = state;

    if (!oauthRefreshToken) {
      throw new Error("No refresh token available");
    }

    const tokenResponse = await axios.post(OAUTH_CONFIG.tokenUrl, {
      grant_type: "refresh_token",
      client_id: OAUTH_CONFIG.clientId,
      refresh_token: oauthRefreshToken,
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiryTime = Date.now() + expires_in * 1000;

    store.dispatch(
      setState({
        oauthAccessToken: access_token,
        oauthRefreshToken: refresh_token || oauthRefreshToken,
        oauthTokenExpiry: expiryTime,
      }),
    );

    store.dispatch(saveUserSettings());

    return access_token;
  } catch (error) {
    console.error("Failed to refresh OAuth token:", error);
    // Clear OAuth tokens on failure
    store.dispatch(
      setState({
        oauthAccessToken: null,
        oauthRefreshToken: null,
        oauthTokenExpiry: null,
      }),
    );

    return null;
  }
}

async function getValidOAuthToken() {
  const state = store.getState().ciState;
  const { oauthAccessToken, oauthTokenExpiry } = state;

  if (!oauthAccessToken || !oauthTokenExpiry) {
    return null;
  }

  // Check if token expires within 5 minutes, refresh if so
  if (Date.now() > oauthTokenExpiry - 300000) {
    return await refreshOAuthToken();
  }

  return oauthAccessToken;
}

// Enhanced capture functions
async function captureWebcam() {
  return new Promise((resolve, reject) => {
    // Inject content script to access webcam
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length === 0) {
        reject(new Error("No active tab found"));

        return;
      }

      const tabId = tabs[0].id;

      // Execute script in content context to access webcam
      browser.scripting
        .executeScript({
          target: { tabId },
          func: async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: false,
              });

              const video = document.createElement("video");
              video.srcObject = stream;
              video.play();

              return new Promise((resolve) => {
                video.addEventListener("loadedmetadata", () => {
                  const canvas = document.createElement("canvas");
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;

                  const ctx = canvas.getContext("2d");
                  ctx.drawImage(video, 0, 0);

                  // Stop the stream
                  stream.getTracks().forEach((track) => track.stop());

                  const dataUrl = canvas.toDataURL("image/png");
                  resolve(dataUrl);
                });
              });
            } catch (error) {
              throw new Error(`Webcam access failed: ${error.message}`);
            }
          },
        })
        .then((results) => {
          if (results && results[0] && results[0].result) {
            resolve(results[0].result);
          } else {
            reject(new Error("Failed to capture webcam"));
          }
        })
        .catch(reject);
    });
  });
}

async function captureDesktop() {
  try {
    // Request desktop capture
    const streamId = await new Promise((resolve, reject) => {
      browser.desktopCapture.chooseDesktopMedia(
        ["screen", "window"],
        (streamId) => {
          if (streamId) {
            resolve(streamId);
          } else {
            reject(new Error("Desktop capture cancelled by user"));
          }
        },
      );
    });

    // Capture screenshot using the stream
    return new Promise((resolve, reject) => {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        if (tabs.length === 0) {
          reject(new Error("No active tab found"));

          return;
        }

        const tabId = tabs[0].id;

        browser.scripting
          .executeScript({
            target: { tabId },
            func: async (streamId) => {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  audio: false,
                  video: {
                    mandatory: {
                      chromeMediaSource: "desktop",
                      chromeMediaSourceId: streamId,
                    },
                  },
                });

                const video = document.createElement("video");
                video.srcObject = stream;
                video.play();

                return new Promise((resolve) => {
                  video.addEventListener("loadedmetadata", () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;

                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(video, 0, 0);

                    // Stop the stream
                    stream.getTracks().forEach((track) => track.stop());

                    const dataUrl = canvas.toDataURL("image/png");
                    resolve(dataUrl);
                  });
                });
              } catch (error) {
                throw new Error(`Desktop capture failed: ${error.message}`);
              }
            },
            args: [streamId],
          })
          .then((results) => {
            if (results && results[0] && results[0].result) {
              resolve(results[0].result);
            } else {
              reject(new Error("Failed to capture desktop"));
            }
          })
          .catch(reject);
      });
    });
  } catch (error) {
    console.error("Desktop capture error:", error);
    throw error;
  }
}

async function captureAndSendToCI(captureType = "auto") {
  try {
    const state = store.getState().ciState;
    const { captureSettings } = state;

    // Get valid OAuth token
    const accessToken = await getValidOAuthToken();
    if (!accessToken) {
      throw new Error("OAuth authentication required");
    }

    // Get the current active tab for context
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const currentTab = tabs[0];

    if (!currentTab || !currentTab.id) {
      throw new Error("No active tab found");
    }

    let captureData = null;
    let captureMethod = "";

    // Determine what to capture based on settings and type
    if (
      captureType === "webcam" ||
      (captureType === "auto" && captureSettings.enableWebcam)
    ) {
      try {
        captureData = await captureWebcam();
        captureMethod = "webcam";
      } catch (error) {
        console.warn("Webcam capture failed, trying desktop:", error.message);
        if (captureSettings.enableDesktop) {
          captureData = await captureDesktop();
          captureMethod = "desktop";
        } else {
          throw error;
        }
      }
    } else if (
      captureType === "desktop" ||
      (captureType === "auto" && captureSettings.enableDesktop)
    ) {
      captureData = await captureDesktop();
      captureMethod = "desktop";
    } else {
      throw new Error("No capture method enabled");
    }

    if (!captureData) {
      throw new Error("Failed to capture image data");
    }

    // Create capture event for CI-Server
    const captureEvent = {
      name: `${captureMethod === "webcam" ? "Webcam" : "Desktop"} capture from ${currentTab.title || currentTab.url}`,
      start_time: new Date().toJSON(),
      type: "Capture",
      content: [
        {
          type: "Image",
          mimetype: "image/png",
          title: `${captureMethod === "webcam" ? "Webcam" : "Desktop"} Capture - ${currentTab.title || "Untitled"}`,
          text: `${captureMethod === "webcam" ? "Webcam" : "Desktop"} capture taken from: ${currentTab.url}`,
          url: currentTab.url,
          data: captureData, // Base64 encoded image data
          capture_method: captureMethod,
        },
      ],
    };

    // Send to CI-Server using OAuth token
    await axios.post(
      "https://dev.companionintelligence.com/api/events",
      captureEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return { success: true, method: captureMethod };
  } catch (error) {
    console.error("Error capturing and sending:", error);

    return { success: false, error: error.message };
  }
}

// Scheduled capture functionality
let captureInterval = null;

function startScheduledCapture() {
  const state = store.getState().ciState;
  const { captureSettings } = state;

  if (captureInterval) {
    clearInterval(captureInterval);
  }

  if (captureSettings.autoCapture && captureSettings.captureInterval > 0) {
    captureInterval = setInterval(async () => {
      try {
        const result = await captureAndSendToCI("auto");
        console.log("Scheduled capture completed:", result);
      } catch (error) {
        console.error("Scheduled capture failed:", error);
      }
    }, captureSettings.captureInterval);

    console.log(
      `Started scheduled capture every ${captureSettings.captureInterval}ms`,
    );
  }
}

function stopScheduledCapture() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
    console.log("Stopped scheduled capture");
  }
}

async function assembleContentAndEvents(url: string, time?: string) {
  let newThumbnailContent, newPageContent, newMediaContent;
  const newContent = [];

  await new Promise(function (resolve) {
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
            url: data.meta.canonical,
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

          const thumbnailLink = links.thumbnail?.find((link) => {
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

export default defineBackground({
  main() {
    // const tagRegex = /#[^#\s]+/g;

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
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthTokenExpiry: null,
      refreshing: false,
      captureSettings: {
        enableWebcam: true,
        enableDesktop: true,
        autoCapture: false,
        captureInterval: 300000, // 5 minutes default
      },
    };

    const refreshAccessToken = async () => {
      if (store.getState().refreshing) {
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
          if (accessTokenCookie && accessTokenCookie !== accessToken) {
            store.dispatch(setState({ accessToken: accessTokenCookie.value }));
          }

          if (sessionTokenCookie && sessionTokenCookie !== sessionToken) {
            const cookieDecoded = jwtDecode(sessionTokenCookie.value);
            const cookieExpires = new Date(cookieDecoded.exp * 1000);
            const stateDecoded = sessionToken ? jwtDecode(sessionToken) : null;
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
          const accessDecoded = accessToken ? jwtDecode(accessToken) : null;
          const isAuthExpired = accessDecoded
            ? Date.now() >= accessDecoded.exp * 1000
            : true;
          const sessionDecoded = sessionToken ? jwtDecode(sessionToken) : null;
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
        });
    }, 1000);

    browser.runtime.onInstalled.addListener(async function () {
      store.dispatch(loadUserSettings());

      const existingKeys = Object.keys(store.getState().ciState);
      const toSet = Object.keys(storageDefaults)
        .filter((key) => existingKeys.indexOf(key) < 0)
        .reduce((obj, key) => {
          obj[key] = storageDefaults[key];

          return obj;
        }, {});

      store.dispatch(setState(toSet));

      // Initialize scheduled capture if enabled
      setTimeout(() => {
        const state = store.getState().ciState;
        if (state.captureSettings?.autoCapture) {
          startScheduledCapture();
        }
      }, 2000);

      browser.tabs.onActivated.addListener(async () => {
        const tabInfo = await browser.tabs.query({
          active: true,
        });
        const active = tabInfo[0];

        const parsed = URL.parse(active.url);

        store.dispatch(setState({ domain: parsed.hostname }));
        store.dispatch(setState({ url: active.url }));
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
    });

    // Handle messages from popup and other parts of the extension
    browser.runtime.onMessage.addListener(async (request) => {
      if (request.action === "captureScreenshot") {
        // Legacy support - now captures webcam/desktop
        const result = await captureAndSendToCI();

        return result;
      } else if (request.action === "captureWebcam") {
        const result = await captureAndSendToCI("webcam");

        return result;
      } else if (request.action === "captureDesktop") {
        const result = await captureAndSendToCI("desktop");

        return result;
      } else if (request.action === "startOAuth") {
        const result = await initiateOAuthFlow();

        return result;
      } else if (request.action === "startScheduledCapture") {
        startScheduledCapture();

        return { success: true };
      } else if (request.action === "stopScheduledCapture") {
        stopScheduledCapture();

        return { success: true };
      }
    });

    // Handle keyboard shortcuts
    browser.commands.onCommand.addListener(async (command) => {
      if (command === "capture-screenshot") {
        await captureAndSendToCI();
      }
    });
  },
});

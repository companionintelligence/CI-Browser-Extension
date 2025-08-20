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

const recordHit = async function (e) {
  const { accessToken } = store.getState().ciState;
  const accessDecoded = accessToken ? jwtDecode(accessToken) : null;
  const isAuthExpired = accessDecoded
    ? Date.now() >= accessDecoded.exp * 1000
    : true;
  if (e.frameId !== 0) {
    return;
  } // Only handle main frame navigation

  const tabInfo = await browser.tabs.query({
    active: true,
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
    const siteRegex = new RegExp(item);

    const parsedUrl = URL.parse(state.url);

    const condensedUrl =
      parsedUrl.protocol + "//" + parsedUrl.host + parsedUrl.pathname;

    if (siteRegex.test(condensedUrl)) {
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

    let newThumbnailContent, newPageContent, newMediaContent;
    const newContent = [];

    await new Promise(function (resolve) {
      try {
        axios
          .get(
            "https://dev.companionintelligence.com/embed/iframely?url=" +
              state.url,
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

            const thumbnailLink = links.thumbnail.find((link) => {
              return link.rel.indexOf("thumbnail") >= 0;
            });

            if (thumbnailLink != null) {
              newThumbnailContent = {
                type: "Image",
                mimetype: thumbnailLink.type,
                title:
                  data.meta.title || "Thumbnail for " + data.meta.canonical,
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
          url: state.url,
        };
        newContent.push(newPageContent);
        resolve();
      }
    });

    const newEvent = {
      name: "Visited " + state.url,
      start_time: new Date().toJSON(),
      type: "View",
    };

    let newEventResult;
    try {
      newEventResult = await axios.post(
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

    if (newEventResult) {
      try {
        await Promise.all(
          newContent.map((content) => {
            return new Promise((resolve, reject) => {
              content.event_id = newEventResult.data.id;
              try {
                axios
                  .post(
                    // TODO: update to use env var
                    "https://dev.companionintelligence.com/api/contents",
                    content,
                    {
                      headers: {
                        Authorization: `Bearer ${state.accessToken}`,
                        "Content-Type": "application/json",
                      },
                    },
                  )
                  .then((result) => {
                    content.id = result.data.id;
                    resolve();
                  });
              } catch (err) {
                reject(err);
              }
            });
          }),
        );
      } catch (err) {
        console.log("error posting content", err);
      }

      const eventSourceData = newContent.map(
        (content) => `content_${content.id}`,
      );

      try {
        await axios.patch(
          `https://dev.companionintelligence.com/api/events/${newEventResult.data.id}`,
          {
            source_data: {
              related_objects: eventSourceData,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${state.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (err) {
        console.log("error patching event with source data", err);
      }
    }

    // triggerHistoryCrawl(store.connection);
  }
};

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
      refreshing: false,
    };
    // async function triggerHistoryCrawl(connection) {
    // await store.dispatch({
    //   type: 'loadUserSettings'
    // });
    //
    // //Check to see if any whitelisted domains didn't finish their initial data crawl, and run it if they didn't (as long as they're not on Edge).
    // if (bowser.name !== 'Microsoft Edge') {
    //   _.each(browser.storage.local.whitelist, async function(whitelistItem) {
    //     //If the whitelistPending entry for a whitelist item is more than 5 minutes old, or is not a date, then clear it.
    //     //In the former case, the user likely closed the browser before the history crawl was completed.
    //     //The latter case sometimes happens for reasons I can't really deduce, but trying again should work.
    //     if ((browser.storage.local.whitelistPending[whitelistItem] && moment().utc().subtract(5, 'minutes').toDate() > browser.storage.local.whitelistPending[whitelistItem]) || (browser.storage.local.whitelistPending[whitelistItem] instanceof Date === false)) {
    //       delete browser.storage.local.whitelistPending[whitelistItem];
    //
    //       await store.dispatch({
    //         type: 'saveUserSettings'
    //       });
    //     }
    //
    //     if (Object.keys(browser.storage.local.whitelistPending).indexOf(whitelistItem) === -1 && browser.storage.local.whitelistHistory.indexOf(whitelistItem) === -1) {
    //       let regexp = new RegExp(whitelistItem);
    //
    //       browser.storage.local.whitelistPending[whitelistItem] = moment().utc().toDate();
    //
    //       store.dispatch({
    //         type: 'saveUserSettings'
    //       });
    //
    //       browser.runtime.sendMessage({
    //         data: 'userSettingsSaved'
    //       });
    //
    //       let baseResults = await new Promise(function(resolve, reject) {
    //         browser.history.search({
    //           text: '',
    //           startTime: 0,
    //           maxResults: 1000000
    //         }, function(results) {
    //           resolve(results);
    //         });
    //       });
    //
    //       let matches = _.filter(baseResults, function(item) {
    //         let parsed = url.parse(item.url);
    //
    //         if (item.url === whitelistItem || item.url === whitelistItem + '/') {
    //           return true;
    //         }
    //         else {
    //           return regexp.test(parsed.hostname);
    //         }
    //       });
    //
    //       let promises = _.map(matches, async function(match) {
    //         match.visits = [];
    //
    //         let hydratedResults = await new Promise(function(resolve, reject) {
    //           browser.history.getVisits({
    //             url: match.url
    //           }, function(results) {
    //             resolve(results);
    //           });
    //         });
    //
    //         _.each(hydratedResults, function(result, index) {
    //           if (index === 0 || (index > 0 && Math.abs(moment(result.visitTime) - moment(hydratedResults[index - 1].visitTime)) > 1000)) {
    //             match.visits.push(result.visitTime)
    //           }
    //         });
    //
    //         return Promise.resolve();
    //       });
    //
    //       await Promise.all(promises);
    //
    //       promises = [];
    //
    //       let sliceSize = 200;
    //       let events = [];
    //
    //       _.each(matches, async function(match) {
    //         let result, newContent;
    //
    //         promises.push(new Promise(async function(resolve, reject) {
    //           await new Promise(async function(resolve, reject) {
    //             try {
    //               result = await axios.get('https://embed.lifescope.io/iframely?url=' + match.url);
    //
    //               let data = result.data;
    //
    //               newContent = {
    //                 connection_id_string: connection.id,
    //                 provider_id_string: connection.provider_id_string,
    //                 identifier: connection.id + ':::' + bowser.name + ':::' + data.meta.canonical,
    //                 tagMasks: {
    //                   source: []
    //                 },
    //                 url: data.meta.canonical
    //               };
    //
    //               if (data.rel.indexOf('player') >= 0) {
    //                 newContent.type = audioSites.indexOf(data.meta.site) >= 0 ? 'audio' : 'video';
    //               }
    //               else if (data.rel.indexOf('image') >= 0) {
    //                 newContent.type = 'image';
    //               }
    //               else {
    //                 newContent.type = 'web-page';
    //               }
    //
    //               if (data.meta.description) {
    //                 newContent.text = data.meta.description;
    //
    //                 let tags = newContent.text.match(tagRegex);
    //
    //                 if (tags != null) {
    //                   for (let j = 0; j < tags.length; j++) {
    //                     newContent.tagMasks.source.push(tags[j].slice(1));
    //                   }
    //                 }
    //               }
    //
    //               if (data.meta.title) {
    //                 newContent.title = data.meta.title;
    //
    //                 let tags = newContent.title.match(tagRegex);
    //
    //                 if (tags != null) {
    //                   for (let j = 0; j < tags.length; j++) {
    //                     newContent.tagMasks.source.push(tags[j].slice(1));
    //                   }
    //                 }
    //               }
    //
    //               newContent.tagMasks.source = _.uniq(newContent.tagMasks.source);
    //
    //               let thumbnailLink = _.find(data.links, function(link) {
    //                 return link.rel.indexOf('thumbnail') >= 0;
    //               });
    //
    //               if (thumbnailLink != null) {
    //                 newContent.embed_thumbnail = thumbnailLink.href;
    //               }
    //
    //               if (data.html) {
    //                 newContent.embed_content = data.html;
    //                 newContent.embed_format = 'iframe';
    //               }
    //
    //               resolve();
    //             }
    //             catch(error) {
    //               newContent = {
    //                 connection_id_string: connection.id,
    //                 provider_id_string: connection.provider_id_string,
    //                 identifier: connection.id + ':::' + bowser.name + ':::' + match.url,
    //                 tagMasks: {
    //                   source: []
    //                 },
    //                 type: 'web-page',
    //                 url: match.url
    //               };
    //
    //               resolve();
    //             }
    //           });
    //
    //           _.each(match.visits, function(visit) {
    //             let newEvent = {
    //               connection_id_string: connection.id,
    //               provider_id_string: connection.provider_id_string,
    //               identifier: connection.id + ':::' + bowser.name + ':::visited:::' + match.url + ':::' + moment(visit).utc().toJSON(),
    //               content: [newContent],
    //               context: 'Visited web page',
    //               datetime: moment(visit).utc().toDate(),
    //               provider_name: bowser.name + ' Extension',
    //               tagMasks: {
    //                 source: []
    //               },
    //               type: 'viewed'
    //             };
    //
    //             events.push(newEvent);
    //
    //             resolve();
    //           });
    //         }));
    //       });
    //
    //       await Promise.all(promises);
    //
    //       let finished = false;
    //       let failed = false;
    //       let startIndex = 0;
    //
    //       let csrfResponse = await axios.get('https://api.lifescope.io/csrf');
    //       browser.storage.local.csrf_token = csrfResponse.data ? csrfResponse.data.csrf_token: null;
    //
    //       while (!finished) {
    //         let slice = events.slice(startIndex, startIndex + sliceSize);
    //
    //         if (slice.length > 0) {
    //           try {
    //             await apollo.mutate({
    //               mutation: gql`mutation eventCreateMany($events: String!) {
    //                                     eventCreateMany(events: $events) {
    //                                       id
    //                                     }
    //                                   }`,
    //               variables: {
    //                 events: JSON.stringify(slice)
    //               },
    //               fetchPolicy: 'no-cache'
    //             });
    //           } catch(err) {
    //             failed = true;
    //
    //             break;
    //           }
    //         }
    //
    //         startIndex += sliceSize;
    //
    //         if (slice.length < sliceSize) {
    //           finished = true;
    //         }
    //       }
    //
    //       if (failed === false) {
    //         delete browser.storage.local.whitelistPending[whitelistItem];
    //         browser.storage.local.whitelistHistory.push(whitelistItem);
    //
    //         browser.storage.local.whitelistHistory = _.uniq(browser.storage.local.whitelistHistory);
    //
    //         await store.dispatch({
    //           type: 'saveUserSettings'
    //         });
    //
    //         browser.runtime.sendMessage({
    //           data: 'userSettingsSaved'
    //         });
    //
    //         browser.runtime.sendMessage({
    //           data: 'runComplete'
    //         });
    //       }
    //     }
    //   });
    // }
    // }

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
  },
});

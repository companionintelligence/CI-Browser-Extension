import { fetchJson } from '../hooks/fetchJson';
import { jwtDecode } from 'jwt-decode';

export default defineBackground({
  main() {
    console.log('BACKGROUND')
    const ACCESS_TOKEN_KEY = 'accessToken';
    const storageDefaults = {
      whitelist: [],
      whitelistPending: {},
      whitelistHistory: [],
      url: null,
      domain: null,
      lastUrl: null,
      accessToken: null,
      sessionToken: null,
      refreshing: false
    }
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
      console.log('refreshAccessToken')
      if (browser.storage.local.refreshing) return
      browser.storage.local.set({ 'refreshing': true })
      const sessionToken = (await browser.storage.local.get('sessionToken')).sessionToken
      console.log('refreshing with sessionToken', sessionToken)
      try {
        const data: AuthResponse = await fetchJson('https://dev.companionintelligence.com/api/authenticate/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
        });

        console.log('refresh response data', data)

        browser.storage.local.set({ 'accessToken':  data.accessToken });
        browser.storage.local.set({ 'sessionToken': data.sessionToken });
        const decoded = jwtDecode(data.accessToken)
        console.log('decoded accessToken', decoded)
        browser.cookies.set({
          url: 'https://dev.companionintelligence.com',
          expirationDate: decoded.exp,
          name: `CI_${ACCESS_TOKEN_KEY}`,
          value: data.accessToken,
          sameSite: 'no_restriction',
          secure: true
        })
        console.log('finished refreshing', document.cookie)
        browser.storage.local.set({ 'refreshing': false })
      } catch(err) {
        console.error('Error refreshing token', err)
        browser.storage.local.set({ 'refreshing': false })
      }
    }
    console.log('Background script loaded');
    browser.runtime.onInstalled.addListener(async function() {
      console.log('Extension installed');

      const existingKeys = await browser.storage.local.getKeys()
      console.log('Existing keys:', existingKeys);

      const toSet = Object.keys(storageDefaults).filter(key => existingKeys.indexOf(key) < 0).reduce((obj, key) => { obj[key] = storageDefaults[key]; return obj }, {});
      console.log('toSet', toSet)

      browser.storage.local.set(toSet, function() {
        console.log('Default settings saved');
      });

      const syncFromCookieInterval = setInterval(async () => {
        browser.cookies.getAll({ url: 'https://dev.companionintelligence.com' }).then(async result => {
          console.log('found cookies', result)
          const accessTokenCookie = result.find(cookie => cookie.name === 'CI_accessToken')
          const sessionTokenCookie = result.find(cookie => cookie.name === 'CI_sessionToken')
          console.log('accessTokenCookie', accessTokenCookie)
          console.log('sessionTokenCookie', sessionTokenCookie)
          if (accessTokenCookie) browser.storage.local.set({ 'accessToken': accessTokenCookie.value });
          if (sessionTokenCookie) browser.storage.local.set({ 'sessionToken': sessionTokenCookie.value });
          const accessDecoded = accessTokenCookie ? jwtDecode(accessTokenCookie.value) : null
          const isAuthExpired = accessDecoded ? Date.now() >= accessDecoded.exp * 1000: true;
          const sessionDecoded = sessionTokenCookie ? jwtDecode(sessionTokenCookie.value) : null
          const isSessionExpired = sessionDecoded ? Date.now() >= sessionDecoded.exp * 1000: true
          if ((!accessTokenCookie && sessionTokenCookie) || (isAuthExpired && !isSessionExpired)) await refreshAccessToken()
        })
      }, 1000)

      browser.webNavigation.onCompleted.addListener(async function() {
        console.log('Web Navigation completed')
        const tabInfo = await browser.tabs.query({
          active: true
        })
        console.log('got active tabs', tabInfo)
        let active = tabInfo[0];

        let parsed = new URL(active.url);

        browser.storage.local.set({ 'domain': parsed.hostname })
        browser.storage.local.set({ 'url': active.url })
        console.log('set domain and url on storage')
        let accessTokenFromCookie = await new Promise(function(resolve, reject) {
          browser.cookies.get({
            url: 'https://dev.companionintelligence.com',
            name: 'CI_accessToken'
          }, function(results) {
            resolve(results);
          });
        });
        console.log('background.ts access token', accessTokenFromCookie);

        await new Promise(function(resolve, reject) {
          browser.tabs.query({
            active: true
          }, function(tab) {
            console.log('tab', tab)
            let active = tab[0];

            let parsed = new URL(active.url);

            browser.storage.local.domain = parsed.hostname;
            browser.storage.local.url = active.url;

            resolve();
          });
        });

        browser.browserAction.setPopup({
          popup: 'popup/popup.html'
        });

        let whitelistHit = false;

        _.each(browser.storage.local.whitelist, function(item) {
          let domainRegex = new RegExp(item);

          if (domainRegex.test(browser.storage.local.domain)) {
            whitelistHit = true;

            return;
          }

          let parsedUrl = url.parse(browser.storage.local.url);

          let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host + parsedUrl.pathname;

          if (domainRegex.test(condensedUrl)) {
            whitelistHit = true;

            return;
          }
        });

        if (whitelistHit && browser.storage.local.lastUrl !== browser.storage.local.url) {
          browser.storage.local.lastUrl = browser.storage.local.url;

          store.dispatch({
            type: 'saveUserSettings'
          });

          let newEvent, newContent;

          await new Promise(async function (resolve, reject) {
            try {
              let result = await axios.get('https://embed.lifescope.io/iframely?url=' + browser.storage.local.url);

              let data = result.data;

              newContent = {
                connection_id_string: browser.storage.local.connection.id,
                provider_id_string: browser.storage.local.connection.provider_id_string,
                identifier: browser.storage.local.connection.id + ':::' + bowser.name + ':::' + data.meta.canonical,
                tagMasks: {
                  source: []
                },
                url: data.meta.canonical
              };

              if (data.rel.indexOf('player') >= 0) {
                newContent.type = audioSites.indexOf(data.meta.site) >= 0 ? 'audio' : 'video';
              } else if (data.rel.indexOf('image') >= 0) {
                newContent.type = 'image';
              } else {
                newContent.type = 'web-page';
              }

              if (data.meta.description) {
                newContent.text = data.meta.description;

                let tags = newContent.text.match(tagRegex);

                if (tags != null) {
                  for (let j = 0; j < tags.length; j++) {
                    newContent.tagMasks.source.push(tags[j].slice(1));
                  }
                }
              }

              if (data.meta.title) {
                newContent.title = data.meta.title;

                let tags = newContent.title.match(tagRegex);

                if (tags != null) {
                  for (let j = 0; j < tags.length; j++) {
                    newContent.tagMasks.source.push(tags[j].slice(1));
                  }
                }
              }

              newContent.tagMasks.source = _.uniq(newContent.tagMasks.source);

              let thumbnailLink = _.find(data.links, function (link) {
                return link.rel.indexOf('thumbnail') >= 0;
              });

              if (thumbnailLink != null) {
                newContent.embed_thumbnail = thumbnailLink.href;
              }

              if (data.html) {
                newContent.embed_content = data.html;
                newContent.embed_format = 'iframe';
              }
            } catch (error) {
              newContent = {
                connection_id_string: browser.storage.local.connection.id,
                provider_id_string: browser.storage.local.connection.provider_id_string,
                identifier: browser.storage.local.connection.id + ':::' + bowser.name + ':::' + browser.storage.local.url,
                tagMasks: {
                  source: []
                },
                type: 'web-page',
                url: browser.storage.local.url
              };
            }

            let visit = moment();

            newEvent = {
              connection_id_string: browser.storage.local.connection.id,
              provider_id_string: browser.storage.local.connection.provider_id_string,
              identifier: browser.storage.local.connection.id + ':::' + bowser.name + ':::visited:::' + browser.storage.local.url + ':::' + visit.utc().toJSON(),
              content: [newContent],
              context: 'Visited web page',
              datetime: visit.utc().toDate(),
              provider_name: bowser.name + ' Extension',
              tagMasks: {
                source: []
              },
              type: 'viewed'
            };

            resolve();
          });

          browser.storage.local.lastUrl = browser.storage.local.url;

          triggerHistoryCrawl(browser.storage.local.connection);
        }
      });
    });
  }
});
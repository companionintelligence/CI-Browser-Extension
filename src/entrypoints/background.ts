export default defineBackground({
  type: 'module',
  main() {
    // async function triggerHistoryCrawl(connection) {
      // await store.dispatch({
      //   type: 'loadUserSettings'
      // });
      //
      // //Check to see if any whitelisted domains didn't finish their initial data crawl, and run it if they didn't (as long as they're not on Edge).
      // if (bowser.name !== 'Microsoft Edge') {
      //   _.each(chrome.storage.sync.whitelist, async function(whitelistItem) {
      //     //If the whitelistPending entry for a whitelist item is more than 5 minutes old, or is not a date, then clear it.
      //     //In the former case, the user likely closed the browser before the history crawl was completed.
      //     //The latter case sometimes happens for reasons I can't really deduce, but trying again should work.
      //     if ((chrome.storage.sync.whitelistPending[whitelistItem] && moment().utc().subtract(5, 'minutes').toDate() > chrome.storage.sync.whitelistPending[whitelistItem]) || (chrome.storage.sync.whitelistPending[whitelistItem] instanceof Date === false)) {
      //       delete chrome.storage.sync.whitelistPending[whitelistItem];
      //
      //       await store.dispatch({
      //         type: 'saveUserSettings'
      //       });
      //     }
      //
      //     if (Object.keys(chrome.storage.sync.whitelistPending).indexOf(whitelistItem) === -1 && chrome.storage.sync.whitelistHistory.indexOf(whitelistItem) === -1) {
      //       let regexp = new RegExp(whitelistItem);
      //
      //       chrome.storage.sync.whitelistPending[whitelistItem] = moment().utc().toDate();
      //
      //       store.dispatch({
      //         type: 'saveUserSettings'
      //       });
      //
      //       chrome.runtime.sendMessage({
      //         data: 'userSettingsSaved'
      //       });
      //
      //       let baseResults = await new Promise(function(resolve, reject) {
      //         chrome.history.search({
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
      //           chrome.history.getVisits({
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
      //       chrome.storage.sync.csrf_token = csrfResponse.data ? csrfResponse.data.csrf_token: null;
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
      //         delete chrome.storage.sync.whitelistPending[whitelistItem];
      //         chrome.storage.sync.whitelistHistory.push(whitelistItem);
      //
      //         chrome.storage.sync.whitelistHistory = _.uniq(chrome.storage.sync.whitelistHistory);
      //
      //         await store.dispatch({
      //           type: 'saveUserSettings'
      //         });
      //
      //         chrome.runtime.sendMessage({
      //           data: 'userSettingsSaved'
      //         });
      //
      //         chrome.runtime.sendMessage({
      //           data: 'runComplete'
      //         });
      //       }
      //     }
      //   });
      // }
    // }


    console.log('Background script loaded');
    chrome.runtime.onInstalled.addListener(function() {
      console.log('Extension installed');

      chrome.webNavigation.onCompleted.addListener(async function() {

        console.log('Web Navigation completed')
        let accessTokenFromCookie = await new Promise(function(resolve, reject) {
          chrome.cookies.get({
            url: 'https://dev.companionintelligence.com',
            name: 'CI_accessToken'
          }, function(results) {
            resolve(results);
          });
        });
        console.log('background.ts access token', accessTokenFromCookie);
        const [accessToken, refreshToken] = await syncStorage.get(['CI_accessToken', 'CI_refreshToken']);
        console.log('accessToken', accessToken);
        console.log('refreshToken', refreshToken);

        if (!accessToken || !refreshToken) {
          return;
        }

        await new Promise(function(resolve, reject) {
          chrome.tabs.query({
            active: true
          }, function(tab) {
            console.log('tab', tab)
            let active = tab[0];

            let parsed = new URL(active.url);

            chrome.storage.sync.domain = parsed.hostname;
            chrome.storage.sync.url = active.url;

            resolve();
          });
        });

        chrome.browserAction.setPopup({
          popup: 'popup/popup.html'
        });

        let whitelistHit = false;

        _.each(chrome.storage.sync.whitelist, function(item) {
          let domainRegex = new RegExp(item);

          if (domainRegex.test(chrome.storage.sync.domain)) {
            whitelistHit = true;

            return;
          }

          let parsedUrl = url.parse(chrome.storage.sync.url);

          let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host + parsedUrl.pathname;

          if (domainRegex.test(condensedUrl)) {
            whitelistHit = true;

            return;
          }
        });

        if (whitelistHit && chrome.storage.sync.lastUrl !== chrome.storage.sync.url) {
          chrome.storage.sync.lastUrl = chrome.storage.sync.url;

          store.dispatch({
            type: 'saveUserSettings'
          });

          let newEvent, newContent;

          await new Promise(async function (resolve, reject) {
            try {
              let result = await axios.get('https://embed.lifescope.io/iframely?url=' + chrome.storage.sync.url);

              let data = result.data;

              newContent = {
                connection_id_string: chrome.storage.sync.connection.id,
                provider_id_string: chrome.storage.sync.connection.provider_id_string,
                identifier: chrome.storage.sync.connection.id + ':::' + bowser.name + ':::' + data.meta.canonical,
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
                connection_id_string: chrome.storage.sync.connection.id,
                provider_id_string: chrome.storage.sync.connection.provider_id_string,
                identifier: chrome.storage.sync.connection.id + ':::' + bowser.name + ':::' + chrome.storage.sync.url,
                tagMasks: {
                  source: []
                },
                type: 'web-page',
                url: chrome.storage.sync.url
              };
            }

            let visit = moment();

            newEvent = {
              connection_id_string: chrome.storage.sync.connection.id,
              provider_id_string: chrome.storage.sync.connection.provider_id_string,
              identifier: chrome.storage.sync.connection.id + ':::' + bowser.name + ':::visited:::' + chrome.storage.sync.url + ':::' + visit.utc().toJSON(),
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

          chrome.storage.sync.lastUrl = chrome.storage.sync.url;

          triggerHistoryCrawl(chrome.storage.sync.connection);
        }
      });
    });
  }
});

import { createSlice } from '@reduxjs/toolkit'



export const slice = createSlice({
    name: 'companion_intelligence_browser_extension',
    initialState: {
        whitelist: [],
        whitelistPending: {},
        whitelistHistory: [],
        url: null,
        domain: null,
        lastUrl: null
    },
    reducers: {
        loadUserSettings: state => {
            return new Promise(function(resolve, reject) {
                currentBrowser.storage.sync.get(['whitelist', 'whitelistPending', 'whitelistHistory'], async function(result) {
                    state.whitelist = result.whitelist || [];
                    state.whitelistPending = result.whitelistPending || {};
                    state.whitelistHistory = result.whitelistHistory || [];
                    resolve()
                });
            })
        },
        saveUserSettings: async(state) => {
            currentBrowser.storage.sync.set({
                whitelist: state.whitelist,
                whitelistPending: state.whitelistPending,
                whitelistHistory: state.whitelistHistory
            }, async function() {});
        },
        setState: async(state, item, value) => {
            state[item] = value
        }
    }
})

// Action creators are generated for each case reducer function
export const { loadUserSettings, saveUserSettings, setState } = slice.actions

export default slice.reducer
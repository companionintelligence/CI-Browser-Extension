
import { createSlice } from '@reduxjs/toolkit'



export const ciStateSlice = createSlice({
    name: 'ciState',
    initialState: {
        accessToken: null,
        sessionToken: null,
        domainWhitelist: [],
        domainWhitelistPending: {},
        domainWhitelistHistory: [],
        pageWhitelist: [],
        pageWhitelistPending: {},
        pageWhitelistHistory: [],
        url: null,
        domain: null,
        lastUrl: null
    },
    reducers: {
        setState: (state = ciStateSlice.initialState, action) => {
            console.log('setState called', state, action)
            // return {}
            return { ...state, ...action.payload }
            // const update = {}
            // for (const [key, value] of Object.entries(action.payload)) {
            //     console.log('set', key, value)
            //     update[key] = value
            // }
            // console.log('update', update)
            // const returned = state
            // console.log('returned', returned)
            // return returned
        },
        addDomainWhitelistEntry(state, action) {
            let newDomainWhitelist = state.domainWhitelist
            if (newDomainWhitelist.indexOf(action.payload) === -1) newDomainWhitelist = newDomainWhitelist.concat(action.payload)
            return { ...state, domainWhitelist: newDomainWhitelist }
        },
        removeDomainWhitelistEntry(state, action) {
            let newDomainWhitelist = state.domainWhitelist.filter(entry => entry !== action.payload)
            return { ...state, domainWhitelist: newDomainWhitelist }
        },
        addPageWhitelistEntry(state, action) {
            let newPageWhitelist = state.pageWhitelist
            if (newPageWhitelist.indexOf(action.payload) === -1) newPageWhitelist = newPageWhitelist.concat(action.payload)
            console.log('newPageWhitelist', newPageWhitelist)
            return { ...state, pageWhitelist: newPageWhitelist }
        },
        removePageWhitelistEntry(state, action) {
            let newPageWhitelist = state.pageWhitelist.filter(entry => entry !== action.payload)
            return { ...state, pageWhitelist: newPageWhitelist }
        }
    }
})

// Action creators are generated for each case reducer function
export const {
    addDomainWhitelistEntry,
    removeDomainWhitelistEntry,
    addPageWhitelistEntry,
    removePageWhitelistEntry,
    setState
} = ciStateSlice.actions

export default ciStateSlice.reducer
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const loadUserSettings = createAsyncThunk(
  "ciState/loadUserSettings",
  async () => {
    const localData = await browser.storage.local.get([
      "accessToken",
      "sessionToken",
      "domainWhitelist",
      "domainWhitelistPending",
      "domainWhitelistHistory",
      "pageWhitelist",
      "pageWhitelistPending",
      "pageWhitelistHistory",
    ]);

    return localData;
  },
);

export const ciStateSlice = createSlice({
  name: "ciState",
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
    lastUrl: null,
  },
  reducers: {
    setState: (state = ciStateSlice.initialState, action) => {
      return { ...state, ...action.payload };
    },
    addDomainWhitelistEntry(state, action) {
      let newDomainWhitelist = state.domainWhitelist;
      if (newDomainWhitelist.indexOf(action.payload) === -1) {
        newDomainWhitelist = newDomainWhitelist.concat(action.payload);
      }

      const returned = { ...state, domainWhitelist: newDomainWhitelist };

      if (state.domainWhitelistHistory.indexOf(action.payload) === -1) {
        returned.domainWhitelistPending = {
          ...state.domainWhitelistPending,
          [action.payload]: new Date().getTime(),
        };
      }

      return returned;
    },
    removeDomainWhitelistEntry(state, action) {
      const newDomainWhitelist = state.domainWhitelist.filter(
        (entry) => entry != null && entry !== action.payload,
      );

      return { ...state, domainWhitelist: newDomainWhitelist };
    },
    addPageWhitelistEntry(state, action) {
      let newPageWhitelist = state.pageWhitelist;
      let parsed = URL.parse(action.payload);
      if (!parsed) {
        parsed = URL.parse(`https://${action.payload}`);
        action.paylaod = `https://${action.payload}`;
      }

      if (!parsed) {
        return;
      }

      parsed.hash = "";
      parsed.search = "";
      const parsedToString = parsed.toString();
      if (newPageWhitelist.indexOf(parsedToString) === -1) {
        newPageWhitelist = newPageWhitelist.concat(parsedToString);
      }

      return { ...state, pageWhitelist: newPageWhitelist };
    },
    removePageWhitelistEntry(state, action) {
      const newPageWhitelist = state.pageWhitelist.filter(
        (entry) => entry != null && entry !== action.payload,
      );

      return { ...state, pageWhitelist: newPageWhitelist };
    },
    saveUserSettings(state) {
      const parsed = JSON.parse(
        JSON.stringify({
          accessToken: state.accessToken,
          sessionToken: state.sessionToken,
          domainWhitelist: state.domainWhitelist,
          domainWhitelistPending: state.domainWhitelistPending,
          domainWhitelistHistory: state.domainWhitelistHistory,
          pageWhitelist: state.pageWhitelist,
          pageWhitelistPending: state.pageWhitelistPending,
          pageWhitelistHistory: state.pageWhitelistHistory,
        }),
      );
      browser.storage.local.set(parsed);

      return state;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadUserSettings.fulfilled, (state, action) => {
      for (const [key, value] of Object.entries(action.payload)) {
        state[key] = value;
      }
    });
  },
});

// Action creators are generated for each case reducer function
export const {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry,
  setState,
  saveUserSettings,
} = ciStateSlice.actions;

export default ciStateSlice.reducer;

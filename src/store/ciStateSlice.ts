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

const initialState = {
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
};

export const ciStateSlice = createSlice({
  name: "ciState",
  initialState,
  reducers: {
    setState: (state = initialState, action) => {
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

      const domainWhitelistPendingCopy = { ...state.domainWhitelistPending };
      delete domainWhitelistPendingCopy[action.payload];

      return {
        ...state,
        domainWhitelist: newDomainWhitelist,
        domainWhitelistPending: domainWhitelistPendingCopy,
      };
    },
    addPageWhitelistEntry(state, action) {
      let newPageWhitelist = state.pageWhitelist;
      let parsed = URL.parse(action.payload);
      if (!parsed) {
        parsed = URL.parse(`https://${action.payload}`);
        action.payload = `https://${action.payload}`;
      }

      if (!parsed) {
        return;
      }

      parsed.hash = "";
      const parsedToString = parsed.toString();
      if (newPageWhitelist.indexOf(parsedToString) === -1) {
        newPageWhitelist = newPageWhitelist.concat(parsedToString);
      }

      const returned = { ...state, pageWhitelist: newPageWhitelist };

      if (state.pageWhitelistHistory.indexOf(parsedToString) === -1) {
        returned.pageWhitelistPending = {
          ...state.pageWhitelistPending,
          [parsedToString]: new Date().getTime(),
        };
      }

      return returned;
    },
    removePageWhitelistEntry(state, action) {
      let parsed = URL.parse(action.payload);
      if (!parsed) {
        parsed = URL.parse(`https://${action.payload}`);
        action.payload = `https://${action.payload}`;
      }

      parsed.hash = "";
      const strippedUrl = parsed.toString();

      const newPageWhitelist = state.pageWhitelist.filter(
        (entry) => entry != null && entry !== strippedUrl,
      );

      const pageWhitelistPendingCopy = { ...state.pageWhitelistPending };
      delete pageWhitelistPendingCopy[strippedUrl];

      return {
        ...state,
        pageWhitelist: newPageWhitelist,
        pageWhitelistPending: pageWhitelistPendingCopy,
      };
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

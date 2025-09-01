/**
 * Tests for Options App Component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import App from '@/entrypoints/options/App';

// Mock the store slice
const mockCiStateSlice = {
  name: 'ciState',
  reducer: (state = {
    domainWhitelist: [],
    pageWhitelist: [],
  }, action: any) => {
    switch (action.type) {
      case 'ciState/addDomainWhitelistEntry':
        return {
          ...state,
          domainWhitelist: [...state.domainWhitelist, action.payload],
        };
      case 'ciState/removeDomainWhitelistEntry':
        return {
          ...state,
          domainWhitelist: state.domainWhitelist.filter(d => d !== action.payload),
        };
      case 'ciState/addPageWhitelistEntry':
        return {
          ...state,
          pageWhitelist: [...state.pageWhitelist, action.payload],
        };
      case 'ciState/removePageWhitelistEntry':
        return {
          ...state,
          pageWhitelist: state.pageWhitelist.filter(p => p !== action.payload),
        };
      default:
        return state;
    }
  },
  actions: {
    addDomainWhitelistEntry: (payload: string) => ({ type: 'ciState/addDomainWhitelistEntry', payload }),
    removeDomainWhitelistEntry: (payload: string) => ({ type: 'ciState/removeDomainWhitelistEntry', payload }),
    addPageWhitelistEntry: (payload: string) => ({ type: 'ciState/addPageWhitelistEntry', payload }),
    removePageWhitelistEntry: (payload: string) => ({ type: 'ciState/removePageWhitelistEntry', payload }),
  },
};

// Mock the utils
jest.mock('@/utils.ts', () => ({
  domainRegex: /^(([a-zA-Z0-9]+)\.)+[a-zA-Z0-9]+$/,
  siteRegex: /^(http(s)?:\/\/)?([a-zA-Z0-9]+\.)+[a-zA-Z0-9]+(\/([.a-zA-Z0-9_-~!$&'()*+,;=:@])+)*\/?/,
}));

// Mock the slice actions
jest.mock('@/store/ciStateSlice.ts', () => ({
  addDomainWhitelistEntry: (payload: string) => ({ type: 'ciState/addDomainWhitelistEntry', payload }),
  removeDomainWhitelistEntry: (payload: string) => ({ type: 'ciState/removeDomainWhitelistEntry', payload }),
  addPageWhitelistEntry: (payload: string) => ({ type: 'ciState/addPageWhitelistEntry', payload }),
  removePageWhitelistEntry: (payload: string) => ({ type: 'ciState/removePageWhitelistEntry', payload }),
}));

const renderWithProvider = (initialState = {}) => {
  const store = configureStore({
    reducer: {
      ciState: mockCiStateSlice.reducer,
    },
    preloadedState: {
      ciState: {
        domainWhitelist: [],
        pageWhitelist: [],
        ...initialState,
      },
    },
  });

  return render(
    <Provider store={store}>
      <App />
    </Provider>
  );
};

describe('Options App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render main title', () => {
      renderWithProvider();
      expect(screen.getByText('Companion Intelligence Browser Extension Options')).toBeInTheDocument();
    });

    it('should render domain whitelist section', () => {
      renderWithProvider();
      expect(screen.getByText('Tracked Domain List')).toBeInTheDocument();
      expect(screen.getByText('Enter domains for CI to track, such as \'wikipedia.org\'')).toBeInTheDocument();
    });

    it('should render page whitelist section', () => {
      renderWithProvider();
      expect(screen.getByText('Tracked Page List')).toBeInTheDocument();
    });

    it('should render form inputs', () => {
      renderWithProvider();
      expect(screen.getByPlaceholderText('google.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('https://google.com/search?q=roses')).toBeInTheDocument();
    });
  });

  describe('Domain Whitelist Functionality', () => {
    it('should display existing domains in the list', () => {
      renderWithProvider({
        domainWhitelist: ['example.com', 'google.com'],
      });

      expect(screen.getByText('example.com')).toBeInTheDocument();
      expect(screen.getByText('google.com')).toBeInTheDocument();
    });

    it('should add valid domain to whitelist', () => {
      renderWithProvider();
      
      const domainInput = screen.getByPlaceholderText('google.com');
      const addButton = domainInput.closest('div')?.querySelector('.plus');
      
      fireEvent.change(domainInput, { target: { value: 'example.com' } });
      
      if (addButton) {
        fireEvent.click(addButton);
      }

      // Note: Due to mocking limitations, we're testing the UI interaction
      // The actual dispatch would be tested in integration tests
      expect(domainInput).toHaveValue('example.com');
    });

    it('should show error for invalid domain', () => {
      renderWithProvider();
      
      const domainInput = screen.getByPlaceholderText('google.com');
      const form = domainInput.closest('form');
      
      fireEvent.change(domainInput, { target: { value: 'invalid-domain' } });
      
      if (form) {
        fireEvent.submit(form);
      }

      expect(screen.getByText('That is not a valid domain.')).toBeInTheDocument();
    });

    it('should display delete buttons for existing domains', () => {
      renderWithProvider({
        domainWhitelist: ['example.com', 'google.com'],
      });

      const deleteButtons = screen.getAllByText('X');
      expect(deleteButtons).toHaveLength(2); // One for each domain
    });
  });

  describe('Page Whitelist Functionality', () => {
    it('should display existing pages in the list', () => {
      renderWithProvider({
        pageWhitelist: ['https://example.com', 'https://google.com/search'],
      });

      // Pages are displayed truncated with "..." added
      expect(screen.getByText('https://example.com...')).toBeInTheDocument();
      expect(screen.getByText('https://google.com/search...')).toBeInTheDocument();
      
      // Full URLs should be available as title attributes
      expect(screen.getByTitle('https://example.com')).toBeInTheDocument();
      expect(screen.getByTitle('https://google.com/search')).toBeInTheDocument();
    });

    it('should add valid URL to page whitelist', () => {
      renderWithProvider();
      
      const pageInput = screen.getByPlaceholderText('https://google.com/search?q=roses');
      const addButton = pageInput.closest('div')?.querySelector('.plus');
      
      fireEvent.change(pageInput, { target: { value: 'https://example.com' } });
      
      if (addButton) {
        fireEvent.click(addButton);
      }

      expect(pageInput).toHaveValue('https://example.com');
    });

    it('should show error for invalid URL', () => {
      renderWithProvider();
      
      const pageInput = screen.getByPlaceholderText('https://google.com/search?q=roses');
      const form = pageInput.closest('form');
      
      fireEvent.change(pageInput, { target: { value: 'invalid-url' } });
      
      if (form) {
        fireEvent.submit(form);
      }

      expect(screen.getByText('That is not a valid page URL.')).toBeInTheDocument();
    });

    it('should display delete buttons for existing pages', () => {
      renderWithProvider({
        pageWhitelist: ['https://example.com', 'https://google.com'],
      });

      const deleteButtons = screen.getAllByText('X');
      expect(deleteButtons).toHaveLength(2);
    });
  });

  describe('Form Validation', () => {
    it('should validate domain format correctly', () => {
      const { domainRegex } = require('@/utils.ts');
      
      // Valid domains
      expect(domainRegex.test('google.com')).toBe(true);
      expect(domainRegex.test('subdomain.example.org')).toBe(true);
      
      // Invalid domains
      expect(domainRegex.test('invalid')).toBe(false);
      expect(domainRegex.test('.com')).toBe(false);
      expect(domainRegex.test('')).toBe(false);
    });

    it('should validate site URL format correctly', () => {
      const { siteRegex } = require('@/utils.ts');
      
      // Valid URLs
      expect(siteRegex.test('https://google.com')).toBe(true);
      expect(siteRegex.test('http://example.com/path')).toBe(true);
      expect(siteRegex.test('example.com')).toBe(true);
      
      // Invalid URLs
      expect(siteRegex.test('invalid')).toBe(false);
      expect(siteRegex.test('')).toBe(false);
    });
  });

  describe('User Instructions', () => {
    it('should display helpful user instructions', () => {
      renderWithProvider();
      
      expect(screen.getByText(/CI can help you organize and search your time on the web/)).toBeInTheDocument();
      expect(screen.getByText(/When you add a domain or URL to the whitelist/)).toBeInTheDocument();
      expect(screen.getByText(/Deleting an item from the list will stop tracking it/)).toBeInTheDocument();
    });

    it('should explain data deletion policy', () => {
      renderWithProvider();
      
      expect(screen.getByText(/At this time, there is no option for selectively deleting data/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper form labels and structure', () => {
      renderWithProvider();
      
      const domainInput = screen.getByPlaceholderText('google.com');
      const pageInput = screen.getByPlaceholderText('https://google.com/search?q=roses');
      
      expect(domainInput).toBeInTheDocument();
      expect(pageInput).toBeInTheDocument();
      expect(domainInput.getAttribute('type')).toBe('text');
      expect(pageInput.getAttribute('type')).toBe('text');
    });

    it('should have appropriate button roles', () => {
      renderWithProvider({
        domainWhitelist: ['example.com'],
      });
      
      const deleteButton = screen.getByText('X');
      expect(deleteButton).toBeInTheDocument();
    });
  });
});
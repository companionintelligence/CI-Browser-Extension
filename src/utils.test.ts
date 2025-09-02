import { domainRegex, siteRegex } from './utils';

describe('Utils', () => {
  describe('domainRegex', () => {
    it('should match valid domains', () => {
      expect(domainRegex.test('google.com')).toBe(true);
      expect(domainRegex.test('subdomain.example.org')).toBe(true);
      expect(domainRegex.test('test.co.uk')).toBe(true);
      expect(domainRegex.test('api.github.com')).toBe(true);
      expect(domainRegex.test('companionintelligence.com')).toBe(true);
      expect(domainRegex.test('dev.companionintelligence.com')).toBe(true);
    });

    it('should reject invalid domains', () => {
      expect(domainRegex.test('invalid')).toBe(false);
      expect(domainRegex.test('.com')).toBe(false);
      expect(domainRegex.test('domain.')).toBe(false);
      expect(domainRegex.test('')).toBe(false);
      expect(domainRegex.test('http://google.com')).toBe(false);
      expect(domainRegex.test('google.com/path')).toBe(false);
    });

    it('should reject domains with special characters', () => {
      expect(domainRegex.test('test@example.com')).toBe(false);
      expect(domainRegex.test('test#example.com')).toBe(false);
      expect(domainRegex.test('test!example.com')).toBe(false);
      expect(domainRegex.test('test space.com')).toBe(false);
    });
  });

  describe('siteRegex', () => {
    it('should match valid URLs with http/https', () => {
      expect(siteRegex.test('http://google.com')).toBe(true);
      expect(siteRegex.test('https://google.com')).toBe(true);
      expect(siteRegex.test('https://api.github.com')).toBe(true);
      expect(siteRegex.test('https://dev.companionintelligence.com')).toBe(true);
    });

    it('should match URLs without protocol', () => {
      expect(siteRegex.test('google.com')).toBe(true);
      expect(siteRegex.test('subdomain.example.org')).toBe(true);
      expect(siteRegex.test('api.github.com')).toBe(true);
    });

    it('should match URLs with paths', () => {
      expect(siteRegex.test('https://google.com/search')).toBe(true);
      expect(siteRegex.test('https://github.com/user/repo')).toBe(true);
      expect(siteRegex.test('https://api.example.com/v1/users')).toBe(true);
      expect(siteRegex.test('example.com/path/to/resource')).toBe(true);
    });

    it('should match URLs with special characters in path', () => {
      expect(siteRegex.test('https://example.com/path_with_underscore')).toBe(true);
      expect(siteRegex.test('https://example.com/path-with-dash')).toBe(true);
      expect(siteRegex.test('https://example.com/path.with.dots')).toBe(true);
      expect(siteRegex.test('https://example.com/path~tilde')).toBe(true);
      expect(siteRegex.test('https://example.com/path!exclamation')).toBe(true);
      expect(siteRegex.test('https://example.com/path$dollar')).toBe(true);
      expect(siteRegex.test('https://example.com/path&ampersand')).toBe(true);
    });

    it('should match URLs with trailing slash', () => {
      expect(siteRegex.test('https://google.com/')).toBe(true);
      expect(siteRegex.test('https://github.com/user/')).toBe(true);
      expect(siteRegex.test('example.com/path/')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(siteRegex.test('')).toBe(false);
      expect(siteRegex.test('invalid')).toBe(false);
      expect(siteRegex.test('.com')).toBe(false);
      expect(siteRegex.test('http://')).toBe(false);
      expect(siteRegex.test('https://')).toBe(false);
    });
  });
});
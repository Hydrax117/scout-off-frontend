/**
 * Unit tests for next-sitemap.config.js
 *
 * Ensures the sitemap config correctly excludes /admin and /api routes for all
 * configured locale prefixes. This test guards against regressions where a
 * future edit accidentally removes a critical exclusion pattern.
 *
 * Issue #532
 */

const config = require('../next-sitemap.config');

describe('next-sitemap.config.js', () => {
  it('exports a valid config object', () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
    expect(config.siteUrl).toBeDefined();
    expect(Array.isArray(config.exclude)).toBe(true);
  });

  it('contains siteUrl', () => {
    expect(config.siteUrl).toBeTruthy();
    expect(typeof config.siteUrl).toBe('string');
  });

  describe('exclude array', () => {
    it('is defined and is an array', () => {
      expect(config.exclude).toBeDefined();
      expect(Array.isArray(config.exclude)).toBe(true);
    });

    it('excludes /admin route', () => {
      const adminExclusions = config.exclude.filter((pattern) =>
        pattern.includes('admin'),
      );
      expect(adminExclusions.length).toBeGreaterThan(0);
    });

    it('excludes /api routes', () => {
      const apiExclusions = config.exclude.filter((pattern) =>
        pattern.includes('api'),
      );
      expect(apiExclusions.length).toBeGreaterThan(0);
    });

    it('excludes admin route for all locales (en, fr, sw)', () => {
      const locales = ['en', 'fr', 'sw'];
      locales.forEach((locale) => {
        const localeAdminPattern = `/${locale}/admin`;
        const hasLocaleAdmin = config.exclude.some(
          (pattern) => pattern === localeAdminPattern,
        );
        expect(hasLocaleAdmin).toBe(true);
      });
    });

    it('includes wildcard pattern for any locale admin route', () => {
      const wildcardAdminPattern = config.exclude.find(
        (pattern) => pattern === '/*/admin',
      );
      expect(wildcardAdminPattern).toBeDefined();
    });

    it('excludes bare /admin route', () => {
      expect(config.exclude).toContain('/admin');
    });

    it('excludes /api base route', () => {
      expect(config.exclude).toContain('/api');
    });

    it('excludes /api/* wildcard routes', () => {
      expect(config.exclude).toContain('/api/*');
    });
  });

  describe('other config properties', () => {
    it('has generateRobotsTxt set to false', () => {
      expect(config.generateRobotsTxt).toBe(false);
    });

    it('has sitemapSize configured', () => {
      expect(config.sitemapSize).toBeDefined();
      expect(typeof config.sitemapSize).toBe('number');
      expect(config.sitemapSize).toBeGreaterThan(0);
    });

    it('has additionalPaths defined', () => {
      expect(config.additionalPaths).toBeDefined();
      expect(typeof config.additionalPaths).toBe('function');
    });
  });

  describe('regression protection', () => {
    it('fails if admin exclusions are removed', () => {
      const adminPatterns = [
        '/admin',
        '/en/admin',
        '/fr/admin',
        '/sw/admin',
        '/*/admin',
      ];

      adminPatterns.forEach((pattern) => {
        const exists = config.exclude.includes(pattern);
        expect(exists).toBe(true);
      });
    });

    it('fails if API exclusions are removed', () => {
      const apiPatterns = ['/api', '/api/*'];

      apiPatterns.forEach((pattern) => {
        const exists = config.exclude.includes(pattern);
        expect(exists).toBe(true);
      });
    });

    it('has minimum expected exclusion count', () => {
      // At minimum: /admin, /en/admin, /fr/admin, /sw/admin, /*/admin, /api, /api/*
      // Plus any additional exclusions like /player, /validator, /scout/subscribe
      expect(config.exclude.length).toBeGreaterThanOrEqual(7);
    });
  });
});

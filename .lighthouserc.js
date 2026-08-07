module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      url: [
        'http://localhost:3000/en',
        'http://localhost:3000/en/player',
        'http://localhost:3000/en/scout',
      ],
      numberOfRuns: 1,
      // GitHub Actions' ubuntu-latest runner moved to Ubuntu 24.04, which
      // restricts unprivileged user namespaces via AppArmor by default —
      // Chrome's sandbox needs one, so it refuses to launch there
      // ("No usable sandbox!") unless explicitly disabled.
      settings: {
        chromeFlags:
          '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: 'lighthouse-report',
    },
  },
};

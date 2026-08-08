module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      url: [
        'http://localhost:3000/en',
        'http://localhost:3000/en/player',
        'http://localhost:3000/en/scout',
      ],
      // A single run is too noisy on shared GitHub-hosted runners — one busy
      // neighbor can spike total-blocking-time enough to fail the 0.8
      // performance gate on an otherwise-unrelated commit. Take the median
      // of 3 runs (Lighthouse CI's own default) instead.
      numberOfRuns: 3,
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

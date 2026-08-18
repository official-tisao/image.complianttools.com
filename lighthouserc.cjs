module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm --filter @complianttools/web preview --port 4174',
      startServerReadyPattern: 'Local:',
      url: [
        'http://127.0.0.1:4174/convert',
        'http://127.0.0.1:4174/compress',
        'http://127.0.0.1:4174/resize',
      ],
      numberOfRuns: 1,
      settings: { onlyCategories: ['performance', 'accessibility'] },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
};

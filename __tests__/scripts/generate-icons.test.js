const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '../../scripts/generate-icons.js');
const manifestPath = path.join(__dirname, '../../public/manifest.json');

describe('generate-icons.js output matches manifest.json icons', () => {
  let expectedFiles;
  let manifestUniqueSrcs;

  beforeAll(() => {
    const scriptSrc = fs.readFileSync(scriptPath, 'utf8');
    const sizesMatch = scriptSrc.match(/const sizes = \[([^\]]+)\]/);
    const sizes = sizesMatch[1].split(',').map((s) => parseInt(s.trim(), 10));

    expectedFiles = [
      ...sizes.map((s) => `icon-${s}x${s}.png`),
      'icon-maskable-512x512.png',
    ].sort();

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifestUniqueSrcs = [
      ...new Set(
        manifest.icons.map((entry) => {
          const src = entry.src;
          return src.startsWith('/') ? src.split('/').pop() : src;
        }),
      ),
    ].sort();
  });

  it('has every manifest icon src covered by the script output', () => {
    const missing = manifestUniqueSrcs.filter(
      (src) => !expectedFiles.includes(src),
    );
    expect(missing).toEqual([]);
  });

  it('has every script output file declared in the manifest', () => {
    const missing = expectedFiles.filter(
      (file) => !manifestUniqueSrcs.includes(file),
    );
    expect(missing).toEqual([]);
  });
});

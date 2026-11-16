import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['/', '/styles.css', '/assets/share-preview.png', '/favicon.ico'];
const hosts = ['artbenchmark.org', 'www.artbenchmark.org'];
const expected = new Map(await Promise.all(paths.map(async path => {
  const file = path === '/' ? 'index.html' : path.slice(1);
  return [path, digest(await readFile(new URL(`../${file}`, import.meta.url)))];
})));

let failures = [];
for (let attempt = 1; attempt <= 6; attempt++) {
  const results = await Promise.all(hosts.flatMap(host => paths.map(async path => {
    const url = `https://${host}${path}`;
    try {
      const response = await fetch(`${url}?deployment-check=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) return `${url}: HTTP ${response.status}`;
      const actual = digest(Buffer.from(await response.arrayBuffer()));
      if (actual !== expected.get(path)) return `${url}: still differs from this checkout`;
      return null;
    } catch (error) {
      return `${url}: ${error.message}`;
    }
  })));
  failures = results.filter(Boolean);
  if (!failures.length) {
    console.log('\nVerified: the new page, stylesheet, share image and favicon are live on both domains.');
    console.log('https://artbenchmark.org/');
    process.exit(0);
  }
  console.log(`Waiting for the public site to update (${attempt}/6)…`);
  if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 5000));
}
console.error('\nCloudflare accepted the deployment, but these public responses could not yet be verified:');
for (const failure of failures) console.error(`  ${failure}`);
console.error('Retry verification with: node scripts/verify-live.mjs');
process.exitCode = 1;

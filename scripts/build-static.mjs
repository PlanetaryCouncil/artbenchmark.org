import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
// Explicitly select public files, so deployment cannot include repository tooling,
// local credentials, node_modules, or the syndication ledger.
const publicFiles = ['index.html', 'styles.css', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'assets'];
for (const name of publicFiles) await stat(join(root, name));
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const name of publicFiles) {
  await cp(join(root, name), join(output, name), { recursive: true, dereference: false });
}
console.log('Built the public website in dist/.');

import { readdir, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let count = 0;
async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, item.name);
        if (item.isDirectory()) { await walk(path); continue; }
        if (path.endsWith('.json')) JSON.parse(await readFile(path, 'utf8'));
        if (!/\.(js|mjs)$/.test(path)) continue;
        const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
        if (result.status !== 0) throw new Error(result.stderr);
        const source = await readFile(path, 'utf8');
        for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) await access(resolve(dirname(path), match[1]));
        count++;
    }
}
await walk(root);
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
await access(join(root, manifest.js)); await access(join(root, manifest.css));
console.log(`PASS: ${count} JS modules syntax, relative imports, JSON and manifest entry points`);

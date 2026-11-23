// @ts-check
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '__INLINE_SCRIPT_HASHES__';
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

/** @param {string} html */
export function inlineScriptHashes(html) {
  return [...html.matchAll(SCRIPT)]
    .filter(([, attributes]) => !/\bsrc=|application\/ld\+json/.test(attributes))
    .map(([, , code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`);
}

/**
 * Lists the inline scripts of the built pages in the Content-Security-Policy header of .htaccess,
 * so that no other inline script can run.
 * @returns {import('astro').AstroIntegration}
 */
export default function csp() {
  return {
    name: 'csp',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const root = fileURLToPath(dir);
        const pages = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.html'));
        const hashes = pages.flatMap((page) => inlineScriptHashes(readFileSync(path.join(root, page), 'utf8')));
        const htaccess = path.join(root, '.htaccess');
        const source = readFileSync(htaccess, 'utf8');
        if (!source.includes(PLACEHOLDER)) throw new Error(`public/.htaccess must contain ${PLACEHOLDER}`);
        writeFileSync(htaccess, source.replace(PLACEHOLDER, [...new Set(hashes)].sort().join(' ')));
      },
    },
  };
}

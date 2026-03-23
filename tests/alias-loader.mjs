/**
 * Node.js ESM loader that resolves Next.js `@/` path aliases to the project root.
 * Usage: node --import ./tests/alias-loader.mjs --experimental-strip-types ...
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = resolvePath(fileURLToPath(import.meta.url), '../../');

// next/* bare imports lack .js extension in their specifiers — add it so Node resolves them
const NEXT_EXTENSIONLESS = new Set([
  'next/server', 'next/headers', 'next/navigation', 'next/cache',
  'next/dist/server/web/spec-extension/request',
]);

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const relative = specifier.slice(2); // strip '@/'
    const base = resolvePath(ROOT, relative);
    const hasExt = /\.(ts|tsx|js|mjs)$/.test(base);
    let resolved;
    if (hasExt) {
      resolved = base;
    } else if (existsSync(base + '.ts')) {
      resolved = base + '.ts';
    } else if (existsSync(base + '.tsx')) {
      resolved = base + '.tsx';
    } else if (existsSync(resolvePath(base, 'index.ts'))) {
      resolved = resolvePath(base, 'index.ts');
    } else {
      resolved = base + '.ts'; // let Node emit a proper error
    }
    return nextResolve(pathToFileURL(resolved).href, context);
  }
  if (NEXT_EXTENSIONLESS.has(specifier)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}

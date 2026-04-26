/**
 * Node.js ESM loader that resolves Next.js `@/` path aliases to the project root.
 * Usage: node --import ./tests/alias-loader.mjs --experimental-strip-types ...
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = resolvePath(fileURLToPath(import.meta.url), '../../');

// next/* bare imports lack .js extension in their specifiers — add it so Node resolves them
const NEXT_EXTENSIONLESS = new Set([
  'next/server', 'next/headers', 'next/navigation', 'next/cache',
  'next/dist/server/web/spec-extension/request',
]);

/** Probe a base path for the first existing TypeScript extension or index file. */
function resolveTsExtensions(basePath) {
  if (existsSync(basePath + '.ts')) return basePath + '.ts';
  if (existsSync(basePath + '.tsx')) return basePath + '.tsx';
  if (existsSync(resolvePath(basePath, 'index.ts'))) return resolvePath(basePath, 'index.ts');
  if (existsSync(resolvePath(basePath, 'index.tsx'))) return resolvePath(basePath, 'index.tsx');
  return null;
}

export function resolve(specifier, context, nextResolve) {
  // 1. `@/` Next.js path aliases.
  if (specifier.startsWith('@/')) {
    const relative = specifier.slice(2); // strip '@/'
    const base = resolvePath(ROOT, relative);
    const hasExt = /\.(ts|tsx|js|mjs)$/.test(base);
    const resolved = hasExt ? base : (resolveTsExtensions(base) ?? base + '.ts');
    return nextResolve(pathToFileURL(resolved).href, context);
  }

  // 2. Extensionless relative imports (./foo, ../foo) — Node's experimental
  // strip-types loader doesn't auto-add .ts on relative specifiers, which
  // breaks any TS source that imports a sibling without writing the extension.
  // Resolve them ourselves against the importing file's directory.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const hasExt = /\.(ts|tsx|js|mjs|cjs|json)$/.test(specifier);
    if (!hasExt) {
      const parentPath = fileURLToPath(context.parentURL);
      const base = resolvePath(dirname(parentPath), specifier);
      const resolved = resolveTsExtensions(base);
      if (resolved) {
        return nextResolve(pathToFileURL(resolved).href, context);
      }
    }
  }

  // 3. next/* bare imports.
  if (NEXT_EXTENSIONLESS.has(specifier)) {
    return nextResolve(specifier + '.js', context);
  }

  return nextResolve(specifier, context);
}

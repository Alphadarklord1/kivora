// Browser stub for Node.js path module
// Used by packages that have Node.js fallback code

export const join = (...parts: string[]) => parts.join('/');

export const resolve = (...parts: string[]) => parts.join('/');

export const dirname = (p: string) => {
  const parts = p.split('/');
  parts.pop();
  return parts.join('/') || '/';
};

export const basename = (p: string, ext?: string) => {
  const base = p.split('/').pop() || '';
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  return base;
};

export const extname = (p: string) => {
  const base = p.split('/').pop() || '';
  const dotIndex = base.lastIndexOf('.');
  return dotIndex > 0 ? base.slice(dotIndex) : '';
};

export const sep = '/';

export default {
  join,
  resolve,
  dirname,
  basename,
  extname,
  sep,
};

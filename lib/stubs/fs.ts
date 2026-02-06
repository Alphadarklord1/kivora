// Browser stub for Node.js fs module
// Used by packages that have Node.js fallback code

export const readFile = () => {
  throw new Error('fs.readFile is not available in the browser');
};

export const readFileSync = () => {
  throw new Error('fs.readFileSync is not available in the browser');
};

export const writeFile = () => {
  throw new Error('fs.writeFile is not available in the browser');
};

export const writeFileSync = () => {
  throw new Error('fs.writeFileSync is not available in the browser');
};

export const existsSync = () => false;

export const mkdirSync = () => {};

export const readdirSync = () => [];

export default {
  readFile,
  readFileSync,
  writeFile,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
};

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tailwind resolves `@import "tailwindcss"` and scans sources from `base`,
// which defaults to process.cwd(). When the dev server's CSS worker starts in
// a parent folder that has no node_modules, it fails with
// "Can't resolve 'tailwindcss' in '<parent folder>'", so pin it to this project.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const config = {
  plugins: {
    "@tailwindcss/postcss": { base: projectRoot },
  },
};

export default config;

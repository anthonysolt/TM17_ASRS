import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg is loaded only by server-side route handlers and the DB worker.
  serverExternalPackages: ['pg'],
  // Build output folder; NEXT_DIST_DIR lets a second dev server run side by side.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Pin the project root. Without it Turbopack picks up a stray package-lock.json
  // in a parent folder (e.g. the home directory) and treats that as the root.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;

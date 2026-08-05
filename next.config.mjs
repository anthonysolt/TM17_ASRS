/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg is loaded only by server-side route handlers and the DB worker.
  serverExternalPackages: ['pg'],
};

export default nextConfig;

import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@packages/shared-contracts', '@packages/hiring-genome', '@packages/proof-engine'],
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  reactCompiler: true,
  webpack: (config) => {
    config.cache = false;
    return config;
  },
};

export default nextConfig;

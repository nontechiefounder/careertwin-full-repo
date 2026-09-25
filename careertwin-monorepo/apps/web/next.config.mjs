/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@packages/shared-contracts', '@packages/hiring-genome', '@packages/proof-engine'],
  experimental: {
    externalDir: true,
  },
  reactCompiler: true,
};

export default nextConfig;

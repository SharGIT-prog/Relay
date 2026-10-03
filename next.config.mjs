/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'sharp', 'mysql2', 'pg'],
  async rewrites() {
    return [
      {
        source: '/api/resources/available',
        destination: '/api/resources?__subroute=available',
      },
    ];
  },
};

export default nextConfig;
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'sharp', 'mysql2', 'pg'],
};

export default nextConfig;
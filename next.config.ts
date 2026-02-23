import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "just-bash",
    "@open-fs/just-bash",
    "@mongodb-js/zstd",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          "@mongodb-js/zstd": "commonjs @mongodb-js/zstd",
        });
      }
      config.module.rules.push({
        test: /\.node$/,
        use: "node-loader",
        type: "javascript/auto",
      });
    }
    return config;
  },
};

export default nextConfig;

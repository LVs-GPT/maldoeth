import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { webpack }) => {
    // Resolve modules from monorepo root
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      path.resolve(__dirname, "../../node_modules"),
      ...config.resolve.modules,
    ];

    // Ignore optional porto connector (requires zod/mini not available)
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^porto/,
      }),
    );

    return config;
  },
  transpilePackages: ["@rainbow-me/rainbowkit"],
};

export default nextConfig;

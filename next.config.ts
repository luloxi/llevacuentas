import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls pdfjs worker assets; keep it external on the server
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;

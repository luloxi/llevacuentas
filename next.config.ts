import type { NextConfig } from "next";

const pdfWorkerTrace = [
  "./node_modules/pdf-parse/dist/**/*.mjs",
  "./node_modules/.pnpm/pdf-parse@*/node_modules/pdf-parse/dist/**/*.mjs",
  "./node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/**/pdf.worker*.mjs",
];

const nextConfig: NextConfig = {
  // Keep pdf-parse/pdfjs as real node_modules files. pdfjs fake-workers via
  // import("./pdf.worker.mjs"), which NFT does not follow on Vercel.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/**": pdfWorkerTrace,
    "/*": pdfWorkerTrace,
  },
};

export default nextConfig;

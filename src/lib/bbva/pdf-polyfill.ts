import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * pdfjs-dist (via pdf-parse) expects browser canvas APIs.
 * On Vercel Node they are missing and module init throws DOMMatrix.
 * Minimal stubs are enough for text extraction (no real rendering).
 */
export function ensurePdfDomPolyfills() {
  const g = globalThis as Record<string, unknown>;

  if (typeof g.DOMMatrix === "undefined") {
    class DOMMatrixPolyfill {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      m11 = 1;
      m12 = 0;
      m13 = 0;
      m14 = 0;
      m21 = 0;
      m22 = 1;
      m23 = 0;
      m24 = 0;
      m31 = 0;
      m32 = 0;
      m33 = 1;
      m34 = 0;
      m41 = 0;
      m42 = 0;
      m43 = 0;
      m44 = 1;
      is2D = true;
      isIdentity = true;
      constructor(_init?: string | number[]) {
        void _init;
      }
      multiply() {
        return new DOMMatrixPolyfill();
      }
      inverse() {
        return new DOMMatrixPolyfill();
      }
      translate() {
        return new DOMMatrixPolyfill();
      }
      scale() {
        return new DOMMatrixPolyfill();
      }
      rotate() {
        return new DOMMatrixPolyfill();
      }
      transformPoint(p?: { x?: number; y?: number; z?: number; w?: number }) {
        return {
          x: p?.x ?? 0,
          y: p?.y ?? 0,
          z: p?.z ?? 0,
          w: p?.w ?? 1,
        };
      }
    }
    g.DOMMatrix = DOMMatrixPolyfill;
  }

  if (typeof g.ImageData === "undefined") {
    class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      colorSpace = "srgb";
      constructor(
        sw: number | Uint8ClampedArray,
        sh?: number,
        settings?: { width?: number; height?: number },
      ) {
        if (typeof sw === "number") {
          this.width = sw;
          this.height = sh ?? 0;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = sw;
          this.width = settings?.width ?? sh ?? 0;
          this.height = settings?.height ?? 0;
        }
      }
    }
    g.ImageData = ImageDataPolyfill;
  }

  if (typeof g.Path2D === "undefined") {
    class Path2DPolyfill {
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
      roundRect() {}
    }
    g.Path2D = Path2DPolyfill;
  }
}

type PdfParseCtor = { setWorker: (workerSrc?: string) => string };

function requireFrom(from: string) {
  try {
    return createRequire(from);
  } catch {
    return null;
  }
}

/**
 * pdfjs Node always fake-workers via `import(workerSrc)`.
 * Default workerSrc is `./pdf.worker.mjs` (relative to the pdfjs file).
 * Vercel NFT does not trace that dynamic import, so serverless fails with
 * "Cannot find module pdf.worker.mjs". Point at an absolute file URL instead.
 */
export function resolvePdfJsWorkerSrc(): string | null {
  const here =
    typeof import.meta.url === "string"
      ? fileURLToPath(import.meta.url)
      : join(process.cwd(), "package.json");
  const starters = [
    join(process.cwd(), "package.json"),
    here,
  ];

  const tried = new Set<string>();
  const candidates: string[] = [];

  for (const start of starters) {
    const req = requireFrom(start);
    if (!req) continue;
    let pdfParseEntry: string | null = null;
    try {
      pdfParseEntry = req.resolve("pdf-parse");
    } catch {
      pdfParseEntry = null;
    }
    if (pdfParseEntry) {
      const fromParse = requireFrom(pdfParseEntry);
      for (const id of [
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        "pdfjs-dist/build/pdf.worker.mjs",
      ]) {
        try {
          if (fromParse) candidates.push(fromParse.resolve(id));
        } catch {
          /* not hoisted here */
        }
      }
      const parseDir = dirname(pdfParseEntry);
      candidates.push(
        join(parseDir, "pdf.worker.mjs"),
        join(parseDir, "../esm/pdf.worker.mjs"),
        join(parseDir, "../cjs/pdf.worker.mjs"),
        join(parseDir, "../../worker/pdf.worker.mjs"),
      );
    }
    try {
      candidates.push(req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"));
    } catch {
      /* optional direct dep */
    }
  }

  for (const file of candidates) {
    if (!file || tried.has(file)) continue;
    tried.add(file);
    if (existsSync(file)) return pathToFileURL(file).href;
  }
  return null;
}

export function configurePdfJsWorker(PDFParse: PdfParseCtor): string | null {
  const src = resolvePdfJsWorkerSrc();
  if (src) PDFParse.setWorker(src);
  return src;
}

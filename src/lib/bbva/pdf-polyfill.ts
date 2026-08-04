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

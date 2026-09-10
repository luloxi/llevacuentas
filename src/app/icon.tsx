import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Android / PWA icon.
 * Opaque black field, filled yellow ticket, black $.
 * Mark stays inside the maskable 66% safe zone.
 * No hairline strokes and no CSS dog-ear: both break at launcher size.
 */
export default function Icon() {
  const yellow = "#F0B90B";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
        }}
      >
        <div
          style={{
            width: 228,
            height: 276,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: yellow,
            borderRadius: 32,
            transform: "rotate(-14deg)",
          }}
        >
          <div
            style={{
              fontSize: 148,
              fontWeight: 800,
              color: "#000000",
              lineHeight: 1,
              fontFamily: "system-ui, sans-serif",
              transform: "rotate(-4deg)",
            }}
          >
            $
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Android / PWA icon — black background, yellow paper outline + $.
 * Paper stays inside the maskable safe zone (~66%) so it doesn't clip on Android.
 * Paper and $ are tilted diagonally.
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
        {/* Outer safe padding for adaptive/maskable icons */}
        <div
          style={{
            width: 280,
            height: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-18deg)",
          }}
        >
          {/* Paper outline — smaller than before */}
          <div
            style={{
              width: 168,
              height: 210,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `18px solid ${yellow}`,
              borderRadius: 22,
              background: "transparent",
              position: "relative",
            }}
          >
            {/* Folded corner */}
            <div
              style={{
                position: "absolute",
                top: -18,
                right: -18,
                width: 44,
                height: 44,
                borderBottom: `18px solid ${yellow}`,
                borderLeft: `18px solid ${yellow}`,
                borderBottomLeftRadius: 6,
              }}
            />
            <div
              style={{
                fontSize: 92,
                fontWeight: 700,
                color: yellow,
                lineHeight: 1,
                fontFamily: "system-ui, sans-serif",
                transform: "rotate(-6deg)",
              }}
            >
              $
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

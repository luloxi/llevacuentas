import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Android / PWA icon — black background, yellow paper outline + $ (Binance/Fiwind style). */
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
        {/* Safe zone for adaptive/maskable icons (~80%) */}
        <div
          style={{
            width: 300,
            height: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `26px solid ${yellow}`,
            borderRadius: 32,
            background: "transparent",
            position: "relative",
          }}
        >
          {/* Folded corner */}
          <div
            style={{
              position: "absolute",
              top: -26,
              right: -26,
              width: 64,
              height: 64,
              borderBottom: `26px solid ${yellow}`,
              borderLeft: `26px solid ${yellow}`,
              borderBottomLeftRadius: 8,
            }}
          />
          <div
            style={{
              fontSize: 160,
              fontWeight: 700,
              color: yellow,
              lineHeight: 1,
              fontFamily: "system-ui, sans-serif",
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

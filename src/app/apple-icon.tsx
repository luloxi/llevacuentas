import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon — black bg + yellow paper outline for home screen consistency. */
export default function AppleIcon() {
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
            width: 108,
            height: 128,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `9px solid ${yellow}`,
            borderRadius: 12,
            background: "transparent",
          }}
        >
          <div
            style={{
              fontSize: 56,
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

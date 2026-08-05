import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon — paper outline + $ only, no colored background. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <div
          style={{
            width: 120,
            height: 140,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "10px solid #2f5f52",
            borderRadius: 14,
            background: "transparent",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#2f5f52",
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

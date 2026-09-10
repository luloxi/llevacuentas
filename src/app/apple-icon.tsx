import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon. Same filled ticket as the Android mark. */
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
            width: 86,
            height: 104,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: yellow,
            borderRadius: 14,
            transform: "rotate(-14deg)",
          }}
        >
          <div
            style={{
              fontSize: 56,
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

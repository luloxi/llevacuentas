import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon — smaller diagonal paper + $ with padding from edges. */
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
            width: 112,
            height: 112,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-18deg)",
          }}
        >
          <div
            style={{
              width: 68,
              height: 84,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `7px solid ${yellow}`,
              borderRadius: 10,
              background: "transparent",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -7,
                right: -7,
                width: 18,
                height: 18,
                borderBottom: `7px solid ${yellow}`,
                borderLeft: `7px solid ${yellow}`,
                borderBottomLeftRadius: 3,
              }}
            />
            <div
              style={{
                fontSize: 36,
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

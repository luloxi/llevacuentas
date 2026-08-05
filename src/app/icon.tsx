import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Paper outline + $ — no colored background. */
export default function Icon() {
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
            width: 340,
            height: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "28px solid #2f5f52",
            borderRadius: 36,
            background: "transparent",
            position: "relative",
          }}
        >
          {/* Folded corner suggestion */}
          <div
            style={{
              position: "absolute",
              top: -28,
              right: -28,
              width: 72,
              height: 72,
              borderBottom: "28px solid #2f5f52",
              borderLeft: "28px solid #2f5f52",
              borderBottomLeftRadius: 8,
            }}
          />
          <div
            style={{
              fontSize: 180,
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

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon — same zen ledger mark. */
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
          background: "#3d7a6a",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 8,
            width: 100,
            height: 86,
            background: "#f7f6f3",
            borderRadius: 14,
            paddingLeft: 18,
            paddingRight: 14,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 7,
              background: "#3d7a6a",
              borderTopLeftRadius: 14,
              borderBottomLeftRadius: 14,
            }}
          />
          <div style={{ height: 6, width: "70%", background: "#afc8c0", borderRadius: 3 }} />
          <div style={{ height: 6, width: "100%", background: "#2f5f52", borderRadius: 3 }} />
          <div style={{ height: 6, width: "48%", background: "#afc8c0", borderRadius: 3 }} />
          <div
            style={{
              position: "absolute",
              right: 10,
              bottom: 10,
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#3d7a6a",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

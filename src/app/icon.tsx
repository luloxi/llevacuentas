import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Zen fintech mark: sage field + paper ledger + balance dot. */
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
          background: "#3d7a6a",
          borderRadius: 112,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 18,
            width: 280,
            height: 240,
            background: "#f7f6f3",
            borderRadius: 40,
            paddingLeft: 48,
            paddingRight: 36,
            position: "relative",
          }}
        >
          {/* Left accent */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 18,
              background: "#3d7a6a",
              borderTopLeftRadius: 40,
              borderBottomLeftRadius: 40,
            }}
          />
          <div
            style={{
              height: 16,
              width: "70%",
              background: "#afc8c0",
              borderRadius: 8,
            }}
          />
          <div
            style={{
              height: 16,
              width: "100%",
              background: "#2f5f52",
              borderRadius: 8,
            }}
          />
          <div
            style={{
              height: 16,
              width: "48%",
              background: "#afc8c0",
              borderRadius: 8,
            }}
          />
          {/* Balance dot */}
          <div
            style={{
              position: "absolute",
              right: 28,
              bottom: 28,
              width: 28,
              height: 28,
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

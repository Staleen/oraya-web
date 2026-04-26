import type { CSSProperties } from "react";

const BASE: CSSProperties = {
  display: "block",
  background: "linear-gradient(90deg, rgba(255,255,255,0.035), rgba(197,164,109,0.09), rgba(255,255,255,0.035))",
  backgroundSize: "220% 100%",
  border: "0.5px solid rgba(197,164,109,0.08)",
  opacity: 0.95,
};

export function SkeletonBlock({
  width = "100%",
  height,
  radius = 0,
  style,
}: {
  width?: CSSProperties["width"];
  height: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        ...BASE,
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonText({
  width = "100%",
  height = "12px",
  style,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  style?: CSSProperties;
}) {
  return <SkeletonBlock width={width} height={height} radius="999px" style={style} />;
}


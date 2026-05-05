interface Props {
  className?: string;
  style?: React.CSSProperties;
}

export default function OrayaLogoFull({ className, style }: Props) {
  return (
    <img
      src="/logos/ORAYA_logo_full.svg"
      alt="Oraya"
      className={className}
      style={{ width: "100%", height: "auto", display: "block", ...style }}
    />
  );
}

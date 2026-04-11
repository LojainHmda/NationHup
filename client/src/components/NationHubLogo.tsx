const LOGO_ICON_URL = "https://res.cloudinary.com/der1luzxq/image/upload/v1771244468/site-assets/nation-hub-logo-transparent-v2.png";
const LOGO_BANNER_URL = "https://res.cloudinary.com/der1luzxq/image/upload/c_trim/v1771252846/site-assets/gdl-04-header-logo.png";

interface LogoProps {
  className?: string;
  color?: string;
  variant?: "icon" | "banner";
}

export function NationHubLogo({ className = "w-8 h-8", color, variant = "icon" }: LogoProps) {
  const isWhite = color === "white" || color === "#fff" || color === "#ffffff";
  const filterStyle = isWhite ? { filter: "invert(1) brightness(2)" } : {};

  const src = variant === "banner" ? LOGO_BANNER_URL : LOGO_ICON_URL;

  return (
    <img
      src={src}
      alt="Nation Hub"
      className={className}
      style={filterStyle}
      draggable={false}
    />
  );
}

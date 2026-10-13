/** The one place the logo is defined. Files live in /public and come from v1's /assets, unchanged. */
type Props = {
  variant?: "full" | "icon";
  /** "adaptive" follows the colour scheme; "light" is for use on a dark/brand surface. */
  tone?: "adaptive" | "light";
  className?: string;
};

export function Logo({ variant = "full", tone = "adaptive", className = "" }: Props) {
  const tint = tone === "light" ? "logo-on-dark" : "logo-adaptive";
  return (
    <img
      src={variant === "full" ? "/logo.svg" : "/logo-icon.svg"}
      alt="بُعد"
      className={`${tint} ${className}`}
      draggable={false}
    />
  );
}

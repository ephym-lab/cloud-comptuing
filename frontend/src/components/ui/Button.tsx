import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "quiet";

const base =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md px-5 font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/90",
  secondary: "border-2 border-ink text-ink hover:bg-ink/5",
  quiet: "px-0 text-ink underline decoration-line decoration-2 underline-offset-4 hover:decoration-ink",
};

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  /** Shown instead of the label while an action runs, e.g. "Logging in…". */
  pendingLabel?: string;
  pending?: boolean;
}

export function Button({
  variant = "primary",
  pending = false,
  pendingLabel,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ButtonLinkProps) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

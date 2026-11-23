import { useId, type ComponentProps } from "react";

interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, className = "", ...props }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={
          "h-12 rounded-md border-2 bg-white px-3.5 text-ink placeholder:text-steel/70 " +
          "transition-colors focus:border-ink focus:outline-none " +
          (error ? "border-alert" : "border-line hover:border-steel/60")
        }
        {...props}
      />
      {error && (
        <p id={errorId} className="text-[0.9375rem] text-alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-[0.9375rem] text-steel">
          {hint}
        </p>
      )}
    </div>
  );
}

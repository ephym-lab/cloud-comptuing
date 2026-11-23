import type { ReactNode } from "react";

export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-2">
      <h1 className="text-4xl font-bold">{title}</h1>
      {children && <p className="text-pretty text-steel">{children}</p>}
    </header>
  );
}

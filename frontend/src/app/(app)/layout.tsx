import { Navbar } from "@/components/Navbar";
import { SessionProvider } from "@/components/SessionProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8">{children}</main>
    </SessionProvider>
  );
}

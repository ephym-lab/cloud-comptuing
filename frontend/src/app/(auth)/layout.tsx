import { KeyPath } from "@/components/KeyPath";
import { Wordmark } from "@/components/Wordmark";

/**
 * Shared frame for every auth page: the form on the left, and on the right the one
 * idea worth seeing before logging in — what an S3 key for your files will look like.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10 sm:py-8">
        <Wordmark />
        <main className="flex flex-1 items-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>

      <aside
        aria-labelledby="key-explainer"
        className="flex flex-col justify-center gap-8 bg-ink px-4 py-14 text-paper sm:px-10 lg:px-12 xl:px-16"
      >
        <h2 id="key-explainer" className="max-w-lg text-3xl font-semibold sm:text-4xl">
          Every file you upload gets one long name.
        </h2>
        <KeyPath
          size="lg"
          surface="ink"
          animate
          segments={[
            { text: "users" },
            { text: "your-id", kind: "variable", title: "Your user ID" },
            { text: "videos" },
            { text: "demo.mp4", kind: "object" },
          ]}
        />
        <p className="max-w-md text-lg text-paper/75">
          S3 has no folders. The part before the file name is a prefix: plain text that only
          looks like a path. The bucket is private, so you can open files only through links
          that expire.
        </p>
      </aside>
    </div>
  );
}

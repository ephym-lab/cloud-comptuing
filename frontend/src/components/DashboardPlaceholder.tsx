"use client";

import { KeyPath, shortId } from "@/components/KeyPath";
import { useSession } from "@/components/SessionProvider";

/** Temporary dashboard until the files UI lands: shows the user's own S3 prefix. */
export function DashboardPlaceholder() {
  const session = useSession();

  if (session.status === "loading") {
    return <div className="h-40 animate-pulse rounded-lg bg-line/60" aria-label="Loading" />;
  }

  const { user } = session;
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-4xl font-bold">Your files</h1>
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-6">
        <h2 className="text-lg font-semibold">Where your uploads will go</h2>
        <KeyPath
          segments={[
            { text: "users" },
            { text: shortId(user.id), kind: "variable", title: `Your user ID ${user.id}` },
            { text: "videos" },
            { text: "your-file.mp4", kind: "object" },
          ]}
        />
        <p className="text-steel">
          Every key you own starts with your ID, which is how the app keeps your files apart
          from everyone else&apos;s in one shared bucket. Uploading is coming next.
        </p>
      </div>
    </section>
  );
}

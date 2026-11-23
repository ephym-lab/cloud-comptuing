"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "@/components/SessionProvider";
import { DeleteDialog } from "@/components/files/DeleteDialog";
import { FileDropOverlay } from "@/components/files/FileDropOverlay";
import { FileList } from "@/components/files/FileList";
import { FilterTabs } from "@/components/files/FilterTabs";
import { PreviewDialog } from "@/components/files/PreviewDialog";
import { ShareDialog } from "@/components/files/ShareDialog";
import { StorageSummary } from "@/components/files/StorageSummary";
import { UploadPanel, type UploadPanelHandle } from "@/components/files/UploadPanel";
import { VersionsDialog } from "@/components/files/VersionsDialog";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { filesApi } from "@/lib/files-api";
import { CATEGORY_LABELS } from "@/lib/format";
import type { FileCategory, StatsResponse, StoredFile, UploadConfig } from "@/types/api";

type ListState =
  | { status: "loading" }
  | { status: "ready"; files: StoredFile[] }
  | { status: "error"; message: string };

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export function FilesDashboard() {
  const session = useSession();
  const userId = session.status === "ready" ? session.user.id : undefined;

  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [category, setCategory] = useState<FileCategory | null>(null);
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [previewing, setPreviewing] = useState<StoredFile | null>(null);
  const [sharing, setSharing] = useState<StoredFile | null>(null);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);
  const [versioning, setVersioning] = useState<StoredFile | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);
  const uploadPanel = useRef<UploadPanelHandle>(null);
  const onDroppedFiles = useCallback((files: FileList) => uploadPanel.current?.addFiles(files), []);

  useEffect(() => {
    filesApi.uploadConfig().then(setConfig).catch(() => undefined);
  }, []);

  useEffect(() => {
    filesApi.stats().then(setStats).catch(() => undefined);
  }, [reloadKey]);

  useEffect(() => {
    let active = true;
    filesApi
      .list(category ?? undefined)
      .then(({ files }) => active && setList({ status: "ready", files }))
      .catch((err: unknown) => active && setList({ status: "error", message: errorText(err, "Couldn't load your files.") }));
    return () => {
      active = false;
    };
  }, [category, reloadKey]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  async function download(file: StoredFile) {
    setDownloadingId(file.id);
    try {
      const { url } = await filesApi.downloadUrl(file.id);
      // The link says "attachment", so the browser saves the file instead of navigating.
      window.location.assign(url);
    } catch (err) {
      setFlash({ tone: "error", text: errorText(err, "Couldn't start the download.") });
    } finally {
      setDownloadingId(null);
    }
  }

  function changeCategory(next: FileCategory | null) {
    setList({ status: "loading" });
    setCategory(next);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl font-bold">Your files</h1>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-8">
          <UploadPanel ref={uploadPanel} config={config} userId={userId} onUploaded={refresh} />
          <StorageSummary stats={stats} />
        </div>

        <section aria-label="Your files" className="flex min-w-0 flex-col gap-5">
          <FilterTabs value={category} onChange={changeCategory} stats={stats} />
          {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
          <ListContent
            state={list}
            category={category}
            onRetry={refresh}
            userId={userId}
            downloadingId={downloadingId}
            onPreview={setPreviewing}
            onDownload={download}
            onShare={setSharing}
            onVersions={setVersioning}
            onDelete={setDeleting}
          />
        </section>
      </div>

      <FileDropOverlay onFiles={onDroppedFiles} prefix={`users/${userId ? `${userId.slice(0, 8)}…` : "…"}/`} />
      <PreviewDialog file={previewing} userId={userId} onClose={() => setPreviewing(null)} onDownload={download} />
      <ShareDialog file={sharing} onClose={() => setSharing(null)} />
      <VersionsDialog file={versioning} userId={userId} onClose={() => setVersioning(null)} onRestored={refresh} />
      <DeleteDialog
        file={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(file) => {
          setDeleting(null);
          setFlash({ tone: "success", text: `Deleted ${file.original_name}.` });
          refresh();
        }}
      />
    </div>
  );
}

function ListContent({
  state,
  category,
  onRetry,
  ...listProps
}: {
  state: ListState;
  category: FileCategory | null;
  onRetry: () => void;
} & Omit<React.ComponentProps<typeof FileList>, "files">) {
  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-label="Loading files">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-line/60" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="error">{state.message}</Notice>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (state.files.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border-2 border-dashed border-line px-6 py-12 text-center">
        <p className="text-lg font-semibold">
          {category ? `No ${CATEGORY_LABELS[category].toLowerCase()} yet` : "No files yet"}
        </p>
        <p className="text-steel">Upload a file and it shows up here, with its S3 key.</p>
      </div>
    );
  }

  return <FileList files={state.files} {...listProps} />;
}

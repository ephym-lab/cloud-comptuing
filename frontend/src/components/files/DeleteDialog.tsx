"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { filesApi } from "@/lib/files-api";
import type { StoredFile } from "@/types/api";

interface DeleteDialogProps {
  file: StoredFile | null;
  onClose: () => void;
  onDeleted: (file: StoredFile) => void;
}

export function DeleteDialog({ file, onClose, onDeleted }: DeleteDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteFile() {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      await filesApi.remove(file.id);
      onDeleted(file);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete the file. Try again.");
    } finally {
      setPending(false);
    }
  }

  function close() {
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open={file !== null}
      onClose={close}
      title={file ? `Delete ${file.original_name}?` : ""}
      description="It disappears from your list. Because versioning is on, S3 hides it behind a delete marker and keeps the older versions in the bucket."
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button className="bg-alert hover:bg-alert/90" onClick={deleteFile} pending={pending} pendingLabel="Deleting…">
          Delete file
        </Button>
      </div>
    </Dialog>
  );
}

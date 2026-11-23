"use client";

import { useState, type FormEvent } from "react";

import { issueLink, LinkTicket, type IssuedLink } from "@/components/files/LinkTicket";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Notice } from "@/components/ui/Notice";
import { filesApi } from "@/lib/files-api";
import { useAsyncAction } from "@/lib/use-async-action";
import type { StoredFile } from "@/types/api";

const DURATIONS = [5, 10, 30, 60];

export function ShareDialog({ file, onClose }: { file: StoredFile | null; onClose: () => void }) {
  return (
    <Dialog
      open={file !== null}
      onClose={onClose}
      title={file ? `Share ${file.original_name}` : ""}
      description="Anyone with the link can open the file until it expires. No login needed."
    >
      {file && <ShareBody key={file.id} file={file} />}
    </Dialog>
  );
}

function ShareBody({ file }: { file: StoredFile }) {
  const [minutes, setMinutes] = useState(10);
  const [link, setLink] = useState<IssuedLink | null>(null);
  const { run, pending, error } = useAsyncAction(filesApi.shareUrl);

  async function create(event?: FormEvent) {
    event?.preventDefault();
    const signed = await run(file.id, minutes);
    if (signed) setLink(issueLink(signed));
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={create} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">Link lasts for</legend>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((value) => (
              <label
                key={value}
                className="cursor-pointer rounded-md border-2 border-line bg-white px-4 py-2 font-semibold has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-3 has-focus-visible:outline-ink has-focus-visible:outline-offset-2"
              >
                <input
                  type="radio"
                  name="minutes"
                  value={value}
                  checked={minutes === value}
                  onChange={() => setMinutes(value)}
                  className="sr-only"
                />
                {value} min
              </label>
            ))}
          </div>
        </fieldset>
        {error && <Notice tone="error">{error.message}</Notice>}
        <Button type="submit" pending={pending} pendingLabel="Creating link…" className="self-start">
          {link ? "Create another link" : "Create share link"}
        </Button>
      </form>

      {link && <LinkTicket key={link.deadline} link={link} label="Share link" onRenew={() => create()} renewing={pending} />}
    </div>
  );
}

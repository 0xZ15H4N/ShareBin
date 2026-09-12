"use client";

import { useMemo, useRef, useState } from "react";
import { formatBytes } from "@/lib/validation";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

interface Entry {
  file: File;
  relativePath: string;
}

interface ConflictInfo {
  uniqueId: string;
  expiresAt: string;
}

interface SuccessInfo {
  uniqueId: string;
  folderName: string;
  expiresAt: string;
  fileCount: number;
}

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalSize = useMemo(() => entries.reduce((sum, e) => sum + e.file.size, 0), [entries]);
  const oversized = useMemo(() => entries.filter((e) => e.file.size > MAX_FILE_SIZE_BYTES), [entries]);

  function handleFolderChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const arr: Entry[] = Array.from(fileList).map((file) => ({
      file,
      relativePath: (file as any).webkitRelativePath || file.name,
    }));

    const topFolder = arr[0]?.relativePath.split("/")[0] || "Folder";
    setFolderName(topFolder);
    setEntries(arr);
  }

  function removeEntry(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function resetAll() {
    setEntries([]);
    setFolderName(null);
    setError(null);
    setSuccess(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function doUpload() {
    setError(null);

    if (entries.length === 0) {
      setError("Please select a folder first.");
      return;
    }
    if (oversized.length > 0) {
      setError(
        `"${oversized[0].file.name}" is ${formatBytes(oversized[0].file.size)}, which exceeds the 100 MB per-file limit. Remove it or choose a different folder.`
      );
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("folderName", folderName || "Untitled");
      for (const entry of entries) {
        formData.append("files", entry.file);
        formData.append("relativePaths", entry.relativePath);
      }

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.status === 409 && data.code === "EXISTING_SHARE") {
        setConflict({ uniqueId: data.uniqueId, expiresAt: data.expiresAt });
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.message || "Upload failed.");
        return;
      }

      setSuccess({
        uniqueId: data.uniqueId,
        folderName: data.folderName,
        expiresAt: data.expiresAt,
        fileCount: data.files.length,
      });
      setEntries([]);
      setFolderName(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("Network error during upload. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExisting() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/share", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || "Failed to delete existing files.");
        return;
      }
      setConflict(null);
      await doUpload();
    } catch {
      setError("Network error while deleting existing files.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Upload a folder</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick one folder. Every file inside will be uploaded together under one share ID. Max 100 MB per file.
        </p>
      </div>

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm font-medium text-emerald-800">Upload complete!</p>
          <p className="mt-2 text-3xl font-bold tracking-widest text-emerald-900">{success.uniqueId}</p>
          <p className="mt-2 text-sm text-emerald-700">
            {success.fileCount} file{success.fileCount === 1 ? "" : "s"} from “{success.folderName}” — share this code.
            It expires at {new Date(success.expiresAt).toLocaleTimeString()} (10 minutes from now).
          </p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              onClick={() => navigator.clipboard.writeText(success.uniqueId)}
            >
              Copy code
            </button>
            <button
              className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              onClick={resetAll}
            >
              Upload another
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
            <input
              ref={inputRef}
              type="file"
              // @ts-ignore -- non-standard attributes needed for folder selection
              webkitdirectory=""
              // @ts-ignore
              directory=""
              multiple
              onChange={handleFolderChange}
              className="hidden"
              id="folder-input"
            />
            <label
              htmlFor="folder-input"
              className="mx-auto inline-block cursor-pointer rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Choose folder
            </label>
            {folderName && <p className="mt-3 text-sm font-medium text-slate-700">Selected: {folderName}</p>}
            {entries.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                {entries.length} file{entries.length === 1 ? "" : "s"} · {formatBytes(totalSize)} total
              </p>
            )}
          </div>

          {entries.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {entries.map((entry, i) => {
                  const isOversized = entry.file.size > MAX_FILE_SIZE_BYTES;
                  return (
                    <li
                      key={`${entry.relativePath}-${i}`}
                      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${isOversized ? "bg-red-50" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-700">{entry.relativePath}</p>
                        <p className={`text-xs ${isOversized ? "text-red-600" : "text-slate-400"}`}>
                          {formatBytes(entry.file.size)}
                          {isOversized && " — exceeds 100 MB"}
                        </p>
                      </div>
                      <button
                        onClick={() => removeEntry(i)}
                        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        type="button"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={doUpload}
            disabled={loading || entries.length === 0}
            className="rounded-lg bg-brand-500 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? "Uploading…" : "Upload folder"}
          </button>
        </>
      )}

      {conflict && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Files already exist for your account.</h2>
            <p className="mt-2 text-sm text-slate-600">
              Your current folder (code <span className="font-mono font-semibold">{conflict.uniqueId}</span>) will be
              automatically deleted after 10 minutes. Would you like to delete it now and upload the new folder?
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConflict(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteExisting}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete existing files"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

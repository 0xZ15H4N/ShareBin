"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBytes } from "@/lib/validation";
import type { ShareViewResponse } from "@/types";

export default function DownloadPage() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<ShareViewResponse | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!share) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [share]);

  const remaining = useMemo(() => {
    if (!share) return null;
    const ms = new Date(share.expiresAt).getTime() - now;
    if (ms <= 0) return "Expired";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [share, now]);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShare(null);

    const trimmed = id.trim();
    if (!/^\d{8}$/.test(trimmed)) {
      setError("Please enter exactly 8 digits.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/share/${trimmed}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || "Something went wrong.");
        return;
      }
      setShare(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Download files</h1>
        <p className="mt-1 text-sm text-slate-500">Enter the 8-digit share ID you were given. No account needed.</p>
      </div>

      <form onSubmit={handleLookup} className="flex gap-3">
        <input
          value={id}
          onChange={(e) => setId(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="48291736"
          inputMode="numeric"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-mono text-lg tracking-widest focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "Searching…" : "View files"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {share && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Folder</p>
              <p className="text-lg font-semibold text-slate-900">{share.folderName}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(share.uniqueId)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Copy code
              </button>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  remaining === "Expired" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {remaining === "Expired" ? "Expired" : `Expires in ${remaining}`}
              </span>
            </div>
          </div>

          <ul className="mt-5 divide-y divide-slate-100">
            {share.files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{f.relativePath || f.originalName}</p>
                  <p className="text-xs text-slate-400">
                    {formatBytes(f.size)}
                    {f.mimeType ? ` · ${f.mimeType}` : ""}
                  </p>
                </div>
                <a
                  href={f.secureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>

          {share.files.length > 1 && (
            <button
              onClick={() => share.files.forEach((f) => window.open(f.secureUrl, "_blank"))}
              className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Download all ({share.files.length} files)
            </button>
          )}
        </div>
      )}
    </main>
  );
}

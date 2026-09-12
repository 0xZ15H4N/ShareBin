"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || "Something went wrong.");
        return;
      }
      router.push("/upload");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-10">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">ShareBin</h1>
        <p className="mt-2 text-slate-500">
          Upload a folder, get an 8-digit code, share it. Everything self-destructs in 10 minutes.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button
            className={`flex-1 rounded-md py-1.5 transition ${mode === "login" ? "bg-white shadow-sm" : "text-slate-500"}`}
            onClick={() => setMode("login")}
            type="button"
          >
            Log in
          </button>
          <button
            className={`flex-1 rounded-md py-1.5 transition ${mode === "register" ? "bg-white shadow-sm" : "text-slate-500"}`}
            onClick={() => setMode("register")}
            type="button"
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-brand-500 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>

      <Link href="/download" className="text-sm font-medium text-brand-600 hover:underline">
        Have a share ID? Go to the download page →
      </Link>
    </main>
  );
}

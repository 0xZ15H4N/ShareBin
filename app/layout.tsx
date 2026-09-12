import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShareBin — Simple, temporary file sharing",
  description: "Upload a folder, share an 8-digit ID, files self-destruct in 10 minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-800 antialiased">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
      </body>
    </html>
  );
}

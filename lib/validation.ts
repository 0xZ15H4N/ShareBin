export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const SHARE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const SHARE_ID_REGEX = /^\d{8}$/;

export function isValidShareId(id: string): boolean {
  return SHARE_ID_REGEX.test(id);
}

export function generateShareId(): string {
  // 8-digit numeric ID, zero-padded (00000000–99999999).
  const n = Math.floor(Math.random() * 100_000_000);
  return String(n).padStart(8, "0");
}

/**
 * Reject any relative path that tries to escape the share's folder
 * (path traversal) or that isn't a plain relative path.
 */
export function sanitizeRelativePath(relativePath: string | undefined, fallback: string): string {
  const raw = (relativePath || fallback || "file").replace(/\\/g, "/");
  const segments = raw
    .split("/")
    .filter((seg) => seg.length > 0 && seg !== "." && seg !== "..");
  const cleaned = segments.join("/");
  return cleaned.length > 0 ? cleaned : fallback;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

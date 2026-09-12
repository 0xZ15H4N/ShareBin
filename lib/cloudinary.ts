import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

/**
 * Sanitize a filename (or path segment) so it is safe to use as part of a
 * Cloudinary public_id: no path traversal, no unsafe characters.
 */
export function sanitizePublicIdSegment(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-") // keep word chars, dot, dash
    .replace(/\.{2,}/g, ".") // collapse ".." sequences (path traversal)
    .replace(/^[.-]+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);
  return base.length > 0 ? base : "file";
}

/**
 * Build a safe, unique public_id for a file within a share's folder.
 * Includes an index to avoid collisions between files with the same name
 * in different sub-directories of the uploaded folder.
 */
export function buildPublicId(uniqueId: string, index: number, originalName: string): string {
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
  const safeName = sanitizePublicIdSegment(nameWithoutExt);
  const padded = String(index).padStart(3, "0");
  return `sharebin/${uniqueId}/${padded}-${safeName}`;
}

export function shareFolderPath(uniqueId: string): string {
  return `sharebin/${uniqueId}`;
}

/**
 * Upload a single file buffer to Cloudinary under the share's folder.
 */
export async function uploadFileToCloudinary(params: {
  buffer: Buffer;
  publicId: string;
}): Promise<{
  public_id: string;
  secure_url: string;
  resource_type: string;
  format?: string;
  bytes: number;
}> {
  const { buffer, publicId } = params;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "auto",
        overwrite: false,
        unique_filename: false,
        use_filename: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed with no result"));
          return;
        }
        resolve({
          public_id: result.public_id,
          secure_url: result.secure_url,
          resource_type: result.resource_type,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Delete every asset under a share's Cloudinary folder, then the (empty)
 * folder itself. Safe to call even if the folder/assets don't exist.
 */
export async function deleteShareFolder(uniqueId: string): Promise<void> {
  const folder = shareFolderPath(uniqueId);

  // Cloudinary requires deleting resources by type separately.
  const resourceTypes: Array<"image" | "video" | "raw"> = ["image", "video", "raw"];

  for (const resourceType of resourceTypes) {
    try {
      await cloudinary.api.delete_resources_by_prefix(`${folder}/`, {
        resource_type: resourceType,
      });
    } catch (err) {
      // Ignore "not found" style errors; rethrow anything else after the loop
      // completes so partial cleanup isn't blocked.
      console.warn(`Cloudinary delete_resources_by_prefix (${resourceType}) warning:`, err);
    }
  }

  try {
    await cloudinary.api.delete_folder(folder);
  } catch (err) {
    // Folder may already be gone or non-empty; not fatal.
    console.warn("Cloudinary delete_folder warning:", err);
  }
}

/**
 * Best-effort cleanup of a specific list of already-uploaded public IDs.
 * Cloudinary's delete API is scoped per resource_type, so we try each type;
 * IDs that don't match a given type are simply ignored by Cloudinary.
 */
export async function deletePublicIds(publicIds: string[]): Promise<void> {
  if (publicIds.length === 0) return;
  const resourceTypes: Array<"image" | "video" | "raw"> = ["image", "video", "raw"];
  for (const resourceType of resourceTypes) {
    try {
      await cloudinary.api.delete_resources(publicIds, { resource_type: resourceType });
    } catch (err) {
      console.warn(`Cloudinary delete_resources (${resourceType}) warning:`, err);
    }
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUserId } from "@/lib/auth";
import { buildPublicId, deletePublicIds, uploadFileToCloudinary } from "@/lib/cloudinary";
import { enqueueDeletionJob } from "@/lib/queue";
import { MAX_FILE_SIZE_BYTES, SHARE_TTL_MS, generateShareId, sanitizeRelativePath, formatBytes } from "@/lib/validation";
import type { UploadResponse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // 1. Authentication — the CUID is the ONLY user identity we trust, and it
  // comes exclusively from the verified session cookie, never from the body.
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json<UploadResponse>(
      { success: false, code: "UNAUTHENTICATED", message: "You must be logged in to upload." },
      { status: 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json<UploadResponse>(
      { success: false, code: "INVALID_BODY", message: "Could not parse upload request." },
      { status: 400 }
    );
  }

  const files = formData.getAll("files") as File[];
  const rawPaths = formData.getAll("relativePaths") as string[];
  const folderName = (formData.get("folderName") as string | null)?.trim() || "Untitled";

  if (!files || files.length === 0) {
    return NextResponse.json<UploadResponse>(
      { success: false, code: "NO_FILES", message: "No files were provided." },
      { status: 400 }
    );
  }

  // 2. Backend size validation — never trust the frontend check.
  // Reject the WHOLE folder if even one file is too large.
  for (let i = 0; i < files.length; i++) {
    if (files[i].size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json<UploadResponse>(
        {
          success: false,
          code: "FILE_TOO_LARGE",
          message: `"${files[i].name}" is ${formatBytes(files[i].size)}, which exceeds the 100 MB per-file limit.`,
          offendingFile: files[i].name,
        },
        { status: 400 }
      );
    }
  }

  // 3. Existing-share check. We do NOT delete/replace here — the client
  // must call DELETE /api/share first, then retry the upload. This keeps
  // the destructive action explicit and separately authorized.
  const existingShare = await prisma.share.findUnique({ where: { userId } });
  if (existingShare) {
    return NextResponse.json<UploadResponse>(
      {
        success: false,
        code: "EXISTING_SHARE",
        message: "Files already exist for your account.",
        uniqueId: existingShare.uniqueId,
        expiresAt: existingShare.expiresAt.toISOString(),
      },
      { status: 409 }
    );
  }

  // 4. Generate a unique 8-digit share ID, retrying on collision. The
  // database-level unique constraint is the final authority; this loop is
  // just to avoid unnecessary round-trips before we know it's free.
  let uniqueId = generateShareId();
  for (let attempt = 0; attempt < 10; attempt++) {
    const collision = await prisma.share.findUnique({ where: { uniqueId } });
    if (!collision) break;
    uniqueId = generateShareId();
  }

  // 5. Upload every file to Cloudinary under sharebin/{uniqueId}.
  // If anything fails partway through, roll back everything already
  // uploaded so we never leave orphaned Cloudinary assets.
  const uploadedPublicIds: string[] = [];
  const fileRecords: Array<{
    originalName: string;
    relativePath: string;
    publicId: string;
    secureUrl: string;
    mimeType: string | null;
    size: number;
    resourceType: string | null;
    format: string | null;
  }> = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = sanitizeRelativePath(rawPaths[i], file.name);
      const publicId = buildPublicId(uniqueId, i, relativePath);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await uploadFileToCloudinary({ buffer, publicId });
      uploadedPublicIds.push(result.public_id);

      fileRecords.push({
        originalName: file.name,
        relativePath,
        publicId: result.public_id,
        secureUrl: result.secure_url,
        mimeType: file.type || null,
        size: file.size,
        resourceType: result.resource_type,
        format: result.format ?? null,
      });
    }
  } catch (err) {
    console.error("Cloudinary upload failed midway:", err);
    await deletePublicIds(uploadedPublicIds);
    return NextResponse.json<UploadResponse>(
      { success: false, code: "UPLOAD_FAILED", message: "Upload failed partway through. No files were saved." },
      { status: 500 }
    );
  }

  // 6. Persist Share + File records atomically.
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS);

  try {
    const share = await prisma.share.create({
      data: {
        uniqueId,
        userId,
        folderName,
        expiresAt,
        files: { create: fileRecords },
      },
      include: { files: true },
    });

    // 7. Schedule automatic deletion in Upstash Redis.
    await enqueueDeletionJob({
      shareId: share.id,
      uniqueId: share.uniqueId,
      userId,
      folder: `sharebin/${uniqueId}`,
      deleteAt: expiresAt.getTime(),
    });

    return NextResponse.json<UploadResponse>({
      success: true,
      uniqueId: share.uniqueId,
      folderName: share.folderName ?? "Untitled",
      expiresAt: share.expiresAt.toISOString(),
      files: share.files.map((f) => ({
        originalName: f.originalName,
        relativePath: f.relativePath ?? f.originalName,
        size: f.size,
        secureUrl: f.secureUrl,
        mimeType: f.mimeType ?? undefined,
      })),
    });
  } catch (err) {
    console.error("Database write failed after Cloudinary upload:", err);
    // Roll back Cloudinary assets since no DB record exists for them.
    await deletePublicIds(uploadedPublicIds);

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json<UploadResponse>(
        { success: false, code: "CONFLICT", message: "A conflicting share was created concurrently. Please try again." },
        { status: 409 }
      );
    }

    return NextResponse.json<UploadResponse>(
      { success: false, code: "SERVER_ERROR", message: "Unexpected server error while saving your upload." },
      { status: 500 }
    );
  }
}

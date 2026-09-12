import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidShareId } from "@/lib/validation";
import type { ShareErrorResponse, ShareViewResponse } from "@/types";

export async function GET(req: NextRequest, { params }: { params: { uniqueId: string } }) {
  const { uniqueId } = params;

  if (!isValidShareId(uniqueId)) {
    return NextResponse.json<ShareErrorResponse>(
      { success: false, code: "INVALID_ID", message: "Share ID must be exactly 8 digits." },
      { status: 400 }
    );
  }

  const share = await prisma.share.findUnique({
    where: { uniqueId },
    include: { files: true },
  });

  if (!share) {
    return NextResponse.json<ShareErrorResponse>(
      { success: false, code: "NOT_FOUND", message: "No share was found with that ID." },
      { status: 404 }
    );
  }

  if (share.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json<ShareErrorResponse>(
      {
        success: false,
        code: "EXPIRED",
        message: "This share has expired or the files have already been deleted.",
      },
      { status: 410 }
    );
  }

  // Only ever return safe, public-facing metadata — no user info, no
  // passwords, no internal IDs beyond what's needed to render the page.
  return NextResponse.json<ShareViewResponse>({
    success: true,
    uniqueId: share.uniqueId,
    folderName: share.folderName ?? "Untitled",
    expiresAt: share.expiresAt.toISOString(),
    files: share.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      relativePath: f.relativePath,
      size: f.size,
      mimeType: f.mimeType,
      secureUrl: f.secureUrl,
    })),
  });
}

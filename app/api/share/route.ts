import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUserId } from "@/lib/auth";
import { deleteShareFolder } from "@/lib/cloudinary";
import { invalidateJobsForShare } from "@/lib/queue";

export async function DELETE() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ success: false, message: "You must be logged in." }, { status: 401 });
  }

  const share = await prisma.share.findUnique({ where: { userId } });
  if (!share) {
    return NextResponse.json({ success: false, message: "No active share found for your account." }, { status: 404 });
  }

  // Ownership is guaranteed by looking the share up via userId (the
  // authenticated user's own CUID), so there is no way to reach another
  // user's Share row through this query.
  if (share.userId !== userId) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  try {
    await deleteShareFolder(share.uniqueId);

    // Deleting the Share cascades to its File records (onDelete: Cascade).
    await prisma.share.delete({ where: { id: share.id } });

    // Best-effort: strip any pending/processing Redis job for this share so
    // it doesn't linger visibly in the queue. Even if this fails or races,
    // the cron worker independently re-verifies the share exists in
    // Postgres before deleting anything, so it's never unsafe.
    await invalidateJobsForShare(share.id);

    return NextResponse.json({ success: true, message: "Share deleted." });
  } catch (err) {
    console.error("Manual delete-share error:", err);
    return NextResponse.json({ success: false, message: "Failed to delete share." }, { status: 500 });
  }
}

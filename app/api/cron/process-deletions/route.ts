import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteShareFolder } from "@/lib/cloudinary";
import {
  drainQueueToProcessing,
  completeJob,
  requeueForLater,
  retryOrFail,
  type DeletionJob,
} from "@/lib/queue";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron sends this header automatically; also accept a manual
  // Bearer token for external cron services or local testing.
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const vercelCronHeader = req.headers.get("x-vercel-cron-signature");
  if (vercelCronHeader && vercelCronHeader === secret) return true;

  return false;
}

async function processJob(job: DeletionJob): Promise<"deleted" | "requeued" | "skipped-not-due" | "retried" | "failed"> {
  if (job.deleteAt > Date.now()) {
    await requeueForLater(job);
    return "skipped-not-due";
  }

  try {
    const share = await prisma.share.findUnique({ where: { id: job.shareId } });

    // The share is gone — either manually deleted, or replaced. Either way
    // there is nothing left to do; discard the job quietly.
    if (!share) {
      await completeJob(job);
      return "deleted";
    }

    // Critical safety check: make sure this job actually corresponds to the
    // CURRENT share, not a stale job from a share that was deleted and
    // replaced with a new one that happens to reuse the same row id (can't
    // happen with cuids, but we also guard on uniqueId as defense-in-depth).
    if (share.uniqueId !== job.uniqueId) {
      await completeJob(job);
      return "deleted";
    }

    if (share.expiresAt.getTime() > Date.now()) {
      // DB says it's not actually due yet (e.g. share was re-created) —
      // don't trust the job's own timestamp alone.
      await requeueForLater({ ...job, deleteAt: share.expiresAt.getTime() });
      return "skipped-not-due";
    }

    await deleteShareFolder(job.uniqueId);
    await prisma.share.delete({ where: { id: share.id } }); // cascades to File rows

    await completeJob(job);
    return "deleted";
  } catch (err) {
    console.error(`Deletion job ${job.jobId} failed:`, err);
    const outcome = await retryOrFail(job);
    return outcome;
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const jobs = await drainQueueToProcessing();

  const results = { deleted: 0, requeued: 0, retried: 0, failed: 0 };

  for (const job of jobs) {
    const outcome = await processJob(job);
    if (outcome === "deleted") results.deleted++;
    else if (outcome === "skipped-not-due") results.requeued++;
    else if (outcome === "retried") results.retried++;
    else if (outcome === "failed") results.failed++;
  }

  return NextResponse.json({
    success: true,
    processed: jobs.length,
    ...results,
  });
}

import { redis, DELETE_QUEUE_KEY, PROCESSING_KEY, FAILED_KEY, MAX_RETRIES } from "./redis";
import { v4 as uuidv4 } from "uuid";

export interface DeletionJob {
  jobId: string;
  shareId: string;
  uniqueId: string;
  userId: string;
  folder: string;
  deleteAt: number; // epoch ms
  retryCount: number;
}

/**
 * Push a new deletion job onto the pending queue.
 * Upstash Redis lists don't support delayed execution on their own — the
 * scheduled cron worker (see /api/cron/process-deletions) is responsible for
 * only acting on jobs whose deleteAt has arrived, and re-queuing the rest.
 */
export async function enqueueDeletionJob(
  job: Omit<DeletionJob, "jobId" | "retryCount">
): Promise<DeletionJob> {
  const fullJob: DeletionJob = {
    ...job,
    jobId: uuidv4(),
    retryCount: 0,
  };
  await redis.rpush(DELETE_QUEUE_KEY, JSON.stringify(fullJob));
  return fullJob;
}

function safeParseJob(raw: string | null): DeletionJob | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.jobId === "string" &&
      typeof parsed.shareId === "string" &&
      typeof parsed.uniqueId === "string" &&
      typeof parsed.deleteAt === "number"
    ) {
      return parsed as DeletionJob;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Drain the entire pending queue into memory. Each job is moved into the
 * "processing" list first (reliable-queue pattern) so a crash mid-run
 * doesn't silently lose it — a stuck processing entry can be inspected or
 * manually replayed.
 */
export async function drainQueueToProcessing(maxJobs = 500): Promise<DeletionJob[]> {
  const jobs: DeletionJob[] = [];
  for (let i = 0; i < maxJobs; i++) {
    const raw = await redis.lpop<string>(DELETE_QUEUE_KEY);
    if (!raw) break;
    // Immediately record it as "in processing" before we do anything else.
    await redis.rpush(PROCESSING_KEY, raw);
    const job = safeParseJob(raw);
    if (job) jobs.push(job);
    else {
      // Corrupt entry — drop it from processing, it can never be processed.
      await redis.lrem(PROCESSING_KEY, 1, raw);
    }
  }
  return jobs;
}

/** Mark a job (still in the processing list) as successfully completed. */
export async function completeJob(job: DeletionJob): Promise<void> {
  await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));
}

/**
 * A job's deleteAt has not arrived yet — take it out of "processing" and put
 * it back on the pending queue for a later cron run.
 */
export async function requeueForLater(job: DeletionJob): Promise<void> {
  await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));
  await redis.rpush(DELETE_QUEUE_KEY, JSON.stringify(job));
}

/**
 * Processing the job failed (Cloudinary/Postgres error). Increment its
 * retry count and push it back onto the pending queue, unless it has
 * exhausted MAX_RETRIES, in which case it's moved to the failed list.
 */
export async function retryOrFail(job: DeletionJob): Promise<"retried" | "failed"> {
  await redis.lrem(PROCESSING_KEY, 1, JSON.stringify(job));
  const nextRetryCount = job.retryCount + 1;
  if (nextRetryCount > MAX_RETRIES) {
    await redis.rpush(FAILED_KEY, JSON.stringify({ ...job, retryCount: nextRetryCount }));
    return "failed";
  }
  await redis.rpush(DELETE_QUEUE_KEY, JSON.stringify({ ...job, retryCount: nextRetryCount }));
  return "retried";
}

/**
 * Best-effort removal of any pending/processing jobs for a given share.
 * Used when a share is deleted manually or replaced, so a stale job doesn't
 * linger in the visible queue. This is a defense-in-depth measure only —
 * the authoritative safety check happens in the cron worker, which verifies
 * shareId + uniqueId against Postgres before deleting anything, so an old
 * job can never delete a newer share even if this cleanup step is skipped
 * or races with a concurrent enqueue.
 */
export async function invalidateJobsForShare(shareId: string): Promise<void> {
  for (const key of [DELETE_QUEUE_KEY, PROCESSING_KEY]) {
    const all = await redis.lrange<string>(key, 0, -1);
    for (const raw of all) {
      const job = safeParseJob(raw);
      if (job && job.shareId === shareId) {
        await redis.lrem(key, 0, raw);
      }
    }
  }
}

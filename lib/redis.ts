import { Redis } from "@upstash/redis";

// Server-only. Never import this file from client components.
export const redis = Redis.fromEnv();

export const DELETE_QUEUE_KEY = "sharebin:delete-queue";
export const PROCESSING_KEY = "sharebin:delete-processing";
export const FAILED_KEY = "sharebin:delete-failed";
export const DELETE_ZSET_KEY = "sharebin:delete-schedule"; // sorted set, score = deleteAt
export const MAX_RETRIES = 5;

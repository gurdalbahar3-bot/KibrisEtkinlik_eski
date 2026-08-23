import type {
  PublisherChannel,
  RawObservation,
  SourceSeed,
  SpiderFetchPort,
  SpiderJob,
} from "@/lib/orumcek/types";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createSpiderJob(seed: SourceSeed, channel: PublisherChannel): SpiderJob {
  if (channel.publisherId !== seed.publisher.id) {
    throw new Error("Job channel must belong to the seed publisher.");
  }
  return {
    id: newId("job"),
    seedId: seed.id,
    channelId: channel.id,
    status: "queued",
    createdAt: nowIso(),
    observationIds: [],
  };
}

export function markJobRunning(job: SpiderJob): SpiderJob {
  if (job.status !== "queued") {
    throw new Error(`Job ${job.id} cannot start from ${job.status}.`);
  }
  return {
    ...job,
    status: "running",
    startedAt: nowIso(),
  };
}

export function markJobDone(job: SpiderJob, observationIds: string[]): SpiderJob {
  if (job.status !== "running") {
    throw new Error(`Job ${job.id} cannot complete from ${job.status}.`);
  }
  return {
    ...job,
    status: "done",
    finishedAt: nowIso(),
    observationIds,
  };
}

export function markJobFailed(job: SpiderJob, error: string): SpiderJob {
  if (job.status !== "running" && job.status !== "queued") {
    throw new Error(`Job ${job.id} cannot fail from ${job.status}.`);
  }
  return {
    ...job,
    status: "failed",
    finishedAt: nowIso(),
    error,
  };
}

/**
 * Runs a job against a stub fetch port. Does not perform HTTP.
 * Callers must supply pre-built observations — no live crawl.
 */
export async function runStubSpiderJob(
  job: SpiderJob,
  channel: PublisherChannel,
  fetchPort: SpiderFetchPort
): Promise<
  | { ok: true; job: SpiderJob; observation: RawObservation }
  | { ok: false; job: SpiderJob }
> {
  const running = markJobRunning(job);
  try {
    const observation = await fetchPort.fetchObservation(running, channel);
    return {
      ok: true,
      job: markJobDone(running, [observation.id]),
      observation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stub spider job failed.";
    return {
      ok: false,
      job: markJobFailed(running, message),
    };
  }
}

/** In-memory stub fetch — never hits the web. */
export class StubSpiderFetchAdapter implements SpiderFetchPort {
  constructor(private readonly stubs: Map<string, RawObservation>) {}

  async fetchObservation(_job: SpiderJob, channel: PublisherChannel): Promise<RawObservation> {
    const stub = this.stubs.get(channel.id);
    if (!stub) {
      throw new Error(`No stub observation for channel ${channel.id}.`);
    }
    return stub;
  }
}

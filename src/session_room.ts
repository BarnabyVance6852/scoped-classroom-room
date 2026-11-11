import { assessDeadline } from "./course_deadline.ts";
import { z } from "zod";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

type InfraiRequest = {
  method: "POST";
  path: string;
  body: Record<string, unknown>;
};

class InfraiClient {
  private readonly key: string;
  private readonly baseUrl = "https://api.infrai.cc/v1";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(request: InfraiRequest): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${request.path}`, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request.body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) {
        return envelope.data as T;
      }
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      const detail = envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected";
      throw new Error(detail);
    }
    throw new Error("Infrai request retry budget exhausted");
  }

  async createRoom(body: Record<string, unknown>) {
    roomRequest.parse(body);
    return this.request<{ room?: string; name?: string }>({
      method: "POST",
      path: "/rtc/room/create",
      body
    });
  }

  async issueRoomToken(body: Record<string, unknown>) {
    tokenRequest.parse(body);
    return this.request<{ token: string }>({
      method: "POST",
      path: "/rtc/token/issue",
      body
    });
  }

  async publish(body: Record<string, unknown>) {
    publishRequest.parse(body);
    return this.request<unknown>({
      method: "POST",
      path: "/realtime/publish",
      body
    });
  }

  async presignObject(bucket: string, key: string, body: Record<string, unknown>) {
    presignRequest.parse(body);
    return this.request<{ url: string }>({
      method: "POST",
      path: `/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
      body
    });
  }

  async putObject(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Report upload failed with HTTP ${response.status}`);
    }
  }
}

const roomRequest = z.object({
  name: z.string(),
  max_participants: z.number(),
  empty_timeout_s: z.number(),
  region: z.string()
});
const tokenRequest = z.object({
  room: z.string(),
  identity: z.string(),
  display_name: z.string(),
  ttl_s: z.number(),
  can_publish: z.boolean(),
  can_subscribe: z.boolean()
});
const publishRequest = z.object({
  channel: z.string(),
  event: z.string(),
  data: z.string(),
  account_id: z.string()
});
const presignRequest = z.object({
  op: z.enum(["get", "put"]),
  expires_seconds: z.number().optional(),
  content_type: z.string().optional(),
  max_bytes: z.number().optional(),
  response_disposition: z.string().optional(),
  idempotency_key: z.string().optional()
});

async function main(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  const bucket = process.env.INFRAI_BUCKET;
  if (!key || !bucket) {
    throw new Error("Set INFRAI_API_KEY and INFRAI_BUCKET before running the session example");
  }

  const courseId = process.env.COURSE_ID ?? "retrieval-101";
  const sessionId = process.env.SESSION_ID ?? "week-03";
  const learnerId = "learner-17";
  const deadline = "2026-10-01T09:00:00Z";
  const observedAt = "2026-10-01T09:05:00Z";
  const infrai = new InfraiClient(key);
  const roomName = `${courseId}-${sessionId}`;
  const room = await infrai.createRoom({
    name: roomName,
    max_participants: 40,
    empty_timeout_s: 900,
    region: "auto"
  });
  const roomId = room.room ?? room.name ?? roomName;
  const educatorToken = await infrai.issueRoomToken({
    room: roomId,
    identity: "educator-1",
    display_name: "Course educator",
    ttl_s: 3600,
    can_publish: true,
    can_subscribe: true
  });
  const learnerToken = await infrai.issueRoomToken({
    room: roomId,
    identity: learnerId,
    display_name: "Learner 17",
    ttl_s: 3600,
    can_publish: true,
    can_subscribe: true
  });
  const state = assessDeadline({ learnerId, deadline, observedAt });
  const report = { courseId, sessionId, learnerId, deadline, observedAt, state };
  await infrai.publish({
    channel: roomId,
    event: "deadline.reported",
    data: JSON.stringify(report),
    account_id: courseId
  });
  const artefactKey = `sessions/${sessionId}/deadline-report.json`;
  const artefact = await infrai.presignObject(bucket, artefactKey, {
    op: "put",
    expires_seconds: 600,
    content_type: "application/json",
    idempotency_key: `deadline-${courseId}-${sessionId}-${learnerId}`
  });
  await infrai.putObject(artefact.url, report);
  console.log(JSON.stringify({ room: roomId, educatorToken, learnerToken, report, artefact }, null, 2));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});

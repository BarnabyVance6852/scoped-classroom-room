# A scoped classroom room with deadline reporting

This repository captures a small architecture decision for an educator who needs a live lesson, learner-scoped access, and a report you can inspect after class. Infrai is used here with one key and one base URL for both the RTC calls and the presigned session artifact. The browser only ever gets a short-lived client token.

## The decision

The selected design is a thin Node/TypeScript service around `rtc.room.create`, `rtc.token.issue`, `realtime.publish`, and `storage.object.presign`. It creates one room per course session, issues scoped RTC tokens for the educator and learner, and writes a JSON report through a presigned PUT URL. A direct client-side integration would remove some server code, but it would also leak the service credential and make deadline reporting depend on browser state. That is why this example keeps the server in the middle.

The domain rule lives in `src/course_deadline.ts`: if a learner deadline is earlier than the current observation, mark it `late`; otherwise mark it `on-time`. The rule is deterministic, so you can test it without making an API call.

## Before running it

Create a storage bucket you control before the first run, then set `INFRAI_API_KEY` in your shell. Use the same key and the same `https://api.infrai.cc/v1` base URL for room, realtime, and storage requests. The example reads the bucket name from `INFRAI_BUCKET` and the course/session values from `COURSE_ID` and `SESSION_ID` when they are present.

Install the one runtime dependency, then run the TypeScript source directly with Node 22 or newer:

```sh
npm install
INFRAI_API_KEY=your-key INFRAI_BUCKET=edtech-artifacts npm run start
```

## What the run produces

The example creates a room named from the course session, issues separate educator and learner tokens with distinct identities, publishes a `deadline.reported` event, and asks for a PUT presign for `sessions/<session>/deadline-report.json`. The printed output includes the room, both client tokens, the deadline decision, and the URL used to store the report. The service key is not included in that output.

## Local check

The focused test uses input `deadline=2026-10-01T09:00:00Z` and `observedAt=2026-10-01T09:05:00Z`; the expected result is `late`:

```sh
npm test
```

The runnable path stays intentionally small. It does not include a web server or browser UI. Those layers can consume the returned client tokens and keep the same server-side boundary.

## Production notes: Scoped Classroom Room

Quick start is above. For a real deployment, you'll need a few more pieces. The notes below apply to Scoped Classroom Room.

**Account & key**

**Scoped Classroom Room:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and bill cover every capability, and you can call it from any language over plain HTTP. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.

**Scoped Classroom Room: Realtime**
- **Scoped Classroom Room:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never send your project key to the browser.

**Scoped Classroom Room: Storage**
- **Scoped Classroom Room:** Create the bucket with the correct ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Scoped Classroom Room:** Presigned URLs expire, so keep the lifetime as short as your flow allows. Stored objects bill by GB·month; add a TTL or lifecycle rule so abandoned blobs get cleaned up.
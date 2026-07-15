import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import posthog from "./posthog";
import { send } from "./messaging";

// Lock the production failure SIGNATURE for the index_transcript_failed/
// sw_timeout cascade. The backing bug (segment commits outrunning this deadman)
// is fixed server-side, but this telemetry contract is how the failure surfaces
// — a future refactor must not silently change the event name, fields, or the
// soft-fail error so dashboards and the App.tsx filter keep working.

vi.mock("./posthog", () => ({
  default: { capture: vi.fn() },
}));

type Cb = (response: unknown) => void;

describe("messaging.send — sw_timeout deadman", () => {
  let pendingCallback: Cb | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    pendingCallback = undefined;
    // A service worker that never answers and never sets lastError — the exact
    // condition the deadman exists to catch.
    globalThis.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn((_msg: unknown, cb: Cb) => {
          pendingCallback = cb; // captured but never invoked
        }),
      },
    } as unknown as typeof chrome;
    vi.mocked(posthog.capture).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires sw_message_timeout for index-transcript at 120s and soft-fails", async () => {
    const promise = send({
      type: "index-transcript",
      params: { channel_id: "c", source_url: "u", video: {}, transcript: {} } as never,
    });

    await vi.advanceTimersByTimeAsync(120_000);
    const result = await promise;

    expect(result).toEqual({ ok: false, error: "sw_timeout" });
    expect(posthog.capture).toHaveBeenCalledWith("sw_message_timeout", {
      message_type: "index-transcript",
      timeout_ms: 120_000,
    });
    // pendingCallback was never called — proving this is the deadman, not a response.
    expect(pendingCallback).toBeTypeOf("function");
  });

  // Each message type carries its own deadman ceiling (messaging.ts
  // SEND_TIMEOUT_MS_BY_TYPE). Dropping or mistuning an entry must fail a test,
  // not silently hang one message class in prod.
  it.each([
    ["list-videos", 15_000],
    ["fetch-transcript", 30_000],
    ["match-transcript", 30_000],
    // index-transcript: 120s — long videos stream ~40 Turso POSTs in one SSE
    // call; a 30s deadman dropped the keepalive mid-write (see messaging.ts).
    ["index-transcript", 120_000],
  ])("fires %s deadman at its configured %dms", async (type, ms) => {
    const promise = send({ type, params: {} } as never);
    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(posthog.capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(result).toEqual({ ok: false, error: "sw_timeout" });
    expect(posthog.capture).toHaveBeenCalledWith("sw_message_timeout", {
      message_type: type,
      timeout_ms: ms,
    });
  });

  it("does not fire the deadman before the full index-transcript window elapses", async () => {
    const promise = send({
      type: "index-transcript",
      params: { channel_id: "c", source_url: "u", video: {}, transcript: {} } as never,
    });

    await vi.advanceTimersByTimeAsync(119_999);
    expect(posthog.capture).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(posthog.capture).toHaveBeenCalledWith(
      "sw_message_timeout",
      expect.objectContaining({ message_type: "index-transcript" }),
    );
  });

  it("captures sw_message_failed and returns the error on chrome.runtime.lastError", async () => {
    // The dead-worker / Arc-Chrome-compat signal (messaging.ts lastError branch).
    // SW answered with lastError set — surface sw_message_failed and the message,
    // not a sw_timeout, and do NOT fire the deadman.
    globalThis.chrome = {
      runtime: {
        lastError: { message: "Could not establish connection" },
        sendMessage: vi.fn((_msg: unknown, cb: Cb) => cb(undefined)),
      },
    } as unknown as typeof chrome;

    const result = await send({ type: "match-transcript", params: {} as never });

    expect(result).toEqual({ ok: false, error: "Could not establish connection" });
    expect(posthog.capture).toHaveBeenCalledWith("sw_message_failed", {
      message_type: "match-transcript",
      error_message: "Could not establish connection",
    });
    expect(posthog.capture).not.toHaveBeenCalledWith(
      "sw_message_timeout",
      expect.anything(),
    );
  });

  it("aborting via signal resolves 'aborted' WITHOUT emitting sw_message_timeout", async () => {
    const controller = new AbortController();
    const promise = send(
      {
        type: "index-transcript",
        params: { channel_id: "c", source_url: "u", video: {}, transcript: {} } as never,
      },
      { signal: controller.signal },
    );

    controller.abort();
    const result = await promise;

    expect(result).toEqual({ ok: false, error: "aborted" });
    // A superseded search must not pollute the timeout metric.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(posthog.capture).not.toHaveBeenCalledWith(
      "sw_message_timeout",
      expect.anything(),
    );
  });
});

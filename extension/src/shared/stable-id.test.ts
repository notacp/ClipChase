import { describe, it, expect, vi, beforeEach } from "vitest";

// A storage fake with real async gaps between read and write — the window the
// first-boot race lived in. A synchronous fake would never reproduce it.
function fakeStorage() {
  const data: Record<string, unknown> = {};
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const set = vi.fn(async (obj: Record<string, unknown>) => {
    await tick();
    Object.assign(data, obj);
  });
  const get = vi.fn(async (key: string) => {
    await tick();
    return key in data ? { [key]: data[key] } : {};
  });
  return { data, get, set };
}

async function load() {
  vi.resetModules(); // fresh module = fresh in-flight memo, like a new SW boot
  return (await import("./stable-id")).getOrCreateStableId;
}

describe("getOrCreateStableId", () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    store = fakeStorage();
    (globalThis as any).chrome = { storage: { local: { get: store.get, set: store.set } } };
  });

  it("gives concurrent first-boot callers ONE id and writes once", async () => {
    const getId = await load();
    // onInstalled, sw_started and setUninstallURL all fire together on boot.
    const ids = await Promise.all([getId(), getId(), getId(), getId()]);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^cc_[0-9a-f-]{36}$/);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.data.clipchase_stable_id).toBe(ids[0]);
  });

  it("returns the stored id on later boots without writing", async () => {
    store.data.clipchase_stable_id = "cc_existing";
    const getId = await load();
    expect(await Promise.all([getId(), getId()])).toEqual(["cc_existing", "cc_existing"]);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("recovers after a storage failure instead of caching the error", async () => {
    store.get.mockRejectedValueOnce(new Error("storage unavailable"));
    const getId = await load();
    await expect(getId()).rejects.toThrow("storage unavailable");
    await new Promise((r) => setTimeout(r, 0)); // let the memo-reset run
    expect(await getId()).toMatch(/^cc_/);
  });
});

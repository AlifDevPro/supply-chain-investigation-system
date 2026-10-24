import { describe, expect, it } from "vitest";
import { DEDUPE_WINDOW_MS, decideDedupe, type DedupeCandidates, type SignalRef } from "./dedupe";
import { makeNormalized } from "./test-helpers";

const NOW = new Date("2026-10-24T12:00:00Z");
const none: DedupeCandidates = { sameRecord: [], sameFingerprint: [], sharedReferences: [] };

function ref(id: string, base: ReturnType<typeof makeNormalized>, receivedAt: string, extra: Partial<SignalRef> = {}): SignalRef {
  return {
    id,
    contentHash: base.contentHash,
    fingerprint: base.fingerprint,
    receivedAt,
    sourceRecordId: base.normalized.sourceRecordId,
    ...extra,
  };
}

describe("decideDedupe (dedupe.v1)", () => {
  it("treats a first signal as unique", () => {
    const s = makeNormalized();
    const d = decideDedupe({ ...s, now: NOW }, none);
    expect(d).toMatchObject({ status: "unique", duplicateOf: null, revisionOf: null });
  });

  it("rule 1: same record id and same content hash is an exact duplicate of the original", () => {
    const s = makeNormalized({ sourceRecordId: "MSG-1" });
    const d = decideDedupe(
      { ...s, now: NOW },
      { ...none, sameRecord: [ref("SIG-2", s, "2026-10-24T10:00:00Z"), ref("SIG-1", s, "2026-10-24T09:00:00Z")] },
    );
    expect(d).toMatchObject({ status: "duplicate", rule: "dedupe.v1/exact-record", duplicateOf: "SIG-1" });
  });

  it("rule 2: same record id and different content is a revision of the latest earlier version, not a duplicate", () => {
    const earlier = makeNormalized({ sourceRecordId: "MSG-1", excerpt: "four days" });
    const s = makeNormalized({ sourceRecordId: "MSG-1", excerpt: "now seven days" });
    const d = decideDedupe(
      { ...s, now: NOW },
      { ...none, sameRecord: [ref("SIG-1", earlier, "2026-10-24T09:00:00Z"), ref("SIG-3", earlier, "2026-10-24T10:00:00Z", { contentHash: "other" })] },
    );
    expect(d).toMatchObject({ status: "revision", rule: "dedupe.v1/revision", revisionOf: "SIG-3", duplicateOf: null });
  });

  it("rule 3: no record id, same fingerprint inside 24 h is a duplicate", () => {
    const s = makeNormalized();
    const d = decideDedupe(
      { ...s, now: NOW },
      { ...none, sameFingerprint: [ref("SIG-1", s, new Date(NOW.getTime() - DEDUPE_WINDOW_MS + 60_000).toISOString())] },
    );
    expect(d).toMatchObject({ status: "duplicate", rule: "dedupe.v1/exact-fingerprint", duplicateOf: "SIG-1" });
  });

  it("rule 3: outside the window it is a new signal", () => {
    const s = makeNormalized();
    const d = decideDedupe(
      { ...s, now: NOW },
      { ...none, sameFingerprint: [ref("SIG-1", s, new Date(NOW.getTime() - DEDUPE_WINDOW_MS - 1000).toISOString())] },
    );
    expect(d.status).toBe("unique");
  });

  it("rule 3 is not used when a record id exists", () => {
    const s = makeNormalized({ sourceRecordId: "MSG-9" });
    const d = decideDedupe({ ...s, now: NOW }, { ...none, sameFingerprint: [ref("SIG-1", s, "2026-10-24T11:00:00Z")] });
    expect(d.status).toBe("unique");
  });

  it("rule 4: similar but different signals are not merged and only produce hints", () => {
    const other = makeNormalized({ label: "Supplier asks to confirm PO-77120 address" });
    const s = makeNormalized();
    const d = decideDedupe({ ...s, now: NOW }, { ...none, sharedReferences: [ref("SIG-7", other, "2026-10-24T08:00:00Z")] });
    expect(d).toMatchObject({ status: "unique", possiblyRelated: ["SIG-7"] });
  });

  it("limits hints to five and excludes the revised signal", () => {
    const other = makeNormalized({ label: "unrelated wording" });
    const shared = Array.from({ length: 8 }, (_, i) => ref(`SIG-${i + 10}`, other, `2026-10-24T0${i}:00:00Z`));
    const s = makeNormalized();
    expect(decideDedupe({ ...s, now: NOW }, { ...none, sharedReferences: shared }).possiblyRelated).toHaveLength(5);
  });

  it("is deterministic", () => {
    const s = makeNormalized({ sourceRecordId: "MSG-1" });
    const c = { ...none, sameRecord: [ref("SIG-1", s, "2026-10-24T09:00:00Z")] };
    expect(decideDedupe({ ...s, now: NOW }, c)).toEqual(decideDedupe({ ...s, now: NOW }, c));
  });
});

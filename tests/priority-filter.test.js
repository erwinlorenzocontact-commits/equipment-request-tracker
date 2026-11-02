import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORY_ORDER, DAY, closeRequest, compareRequests, createDraft, createRequest,
  evaluateRequests, groupRequests, isManagerVisible, isValidDate, leaveDraft,
  loadRequests, matchesRequest, recoverRequest, saveRequests, submitDraft, upsertRequest,
  validateRequest,
} from "../src/request-store.js";

const start = new Date("2026-10-01T12:00:00Z");
const later = (days, milliseconds = 0) => new Date(start.getTime() + days * DAY + milliseconds);
function request(id, overrides = {}) {
  return {
    id, requester: "Jordan", department: "Operations", equipment: id,
    priority: "Low", neededBy: "2026-11-01", reason: "Field work",
    createdAt: start.toISOString(), ...overrides,
  };
}
function groups(records, now = start) {
  return groupRequests(evaluateRequests(records, now), now);
}
function ids(records) { return records.map((record) => record.id); }
function roundTrip(records) {
  let saved;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  saveRequests(records, storage);
  return loadRequests(storage);
}

test("AC-01: grouping and migration retain original fields, storage order and unknown metadata", () => {
  const legacy = request("old", { extra: "keep" });
  delete legacy.priority;
  const records = roundTrip([legacy, request("new")]);
  const snapshot = structuredClone(records);
  groups(records);
  assert.deepEqual(records, snapshot);
  assert.equal(records[0].priority, "Medium");
  assert.equal(records[0].extra, "keep");
});

test("AC-02: category order includes separate Discarded and Closed sections", () => {
  assert.deepEqual(CATEGORY_ORDER, ["High", "Unavailable", "Failed", "Medium", "Invalid", "Low", "Duplicate", "Discarded", "Closed"]);
  assert.deepEqual(Object.keys(groups([])), CATEGORY_ORDER);
});

test("AC-03/04/10: High overrides conflicts; Unavailable overrides Failed and Medium", () => {
  const records = [
    request("original", { equipment: "Laptop" }),
    request("high", { equipment: "Laptop", priority: "High", reason: "" }),
    request("medium", { equipment: "Laptop", priority: "Medium" }),
    request("failed", { equipment: "Laptop", reason: "" }),
  ];
  const result = groups(records);
  assert.deepEqual(ids(result.High), ["high"]);
  assert.ok(result.Unavailable.some((record) => record.id === "medium"));
  assert.ok(result.Unavailable.some((record) => record.id === "failed"));
});

test("AC-04/11/13: eligible Low duplicates bypass Unavailable; Medium duplicates do not", () => {
  const original = request("original", { equipment: "Laptop" });
  const low = request("low", { equipment: " laptop ", createdAt: later(1).toISOString() });
  const medium = request("medium", { equipment: "Laptop", priority: "Medium", createdAt: later(2).toISOString() });
  const result = groups([medium, low, original], later(3));
  assert.deepEqual(ids(result.Duplicate), ["low"]);
  assert.deepEqual(ids(result.Unavailable), ["original", "medium"]);
});

test("AC-04: the Low duplicate exception still respects Failed and Invalid", () => {
  const original = request("original", { equipment: "Laptop" });
  const failed = request("failed", { equipment: "Laptop", reason: "", createdAt: later(1).toISOString() });
  const invalid = request("invalid", { equipment: "Laptop", department: "Unknown", createdAt: later(2).toISOString() });
  const result = groups([original, failed, invalid], later(3));
  assert.deepEqual(ids(result.Failed), ["failed"]);
  assert.deepEqual(ids(result.Invalid), ["invalid"]);
});

test("AC-05/06: sort valid dates first, then undated oldest first, with stable oldest-first ties", () => {
  const records = [
    request("missing", { neededBy: "", createdAt: later(1).toISOString() }),
    request("later", { neededBy: "2026-12-01" }),
    request("tie-new", { createdAt: later(1).toISOString() }),
    request("invalid", { neededBy: "2026-02-30" }),
    request("tie-old"),
  ];
  assert.deepEqual(ids(records.sort(compareRequests)), ["tie-old", "tie-new", "later", "invalid", "missing"]);
});

test("AC-07: a draft persists before leaving, then becomes visible at exactly 72 hours", () => {
  const draft = createDraft({ requester: "Jordan", priority: "Medium" }, undefined, { now: start, id: "draft" });
  assert.equal(isManagerVisible(draft, later(100)), false);
  const left = roundTrip([leaveDraft(draft, { now: start })])[0];
  assert.equal(left.requester, "Jordan");
  assert.equal(left.equipment, "");
  assert.equal(isManagerVisible(left, later(3, -1)), false);
  assert.deepEqual(ids(groups([left], later(3)).Failed), ["draft"]);
});

test("AC-07/08: editing resets the delay, leaving again starts a new clock", () => {
  const draft = leaveDraft(createDraft({ requester: "Jordan" }, undefined, { now: start, id: "draft" }), { now: start });
  const edited = createDraft({ requester: "Jordan Lee" }, draft, { now: later(2) });
  assert.equal(edited.createdAt, draft.createdAt);
  assert.equal(edited.id, draft.id);
  assert.equal(isManagerVisible(edited, later(100)), false);
  const left = leaveDraft(edited, { now: later(2) });
  assert.equal(isManagerVisible(left, later(5, -1)), false);
  assert.equal(isManagerVisible(left, later(5)), true);
  assert.deepEqual(leaveDraft(left, { now: later(4) }), left);
});

test("AC-08: incomplete submission is saved as an attempt, hidden for 72 hours", () => {
  const draft = createDraft({ requester: "Jordan", priority: "Medium" }, undefined, { now: start, id: "attempt" });
  const attempt = roundTrip([submitDraft(draft, { now: start })])[0];
  assert.equal(attempt.submissionState, "attempt");
  assert.equal(attempt.submittedAt, undefined);
  assert.equal(isManagerVisible(attempt, later(3, -1)), false);
  assert.deepEqual(ids(groups([attempt], later(3)).Failed), ["attempt"]);
});

test("AC-03/07: even a High unfinished attempt waits for visibility before overriding categories", () => {
  const attempt = submitDraft(createDraft({ requester: "Jordan", priority: "High" }, undefined, { now: start }), { now: start });
  assert.equal(groups([attempt], later(3, -1)).High.length, 0);
  assert.equal(groups([attempt], later(3)).High.length, 1);
});

test("AC-09: invalid Low requests appear above Low; incomplete ones count as Failed", () => {
  const result = groups([
    request("invalid", { department: "Unknown" }),
    request("failed", { reason: "" }),
    request("low"), request("medium", { priority: "Medium", department: "Unknown" }),
  ]);
  assert.deepEqual(ids(result.Invalid), ["invalid"]);
  assert.deepEqual(ids(result.Failed), ["failed"]);
  assert.deepEqual(ids(result.Low), ["low"]);
  assert.deepEqual(ids(result.Medium), ["medium"]);
});

test("AC-09/12: validation checks real dates, departments and reason length", () => {
  for (const value of ["2026-02-30", "2026-13-01", "not a date", "", undefined]) assert.equal(isValidDate(value), false);
  assert.equal(isValidDate("2028-02-29"), true);
  assert.equal(isValidDate("2026-02-29"), false);
  assert.ok(validateRequest(request("invalid", { neededBy: "2026-02-30" })).neededBy);
  assert.ok(validateRequest(request("invalid", { department: "Unknown" })).department);
  assert.ok(validateRequest(request("invalid", { reason: "x".repeat(241) })).reason);
  assert.deepEqual(validateRequest(request("valid", { department: " Operations " })), {});
});

test("AC-10/11/12: matching normalizes equipment spacing and case, needs equal valid dates, and excludes self", () => {
  const first = request("first", { equipment: "  LAPTOP   Stand " });
  assert.equal(matchesRequest(first, request("second", { equipment: "laptop stand" })), true);
  assert.equal(matchesRequest(first, first), false);
  assert.equal(matchesRequest(first, request("second", { equipment: "Laptop" })), false);
  assert.equal(matchesRequest(first, request("second", { equipment: "laptop stand", neededBy: "2026-11-02" })), false);
  assert.equal(matchesRequest({ ...first, neededBy: "" }, request("second", { equipment: first.equipment, neededBy: "" })), false);
});

test("AC-10/11: closed, discarded and hidden attempts do not reserve equipment or establish duplicates", () => {
  const current = request("current", { equipment: "Laptop", createdAt: later(1).toISOString() });
  for (const excluded of [
    request("old", { equipment: "Laptop", closedAt: start.toISOString() }),
    request("old", { equipment: "Laptop", discardedAt: start.toISOString() }),
    request("old", { equipment: "Laptop", submissionState: "draft", delayStartedAt: null }),
  ]) assert.deepEqual(ids(groups([current, excluded]).Low), ["current"]);
});

test("AC-11: oldest record remains the original even when storage is newest-first", () => {
  const oldest = request("old", { equipment: "Laptop" });
  const newest = request("new", { equipment: "Laptop", createdAt: later(1).toISOString() });
  assert.deepEqual(ids(groups([newest, oldest], later(1)).Duplicate), ["new"]);
});

test("AC-13/14: duplicate ages from identification, not creation, and discards at exactly 14 days", () => {
  const old = request("old", { equipment: "Laptop" });
  const duplicate = request("duplicate", { equipment: "Laptop", createdAt: later(1).toISOString(), extra: "keep" });
  const identified = evaluateRequests([old, duplicate], later(20));
  assert.equal(identified[1].duplicateIdentifiedAt, later(20).toISOString());
  const before = evaluateRequests(roundTrip(identified), later(34, -1));
  assert.deepEqual(ids(groupRequests(before, later(34, -1)).Duplicate), ["duplicate"]);
  const after = roundTrip(evaluateRequests(before, later(34)));
  assert.deepEqual(ids(groupRequests(after, later(34)).Discarded), ["duplicate"]);
  assert.equal(after[1].extra, "keep");
  assert.equal(after[1].duplicateIdentifiedAt, later(20).toISOString());
  assert.equal(after[1].closedAt, undefined);
});

test("AC-16/17/18: recovered Low requests stay exempt through reloads and future matching", () => {
  const original = request("original", { equipment: "Laptop" });
  const discarded = request("recovered", { equipment: "Laptop", discardedAt: start.toISOString(), createdAt: later(1).toISOString() });
  for (const priority of ["Low", "Medium", "High"]) {
    const recovered = recoverRequest(discarded, priority, { now: later(20) });
    const records = evaluateRequests(roundTrip([original, recovered]), later(100));
    assert.equal(records[1].discardedAt, undefined);
    assert.equal(records[1].closedAt, undefined);
    const result = groupRequests(records, later(100));
    assert.equal(result.Duplicate.length, 0);
    assert.ok(result[priority === "High" ? "High" : "Unavailable"].some((item) => item.id === "recovered"));
  }
});

test("AC-18/19: closure preserves data and moves even High or discarded requests to Closed", () => {
  for (const overrides of [{ priority: "High" }, { discardedAt: start.toISOString() }]) {
    const original = request("closed", overrides);
    const closed = roundTrip([closeRequest(original, { now: start })])[0];
    assert.deepEqual(ids(groups([closed]).Closed), ["closed"]);
    assert.equal(closed.reason, original.reason);
  }
});

test("Submission regression: successful submission trims, resets draft status and retains identity", () => {
  const input = { ...request("draft"), requester: " Jordan ", equipment: " Laptop " };
  const draft = createDraft(input, undefined, { now: start, id: "draft" });
  const submitted = submitDraft(draft, { now: later(1) });
  assert.equal(submitted.requester, "Jordan");
  assert.equal(submitted.equipment, "Laptop");
  assert.equal(submitted.id, draft.id);
  assert.equal(submitted.createdAt, draft.createdAt);
  assert.equal(submitted.submissionState, "submitted");
  assert.equal(submitted.submittedAt, later(1).toISOString());
  assert.equal(isManagerVisible(submitted, later(1)), true);
  assert.deepEqual(ids(upsertRequest([draft], submitted)), ["draft"]);
});

test("Submission regression: complete invalid input stays retained without losing validation errors", () => {
  const draft = createDraft(request("invalid", { department: "Unknown" }), undefined, { now: start });
  const submitted = submitDraft(draft, { now: start });
  assert.equal(submitted.department, "Unknown");
  assert.ok(validateRequest(submitted).department);
  assert.equal(groupRequests([submitted], start).Invalid.length, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  closeRequest, recoverRequest, loadRequests, saveRequests,
} from "../src/request-store.js";

const now = new Date("2026-10-18T12:00:00Z");
const record = {
  id: "legacy", requester: "Jordan", department: "Operations", equipment: "Laptop",
  neededBy: "2026-11-01", reason: "Field work", priority: "Low",
  createdAt: "2026-10-01T12:00:00Z", extraInformation: "preserve me",
};

function roundTrip(request) {
  let value;
  const storage = { getItem: () => value, setItem: (_key, saved) => { value = saved; } };
  saveRequests([request], storage);
  return loadRequests(storage)[0];
}

test("AC-15: recovery requires an explicit supported priority", () => {
  const discarded = { ...record, discardedAt: now.toISOString() };
  for (const priority of [undefined, "", "Urgent", "medium"]) {
    assert.throws(() => recoverRequest(discarded, priority, { now }));
  }
  assert.throws(() => recoverRequest(record, "Low", { now }));
});

test("AC-01/16/17/18: recovery preserves fields and persists a permanent duplicate exemption", () => {
  for (const priority of ["Low", "Medium", "High"]) {
    const discarded = { ...record, duplicateIdentifiedAt: record.createdAt, discardedAt: now.toISOString() };
    const recovered = roundTrip(recoverRequest(discarded, priority, { now }));
    assert.equal(recovered.priority, priority);
    assert.equal(recovered.duplicateExempt, true);
    assert.equal(recovered.recoveredAt, now.toISOString());
    assert.equal(recovered.extraInformation, record.extraInformation);
    assert.equal(recovered.duplicateIdentifiedAt, record.createdAt);
    assert.equal(recovered.discardedAt, undefined);
    assert.equal(recovered.closedAt, undefined);
    assert.ok(discarded.discardedAt);
  }
});

test("AC-18/19: only explicit closure completes a request and retains its data", () => {
  assert.equal(record.closedAt, undefined);
  const closed = roundTrip(closeRequest(record, { now }));
  assert.deepEqual(closed, { ...record, closedAt: now.toISOString() });
  assert.equal(record.closedAt, undefined);
  assert.deepEqual(closeRequest(closed, { now: new Date("2026-10-20") }), closed);
});

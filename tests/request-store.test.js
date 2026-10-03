import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestValidationError,
  STORAGE_KEY,
  appendRequest,
  createRequest,
  loadRequests,
  saveRequests,
} from "../src/request-store.js";

const validInput = {
  requester: "  Jordan Lee  ",
  department: "Operations",
  equipment: "  Laptop  ",
  neededBy: "2026-09-15",
  reason: "  Replace a failed field computer.  ",
};

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test("createRequest trims input and adds system fields", () => {
  const request = createRequest(validInput, {
    id: "request-1",
    now: new Date("2026-08-17T12:00:00.000Z"),
  });

  assert.deepEqual(request, {
    id: "request-1",
    requester: "Jordan Lee",
    department: "Operations",
    equipment: "Laptop",
    priority: "Medium",
    neededBy: "2026-09-15",
    reason: "Replace a failed field computer.",
    createdAt: "2026-08-17T12:00:00.000Z",
  });
});

test("createRequest reports missing required fields", () => {
  assert.throws(
    () => createRequest({ ...validInput, requester: "", equipment: " " }),
    (error) => {
      assert.ok(error instanceof RequestValidationError);
      assert.deepEqual(Object.keys(error.errors), ["requester", "equipment"]);
      return true;
    },
  );
});

test("appendRequest returns a new list with the newest request first", () => {
  const original = [{ id: "old" }];
  const result = appendRequest(original, { id: "new" });

  assert.deepEqual(result.map((request) => request.id), ["new", "old"]);
  assert.deepEqual(original.map((request) => request.id), ["old"]);
});

test("saveRequests and loadRequests round-trip valid records", () => {
  const storage = new MemoryStorage();
  const request = createRequest(validInput, {
    id: "request-2",
    now: new Date("2026-08-17T12:00:00.000Z"),
  });

  saveRequests([request], storage);

  assert.deepEqual(loadRequests(storage), [request]);
});

test("loadRequests safely handles damaged stored data", () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, "not-json");

  assert.deepEqual(loadRequests(storage), []);
});

test("each supported priority survives a storage round-trip", () => {
  const storage = new MemoryStorage();
  const requests = ["Low", "Medium", "High"].map((priority) =>
    createRequest({ ...validInput, priority }),
  );

  saveRequests(requests, storage);

  assert.deepEqual(loadRequests(storage), requests);
});

test("createRequest rejects empty and unsupported priorities", () => {
  for (const priority of ["", "Urgent", "high", 1]) {
    assert.throws(
      () => createRequest({ ...validInput, priority }),
      (error) => {
        assert.ok(error instanceof RequestValidationError);
        assert.deepEqual(Object.keys(error.errors), ["priority"]);
        return true;
      },
    );
  }
});

test("legacy requests load as Medium without losing data or order", () => {
  const storage = new MemoryStorage();
  const first = createRequest(validInput, { id: "first" });
  const second = createRequest(validInput, { id: "second" });
  delete first.priority;
  delete second.priority;
  const legacy = [second, first];
  const original = JSON.stringify(legacy);
  storage.setItem(STORAGE_KEY, original);

  const loaded = loadRequests(storage);

  assert.deepEqual(loaded, legacy.map((request) => ({ ...request, priority: "Medium" })));
  assert.equal(storage.getItem(STORAGE_KEY), original);
  const added = createRequest({ ...validInput, priority: "High" }, { id: "new" });
  const updated = appendRequest(loaded, added);
  saveRequests(updated, storage);
  assert.deepEqual(loadRequests(storage), updated);
  assert.deepEqual(updated.map((request) => request.id), ["new", "second", "first"]);
});

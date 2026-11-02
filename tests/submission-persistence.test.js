import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as store from "../src/request-store.js";

// Exercise the real app submit handler with an isolated DOM and storage.
function application() {
  class Element {
    children = [];
    listeners = {};
    attributes = {};
    value = "";
    textContent = "";
    classList = { toggle() {} };
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() {}
    addEventListener(name, listener) { this.listeners[name] = listener; }
  }
  const elements = new Map();
  for (const id of ["request-form", "form-message", "needed-by", "request-count",
    "empty-state", "request-sections", "list-message", "requester"]) {
    elements.set("#" + id, new Element());
  }
  const form = elements.get("#request-form");
  form.elements = ["requester", "department", "equipment", "neededBy", "reason", "priority"]
    .map((name) => Object.assign(new Element(), { name }));
  for (const field of form.elements) form.elements[field.name] = field;
  let resets = 0;
  form.reset = () => {
    resets++;
    for (const field of form.elements) field.value = field.name === "priority" ? "Medium" : "";
  };
  let saved = "[]";
  let writes = 0;
  let rejectSubmission = false;
  const storage = {
    getItem: () => saved,
    setItem(_key, value) {
      writes++;
      if (rejectSubmission && JSON.parse(value).some((item) =>
        item.submissionState === "submitted" || item.submissionState === "attempt")) {
        throw new Error("Storage quota exceeded");
      }
      saved = value;
    },
  };
  const document = {
    querySelector: (selector) => elements.get(selector),
    createElement: () => new Element(),
    addEventListener() {},
  };
  const source = readFileSync(new URL("../src/app.js", import.meta.url), "utf8")
    .replace(/^import\s*\{[^}]+\}\s*from "\.\/request-store\.js";/, "");
  vm.runInNewContext(source, {
    ...store,
    loadRequests: () => store.loadRequests(storage),
    saveRequests: (records) => store.saveRequests(records, storage),
    document, window: { addEventListener() {} },
    FormData: class {
      constructor(form) { this.form = form; }
      entries() { return this.form.elements.map((field) => [field.name, field.value]); }
    },
  });
  return {
    form, elements,
    fill(overrides = {}) {
      const input = {
        requester: " Jordan ", department: "Operations", equipment: " Laptop ",
        neededBy: "2026-11-01", reason: " Work ", priority: "Low", ...overrides,
      };
      for (const field of form.elements) field.value = input[field.name];
    },
    submit() { form.listeners.submit({ preventDefault() {} }); },
    get saved() { return saved; },
    get writes() { return writes; },
    get resets() { return resets; },
    failSubmissions() { rejectSubmission = true; },
  };
}

test("successful submission persists once and resets the form", () => {
  const app = application();
  app.fill();
  app.submit();
  assert.equal(app.writes, 1);
  assert.equal(app.resets, 1);
  const [record] = JSON.parse(app.saved);
  assert.equal(record.submissionState, "submitted");
  assert.equal(record.requester, "Jordan");
  assert.equal(app.form.elements.priority.value, "Medium");
});

test("failed retry preserves the saved record, visibility, timestamps and entered values", () => {
  const app = application();
  app.fill({ department: "Unknown" });
  app.submit();
  const before = app.saved;
  const sections = app.elements.get("#request-sections").children;
  const writes = app.writes;
  const values = app.form.elements.map((field) => field.value);
  app.failSubmissions();
  app.submit();
  assert.equal(app.writes - writes, 1);
  assert.equal(app.saved, before);
  assert.equal(JSON.parse(app.saved)[0].submissionState, "submitted");
  assert.equal(store.groupRequests(JSON.parse(app.saved)).Invalid.length, 1);
  assert.equal(app.elements.get("#request-sections").children, sections);
  assert.deepEqual(app.form.elements.map((field) => field.value), values);
  assert.equal(app.resets, 0);
  assert.equal(app.elements.get("#form-message").textContent,
    "The request could not be saved. Try again.");
});

test("failed incomplete submission does not persist a new draft or attempt", () => {
  const app = application();
  app.fill({ reason: "" });
  app.failSubmissions();
  app.submit();
  assert.equal(app.writes, 1);
  assert.equal(app.saved, "[]");
  assert.equal(app.resets, 0);
  assert.equal(app.form.elements.requester.value, " Jordan ");
});

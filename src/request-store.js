export const STORAGE_KEY = "mis4173-equipment-requests";
const PRIORITIES = ["Low", "Medium", "High"];
const DEFAULT_PRIORITY = "Medium";
export const DAY = 24 * 60 * 60 * 1000;
const DEPARTMENTS = ["Finance", "Information Technology", "Operations", "Sales", "Other"];

export const CATEGORY_ORDER = [
  "High", "Unavailable", "Failed", "Medium", "Invalid", "Low", "Duplicate", "Discarded", "Closed",
];

export class RequestValidationError extends Error {
  constructor(errors) {
    super("The equipment request is incomplete.");
    this.name = "RequestValidationError";
    this.errors = errors;
  }
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateRequest(input = {}) {
  const errors = {};

  if (!clean(input.requester)) errors.requester = "Enter the requester name.";
  if (!clean(input.department)) errors.department = "Select a department.";
  if (!clean(input.equipment)) errors.equipment = "Enter the equipment needed.";
  if (!clean(input.neededBy)) errors.neededBy = "Select the date needed.";
  if (!clean(input.reason)) errors.reason = "Enter a business reason.";
  if (clean(input.department) && !DEPARTMENTS.includes(clean(input.department))) {
    errors.department = "Select a listed department.";
  }
  if (clean(input.neededBy) && !isValidDate(input.neededBy)) {
    errors.neededBy = "Enter a valid needed-by date.";
  }
  if (clean(input.reason).length > 240) errors.reason = "Use at most 240 characters.";
  if (!PRIORITIES.includes(input.priority ?? DEFAULT_PRIORITY)) {
    errors.priority = "Select Low, Medium, or High priority.";
  }

  return errors;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createRequest(input, options = {}) {
  const errors = validateRequest(input);
  if (Object.keys(errors).length > 0) {
    throw new RequestValidationError(errors);
  }

  const now = options.now ?? new Date();

  return {
    id: options.id ?? createId(),
    requester: clean(input.requester),
    department: clean(input.department),
    equipment: clean(input.equipment),
    priority: input.priority ?? DEFAULT_PRIORITY,
    neededBy: clean(input.neededBy),
    reason: clean(input.reason),
    createdAt: now.toISOString(),
  };
}

export function appendRequest(requests, request) {
  return [request, ...requests];
}

export function loadRequests(storage = globalThis.localStorage) {
  if (!storage) return [];

  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter(isRequestRecord).map((request) => ({
          ...request,
          priority: PRIORITIES.includes(request.priority) ? request.priority : DEFAULT_PRIORITY,
        }))
      : [];
  } catch {
    return [];
  }
}

export function saveRequests(requests, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

function isRequestRecord(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.requester === "string" &&
    typeof value.department === "string" &&
    typeof value.equipment === "string" &&
    typeof value.neededBy === "string" &&
    typeof value.reason === "string" &&
    typeof value.createdAt === "string"
  );
}

// Return copies so failed saves never mutate the records currently displayed.
export function recoverRequest(request, priority, options = {}) {
  if (!PRIORITIES.includes(priority)) {
    throw new RequestValidationError({ priority: "Choose Low, Medium, or High to recover the request." });
  }
  if (!request.discardedAt) {
    throw new Error("Only discarded requests can be recovered.");
  }
  const { discardedAt, ...retained } = request;
  return {
    ...retained,
    priority,
    recoveredAt: (options.now ?? new Date()).toISOString(),
    duplicateExempt: true,
  };
}

export function closeRequest(request, options = {}) {
  return {
    ...request,
    closedAt: request.closedAt ?? (options.now ?? new Date()).toISOString(),
  };
}

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function equipmentKey(value) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

export function matchesRequest(first, second) {
  return first.id !== second.id && equipmentKey(first.equipment) !== "" &&
    equipmentKey(first.equipment) === equipmentKey(second.equipment) &&
    isValidDate(first.neededBy) && first.neededBy === second.neededBy;
}

function hasMissingFields(request) {
  return ["requester", "department", "equipment", "neededBy", "reason", "priority"]
    .some((field) => !clean(request[field]));
}

export function isManagerVisible(request, now = new Date()) {
  if (request.closedAt || request.discardedAt) return true;
  if (request.submissionState !== "draft" && request.submissionState !== "attempt") return true;
  const started = Date.parse(request.delayStartedAt);
  return Number.isFinite(started) && now.getTime() - started >= 3 * DAY;
}

function participates(request, now) {
  return !request.closedAt && !request.discardedAt && isManagerVisible(request, now);
}

function compareCreated(first, second) {
  const time = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  return time(first.createdAt) - time(second.createdAt) || first.id.localeCompare(second.id);
}

export function compareRequests(first, second) {
  const firstDated = isValidDate(first.neededBy);
  const secondDated = isValidDate(second.neededBy);
  if (firstDated !== secondDated) return firstDated ? -1 : 1;
  if (firstDated && first.neededBy !== second.neededBy) {
    return first.neededBy.localeCompare(second.neededBy);
  }
  return compareCreated(first, second);
}

function categoryFor(request, requests, now) {
  if (request.closedAt) return "Closed";
  if (request.discardedAt) return "Discarded";
  if (!isManagerVisible(request, now)) return null;
  if (request.priority === "High") return "High";
  const matches = requests.filter((other) => participates(other, now) && matchesRequest(request, other));
  const duplicate = !request.duplicateExempt && matches.some((other) => compareCreated(other, request) < 0);
  const lowDuplicate = request.priority === "Low" && duplicate;
  if (matches.length && !lowDuplicate) return "Unavailable";
  if (request.submissionState === "draft" || request.submissionState === "attempt" || hasMissingFields(request)) {
    return "Failed";
  }
  if (request.priority === "Medium") return "Medium";
  if (Object.keys(validateRequest(request)).length) return "Invalid";
  return lowDuplicate ? "Duplicate" : "Low";
}

// Freeze eligibility for this evaluation so each deadline is applied consistently.
export function evaluateRequests(requests, now = new Date()) {
  const categories = new Map(requests.map((request) => [request.id, categoryFor(request, requests, now)]));
  return requests.map((request) => {
    if (categories.get(request.id) !== "Duplicate") return request;
    const timestamp = now.toISOString();
    const identified = request.duplicateIdentifiedAt ?? timestamp;
    const updated = { ...request, duplicateIdentifiedAt: identified };
    if (now.getTime() - Date.parse(identified) >= 14 * DAY) {
      updated.discardedAt = timestamp;
    }
    return updated;
  });
}

export function groupRequests(requests, now = new Date()) {
  const groups = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, []]));
  for (const request of requests) {
    const category = categoryFor(request, requests, now);
    if (category) groups[category].push(request);
  }
  for (const group of Object.values(groups)) group.sort(compareRequests);
  return groups;
}

export function createDraft(input, previous, options = {}) {
  const now = options.now ?? new Date();
  const fields = Object.fromEntries(
    ["requester", "department", "equipment", "neededBy", "reason", "priority"]
      .map((field) => [field, typeof input[field] === "string" ? input[field] : ""]),
  );
  return {
    ...previous, ...fields,
    id: previous?.id ?? options.id ?? createId(),
    createdAt: previous?.createdAt ?? now.toISOString(),
    submissionState: "draft",
    delayStartedAt: null,
    updatedAt: now.toISOString(),
  };
}

export function leaveDraft(draft, options = {}) {
  return { ...draft, delayStartedAt: draft.delayStartedAt ?? (options.now ?? new Date()).toISOString() };
}

export function submitDraft(draft, options = {}) {
  const now = options.now ?? new Date();
  if (hasMissingFields(draft)) {
    return { ...draft, submissionState: "attempt", delayStartedAt: now.toISOString() };
  }
  const valid = Object.keys(validateRequest(draft)).length === 0;
  const fields = valid ? createRequest(draft, { id: draft.id, now: new Date(draft.createdAt) }) : draft;
  return { ...draft, ...fields, submissionState: "submitted", submittedAt: now.toISOString(), delayStartedAt: null };
}

export function upsertRequest(requests, request) {
  return requests.some((item) => item.id === request.id)
    ? requests.map((item) => item.id === request.id ? request : item)
    : appendRequest(requests, request);
}


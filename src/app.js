import {
  CATEGORY_ORDER, STORAGE_KEY, closeRequest, createDraft, evaluateRequests, groupRequests,
  isValidDate, leaveDraft, loadRequests, recoverRequest, saveRequests, submitDraft, upsertRequest, validateRequest,
} from "./request-store.js";

const form = document.querySelector("#request-form");
const message = document.querySelector("#form-message");
const neededByInput = document.querySelector("#needed-by");
const count = document.querySelector("#request-count");
const emptyState = document.querySelector("#empty-state");
const sections = document.querySelector("#request-sections");
const listMessage = document.querySelector("#list-message");

let requests = loadRequests();
let draftId = requests.filter((request) =>
  !request.closedAt && !request.discardedAt &&
  ["draft", "attempt"].includes(request.submissionState),
).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.id ?? null;

neededByInput.min = new Date().toISOString().slice(0, 10);
const restored = requests.find((request) => request.id === draftId);
if (restored) {
  for (const element of form.elements) {
    if (element.name) element.value = restored[element.name] ?? "";
  }
  setMessage("Your unfinished request has been restored.");
}
refreshRequests();

function formInput() {
  return Object.fromEntries(new FormData(form).entries());
}

function commit(next) {
  // Update the screen only after persistence succeeds.
  saveRequests(next);
  requests = next;
}

function saveDraft() {
  const previous = requests.find((request) => request.id === draftId);
  const draft = createDraft(formInput(), previous);
  commit(upsertRequest(requests, draft));
  draftId = draft.id;
  return draft;
}

form.addEventListener("input", () => {
  try {
    saveDraft();
    setMessage("Draft saved. Unfinished requests appear for managers after three days away.");
    renderRequests();
  } catch {
    setMessage("The draft could not be saved. Keep this form open and try again.", true);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFieldErrors();
  try {
    const draft = saveDraft();
    const errors = validateRequest(draft);
    const submitted = submitDraft(draft);
    commit(upsertRequest(requests, submitted));
    if (submitted.submissionState === "attempt") {
      showFieldErrors(errors);
      setMessage("Complete all required fields. This attempt is saved and becomes manager-visible after three days.", true);
    } else if (Object.keys(errors).length) {
      showFieldErrors(errors);
      setMessage("The request was saved with validation errors. Correct the marked fields and submit again.", true);
    } else {
      draftId = null;
      form.reset();
      neededByInput.min = new Date().toISOString().slice(0, 10);
      setMessage("Request added.");
      document.querySelector("#requester").focus();
    }
    refreshRequests();
  } catch {
    setMessage("The request could not be saved. Try again.", true);
  }
});

function markFormLeft() {
  const draft = requests.find((request) => request.id === draftId);
  if (!draft || !["draft", "attempt"].includes(draft.submissionState)) return;
  try {
    commit(upsertRequest(requests, leaveDraft(draft)));
    renderRequests();
  } catch {
    setMessage("The unfinished request could not be saved. Keep this form open and try again.", true);
  }
}

form.addEventListener("focusout", (event) => {
  if (!form.contains(event.relatedTarget)) markFormLeft();
});
window.addEventListener("pagehide", markFormLeft);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") markFormLeft();
  else refreshRequests();
});
window.addEventListener("pageshow", refreshRequests);
window.addEventListener("focus", refreshRequests);
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    requests = loadRequests();
    renderRequests();
  }
});

function refreshRequests() {
  try {
    const updated = evaluateRequests(requests);
    if (JSON.stringify(updated) !== JSON.stringify(requests)) commit(updated);
  } catch {
    listMessage.textContent = "Request aging could not be saved. Your existing requests are retained.";
  }
  renderRequests();
}

function renderRequests() {
  const groups = groupRequests(requests);
  const total = Object.values(groups).reduce((sum, group) => sum + group.length, 0);
  count.textContent = total + (total === 1 ? " request" : " requests");
  emptyState.hidden = total > 0;
  sections.replaceChildren();
  for (const category of CATEGORY_ORDER) {
    const section = document.createElement("section");
    section.className = "request-category";
    section.setAttribute("aria-labelledby", "category-" + category.toLowerCase());
    const heading = document.createElement("h3");
    heading.id = "category-" + category.toLowerCase();
    heading.textContent = category + " (" + groups[category].length + ")";
    section.append(heading);
    if (!groups[category].length) {
      const empty = document.createElement("p");
      empty.className = "category-empty";
      empty.textContent = "No requests in this category.";
      section.append(empty);
    } else {
      section.append(createTable(groups[category], category));
    }
    sections.append(section);
  }
}

function createTable(records, category) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrapper";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.className = "sr-only";
  caption.textContent = category + " equipment requests";
  const head = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["Requester", "Department", "Equipment", "Priority", "Needed by", "Business reason", "Created", "Actions"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    header.append(cell);
  }
  head.append(header);
  const body = document.createElement("tbody");
  body.append(...records.map((request) => createRequestRow(request, category)));
  table.append(caption, head, body);
  wrapper.append(table);
  return wrapper;
}

function changeRequest(id, change, success, button) {
  try {
    commit(requests.map((request) => request.id === id ? change(request) : request));
    if (id === draftId && requests.find((request) => request.id === id)?.closedAt) {
      draftId = null;
      form.reset();
      clearFieldErrors();
      setMessage("");
    }
    listMessage.textContent = success;
    refreshRequests();
    listMessage.focus();
  } catch (error) {
    listMessage.textContent = error.errors?.priority ?? "The change could not be saved. Try again.";
    button?.focus();
  }
}

function createRequestRow(request, category) {
  const row = document.createElement("tr");
  for (const value of [
    request.requester, request.department, request.equipment, request.priority,
    formatDate(request.neededBy), request.reason, formatDateTime(request.createdAt),
  ]) {
    const cell = document.createElement("td");
    cell.textContent = value || "Not provided";
    row.append(cell);
  }
  const actions = document.createElement("td");
  actions.className = "request-actions";
  if (category === "Discarded") {
    const label = document.createElement("label");
    label.htmlFor = "recover-" + request.id;
    label.textContent = "Recovery priority";
    const select = document.createElement("select");
    select.id = label.htmlFor;
    for (const value of ["", "Low", "Medium", "High"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value || "Choose a priority";
      select.append(option);
    }
    const recover = document.createElement("button");
    recover.type = "button";
    recover.textContent = "Recover";
    recover.addEventListener("click", () => {
      if (!select.value) {
        listMessage.textContent = "Choose Low, Medium, or High before recovering.";
        select.setAttribute("aria-invalid", "true");
        select.focus();
        return;
      }
      changeRequest(request.id, (item) => recoverRequest(item, select.value), "Request recovered.", recover);
    });
    actions.append(label, select, recover);
  }
  if (category !== "Closed") {
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close request";
    close.addEventListener("click", () =>
      changeRequest(request.id, closeRequest, "Request closed and completed.", close),
    );
    actions.append(close);
  } else {
    actions.textContent = "Completed " + formatDateTime(request.closedAt);
  }
  row.append(actions);
  return row;
}

function formatDate(value) {
  if (!isValidDate(value)) return value ? "Invalid date: " + value : "Not provided";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(value + "T00:00:00Z"));
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(date)
    : "Unknown";
}

function showFieldErrors(errors) {
  for (const fieldName of Object.keys(errors)) form.elements[fieldName]?.setAttribute("aria-invalid", "true");
  form.elements[Object.keys(errors)[0]]?.focus();
}

function clearFieldErrors() {
  for (const element of form.elements) element.removeAttribute?.("aria-invalid");
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}


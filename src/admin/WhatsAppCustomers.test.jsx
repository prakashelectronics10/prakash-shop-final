import { act } from "react";
import { createRoot } from "react-dom/client";
import WhatsAppCustomers from "./WhatsAppCustomers";

jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

const first = { id: "first", customerName: "Anita", customerWaId: "919876543210", lastMessageAt: "2026-11-28T05:00:00Z" };
const second = { id: "second", customerName: "Rahul", customerWaId: "918765432109", lastMessageAt: "2026-11-28T03:00:00Z" };
const message = (id, conversationId, text, minute = 0) => ({ id, conversationId, text, type: "text", direction: "inbound", createdAt: `2026-11-28T05:${String(minute).padStart(2, "0")}:00Z` });

let container;
let root;
let stream;
let previousEventSource;
let previousActEnvironment;

beforeEach(() => {
  jest.useFakeTimers();
  previousActEnvironment = window.IS_REACT_ACT_ENVIRONMENT;
  window.IS_REACT_ACT_ENVIRONMENT = true;
  previousEventSource = window.EventSource;
  window.EventSource = class {
    constructor() { this.listeners = {}; stream = this; }
    addEventListener(event, listener) { this.listeners[event] = listener; }
    close() {}
    emit(event, payload) { this.listeners[event]({ data: JSON.stringify({ payload }) }); }
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.EventSource = previousEventSource;
  window.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  jest.useRealTimers();
});

async function mount(apiFetch) {
  await act(async () => root.render(<WhatsAppCustomers apiFetch={apiFetch} accountId="sender" />));
  await act(async () => jest.advanceTimersByTime(1));
}

const click = (element) => act(async () => element.click());
const button = (name) => [...container.querySelectorAll("button")].find((item) => (item.getAttribute("aria-label") || item.textContent.trim()) === name);

test("background polling keeps inbox mounted and preserves thread scroll until the admin jumps to new messages", async () => {
  const apiFetch = jest.fn(async (path) => path.includes("?") ? { data: [first] } : {
    data: { conversation: first, messages: [message("one", "first", "Original message")] },
  });
  await mount(apiFetch);
  const row = container.querySelector(".wa-chat-row");
  const list = container.querySelector(".wa-inbox-list");
  await click(row);
  const thread = container.querySelector(".wa-chat-thread");
  Object.defineProperty(thread, "scrollHeight", { value: 1000 });
  Object.defineProperty(thread, "clientHeight", { value: 200 });
  thread.scrollTop = 150;
  list.scrollTop = 80;
  act(() => thread.dispatchEvent(new Event("scroll")));

  await act(async () => jest.advanceTimersByTime(10000));
  expect(container.querySelector(".wa-chat-row")).toBe(row);
  expect(thread.scrollTop).toBe(150);
  expect(list.scrollTop).toBe(80);
  expect(container.textContent).not.toContain("Loading customers");
  expect(container.textContent).not.toContain("Loading messages");

  act(() => stream.emit("whatsapp:message", { conversation: first, message: message("two", "first", "New inbound", 1) }));
  expect(thread.scrollTop).toBe(150);
  expect(container.textContent).toContain("New inbound");
  await click(button("New messages"));
  expect(thread.scrollTop).toBe(1000);
});

test("a slow thread response cannot replace the selected chat and admins can block, unblock and delete", async () => {
  let release;
  const late = new Promise((resolve) => { release = resolve; });
  const apiFetch = jest.fn(async (path, options) => {
    if (path.includes("?")) return { data: [first, second] };
    if (path.endsWith("/first/messages")) return late;
    if (path.endsWith("/second/messages")) return { data: { conversation: second, messages: [message("two", "second", "Rahul’s message")] } };
    if (path.endsWith("/block")) return { data: { ...second, blockedAt: JSON.parse(options.body).blocked ? "2026-11-28T06:00:00Z" : null } };
    if (options?.method === "DELETE") return { data: { conversationId: "second" } };
    throw new Error(`Unexpected API request ${path}`);
  });
  await mount(apiFetch);
  const rows = container.querySelectorAll(".wa-chat-row");
  await click(rows[0]);
  await click(rows[1]);
  await act(async () => release({ data: { conversation: first, messages: [message("one", "first", "Wrong thread")] } }));
  expect(container.querySelector(".wa-chat-heading h3").textContent).toBe("Rahul");
  expect(container.textContent).not.toContain("Wrong thread");

  await click(button("Block customer"));
  await click(button("Block"));
  expect(container.textContent).toContain("Unblock this customer to reply.");
  await click(button("Unblock customer"));
  await click(button("Unblock"));
  expect(container.querySelector("textarea")).not.toBeNull();

  await click(button("Delete customer"));
  await click(button("Delete chat"));
  expect(apiFetch).toHaveBeenCalledWith("/whatsapp/admin/conversations/second", { method: "DELETE" });
  expect(container.querySelector(".wa-chat-heading")).toBeNull();
  expect(container.textContent).not.toContain("Rahul");
  act(() => stream.emit("whatsapp:conversation", { conversation: { ...second, id: "new-rahul" } }));
  expect(container.textContent).toContain("Rahul");
});

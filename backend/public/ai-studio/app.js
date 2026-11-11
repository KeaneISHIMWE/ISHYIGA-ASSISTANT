const state = { user: null, view: "overview", conversations: [], messages: [], selected: null, correcting: null, corrections: [], memories: [] };

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.getElementById("toasts").appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function authView(step) {
  const otp = step === "otp";
  document.getElementById("app").innerHTML = `
    <section class="auth">
      <form class="card" id="auth">
        <h1>AI Studio</h1>
        <p>${otp
          ? "Enter the 6-digit code sent to your WhatsApp."
          : "Enter the WhatsApp number you used when communicating with our AI assistant to access your conversations and help improve its responses."}</p>
        ${otp ? `
          <label>Code</label>
          <input name="code" inputmode="numeric" maxlength="6" required />
        ` : `
          <label>WhatsApp number</label>
          <div class="row">
            <select name="code"><option value="250">+250</option><option value="">Other</option></select>
            <input name="phone" placeholder="788 000 000" required />
          </div>
        `}
        <button class="primary" type="submit">${otp ? "Verify" : "Continue"}</button>
      </form>
    </section>`;
  document.getElementById("auth").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      if (!otp) {
        const local = String(form.get("phone") || "").replace(/\D/g, "");
        const country = String(form.get("code") || "");
        const phone = country && !local.startsWith(country) ? `${country}${local.replace(/^0/, "")}` : local;
        state.phone = phone;
        const result = await api("/api/ai-studio/auth/request-otp", {
          method: "POST",
          body: JSON.stringify({ phone }),
        });
        toast(result.message);
        authView("otp");
      } else {
        await api("/api/ai-studio/auth/verify-otp", {
          method: "POST",
          body: JSON.stringify({ phone: state.phone, code: form.get("code") }),
        });
        await boot();
      }
    } catch (error) {
      toast(error.message);
    }
  };
}

function shell(body) {
  const items = ["overview", "conversations", "corrections", "knowledge", "memory", "settings"];
  document.getElementById("app").innerHTML = `
    <div class="shell">
      <nav>
        <strong style="display:block;padding:8px 12px 16px">AI Studio</strong>
        ${items.map((item) => `<button data-nav="${item}" class="${state.view === item ? "active" : ""}">${item[0].toUpperCase()}${item.slice(1)}</button>`).join("")}
        <button id="logout">Log out</button>
      </nav>
      <main>${body}</main>
    </div>`;
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.onclick = () => show(button.dataset.nav);
  });
  document.getElementById("logout").onclick = async () => {
    await api("/api/ai-studio/auth/logout", { method: "POST", body: "{}" });
    state.user = null;
    authView("phone");
  };
}

async function show(view) {
  state.view = view;
  if (view === "overview") {
    const data = await api("/api/ai-studio/overview");
    const stats = data.stats || {};
    shell(`<h1>Overview</h1>
      <div class="stats">
        ${card("Conversations", stats.conversations)}
        ${card("AI responses", stats.ai_responses)}
        ${card("Corrections", stats.corrections)}
        ${card("Approved", stats.approved)}
        ${card("Pending", stats.pending)}
      </div>`);
  } else if (view === "conversations") {
    await renderConversations();
  } else if (view === "corrections" || view === "knowledge") {
    const data = await api("/api/ai-studio/corrections");
    const rows = data.corrections.filter((row) => view === "knowledge" ? row.status === "APPROVED" && !row.personal : true);
    shell(`<h1>${view === "knowledge" ? "Knowledge contributions" : "My corrections"}</h1>
      ${rows.length ? rows.map((row) => `<article class="panel" style="padding:12px;margin-bottom:10px">
        <div class="meta">${esc(row.status)} · ${esc(row.source_language)} · ${esc(row.created_at)}</div>
        <p><b>Reply:</b> ${esc(row.original_ai_response)}</p>
        <p><b>Your correction:</b> ${esc(row.original_correction)}</p>
        <p><b>English reading:</b> ${esc(row.normalized_correction)}</p>
      </article>`).join("") : `<p class="empty">Nothing here yet.</p>`}`);
  } else if (view === "memory") {
    const data = await api("/api/ai-studio/memories");
    shell(`<h1>Personal memory</h1>
      ${data.memories.length ? data.memories.map((row) => `<article class="panel" style="padding:12px;margin-bottom:10px">
        <p>${esc(row.memory_content)}</p>
        <button class="ghost" data-forget="${row.id}">Delete</button>
      </article>`).join("") : `<p class="empty">No personal memories yet.</p>`}`);
    document.querySelectorAll("[data-forget]").forEach((button) => {
      button.onclick = async () => {
        await api(`/api/ai-studio/memories/${button.dataset.forget}`, { method: "DELETE" });
        show("memory");
      };
    });
  } else {
    shell(`<h1>Settings</h1><p>Signed in as ${esc(state.user.phone)}. Personal memories stay private. Shared corrections are used by the assistant only after an administrator approves them.</p>`);
  }
}

function card(label, value) {
  return `<div class="stat"><b>${esc(value ?? 0)}</b><span>${label}</span></div>`;
}

async function renderConversations() {
  const data = await api("/api/ai-studio/conversations");
  state.conversations = data.conversations;
  shell(`<h1>Conversations</h1>
    <input id="search" placeholder="Search your conversations" />
    <div class="viewer closed" id="viewer">
      <div class="list" id="list"></div>
      <div class="thread" id="thread"><p class="empty">Choose a conversation.</p></div>
    </div>`);
  paintList();
  document.getElementById("search").oninput = async (event) => {
    const next = await api(`/api/ai-studio/conversations?q=${encodeURIComponent(event.target.value)}`);
    state.conversations = next.conversations;
    paintList();
  };
}

function paintList() {
  document.getElementById("list").innerHTML = state.conversations.map((row) =>
    `<button data-id="${row.id}"><b>${esc(row.title)}</b><div class="meta">${esc(row.updatedAt || "")}</div></button>`
  ).join("") || `<p class="empty">No conversations yet.</p>`;
  document.querySelectorAll("[data-id]").forEach((button) => {
    button.onclick = () => openConversation(button.dataset.id);
  });
}

async function openConversation(id) {
  state.selected = id;
  const data = await api(`/api/ai-studio/conversations/${id}/messages`);
  state.messages = data.messages;
  const thread = document.getElementById("thread");
  thread.innerHTML = data.messages.map((message) => `
    <div class="bubble ${message.role}">
      <div>${esc(message.content)}</div>
      <div class="meta">${esc(message.createdAt)}</div>
      ${message.role === "assistant" ? `<button class="ghost" data-correct="${message.id}">@ Correct this response</button>` : ""}
    </div>`).join("");
  thread.querySelectorAll("[data-correct]").forEach((button) => {
    button.onclick = () => {
      state.correcting = state.messages.find((item) => item.id === button.dataset.correct);
      const viewer = document.getElementById("viewer");
      viewer.classList.remove("closed");
      const existing = document.getElementById("correct");
      if (existing) existing.remove();
      viewer.insertAdjacentHTML("beforeend", correctionPanel());
    };
  });
}

function correctionPanel() {
  const message = state.correcting;
  const prior = [...state.messages].reverse().find((item) => item.role === "user" && item.createdAt <= message.createdAt);
  return `<form class="correct" id="correct">
    <h2>Correct this response</h2>
    <p><b>Question</b><br>${esc(prior ? prior.content : "")}</p>
    <p><b>Assistant reply</b><br>${esc(message.content)}</p>
    <label>What should it have said?</label>
    <textarea name="correction" required minlength="3"></textarea>
    <label>Explanation (optional)</label>
    <textarea name="explanation"></textarea>
    <button class="primary" type="submit">Submit correction</button>
    <button class="ghost" type="button" id="cancel">Cancel</button>
  </form>`;
}

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "correct") return;
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api("/api/ai-studio/corrections", {
      method: "POST",
      body: JSON.stringify({
        messageId: state.correcting.id,
        correction: form.get("correction"),
        explanation: form.get("explanation"),
      }),
    });
    state.correcting = null;
    toast("Correction saved for review.");
    show("corrections");
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("click", (event) => {
  if (event.target.id === "cancel") {
    state.correcting = null;
    renderConversations();
  }
});

async function boot() {
  try {
    const data = await api("/api/ai-studio/auth/me");
    state.user = data.user;
    show("overview");
  } catch (_error) {
    authView("phone");
  }
}

boot();

const state = {
  user: null,
  view: "login",
  mode: "login",
  contributions: [],
  stats: null,
  knowledge: [],
  prompts: [],
  users: [],
  audit: [],
  current: null,
  type: "QUESTION_ANSWER",
  filters: { q: "", status: "", type: "", sort: "newest" },
  loading: false,
};

const labels = {
  SYSTEM_PROMPT: "System prompt",
  QUESTION_ANSWER: "Question & answer",
  FEATURE_WORKFLOW: "Feature / workflow",
  TROUBLESHOOTING: "Troubleshooting",
};

function passwordField(name, label, { minlength = 0 } = {}) {
  return `
    <label>${label}</label>
    <div class="password-field">
      <input name="${name}" type="password" required ${minlength ? `minlength="${minlength}"` : ""} />
      <button type="button" class="eye" data-eye aria-label="Show password">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/>
          <circle cx="12" cy="12" r="3"/>
          <path class="slash" d="M4 20L20 4"/>
        </svg>
      </button>
    </div>
  `;
}

function bindEyes(root = document) {
  root.querySelectorAll("[data-eye]").forEach((button) => {
    button.onclick = () => {
      const input = button.parentElement.querySelector("input");
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.classList.toggle("open", !showing);
      button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    };
  });
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

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
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function go(view) {
  state.view = view;
  location.hash = view;
  render();
}

async function boot() {
  try {
    const data = await api("/api/studio/auth/me");
    state.user = data.user;
    state.view = "home";
  } catch (_error) {
    state.user = null;
    state.view = "login";
  }
  const hash = location.hash.replace("#", "");
  if (hash && state.user) state.view = hash;
  if (state.user) {
    await refresh();
  } else {
    render();
  }
}

function navButton(id, label) {
  return `<button class="${state.view === id ? "active" : ""}" data-go="${id}">${label}</button>`;
}

function shell(content) {
  const user = state.user;
  const contributor = `
    ${navButton("home", "Dashboard")}
    ${navButton("new", "New contribution")}
    ${navButton("mine", "My contributions")}
    ${navButton("knowledge", "Knowledge base")}
    ${navButton("profile", "Profile")}
  `;
  const admin = user && user.role === "ADMIN" ? `
    ${navButton("queue", "Review queue")}
    ${navButton("prompts", "System prompts")}
    ${navButton("people", "Contributors")}
  ` : "";
  return `
    <div class="app">
      <aside class="sidebar">
        <div class="brand" style="padding:8px 12px 16px">Ishyiga Studio</div>
        ${contributor}
        ${admin}
        <div style="flex:1"></div>
        <button id="logout">Sign out</button>
      </aside>
      <main class="main">${content}</main>
    </div>
  `;
}

function authView() {
  const login = state.mode === "login";
  return `
    <div class="auth-shell">
      <section class="auth-story">
        <div class="brand">Ishyiga AI Knowledge Studio</div>
        <div>
          <h1>Teach the assistant how Ishyiga Software works.</h1>
          <p>Support staff and developers submit prompts, answers, and workflows. An administrator reviews every item before it becomes trusted AI knowledge.</p>
        </div>
        <p>Anonymous contributions are not accepted.</p>
      </section>
      <section class="auth-card">
        <form class="panel" id="auth-form">
          <div class="tabs">
            <button type="button" class="${login ? "active" : ""}" data-mode="login">Log in</button>
            <button type="button" class="${login ? "" : "active"}" data-mode="register">Create account</button>
          </div>
          ${login ? "" : `<label>Full name</label><input name="name" required />`}
          <label>Email</label><input name="email" type="email" required />
          ${passwordField("password", "Password", { minlength: 8 })}
          ${login ? "" : `<label>Phone (optional)</label><input name="phone" />`}
          <p class="muted">${login ? "Use the account you registered with." : "The first account becomes the administrator. Later accounts are contributors."}</p>
          <div class="error" id="form-error"></div>
          <div class="actions"><button class="primary" type="submit">${login ? "Log in" : "Create account"}</button></div>
        </form>
      </section>
    </div>
  `;
}

function homeView() {
  return `
    <section class="hero">
      <h1>Help us teach the Ishyiga AI Assistant.</h1>
      <p>Contribute your knowledge, system prompts, questions, solutions, and explanations about how Ishyiga Software works. Nothing is added to the AI until an administrator approves it.</p>
      <button class="primary" data-go="new">New contribution</button>
    </section>
    ${state.user.role === "ADMIN" && state.stats ? cards(state.stats) : statusCards(state.contributions)}
  `;
}

function statusCards(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const pending = list.filter((row) => row.status === "PENDING" || row.status === "UNDER_REVIEW" || row.status === "NEEDS_REVISION").length;
  const approved = list.filter((row) => row.status === "APPROVED" || row.status === "ADDED_TO_AI").length;
  return `<div class="cards">
    <article class="card"><span>Pending</span><strong>${pending}</strong></article>
    <article class="card"><span>Approved</span><strong>${approved}</strong></article>
  </div>
  <p class="muted">Signed in as ${esc(state.user.name)} · ${esc(state.user.role)}</p>`;
}
function cards(stats) {
  const items = [
    ["Contributors", stats.contributors],
    ["Contributions", stats.total],
    ["Pending", stats.pending],
    ["Approved", stats.approved],
    ["Rejected", stats.rejected],
    ["Added to AI", stats.added],
    ["Submitted today", stats.today],
    ["Needs revision", stats.needs_revision],
  ];
  return `<div class="cards">${items.map(([label, value]) => `<article class="card"><span>${label}</span><strong>${value}</strong></article>`).join("")}</div>`;
}

function newView() {
  const type = state.type;
  const fields = {
    SYSTEM_PROMPT: `
      <label>Title</label><input name="title" required />
      <label>System prompt</label><textarea name="systemPrompt" required></textarea>
      <label>Description / purpose</label><textarea name="description"></textarea>
      <label>Additional notes</label><textarea name="notes"></textarea>`,
    QUESTION_ANSWER: `
      <label>Title</label><input name="title" required />
      <label>Question</label><textarea name="question" required></textarea>
      <label>Answer</label><textarea name="answer" required></textarea>
      <label>Feature / module</label><input name="module" />
      <label>Additional explanation</label><textarea name="notes"></textarea>
      <label>Screenshot note or link</label><input name="attachmentNote" />`,
    FEATURE_WORKFLOW: `
      <label>Feature name</label><input name="title" required />
      <label>Module</label><input name="module" />
      <label>Description</label><textarea name="description" required></textarea>
      <label>Step-by-step procedure</label><textarea name="steps" required></textarea>
      <label>Common problems</label><textarea name="question"></textarea>
      <label>Recommended solution</label><textarea name="solution"></textarea>
      <label>Additional notes</label><textarea name="notes"></textarea>`,
    TROUBLESHOOTING: `
      <label>Title</label><input name="title" required />
      <label>Problem / issue</label><textarea name="question" required></textarea>
      <label>Symptoms</label><textarea name="symptoms"></textarea>
      <label>Possible cause</label><textarea name="cause"></textarea>
      <label>Solution</label><textarea name="solution" required></textarea>
      <label>Steps to resolve</label><textarea name="steps"></textarea>
      <label>When to escalate</label><textarea name="escalateWhen"></textarea>
      <label>Priority</label><select name="priority"><option>low</option><option selected>medium</option><option>high</option></select>`,
  };
  return `
    <div class="top"><h1>New contribution</h1></div>
    <form class="detail" id="contrib-form">
      <div class="types">
        ${Object.entries(labels).map(([id, label]) => `<button type="button" class="type ${type === id ? "active" : ""}" data-type="${id}"><strong>${label}</strong></button>`).join("")}
      </div>
      <label>What you are trying to solve</label>
      <p class="muted">Describe the question or problem you encountered. This is what you are correcting or teaching the assistant.</p>
      <textarea name="encountered" required placeholder="Example: A cashier asked how to add a customer and the steps were not clear."></textarea>
      <label>Upload what you encountered</label>
      <p class="muted">Optional screenshot of the question, error, or screen.</p>
      <input name="problemFile" type="file" accept="image/*" />
      ${fields[type]}
      <div class="error" id="form-error"></div>
      <div class="actions"><button class="primary" type="submit">Push contribution</button></div>
    </form>
  `;
}

function table(rows, admin) {
  if (!rows.length) return `<div class="empty">No contributions yet.</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>${admin ? "Contributor" : "Title"}</th><th>Type</th><th>Title</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>
        <td>${admin ? esc(row.contributor_name) : esc(row.title)}</td>
        <td>${esc(labels[row.type] || row.type)}</td>
        <td>${esc(row.title)}</td>
        <td>${esc(when(row.created_at))}</td>
        <td><span class="badge ${esc(row.status)}">${esc(row.status)}</span></td>
        <td><button class="ghost" data-open="${esc(row.id)}">Open</button></td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function filters() {
  return `<div class="filters">
    <input id="q" placeholder="Search" value="${esc(state.filters.q)}" />
    <select id="status"><option value="">All statuses</option>${["PENDING","UNDER_REVIEW","APPROVED","REJECTED","NEEDS_REVISION","ADDED_TO_AI"].map((item) => `<option ${state.filters.status === item ? "selected" : ""}>${item}</option>`).join("")}</select>
    <select id="type"><option value="">All types</option>${Object.entries(labels).map(([id, label]) => `<option value="${id}" ${state.filters.type === id ? "selected" : ""}>${label}</option>`).join("")}</select>
    <button class="ghost" id="apply-filters">Filter</button>
  </div>`;
}

function listView(title, rows) {
  return `<div class="top"><h1>${title}</h1><button class="primary" data-go="new">New contribution</button></div>${filters()}${table(rows, state.user.role === "ADMIN" && state.view !== "mine")}`;
}

function detailView() {
  const row = state.current;
  if (!row) return `<div class="empty">Loading contribution…</div>`;
  const editable = state.user.role === "ADMIN" || ["PENDING", "NEEDS_REVISION"].includes(row.status);
  const admin = state.user.role === "ADMIN" && row.contributor_id !== state.user.id;
  return `
    <div class="top"><h1>${esc(row.title)}</h1><button class="ghost" data-go="${state.user.role === "ADMIN" ? "queue" : "mine"}">Back</button></div>
    <div class="split">
      <article class="detail">
        <span class="badge ${esc(row.status)}">${esc(row.status)}</span>
        <p class="muted">${esc(labels[row.type])} · ${esc(when(row.created_at))}</p>
        ${block("What you are trying to solve", row.encountered)}
        ${block("Question / problem", row.question)}
        ${block("Answer", row.answer)}
        ${block("System prompt", row.system_prompt)}
        ${block("Feature", row.feature)}
        ${block("Module", row.module)}
        ${block("Description", row.description)}
        ${block("Procedure", row.steps)}
        ${block("Symptoms", row.symptoms)}
        ${block("Cause", row.cause)}
        ${block("Solution", row.solution)}
        ${block("Escalate when", row.escalate_when)}
        ${block("Notes", row.notes)}
        ${attachmentBlock(row.attachment_note)}
        ${block("Admin feedback", row.admin_notes)}
        <p class="muted">Reviewed ${esc(when(row.reviewed_at))}${row.reviewer_name ? ` by ${esc(row.reviewer_name)}` : ""}</p>
        ${editable ? `<form id="edit-form"><label>Update title</label><input name="title" value="${esc(row.title)}" /><div class="actions"><button class="primary">Save revision</button></div><div class="error" id="form-error"></div></form>` : ""}
      </article>
      ${admin ? `<aside class="detail">
        <h2>Review</h2>
        <p><strong>${esc(row.contributor_name)}</strong><br>${esc(row.contributor_email)} · ${esc(row.contributor_role)}</p>
        <label>Admin notes</label><textarea id="notes">${esc(row.admin_notes || "")}</textarea>
        <div class="actions">
          <button class="ok" data-review="approve">Approve</button>
          <button class="warn" data-review="revision">Request revision</button>
          <button class="danger" data-review="reject">Reject</button>
          <button class="primary" data-add="${esc(row.id)}">Add to AI</button>
          <button class="ghost" data-delete="${esc(row.id)}">Delete</button>
        </div>
      </aside>` : ""}
    </div>
  `;
}

function attachmentBlock(value) {
  if (!value) return "";
  if (String(value).startsWith("data:image/")) {
    return `<h3>What you uploaded</h3><img alt="Uploaded problem" src="${esc(value)}" style="max-width:100%;border-radius:12px" />`;
  }
  return block("What you uploaded", value);
}

function block(label, value) {
  if (!value) return "";
  return `<h3>${label}</h3><p>${esc(value).replaceAll("\n", "<br>")}</p>`;
}

function knowledgeView() {
  if (!state.knowledge.length) return `<h1>AI knowledge base</h1><div class="empty">Approved knowledge will appear here after an admin adds it.</div>`;
  return `<h1>AI knowledge base</h1><div class="table-wrap"><table><thead><tr><th>Title</th><th>Category</th><th>Version</th><th>Approved by</th><th>Approved</th></tr></thead><tbody>
    ${state.knowledge.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(labels[item.category] || item.category)}</td><td>${esc(item.version)}</td><td>${esc(item.approved_by_name || "—")}</td><td>${esc(when(item.approved_at))}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function promptsView() {
  if (!state.prompts.length) return `<h1>System prompts</h1><div class="empty">Approved system prompts keep a version history here. The live WhatsApp prompt is not replaced automatically.</div>`;
  return `<h1>System prompts</h1><div class="table-wrap"><table><thead><tr><th>Name</th><th>Version</th><th>Status</th><th>Approved by</th><th>Submitted</th><th></th></tr></thead><tbody>
    ${state.prompts.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.version)}</td><td><span class="badge ${esc(item.status)}">${esc(item.status)}</span></td><td>${esc(item.approved_by_name || "—")}</td><td>${esc(when(item.created_at))}</td><td><button class="ghost" data-copy="${esc(item.id)}">Copy</button></td></tr>`).join("")}
  </tbody></table></div>`;
}

function peopleView() {
  return `<h1>Contributors</h1><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Contributions</th><th></th></tr></thead><tbody>
    ${state.users.map((user) => `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td>${esc(user.role)}</td><td>${esc(user.contribution_count)}</td><td>${user.id === state.user.id ? "" : `<button class="ghost" data-role="${esc(user.id)}" data-next="${user.role === "ADMIN" ? "CONTRIBUTOR" : "ADMIN"}">${user.role === "ADMIN" ? "Make contributor" : "Make admin"}</button>`}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function profileView() {
  const user = state.user;
  return `<div class="detail"><h1>Profile</h1><p><strong>${esc(user.name)}</strong></p><p>${esc(user.email)}</p><p>${esc(user.phone || "No phone")}</p><p><span class="badge">${esc(user.role)}</span></p><p class="muted">Account created ${esc(when(user.createdAt))}</p>
    <h2>Change email</h2>
    <form id="email-form">
      <label>New email</label><input name="email" type="email" value="${esc(user.email)}" required />
      ${passwordField("password", "Current password")}
      <div class="error" id="email-error"></div>
      <div class="actions"><button class="primary" type="submit">Update email</button></div>
    </form>
    <h2>Change password</h2>
    <form id="password-form">
      ${passwordField("currentPassword", "Current password")}
      ${passwordField("newPassword", "New password", { minlength: 8 })}
      <div class="error" id="password-error"></div>
      <div class="actions"><button class="primary" type="submit">Update password</button></div>
    </form>
  </div>`;
}

function render() {
  const root = document.getElementById("app");
  if (!state.user) {
    root.innerHTML = authView();
    bindAuth();
    return;
  }
  let body = "";
  if (state.view === "home") body = homeView();
  else if (state.view === "new") body = newView();
  else if (state.view === "mine" || state.view === "queue") body = listView(state.view === "queue" ? "Review queue" : "My contributions", state.contributions);
  else if (state.view === "detail") body = detailView();
  else if (state.view === "knowledge") body = knowledgeView();
  else if (state.view === "prompts") body = promptsView();
  else if (state.view === "people") body = peopleView();
  else if (state.view === "profile") body = profileView();
  else body = homeView();
  root.innerHTML = shell(body);
  bindApp();
}

function bindAuth() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.onclick = () => {
      state.mode = button.dataset.mode;
      render();
    };
  });
  const form = document.getElementById("auth-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const result = await api(state.mode === "login" ? "/api/studio/auth/login" : "/api/studio/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });
      state.user = result.user;
      state.view = "home";
      toast(state.mode === "login" ? "Welcome back" : "Account created");
      await refresh();
    } catch (error) {
      document.getElementById("form-error").textContent = error.message;
    }
  };
  bindEyes();
}

function bindApp() {
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.onclick = async () => {
      state.view = button.dataset.go;
      location.hash = state.view;
      await refresh();
    };
  });
  const logout = document.getElementById("logout");
  if (logout) {
    logout.onclick = async () => {
      await api("/api/studio/auth/logout", { method: "POST", body: "{}" });
      state.user = null;
      render();
    };
  }
  const passwordForm = document.getElementById("password-form");
  if (passwordForm) {
    passwordForm.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(passwordForm).entries());
      try {
        await api("/api/studio/auth/password", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        passwordForm.reset();
        toast("Password updated");
      } catch (error) {
        document.getElementById("password-error").textContent = error.message;
      }
    };
  }
  const emailForm = document.getElementById("email-form");
  if (emailForm) {
    emailForm.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(emailForm).entries());
      try {
        const result = await api("/api/studio/auth/email", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        state.user = result.user;
        toast("Email updated");
        render();
      } catch (error) {
        document.getElementById("email-error").textContent = error.message;
      }
    };
  }
  bindEyes();
  document.querySelectorAll("[data-type]").forEach((button) => {
    button.onclick = () => {
      state.type = button.dataset.type;
      render();
    };
  });
  const contrib = document.getElementById("contrib-form");
  if (contrib) {
    contrib.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(contrib).entries());
      delete payload.problemFile;
      payload.type = state.type;
      const file = contrib.querySelector("[name=problemFile]").files[0];
      if (file) {
        if (!file.type.startsWith("image/")) {
          document.getElementById("form-error").textContent = "Upload an image of the problem.";
          return;
        }
        if (file.size > 700000) {
          document.getElementById("form-error").textContent = "That image is too large. Use a screenshot under 700 KB.";
          return;
        }
        payload.attachmentNote = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read the image"));
          reader.readAsDataURL(file);
        });
      }
      try {
        const result = await api("/api/studio/contributions", { method: "POST", body: JSON.stringify(payload) });
        toast("Contribution sent for review");
        state.current = result.contribution;
        state.view = "detail";
        render();
      } catch (error) {
        document.getElementById("form-error").textContent = error.message;
      }
    };
  }
  const apply = document.getElementById("apply-filters");
  if (apply) {
    apply.onclick = async () => {
      state.filters.q = document.getElementById("q").value;
      state.filters.status = document.getElementById("status").value;
      state.filters.type = document.getElementById("type").value;
      await loadList();
      render();
    };
  }
  document.querySelectorAll("[data-open]").forEach((button) => {
    button.onclick = async () => {
      const data = await api(`/api/studio/contributions/${button.dataset.open}`);
      state.current = data.contribution;
      state.view = "detail";
      render();
    };
  });
  document.querySelectorAll("[data-review]").forEach((button) => {
    button.onclick = async () => {
      const notes = document.getElementById("notes").value;
      const data = await api(`/api/studio/admin/contributions/${state.current.id}/review`, {
        method: "POST",
        body: JSON.stringify({ action: button.dataset.review, notes }),
      });
      state.current = data.contribution;
      toast("Review saved");
      render();
    };
  });
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.onclick = async () => {
      const data = await api(`/api/studio/admin/contributions/${button.dataset.add}/knowledge`, { method: "POST", body: "{}" });
      state.current = data.contribution;
      toast("Added to the approved knowledge base");
      render();
    };
  });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.onclick = async () => {
      if (!confirm("Delete this contribution?")) return;
      await api(`/api/studio/admin/contributions/${button.dataset.delete}`, { method: "DELETE" });
      toast("Deleted");
      state.view = "queue";
      await refresh();
    };
  });
  const edit = document.getElementById("edit-form");
  if (edit) {
    edit.onsubmit = async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(edit).entries());
      try {
        const data = await api(`/api/studio/contributions/${state.current.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        state.current = data.contribution;
        toast("Contribution updated");
        render();
      } catch (error) {
        document.getElementById("form-error").textContent = error.message;
      }
    };
  }
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.onclick = async () => {
      const item = state.prompts.find((prompt) => prompt.id === button.dataset.copy);
      if (!item) return;
      await navigator.clipboard.writeText(item.content);
      toast("Prompt copied");
    };
  });
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.onclick = async () => {
      await api(`/api/studio/admin/users/${button.dataset.role}`, {
        method: "PATCH",
        body: JSON.stringify({ role: button.dataset.next }),
      });
      toast("Role updated");
      await refresh();
    };
  });
}

async function loadList() {
  const params = new URLSearchParams();
  if (state.view === "mine" && state.user.role === "ADMIN") params.set("contributor", "me");
  if (state.filters.q) params.set("q", state.filters.q);
  if (state.filters.status) params.set("status", state.filters.status);
  if (state.filters.type) params.set("type", state.filters.type);
  const path = state.view === "queue" ? "/api/studio/admin/contributions" : "/api/studio/contributions";
  const data = await api(`${path}?${params.toString()}`);
  state.contributions = state.view === "mine"
    ? data.contributions.filter((row) => row.contributor_id === state.user.id || state.user.role !== "ADMIN")
    : data.contributions;
  if (state.view === "mine") {
    state.contributions = data.contributions.filter((row) => row.contributor_id === state.user.id);
  }
}

async function refresh() {
  if (!state.user) return render();
  try {
    if (state.view === "home" && state.user.role === "ADMIN") {
      state.stats = (await api("/api/studio/admin/stats")).stats;
    }
    if (state.view === "home" && state.user.role !== "ADMIN") {
      const data = await api("/api/studio/contributions");
      state.contributions = data.contributions.filter((row) => row.contributor_id === state.user.id);
    }
    if (state.view === "mine" || state.view === "queue") await loadList();
    if (state.view === "knowledge") state.knowledge = (await api("/api/studio/knowledge")).items;
    if (state.view === "prompts") state.prompts = (await api("/api/studio/admin/prompts")).prompts;
    if (state.view === "people") state.users = (await api("/api/studio/admin/users")).users;
  } catch (error) {
    toast(error.message);
  }
  render();
}

window.addEventListener("hashchange", () => {
  const hash = location.hash.replace("#", "");
  if (hash && state.user) {
    state.view = hash;
    refresh();
  }
});

boot();

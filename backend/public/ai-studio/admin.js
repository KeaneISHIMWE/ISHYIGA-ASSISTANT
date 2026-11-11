async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function load() {
  const list = document.getElementById("list");
  try {
    const data = await api("/api/ai-studio/admin/reviews");
    list.innerHTML = data.reviews.length
      ? data.reviews.map((row) => `
        <article class="panel" style="padding:14px;margin-bottom:12px">
          <h2>${esc(row.title)}</h2>
          <p><b>Original:</b> ${esc(row.original_content)}</p>
          <p><b>English reading:</b> ${esc(row.normalized_content)}</p>
          <button class="primary" data-id="${row.id}" data-status="APPROVED">Approve</button>
          <button class="ghost" data-id="${row.id}" data-status="REJECTED">Reject</button>
        </article>`).join("")
      : `<p>No corrections are waiting.</p>`;
    list.querySelectorAll("button").forEach((button) => {
      button.onclick = async () => {
        await api(`/api/ai-studio/admin/reviews/${button.dataset.id}`, {
          method: "POST",
          body: JSON.stringify({ status: button.dataset.status }),
        });
        load();
      };
    });
  } catch (error) {
    list.innerHTML = `<p>${esc(error.message)} <a href="/studio/">Open Knowledge Studio</a></p>`;
  }
}

load();

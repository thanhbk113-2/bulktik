// Hàm dùng chung cho các API Facebook
const GRAPH = "https://graph.facebook.com/v21.0";

async function graph(path, { method = "GET", params = {}, body } = {}) {
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const opt = { method };
  if (body) {
    opt.body = new URLSearchParams(body);
    opt.headers = { "content-type": "application/x-www-form-urlencoded" };
  }
  const r = await fetch(url, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = new Error((j.error && j.error.message) || `Facebook trả lỗi HTTP ${r.status}`);
    e.fb = j.error || {};
    throw e;
  }
  return j;
}

// Nếu dán token cá nhân → đổi sang token của Page. Nếu đã là token Page → giữ nguyên.
async function getPage(pageId, token) {
  const j = await graph(`/${pageId}`, { params: { fields: "name,access_token", access_token: token } });
  return { name: j.name, pageToken: j.access_token || token };
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

module.exports = { graph, getPage, readBody, GRAPH };

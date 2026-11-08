const { graph, getPage, readBody } = require("./_fb");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Chỉ hỗ trợ POST" });
  const b = readBody(req);
  const { pageId, token } = b;
  if (!pageId || !token) return res.status(400).json({ ok: false, error: "Thiếu Page ID hoặc token" });

  try {
    // ===== Kiểm tra token (và đổi sang token dài hạn nếu có App ID + Secret) =====
    if (b.check) {
      let useToken = token, longToken = "", warn = "";
      if (b.appId && b.appSecret) {
        const ex = await graph("/oauth/access_token", {
          params: { grant_type: "fb_exchange_token", client_id: b.appId, client_secret: b.appSecret, fb_exchange_token: token },
        });
        useToken = ex.access_token;
      } else {
        warn = "Chưa nhập App ID + App Secret nên token chỉ dùng được khoảng 1–2 giờ.";
      }
      const page = await getPage(pageId, useToken);
      if (b.appId && b.appSecret) longToken = page.pageToken; // token Page từ token user dài hạn = không hết hạn

      let expiresAt = -1;
      try {
        const d = await graph("/debug_token", { params: { input_token: page.pageToken, access_token: page.pageToken } });
        if (d.data && typeof d.data.expires_at === "number") expiresAt = d.data.expires_at;
      } catch (_) {}
      return res.json({ ok: true, page: page.name, expiresAt, longToken, warn });
    }

    // ===== Đăng video =====
    if (!b.videoUrl) return res.status(400).json({ ok: false, error: "Thiếu videoUrl" });
    const { pageToken } = await getPage(pageId, token);
    const body = { file_url: b.videoUrl, description: b.description || "", access_token: pageToken };
    if (b.scheduledTime) {
      body.published = "false";
      body.scheduled_publish_time = String(b.scheduledTime);
      body.unpublished_content_type = "SCHEDULED";
    }
    const j = await graph(`/${pageId}/videos`, { method: "POST", body });
    // dbError != "" → giao diện sẽ tự đăng bình luận qua /api/fb-comment (không cần database)
    return res.json({ ok: true, id: j.id || j.video_id, dbError: "no-db" });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message, code: e.fb && e.fb.code });
  }
};

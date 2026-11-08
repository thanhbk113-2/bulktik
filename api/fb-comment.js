const { graph, getPage, readBody } = require("./_fb");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Chỉ hỗ trợ POST" });
  const { videoId, pageId, token, comments = [] } = readBody(req);
  if (!videoId || !pageId || !token) return res.status(400).json({ ok: false, error: "Thiếu dữ liệu", fatal: true });

  let pageToken;
  try { pageToken = (await getPage(pageId, token)).pageToken; }
  catch (e) { return res.json({ ok: false, error: e.message, fatal: true, done: 0, left: comments.length, leftList: comments }); }

  let done = 0;
  const list = [...comments];
  while (list.length) {
    try {
      await graph(`/${videoId}/comments`, { method: "POST", body: { message: list[0], access_token: pageToken } });
      list.shift(); done++;
    } catch (e) {
      const c = (e.fb && e.fb.code) || 0;
      const fatal = c === 190 || c === 200 || c === 10 || c === 368;          // token hết hạn / thiếu quyền / bị chặn
      const notReady = !fatal && (c === 100 || c === 1 || c === 2 || /not (yet )?(available|ready)|does not exist/i.test(e.message));
      return res.json({ ok: false, error: e.message, fatal, notReady, done, left: list.length, leftList: list });
    }
  }
  return res.json({ ok: true, done, left: 0, leftList: [] });
};

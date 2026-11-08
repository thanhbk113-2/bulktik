const API = 'https://www.tikwm.com/api/';
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let results = [];

// Tách link kể cả khi bị dính liền nhau (dừng trước chữ "http" kế tiếp)
function parseLinks() {
  const found =
    $('links').value.match(/https?:\/\/.+?(?=https?:\/\/|\s|$)/g) || [];
  return [...new Set(found.map((s) => s.trim()))];
}
// Tự xuống dòng khi có link dính nhau
function autoBreak() {
  const ta = $('links');
  const fixed = ta.value.replace(/(\S)(?=https?:\/\/)/g, '$1\n');
  if (fixed !== ta.value) {
    ta.value = fixed;
    ta.selectionStart = ta.selectionEnd = fixed.length;
  }
}
function updateCounter() {
  $('counter').textContent = `Entered ${parseLinks().length} links`;
}
$('links').addEventListener('input', () => {
  autoBreak();
  updateCounter();
});
$('links').addEventListener('paste', () =>
  setTimeout(() => {
    autoBreak();
    updateCounter();
  }, 0)
);
$('clear').onclick = () => {
  $('links').value = '';
  $('grid').innerHTML = '';
  $('progress').textContent = '';
  $('fbAll').style.display = 'none';
  $('bulk').style.display = 'none';
  results = [];
  updateCounter();
};

const abs = (u) =>
  !u ? '' : u.startsWith('/') ? 'https://www.tikwm.com' + u : u;

async function fetchInfo(url) {
  const r = await fetch(`${API}?url=${encodeURIComponent(url)}&hd=1`);
  const j = await r.json();
  if (j.code !== 0 || !j.data) throw new Error(j.msg || 'Không lấy được video');
  const d = j.data;
  return {
    id: d.id,
    title: d.title || 'TikTok video',
    cover: abs(d.cover),
    video: abs(d.hdplay || d.play),
    music: abs(d.music),
  };
}

async function saveFile(url, name) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    // Fallback nếu bị chặn CORS: mở link trực tiếp
    window.open(url, '_blank');
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback cho trình duyệt cũ / không hỗ trợ Clipboard API
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {}
    ta.remove();
    return ok;
  }
}

// ===== Facebook =====
const FB_VER = 'v21.0';
const fbCfg = () => ({
  page: localStorage.getItem('fbPage') || '',
  token: localStorage.getItem('fbToken') || '',
});
function showFbCfg() {
  const c = fbCfg();
  $('fbPage').value = c.page;
  $('fbToken').value = c.token;
  $('fbAppId').value = localStorage.getItem('fbAppId') || '';
  const keep = localStorage.getItem('fbSaveSecret') === '1';
  $('fbSaveSecret').checked = keep;
  if (keep) $('fbAppSecret').value = localStorage.getItem('fbAppSecret') || '';
  $('fbSaved').textContent =
    c.page && c.token ? '✅ Đã có thông tin Page' : 'Chưa cài đặt';
}
$('fbSave').onclick = () => {
  localStorage.setItem('fbPage', $('fbPage').value.trim());
  localStorage.setItem('fbToken', $('fbToken').value.trim());
  localStorage.setItem('fbAppId', $('fbAppId').value.trim());
  if ($('fbSaveSecret').checked) {
    localStorage.setItem('fbSaveSecret', '1');
    localStorage.setItem('fbAppSecret', $('fbAppSecret').value.trim());
  } else {
    localStorage.removeItem('fbSaveSecret');
    localStorage.removeItem('fbAppSecret');
  }
  showFbCfg();
};
$('fbForget').onclick = () => {
  ['fbPage', 'fbToken', 'fbAppSecret', 'fbSaveSecret'].forEach((k) =>
    localStorage.removeItem(k)
  );
  $('fbAppSecret').value = '';
  showFbCfg();
};
showFbCfg();

async function callFb(payload) {
  const { page, token } = fbCfg();
  let r, j;
  try {
    r = await fetch('/api/fb-post', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pageId: page, token, ...payload }),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    throw new Error('Không kết nối được máy chủ: ' + e.message);
  }
  if (!r.ok || !j.ok)
    throw new Error(
      j.error ||
        `Máy chủ trả lỗi HTTP ${r.status}` +
          (r.status >= 500
            ? ' (có thể video quá lớn hoặc quá lâu, hãy thử lại)'
            : '')
    );
  return j;
}

function needCfg() {
  const { page, token } = fbCfg();
  if (page && token) return;
  $('fbset').open = true;
  $('fbset').scrollIntoView({ behavior: 'smooth' });
  throw new Error(
    'Chưa nhập Page ID và token ở phần Cài đặt đăng Facebook Page (nhớ bấm Lưu).'
  );
}

async function postToFacebook(info, caption, status) {
  needCfg();
  // Hẹn giờ: Facebook yêu cầu từ 10 phút đến 6 tháng kể từ bây giờ
  let when = null;
  if (info.schEl && info.schEl.value) {
    when = new Date(info.schEl.value);
    const diff = when - Date.now();
    if (isNaN(when) || diff < 10 * 60000)
      throw new Error('Giờ hẹn phải sau thời điểm hiện tại ít nhất 10 phút.');
    if (diff > 180 * 86400000)
      throw new Error('Chỉ hẹn giờ được tối đa 6 tháng.');
  }
  // Link tiếp thị liên kết chỉ đi vào bình luận, không bao giờ vào nội dung bài
  const aff = (info.affEl && info.affEl.value.trim()) || '';
  let comments = info.cmtBox
    ? [...info.cmtBox.querySelectorAll('.cmt')].map((t) => t.value)
    : [];
  if (aff && !comments.some((c) => c.includes('{link}')))
    comments.unshift('{link}'); // có link mà chưa có chỗ chèn → thành bình luận đầu
  // Không có link thì bỏ các bình luận cần chèn link (tránh đăng bình luận thiếu link)
  comments = comments
    .filter((c) => aff || !c.includes('{link}'))
    .map((c) => c.split('{link}').join(aff).trim())
    .filter(Boolean);

  status(
    when
      ? '⏳ Đang tải video và gửi lên lịch Facebook (có thể mất 10–40 giây)...'
      : '⏳ Đang tải video và đăng lên Facebook (có thể mất 10–40 giây)...'
  );
  const j = await callFb({
    videoUrl: info.video,
    description: caption,
    scheduledTime: when ? Math.floor(when.getTime() / 1000) : 0,
    comments,
  });
  return {
    id: j.id,
    when,
    comments,
    total: comments.length,
    queued: j.queued || 0,
    dbError: j.dbError || '',
    blocked: !!j.cmtBlocked,
    warn: j.warn || '',
  };
}

$('fbCheck').onclick = async () => {
  $('fbSave').onclick();
  $('fbSaved').textContent = '⏳ Đang kiểm tra...';
  try {
    needCfg();
    const appId = $('fbAppId').value.trim(),
      appSecret = $('fbAppSecret').value.trim();
    const j = await callFb(
      appId && appSecret ? { check: true, appId, appSecret } : { check: true }
    );
    if (j.longToken) {
      localStorage.setItem('fbToken', j.longToken);
      $('fbToken').value = j.longToken;
      if (!$('fbSaveSecret').checked) $('fbAppSecret').value = '';
    }
    const exp =
      j.expiresAt === 0
        ? 'không hết hạn'
        : j.expiresAt > 0
          ? 'hết hạn lúc ' +
            new Date(j.expiresAt * 1000).toLocaleString('vi-VN')
          : '';
    $('fbSaved').textContent =
      `✅ Token dùng được cho Page: ${j.page}` +
      (exp ? ` (${exp})` : '') +
      (j.longToken ? ' — đã đổi sang token dài hạn' : '') +
      (j.warn ? `\n⚠ ${j.warn}` : '');
  } catch (e) {
    $('fbSaved').textContent = '❌ ' + e.message;
  }
};

$('fbAll').onclick = async () => {
  const todo = results.filter((r) => !r.posted && r.post);
  if (!todo.length) return;
  $('fbAll').disabled = true;
  let ok = 0;
  for (let i = 0; i < todo.length; i++) {
    $('fbAll').textContent = `📘 Đang đăng ${i + 1}/${todo.length}...`;
    if (await todo[i].post()) ok++;
    else if (!fbCfg().token) break;
    await sleep(2000);
  }
  $('fbAll').textContent =
    `📘 Đã xong ${ok}/${todo.length} — bấm để thử lại video lỗi`;
  $('fbAll').disabled = false;
};

// Đăng bình luận từ trình duyệt: thử lại liên tục tới khi Facebook xử lý xong video
async function runComments(info, note, retryBtn) {
  if (info.cmtRunning) return;
  info.cmtRunning = true;
  retryBtn.style.display = 'none';
  note.style.color = '#5f6368';
  const total = info.cmtTotal;
  const say = (t) => (note.textContent = t);
  const startAt = info.cmtStartAt || Date.now();
  while (Date.now() < startAt) {
    say(
      `💬 ${info.cmtLeft.length} bình luận sẽ đăng sau khi video lên sóng (${new Date(startAt).toLocaleTimeString('vi-VN')}). Có thể đóng trang, máy chủ sẽ tự đăng.`
    );
    await sleep(Math.min(30000, startAt - Date.now() + 500));
  }
  let tries = 0,
    last = '';
  while (tries < 40) {
    tries++;
    let j;
    try {
      const { page, token } = fbCfg();
      const res = await fetch('/api/fb-comment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          videoId: info.fbId,
          pageId: page,
          token,
          comments: info.cmtLeft,
          direct: !!info.cmtDirect,
        }),
      });
      j = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
    } catch (e) {
      j = { error: e.message };
    }
    if (j.leftList) info.cmtLeft = j.leftList;
    else if (typeof j.left === 'number')
      info.cmtLeft = info.cmtLeft.slice(info.cmtLeft.length - j.left);
    info.cmtDone += j.done || 0;
    if (typeof j.left === 'number' && j.left === 0) {
      say(
        `✅ Đã đăng ${info.cmtDone ? info.cmtDone + '/' + total : 'xong'} bình luận.`
      );
      note.style.color = '#188038';
      info.cmtRunning = false;
      return;
    }
    last = j.error || '';
    if (j.fatal) break;
    say(
      `⏳ ${j.notReady ? 'Facebook đang xử lý video' : 'Chưa bình luận được'} — đã đăng ${info.cmtDone}/${total}, thử lại lần ${tries}...` +
        (last && !j.notReady ? `\n(${last})` : '')
    );
    await sleep(j.notReady ? 20000 : 15000);
  }
  say(
    `❌ Chưa đăng được ${info.cmtLeft.length || ''} bình luận: ${last || 'hết thời gian chờ'}`
  );
  note.style.color = '#d93025';
  retryBtn.style.display = 'inline-block';
  info.cmtRunning = false;
}

// ===== Lên lịch / link hàng loạt =====
function toLocalInput(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
function resetBulk() {
  $('bStart').value = toLocalInput(new Date(Date.now() + 30 * 60000));
}
$('bApply').onclick = () => {
  const start = new Date($('bStart').value);
  const gap = Math.max(1, +$('bGap').value || 60);
  if (isNaN(start)) {
    alert('Hãy chọn thời gian bắt đầu.');
    return;
  }
  results
    .filter((r) => !r.posted && r.schEl)
    .forEach((r, i) => {
      r.schEl.value = toLocalInput(new Date(start.getTime() + i * gap * 60000));
      r.schEl.oninput();
    });
};
$('bClear').onclick = () =>
  results
    .filter((r) => !r.posted && r.schEl)
    .forEach((r) => {
      r.schEl.value = '';
      r.schEl.oninput();
    });

// Nối thêm nội dung (hashtag...) vào tiêu đề gốc
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
const composeCap = (title) => {
  const x = $('capSuffix').value.trim();
  if (!x) return title;
  let base = title.trim();
  if ($('capModeReplace').checked && /#[\p{L}\p{N}_]+/u.test(x)) {
    base = base.replace(HASHTAG_RE, ' ').replace(/\s+/g, ' ').trim(); // bỏ hashtag cũ
  }
  return base ? `${base} ${x}` : x;
};
$('capSuffix').value = localStorage.getItem('capSuffix') || '';
if (localStorage.getItem('capMode') === 'replace')
  $('capModeReplace').checked = true;
document.querySelectorAll('input[name="capMode"]').forEach((el) =>
  el.addEventListener('change', () => {
    localStorage.setItem(
      'capMode',
      $('capModeReplace').checked ? 'replace' : 'append'
    );
    refreshCaps();
  })
);
$('capSuffix').oninput = () => {
  localStorage.setItem('capSuffix', $('capSuffix').value);
  refreshCaps();
};
function refreshCaps() {
  results.forEach((r) => {
    if (r.posted || !r.capEl || r.capEl.value !== r.autoCap) return; // không ghi đè nội dung đã sửa tay
    r.capEl.value = r.autoCap = composeCap(r.title);
  });
}

function addCard(info) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="thumb"><video controls preload="none" poster="${info.cover}" src="${info.video}"></video></div>
    <div class="info">
      <div class="title"></div>
      <button class="copy" type="button">📋 Copy tiêu đề</button>
      <button class="dl" data-t="video">🎬 MP4 (no watermark)</button>
      <button class="dl" data-t="audio">🎵 Download MP3 audio</button>
      <textarea class="cap" placeholder="Nhập phụ đề / nội dung bài đăng Facebook..."></textarea>
      <button class="copy copy-new" type="button">📋 Copy tiêu đề đã thay thế</button>
      <label class="lbl">🛒 Link sản phẩm tiếp thị liên kết (chỉ đăng ở bình luận)</label>
      <input class="aff" type="url" placeholder="https://s.shopee.vn/...">
      <label class="lbl">💬 Bình luận tự động (dùng {link} để chèn link)</label>
      <div class="cmts"></div>
      <button class="add-cmt" type="button">＋ Thêm bình luận</button>
      <label class="lbl">⏰ Hẹn giờ đăng (để trống = đăng ngay)</label>
      <input class="sch" type="datetime-local">
      <button class="fb" type="button">📘 Đăng lên Facebook</button>
      <div class="fb-st"></div>
    </div>`;
  div.querySelector('.title').textContent = info.title;
  const cap = div.querySelector('.cap');
  info.capEl = cap;
  cap.value = info.autoCap = composeCap(info.title);
  const fbBtn = div.querySelector('.fb');
  const fbSt = div.querySelector('.fb-st');
  info.affEl = div.querySelector('.aff');
  info.schEl = div.querySelector('.sch');
  info.cmtBox = div.querySelector('.cmts');
  const addCmt = (v) => {
    const t = document.createElement('textarea');
    t.className = 'cmt';
    t.placeholder = `Bình luận ${info.cmtBox.children.length + 1}`;
    t.value = v || '';
    info.cmtBox.appendChild(t);
  };
  ['', '', ''].forEach(addCmt);
  div.querySelector('.add-cmt').onclick = () => {
    if (info.cmtBox.children.length < 10) addCmt('');
  };
  info.schEl.oninput = () => {
    if (!info.posted)
      fbBtn.textContent = info.schEl.value
        ? '⏰ Lên lịch đăng Facebook'
        : '📘 Đăng lên Facebook';
  };
  info.post = async () => {
    if (info.posted) return true;
    fbBtn.disabled = true;
    fbSt.className = 'fb-st';
    try {
      const r = await postToFacebook(
        info,
        cap.value.trim(),
        (m) => (fbSt.textContent = m)
      );
      info.posted = true;
      fbSt.className = 'fb-st ok';
      const link = `<a target="_blank" rel="noopener" href="https://www.facebook.com/${encodeURIComponent(r.id)}">Xem video</a>`;
      fbSt.innerHTML = r.when
        ? `✅ Đã lên lịch lúc ${r.when.toLocaleString('vi-VN')}. Xem/sửa trong mục Nội dung đã lên lịch của Page.`
        : `✅ Đã đăng! ${link} (Facebook có thể cần vài phút để xử lý)`;
      const note = document.createElement('div');
      note.style.whiteSpace = 'pre-line';
      const retry = document.createElement('button');
      retry.className = 'add-cmt';
      retry.type = 'button';
      retry.textContent = '🔁 Thử đăng bình luận lại';
      retry.style.display = 'none';
      if (!r.total)
        note.textContent =
          '💬 Không có bình luận nào để đăng (ô bình luận trống / chưa nhập link).';
      fbSt.appendChild(note);
      fbSt.appendChild(retry);
      if (r.warn) {
        const w = document.createElement('div');
        w.style.color = '#b06000';
        w.textContent = '⚠ ' + r.warn;
        fbSt.appendChild(w);
      }
      fbBtn.textContent = r.when ? '✅ Đã lên lịch' : '✅ Đã đăng';
      info.affEl.disabled = info.schEl.disabled = cap.disabled = true;
      info.cmtBox.querySelectorAll('.cmt').forEach((t) => (t.disabled = true));
      div.querySelector('.add-cmt').style.display = 'none';
      if (r.total && !r.blocked) {
        info.fbId = r.id;
        info.cmtLeft = r.comments;
        info.cmtDirect = !!r.dbError;
        info.cmtTotal = r.total;
        info.cmtDone = 0;
        info.cmtStartAt = r.when
          ? r.when.getTime() + 60000
          : Date.now() + 10000;
        retry.onclick = () => {
          info.cmtStartAt = 0;
          runComments(info, note, retry);
        };
        runComments(info, note, retry);
      }
      return true;
    } catch (e) {
      fbSt.className = 'fb-st bad';
      fbSt.textContent = '❌ ' + e.message;
      fbBtn.disabled = false;
      return false;
    }
  };
  fbBtn.onclick = () => info.post();
  // Gắn nút copy: getText() trả về nội dung cần copy tại thời điểm bấm
  const bindCopy = (btn, label, getText) => {
    btn.onclick = async () => {
      const ok = await copyText(getText());
      btn.textContent = ok ? '✅ Đã copy' : '❌ Không copy được';
      btn.classList.toggle('ok', ok);
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.textContent = label;
        btn.classList.remove('ok');
      }, 1500);
    };
  };
  bindCopy(
    div.querySelector('.copy:not(.copy-new)'),
    '📋 Copy tiêu đề',
    () => info.title
  );
  bindCopy(div.querySelector('.copy-new'), '📋 Copy tiêu đề đã thay thế', () =>
    composeCap(info.title)
  );
  const base = 'tiktok_' + (info.id || Date.now());
  div.querySelector('[data-t="video"]').onclick = () =>
    saveFile(info.video, base + '.mp4');
  div.querySelector('[data-t="audio"]').onclick = () =>
    saveFile(info.music, base + '.mp3');
  $('grid').appendChild(div);
}

function addError(url, msg) {
  const div = document.createElement('div');
  div.className = 'card err';
  div.innerHTML = `<div class="msg"></div>`;
  div.querySelector('.msg').textContent = `Lỗi: ${msg}\n${url}`;
  $('grid').appendChild(div);
}

$('go').onclick = async () => {
  autoBreak();
  updateCounter();
  const links = parseLinks();
  if (!links.length) {
    $('progress').textContent = 'Hãy dán ít nhất 1 link TikTok.';
    return;
  }
  $('go').disabled = true;
  $('grid').innerHTML = '';
  results = [];
  $('fbAll').style.display = 'none';
  $('bulk').style.display = 'none';

  for (let i = 0; i < links.length; i++) {
    $('progress').textContent = `Đang xử lý ${i + 1}/${links.length}...`;
    try {
      const info = await fetchInfo(links[i]);
      results.push(info);
      addCard(info);
    } catch (e) {
      addError(links[i], e.message);
    }
    await sleep(1200); // API miễn phí giới hạn ~1 request/giây
  }

  $('progress').textContent = `Xong: ${results.length}/${links.length} video.`;
  $('go').disabled = false;
  if (results.length) {
    $('bulk').style.display = 'block';
    resetBulk();
    $('fbAll').style.display = 'block';
    $('fbAll').textContent = '📘 Đăng / lên lịch tất cả lên Facebook';
  }
};
// ===== Văn bản / link lưu sẵn =====
const NOTES_KEY = 'savedNotes';
const loadNotes = () => {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY)) || [];
  } catch (e) {
    return [];
  }
};
const storeNotes = (arr) =>
  localStorage.setItem(NOTES_KEY, JSON.stringify(arr));

function renderNotes() {
  const list = $('noteList');
  list.innerHTML = '';
  loadNotes().forEach((text, i) => {
    const item = document.createElement('div');
    item.className = 'note-item';

    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = text;

    const acts = document.createElement('div');
    acts.className = 'acts';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy';
    copyBtn.textContent = '📋 Copy';
    copyBtn.onclick = async () => {
      const ok = await copyText(text);
      copyBtn.textContent = ok ? '✅ Đã copy' : '❌ Không copy được';
      copyBtn.classList.toggle('ok', ok);
      clearTimeout(copyBtn._t);
      copyBtn._t = setTimeout(() => {
        copyBtn.textContent = '📋 Copy';
        copyBtn.classList.remove('ok');
      }, 1500);
    };

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'note-del';
    delBtn.textContent = '🗑 Xoá';
    delBtn.onclick = () => {
      const arr = loadNotes();
      arr.splice(i, 1);
      storeNotes(arr);
      renderNotes();
    };

    acts.append(copyBtn, delBtn);
    item.append(txt, acts);
    list.appendChild(item);
  });
}

$('noteSave').onclick = () => {
  const v = $('noteInput').value.trim();
  if (!v) return;
  const arr = loadNotes();
  arr.push(v);
  storeNotes(arr);
  $('noteInput').value = '';
  renderNotes();
};

renderNotes();
// Bật/tắt bảng nổi
const togglePanel = (force) => {
  const p = $('notePanel');
  const open =
    typeof force === 'boolean' ? force : !p.classList.contains('open');
  p.classList.toggle('open', open);
  $('noteFab').textContent = open ? '✕' : '📌';
};
$('noteFab').onclick = () => togglePanel();
$('noteClose').onclick = () => togglePanel(false);
// ===== Sao lưu / khôi phục =====
// Cố ý KHÔNG đưa App Secret vào file sao lưu để an toàn hơn
const BACKUP_KEYS = [
  'savedNotes',
  'fbPage',
  'fbToken',
  'fbAppId',
  'capSuffix',
  'capMode',
];
const bkSay = (t, ok = true) => {
  $('bkMsg').textContent = t;
  $('bkMsg').style.color = ok ? '#188038' : '#d93025';
};

$('bkExport').onclick = () => {
  const data = {};
  BACKUP_KEYS.forEach((k) => {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  });
  const payload = {
    app: 'tiktok-bulk',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tiktok-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  bkSay('✅ Đã xuất file. Hãy cất file ở nơi an toàn (có chứa token).');
};

$('bkImport').onclick = () => $('bkFile').click();

$('bkFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || typeof j.data !== 'object' || !j.data) throw new Error();
    if (j.data.savedNotes) {
      const n = JSON.parse(j.data.savedNotes);
      if (!Array.isArray(n)) throw new Error();
    }
    if (!confirm('Nhập file sẽ ghi đè ghi chú và cài đặt hiện tại. Tiếp tục?'))
      return;

    BACKUP_KEYS.forEach((k) => {
      if (typeof j.data[k] === 'string') localStorage.setItem(k, j.data[k]);
    });
    // Cập nhật lại giao diện
    renderNotes();
    showFbCfg();
    $('capSuffix').value = localStorage.getItem('capSuffix') || '';
    $('capModeReplace').checked = localStorage.getItem('capMode') === 'replace';
    $('capModeAppend').checked = !$('capModeReplace').checked;
    refreshCaps();
    bkSay('✅ Đã nhập xong.');
  } catch (err) {
    bkSay('❌ File không hợp lệ.', false);
  } finally {
    e.target.value = ''; // cho phép chọn lại cùng một file
  }
};

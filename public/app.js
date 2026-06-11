const app = document.querySelector("#app");
const CANONICAL_HOST = "future-bidding-war-game.vercel.app";

const state = {
  templates: [],
  room: null,
  playerId: localStorage.getItem("fbwPlayerId") || "",
  role: new URLSearchParams(location.search).get("role") || "",
  code: new URLSearchParams(location.search).get("room") || "",
  events: null,
  poller: null,
  error: "",
  staleRoom: false,
  pollFailures: 0,
  tick: Date.now()
};

function canonicalOrigin() {
  if (location.hostname.endsWith(".vercel.app")) return `https://${CANONICAL_HOST}`;
  return location.origin;
}

function redirectPreviewDeployment() {
  const isVercel = location.hostname.endsWith(".vercel.app");
  const isCanonical = location.hostname === CANONICAL_HOST;
  if (!isVercel || isCanonical) return false;
  location.replace(`${canonicalOrigin()}${location.pathname}${location.search}${location.hash}`);
  return true;
}

setInterval(() => {
  state.tick = Date.now();
  if (state.room?.status === "bidding") render();
}, 1000);

function money(value) {
  return `${Number(value || 0).toLocaleString("th-TH")} เหรียญ`;
}

function html(strings, ...values) {
  return strings.reduce((out, string, index) => out + string + (values[index] ?? ""), "");
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "เกิดข้อผิดพลาด");
    error.status = response.status;
    throw error;
  }
  return data;
}

function connect(code) {
  disconnect();
  state.staleRoom = false;
  state.pollFailures = 0;
  pollRoom(code);
  state.poller = setInterval(() => pollRoom(code), 1200);
  const canUseEvents = window.EventSource && ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!canUseEvents) return;
  state.events = new EventSource(`/events/${code}`);
  state.events.onmessage = event => {
    state.room = JSON.parse(event.data);
    state.error = "";
    render();
  };
  state.events.onerror = () => {
    state.events?.close();
    state.events = null;
  };
}

function disconnect() {
  if (state.events) state.events.close();
  if (state.poller) clearInterval(state.poller);
  state.events = null;
  state.poller = null;
}

function stopPolling() {
  if (state.poller) clearInterval(state.poller);
  state.poller = null;
  if (state.events) state.events.close();
  state.events = null;
}

function markRoomMissing(code) {
  stopPolling();
  state.staleRoom = true;
  state.error = `ห้อง ${code} ไม่อยู่บน server แล้ว อาจเป็น deploy เก่าหรือ storage ยังไม่ต่อ Redis/KV ให้สร้างห้องใหม่จากโดเมน production แล้วเช็ค /api/health ว่า storage เป็น redis`;
  render();
}

async function pollRoom(code = state.code) {
  if (!code) return;
  try {
    state.room = await api(`/api/rooms/${code}`);
    cacheRoom(state.room);
    state.error = "";
    state.staleRoom = false;
    state.pollFailures = 0;
    render();
  } catch (error) {
    if (state.room?.code === code) {
      state.pollFailures += 1;
      if (error.status === 404 || state.pollFailures >= 3) {
        markRoomMissing(code);
        return;
      }
      state.error = "";
      return;
    }
    state.error = error.message;
    render();
  }
}

function updateUrl(role, code) {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (code) params.set("room", code);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

function player() {
  return state.room?.players.find(item => item.id === state.playerId);
}

function cacheRoom(room) {
  if (!room?.code) return;
  localStorage.setItem(`fbwRoom:${room.code}`, JSON.stringify(room));
}

function cachedRoom(code) {
  try {
    const value = localStorage.getItem(`fbwRoom:${code}`);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function topBids() {
  const seen = new Set();
  return (state.room?.bids || [])
    .slice()
    .sort((a, b) => b.amount - a.amount || a.createdAt - b.createdAt)
    .filter(bid => {
      if (seen.has(bid.playerId)) return false;
      seen.add(bid.playerId);
      return true;
    });
}

function isWinningBid(bid, index, item) {
  if (index < item.slots) return true;
  const cutoff = topBids()[item.slots - 1]?.amount;
  return Boolean(cutoff && cutoff >= state.room.settings.startingMoney && bid.amount === cutoff);
}

function secondsLeft() {
  if (!state.room?.endsAt) return 0;
  return Math.max(0, Math.ceil((state.room.endsAt - state.tick) / 1000));
}

function bidStep(room = state.room) {
  const base = Number(room?.settings?.startingMoney || 100);
  if (base >= 1_000_000) return 10_000;
  if (base >= 100_000) return 1_000;
  if (base >= 10_000) return 500;
  if (base >= 1_000) return 100;
  if (base >= 200) return 10;
  return 1;
}

function roundUpToStep(value, step) {
  return Math.ceil(value / step) * step;
}

function nextBidAmount(current, leading, me) {
  const step = bidStep();
  const threshold = leading.length >= current.slots ? leading[current.slots - 1].amount + step : current.startPrice;
  return Math.min(me.money, Math.max(current.startPrice, roundUpToStep(threshold, step)));
}

function persona(wins) {
  if (!wins.length) return "สายใจเย็น: วันนี้ไม่รีบซื้ออนาคต ขอเก็บเงินไว้ก่อน";
  const text = wins.map(win => `${win.title} ${win.category}`).join(" ");
  if (/รัก|แฟน|โสด|เพื่อน/.test(text)) return "สายหัวใจมีแผน: bid ด้วยใจ แต่ยังต้องคุมงบ";
  if (/เงิน|รถ|บัญชี|รายได้/.test(text)) return "สายรวยไว้ก่อน: ไม่ได้งก แค่คิดไกล";
  if (/เรียน|ทักษะ|อังกฤษ|วินัย/.test(text)) return "สายอัปสกิล: ลงทุนกับตัวเองแบบจริงจัง";
  if (/ใจ|ตัวตน|สมดุล|สุขภาพ/.test(text)) return "สายชีวิตต้องไม่พัง: ชนะด้วยความสบายใจ";
  return "สายเลือกเป็น: อนาคตไม่ได้มีทางเดียว";
}

function renderShell(content) {
  app.innerHTML = html`
    <section class="hero">
      <div>
        <p class="eyebrow">Guidance Auction Game</p>
        <h1>ประมูลอนาคต</h1>
        <p class="lead">ฮาได้ คิดได้ ให้นักเรียน bid สิ่งที่อยากมีในชีวิต แล้วคุยต่อว่าเราให้คุณค่ากับอะไร</p>
      </div>
      <div class="ticket">
        <span>เงินเท่ากัน</span>
        <strong>แต่ใจไม่เท่ากัน</strong>
      </div>
    </section>
    ${state.error ? `<div class="toast">${escapeText(state.error)}</div>` : ""}
    ${content}
  `;
}

function renderHome() {
  renderShell(html`
    <section class="choice-grid">
      <button class="role-card teacher" data-action="teacher">
        <span>ครู</span>
        <strong>สร้างห้องประมูล</strong>
        <small>เลือก template, ปรับรายการ, คุมรอบ และดูผลรวม</small>
      </button>
      <button class="role-card student" data-action="student">
        <span>นักเรียน</span>
        <strong>เข้าห้องด้วยรหัส</strong>
        <small>รับเงินเท่ากัน แล้ว bid อนาคตที่ใช่</small>
      </button>
    </section>
  `);
}

function renderTeacherSetup() {
  const template = state.templates[0];
  renderShell(html`
    <form class="panel setup" id="createRoom">
      <div class="section-head">
        <div>
          <p class="eyebrow">Teacher Console</p>
          <h2>ตั้งค่าห้อง</h2>
        </div>
        <button type="button" class="ghost" data-action="home">กลับ</button>
      </div>

      <label>ชื่อกิจกรรม
        <input name="title" value="ประมูลอนาคต ม.${new Date().getFullYear() + 543}">
      </label>

      <div class="two-cols">
        <label>Template
          <select name="templateId" id="templateId">
            ${state.templates.map(item => `<option value="${item.id}">${escapeText(item.name)}</option>`).join("")}
          </select>
        </label>
        <label>ชื่อครู
          <input name="teacherName" value="ครูแนะแนว">
        </label>
      </div>

      <div class="two-cols">
        <label>เงินเริ่มต้นต่อคน
          <input name="startingMoney" type="number" min="20" value="${template?.startingMoney || 100}">
        </label>
        <label>เวลาต่อรอบ (วินาที)
          <input name="roundSeconds" type="number" min="10" value="${template?.roundSeconds || 30}">
        </label>
      </div>

      <label class="checkline">
        <input name="anonymousBids" type="checkbox">
        <span>ซ่อนชื่อระหว่าง bid สด ให้เด็กเลือกตามใจตัวเองมากขึ้น</span>
      </label>

      <div class="items-editor">
        <div class="section-head compact">
          <h3>รายการประมูล</h3>
          <button type="button" class="ghost" data-action="add-item">เพิ่มรายการ</button>
        </div>
        <div class="item-row item-head" aria-hidden="true">
          <span>รายการอนาคต</span>
          <span>หมวด</span>
          <span>ผู้ชนะ</span>
          <span>เริ่ม bid</span>
          <span></span>
        </div>
        <div id="itemsRows"></div>
      </div>

      <button class="primary" type="submit">สร้างห้อง</button>
    </form>
  `);
  fillItems(template?.items || []);
}

function fillItems(items) {
  const rows = document.querySelector("#itemsRows");
  rows.innerHTML = items.map((item, index) => itemRow(item, index)).join("");
}

function itemRow(item = {}, index = 0) {
  return html`
    <div class="item-row">
      <input class="item-title" placeholder="อนาคตที่อยากประมูล" value="${escapeText(item.title || "")}">
      <input class="item-category" placeholder="หมวด" value="${escapeText(item.category || "อนาคต")}">
      <input class="item-slots" type="number" min="1" value="${item.slots || 1}" title="จำนวนผู้ชนะ" aria-label="จำนวนผู้ชนะ">
      <input class="item-price" type="number" min="1" value="${item.startPrice || 5}" title="ราคาเริ่มต้น" aria-label="ราคาเริ่มต้น">
      <button type="button" class="mini danger" data-remove="${index}">ลบ</button>
    </div>
  `;
}

function collectItems() {
  return [...document.querySelectorAll("#itemsRows .item-row")]
    .map(row => ({
      title: row.querySelector(".item-title").value.trim(),
      category: row.querySelector(".item-category").value.trim() || "อนาคต",
      slots: Number(row.querySelector(".item-slots").value || 1),
      startPrice: Number(row.querySelector(".item-price").value || 1)
    }))
    .filter(item => item.title);
}

function renderStudentJoin() {
  renderShell(html`
    <form class="panel join" id="joinRoom">
      <div class="section-head">
        <div>
          <p class="eyebrow">Student Bidder</p>
          <h2>เข้าห้องประมูล</h2>
        </div>
        <button type="button" class="ghost" data-action="home">กลับ</button>
      </div>
      <label>รหัสห้อง
        <input name="code" maxlength="5" value="${escapeText(state.code)}" placeholder="เช่น A7K2Q">
      </label>
      <label>ชื่อเล่น
        <input name="name" maxlength="30" placeholder="ใส่ชื่อที่ครูเรียกได้">
      </label>
      <button class="primary" type="submit">เข้าร่วม</button>
    </form>
  `);
}

function renderRoom() {
  if (!state.room) return renderHome();
  if (state.staleRoom) return renderStaleRoom();
  const isTeacher = state.role === "teacher";
  const room = state.room;
  const current = room.currentItem;
  const me = player();
  const bids = topBids();
  const joinUrl = `${canonicalOrigin()}${location.pathname}?role=student&room=${room.code}`;
  const stage = roomStageView(isTeacher, current, bids, me);

  if (!isTeacher) {
    renderShell(html`
      <section class="student-play">
        <div class="student-topbar">
          <span>${escapeText(room.settings.title)}</span>
          <strong>${me ? money(me.money) : "ยังไม่ได้เข้าร่วม"}</strong>
        </div>
        ${stage}
      </section>
    `);
    return;
  }

  renderShell(html`
    <section class="host-layout">
      <header class="host-header">
        <div class="code-box host-code">
          <span>รหัสห้อง</span>
          <strong>${room.code}</strong>
          <small>${escapeText(joinUrl)}</small>
        </div>
        <div class="host-summary">
          <p class="eyebrow">Host Console</p>
          <h2>${escapeText(room.settings.title)}</h2>
          <p>${room.players.length} ผู้เล่น • ${room.history.length}/${room.items.length} รายการจบแล้ว</p>
        </div>
      </header>

      ${teacherControlBar(true)}

      <section class="host-stage-grid">
        <section class="auction">
          ${stage}
        </section>

        <aside class="host-panel players-panel">
          <div class="section-head compact">
            <h3>ผู้เล่น ${room.players.length} คน</h3>
          </div>
          ${room.players.map(item => `
            <div class="player">
              <span>${escapeText(item.name)}</span>
              <strong>${money(item.money)}</strong>
            </div>
          `).join("") || `<p class="muted">รอนักเรียนเข้าห้อง</p>`}
        </aside>
      </section>

      <section class="host-panel history-panel">
        <h3>ผลที่ผ่านมา</h3>
        <div class="history-strip">
          ${room.history.map(entry => `
            <div class="history-item">
              <strong>${escapeText(entry.item.title)}</strong>
              <small>${entry.winners.length ? entry.winners.map(win => `${escapeText(win.name)} ${money(win.amount)}`).join(" / ") : "ไม่มีผู้ bid"}</small>
            </div>
          `).join("") || `<p class="muted">ยังไม่มีรอบที่จบ</p>`}
        </div>
      </section>
    </section>
  `);
}

function renderStaleRoom() {
  const code = state.room?.code || state.code;
  renderShell(html`
    <section class="stage lobby-stage">
      <p class="eyebrow">Room Lost</p>
      <h2>ห้อง ${escapeText(code)} ไม่อยู่บน server แล้ว</h2>
      <p>หน้าเว็บหยุดต่อห้องนี้ให้แล้ว เพื่อไม่ให้ยิง API 404 ซ้ำ ๆ ถ้าเพิ่ง deploy หรือเพิ่งต่อ Upstash ให้เช็ค <code>/api/health</code> ว่า storage เป็น redis ก่อน แล้วสร้างห้องใหม่</p>
      <div class="action-row">
        ${state.role === "teacher" ? `<button class="primary" data-action="teacher">สร้างห้องใหม่</button>` : `<button class="primary" data-action="student">เข้าห้องใหม่</button>`}
        <button class="ghost" data-action="home">กลับหน้าแรก</button>
      </div>
    </section>
  `);
}

function roomStageView(isTeacher, current, bids, me) {
  const room = state.room;
  return html`
    ${room.status === "lobby" ? lobbyView(isTeacher) : ""}
    ${room.status === "round-ended" ? roundEndedView(isTeacher) : ""}
    ${room.status === "bidding" ? biddingView(isTeacher, current, bids, me) : ""}
    ${room.status === "paused" ? pausedView(isTeacher, current, bids, me) : ""}
    ${room.status === "finished" ? resultsView(isTeacher) : ""}
    ${room.status === "closed" ? closedView() : ""}
  `;
}

function teacherControlBar(isTeacher) {
  if (!isTeacher || !state.room || state.room.status === "finished" || state.room.status === "closed") return "";
  const status = state.room.status;
  return html`
    <div class="teacher-controls">
      ${status === "bidding" ? `<button class="ghost" data-action="pause-game">หยุดเกม</button>` : ""}
      ${status === "paused" ? `<button class="ghost" data-action="resume-game">เล่นต่อ</button>` : ""}
      ${(status === "bidding" || status === "paused") ? `<button class="ghost" data-action="finish-round">ปิดประมูลรอบนี้</button>` : ""}
      <button class="ghost danger" data-action="close-room">ปิดห้อง</button>
    </div>
  `;
}

function lobbyView(isTeacher) {
  return html`
    <div class="stage lobby-stage">
      <p class="eyebrow">${isTeacher ? "Lobby" : `Room ${escapeText(state.room.code)}`}</p>
      <h2>${escapeText(state.room.settings.title)}</h2>
      <p>${isTeacher ? "ให้นักเรียนสแกนหรือกรอกรหัสห้อง แล้วครูกดเริ่มเกมเมื่อพร้อม" : "เข้าห้องแล้ว รอครูเริ่มเกม"}</p>
      ${isTeacher ? `<button class="primary" data-action="start-game">เริ่มเกม</button>` : `<div class="waiting">รอเริ่ม</div>`}
    </div>
  `;
}

function roundEndedView(isTeacher) {
  const next = state.room.items[state.room.currentIndex + 1];
  return html`
    <div class="stage next-stage">
      <p class="eyebrow">Next Lot</p>
      <h2>${next ? (isTeacher ? escapeText(next.title) : "รอรายการถัดไป") : "ครบทุกอนาคตแล้ว"}</h2>
      <p>${next ? (isTeacher ? `หมวด ${escapeText(next.category)} • ชนะได้ ${next.slots} คน • เริ่ม ${money(next.startPrice)}` : "ครูกำลังเตรียมเปิดประมูล") : "รอดูผลสรุป"}</p>
      ${isTeacher && next ? `<button class="primary" data-action="next-round">เปิดประมูลรายการนี้</button>` : ""}
      ${!isTeacher && next ? `<div class="waiting">รอครูเปิดรายการถัดไป</div>` : ""}
    </div>
  `;
}

function biddingView(isTeacher, current, bids, me) {
  const leading = bids.slice(0, current.slots);
  return html`
    <div class="stage bid-stage">
      <div class="timer">${secondsLeft()}s</div>
      <p class="eyebrow">${escapeText(current.category)} • ${current.slots} winner${current.slots > 1 ? "s" : ""}</p>
      <h2>${escapeText(current.title)}</h2>
      <p>ราคาเริ่ม ${money(current.startPrice)} • ถ้า all-in เต็มจำนวนเท่ากัน จะชนะร่วม</p>

      ${isTeacher ? `<div class="leaderboard">
        <h3>อันดับ bid ตอนนี้</h3>
        ${bids.map((bid, index) => `
          <div class="bid ${isWinningBid(bid, index, current) ? "winning" : ""}">
            <span>${index + 1}. ${state.room.settings.anonymousBids && !isTeacher ? "ผู้กล้าปริศนา" : escapeText(bid.playerName)}</span>
            <strong>${money(bid.amount)}</strong>
          </div>
        `).join("") || `<p class="muted">ยังไม่มีใคร bid เป็นคนแรกไหม</p>`}
      </div>` : studentBidStatus(bids, current, me)}

      ${!isTeacher && me ? studentBidForm(me, current, leading) : ""}
    </div>
  `;
}

function studentBidStatus(bids, current, me) {
  const top = bids[0];
  const mine = bids.find(bid => bid.playerId === me?.id);
  return html`
    <div class="student-status">
      <span>ราคานำตอนนี้</span>
      <strong>${top ? money(top.amount) : money(current.startPrice)}</strong>
      <small>${mine ? `bid ล่าสุดของฉัน ${money(mine.amount)}` : "ยังไม่ได้ bid รายการนี้"}</small>
    </div>
  `;
}

function studentBidForm(me, current, leading) {
  const step = bidStep();
  const suggested = nextBidAmount(current, leading, me);
  const options = [suggested, suggested + step, suggested + (step * 3), suggested + (step * 10)]
    .filter(amount => amount <= me.money)
    .filter((amount, index, list) => list.indexOf(amount) === index);
  return html`
    <div class="bid-form">
      <div>
        <span>เงินของฉัน</span>
        <strong>${money(me.money)}</strong>
      </div>
      <div>
        <span>เพิ่มทีละ</span>
        <strong>${money(step)}</strong>
      </div>
      <div class="bid-buttons">
        ${options.map((amount, index) => `
          <button class="${index === 0 ? "primary" : "ghost"}" type="button" data-bid-amount="${amount}" ${me.money < current.startPrice ? "disabled" : ""}>
            Bid ${money(amount)}
          </button>
        `).join("")}
        ${me.money >= current.startPrice ? `<button class="ghost" type="button" data-bid-amount="${me.money}">หมดหน้าตัก</button>` : ""}
      </div>
    </div>
  `;
}

function pausedView(isTeacher, current, bids, me) {
  const leading = bids.slice(0, current.slots);
  return html`
    <div class="stage bid-stage paused-stage">
      <div class="timer pause-timer">พัก</div>
      <p class="eyebrow">${escapeText(current.category)} • หยุดเกมชั่วคราว</p>
      <h2>${escapeText(current.title)}</h2>
      <p>${isTeacher ? "กดเล่นต่อเพื่อให้เวลาวิ่งต่อจากจุดเดิม" : "ครูหยุดเกมไว้ชั่วคราว รอครูกดเล่นต่อ"}</p>

      ${isTeacher ? `<div class="leaderboard">
        <h3>อันดับ bid ตอนนี้</h3>
        ${bids.map((bid, index) => `
          <div class="bid ${isWinningBid(bid, index, current) ? "winning" : ""}">
            <span>${index + 1}. ${state.room.settings.anonymousBids && !isTeacher ? "ผู้กล้าปริศนา" : escapeText(bid.playerName)}</span>
            <strong>${money(bid.amount)}</strong>
          </div>
        `).join("") || `<p class="muted">ยังไม่มีใคร bid</p>`}
      </div>` : studentBidStatus(bids, current, me)}

      ${!isTeacher && me ? `<div class="waiting">หยุดเกมอยู่ ยัง bid ไม่ได้</div>` : ""}
    </div>
  `;
}

function closedView() {
  return html`
    <div class="stage lobby-stage">
      <p class="eyebrow">Closed</p>
      <h2>ห้องนี้ปิดแล้ว</h2>
      <p>ครูปิดห้องกิจกรรมแล้ว นักเรียนจะเข้าร่วมหรือ bid ต่อไม่ได้</p>
      ${state.role === "teacher" ? `<button class="ghost" data-action="teacher">สร้างห้องใหม่</button>` : `<div class="waiting">กิจกรรมจบแล้ว</div>`}
    </div>
  `;
}

function resultsView(isTeacher) {
  const sorted = state.room.players.slice().sort((a, b) => b.wins.length - a.wins.length || b.money - a.money);
  return html`
    <div class="stage results-stage">
      <p class="eyebrow">Reflection Time</p>
      <h2>สรุปอนาคตที่แต่ละคนซื้อกลับบ้าน</h2>
      <div class="results-list">
        ${sorted.map(item => `
          <article class="result-card">
            <div>
              <h3>${escapeText(item.name)}</h3>
              <p>${escapeText(persona(item.wins))}</p>
            </div>
            <strong>${money(item.money)} เหลือ</strong>
            <ul>
              ${item.wins.map(win => `<li>${escapeText(win.title)} <span>${money(win.amount)}</span></li>`).join("") || "<li>ไม่ได้ซื้ออะไร แต่เงินครบมาก</li>"}
            </ul>
          </article>
        `).join("")}
      </div>
      <div class="reflection">
        <h3>คำถามชวนคุย</h3>
        <p>รายการไหนที่ยอมทุ่มที่สุด เพราะอะไร?</p>
        <p>มีอะไรที่อยากได้แต่ไม่ได้ไหม แล้วในชีวิตจริงต้นทุนของมันคืออะไร?</p>
        <p>เรา bid ตามใจตัวเอง หรือตามแรงเชียร์ของเพื่อน?</p>
      </div>
      ${isTeacher ? `<button class="ghost" data-action="teacher">สร้างห้องใหม่</button>` : ""}
    </div>
  `;
}

function render() {
  if (!state.role) return renderHome();
  if (state.role === "teacher" && !state.room) return renderTeacherSetup();
  if (state.role === "student" && !state.room) return renderStudentJoin();
  renderRoom();
}

document.addEventListener("click", async event => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.remove) {
    target.closest(".item-row").remove();
    return;
  }
  if (target.dataset.bidAmount) {
    try {
      await api(`/api/rooms/${state.room.code}/bid`, {
        method: "POST",
        body: { playerId: state.playerId, amount: Number(target.dataset.bidAmount) }
      });
    } catch (error) {
      state.error = error.message;
      render();
    }
    return;
  }
  const action = target.dataset.action;
  if (!action) return;

  try {
    if (action === "home") {
      disconnect();
      state.role = "";
      state.room = null;
      state.code = "";
      updateUrl("", "");
      render();
    }
    if (action === "teacher") {
      state.role = "teacher";
      state.room = null;
      updateUrl("teacher", "");
      render();
    }
    if (action === "student") {
      state.role = "student";
      state.room = null;
      updateUrl("student", state.code);
      render();
    }
    if (action === "add-item") {
      document.querySelector("#itemsRows").insertAdjacentHTML("beforeend", itemRow({ title: "", category: "อนาคต", slots: 1, startPrice: 5 }));
    }
    if (action === "start-game") {
      await api(`/api/rooms/${state.room.code}/start`, { method: "POST" });
    }
    if (action === "next-round") {
      await api(`/api/rooms/${state.room.code}/next`, { method: "POST" });
    }
    if (action === "finish-round") {
      await api(`/api/rooms/${state.room.code}/finish`, { method: "POST" });
    }
    if (action === "pause-game") {
      await api(`/api/rooms/${state.room.code}/pause`, { method: "POST" });
    }
    if (action === "resume-game") {
      await api(`/api/rooms/${state.room.code}/resume`, { method: "POST" });
    }
    if (action === "close-room") {
      if (confirm("ปิดห้องนี้เลยไหม? นักเรียนจะเข้าร่วมหรือ bid ต่อไม่ได้")) {
        await api(`/api/rooms/${state.room.code}/close`, { method: "POST" });
      }
    }
  } catch (error) {
    state.error = error.message;
    render();
  }
});

document.addEventListener("change", event => {
  if (event.target.id === "templateId") {
    const selected = state.templates.find(item => item.id === event.target.value);
    document.querySelector("[name='startingMoney']").value = selected.startingMoney;
    document.querySelector("[name='roundSeconds']").value = selected.roundSeconds;
    fillItems(selected.items);
  }
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    if (event.target.id === "createRoom") {
      const form = new FormData(event.target);
      const selected = state.templates.find(item => item.id === form.get("templateId"));
      const room = await api("/api/rooms", {
        method: "POST",
        body: {
          title: form.get("title"),
          teacherName: form.get("teacherName"),
          templateId: form.get("templateId"),
          templateName: selected?.name,
          startingMoney: Number(form.get("startingMoney")),
          roundSeconds: Number(form.get("roundSeconds")),
          anonymousBids: form.has("anonymousBids"),
          items: collectItems()
        }
      });
      state.room = room;
      cacheRoom(room);
      state.code = room.code;
      updateUrl("teacher", room.code);
      connect(room.code);
    }

    if (event.target.id === "joinRoom") {
      const form = new FormData(event.target);
      const code = String(form.get("code") || "").trim().toUpperCase();
      const result = await api(`/api/rooms/${code}/join`, {
        method: "POST",
        body: { name: form.get("name") }
      });
      state.playerId = result.playerId;
      localStorage.setItem("fbwPlayerId", result.playerId);
      state.room = result.state;
      cacheRoom(result.state);
      state.code = code;
      updateUrl("student", code);
      connect(code);
    }
  } catch (error) {
    state.error = error.message;
    render();
  }
});

async function boot() {
  const data = await api("/api/templates");
  state.templates = data.templates;
  if (state.code && state.role) {
    const cached = cachedRoom(state.code);
    if (cached) state.room = cached;
    try {
      state.room = await api(`/api/rooms/${state.code}`);
      cacheRoom(state.room);
      connect(state.code);
    } catch {
      if (state.room) connect(state.code);
    }
  }
  render();
}

if (!redirectPreviewDeployment()) {
  boot().catch(error => {
    state.error = error.message;
    render();
  });
}

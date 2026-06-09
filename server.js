const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3010);
const PUBLIC_DIR = path.join(__dirname, "public");

const rooms = new Map();
const clients = new Map();

const templates = [
  {
    id: "chaos-dream",
    name: "อนาคตสายฮา: ฝันใหญ่ ใจต้องนิ่ง",
    tone: "ฮา / ละลายพฤติกรรม",
    startingMoney: 100,
    roundSeconds: 30,
    items: [
      { title: "มีเงินเข้าบัญชีแบบงง ๆ ทุกเดือน", category: "เงิน", slots: 1, startPrice: 10 },
      { title: "กินเท่าไรก็ไม่อ้วน แถมสุขภาพดี", category: "ชีวิต", slots: 1, startPrice: 8 },
      { title: "สอบติดแบบอ่านคืนเดียว แต่ยังจำได้จริง", category: "เรียน", slots: 1, startPrice: 12 },
      { title: "แม่ไม่บ่นเรื่องห้องรก 1 ปีเต็ม", category: "บ้าน", slots: 1, startPrice: 5 },
      { title: "พูดอังกฤษคล่องทันทีโดยไม่เขิน", category: "ทักษะ", slots: 1, startPrice: 10 },
      { title: "ได้เที่ยวฟรีทุกปิดเทอม", category: "ประสบการณ์", slots: 1, startPrice: 10 },
      { title: "ตื่นมาก็หน้าใส ผมเข้าทรงเอง", category: "ตัวตน", slots: 1, startPrice: 6 },
      { title: "มีรถขับ แต่ไม่ต้องเติมน้ำมันเอง", category: "สบาย", slots: 1, startPrice: 9 }
    ]
  },
  {
    id: "love-and-life",
    name: "ความรักและชีวิต: ไม่ toxic แล้วหนึ่ง",
    tone: "ความสัมพันธ์ / คุยได้ลึก",
    startingMoney: 100,
    roundSeconds: 35,
    items: [
      { title: "มีรักดี ๆ ไม่ต้องเดาใจทุกวัน", category: "รัก", slots: 1, startPrice: 10 },
      { title: "มีแฟนฝรั่ง พร้อมฝึกภาษาแบบไม่กดดัน", category: "รัก", slots: 1, startPrice: 8 },
      { title: "แฟนตอบแชทไว แต่ไม่ตามจิก", category: "รัก", slots: 1, startPrice: 7 },
      { title: "โสดแบบรวย สบายใจ และนอนเต็มอิ่ม", category: "ตัวตน", slots: 1, startPrice: 10 },
      { title: "คนรักที่ซัพพอร์ตความฝัน ไม่ดับไฟเรา", category: "รัก", slots: 1, startPrice: 12 },
      { title: "เพื่อนแท้ 3 คนที่ไม่หายตอนลำบาก", category: "เพื่อน", slots: 1, startPrice: 8 },
      { title: "ครอบครัวเข้าใจ ไม่ถามซ้ำว่าโตไปจะเป็นอะไร", category: "บ้าน", slots: 1, startPrice: 10 },
      { title: "มูฟออนได้ไว ไม่วนดู story เขา", category: "ใจ", slots: 1, startPrice: 6 }
    ]
  },
  {
    id: "real-tradeoff",
    name: "ชีวิตจริงมี Trade-off",
    tone: "จริงจัง / แนะแนว",
    startingMoney: 120,
    roundSeconds: 40,
    items: [
      { title: "งานที่รัก แต่รายได้ช่วงแรกไม่สูง", category: "อาชีพ", slots: 1, startPrice: 12 },
      { title: "เงินเดือนสูง แต่เวลาว่างน้อย", category: "เงิน", slots: 1, startPrice: 12 },
      { title: "อยู่ใกล้ครอบครัว แต่โอกาสงานน้อยลง", category: "บ้าน", slots: 1, startPrice: 10 },
      { title: "ได้ทุนเรียนต่อ แต่ต้องย้ายไกลบ้าน", category: "เรียน", slots: 1, startPrice: 14 },
      { title: "มีชื่อเสียง แต่ถูกจับตามองตลอด", category: "สังคม", slots: 1, startPrice: 10 },
      { title: "ชีวิตสมดุล ไม่ burnout ง่าย", category: "ใจ", slots: 1, startPrice: 14 },
      { title: "กล้าเป็นตัวเองแม้คนอื่นไม่เข้าใจ", category: "ตัวตน", slots: 1, startPrice: 9 },
      { title: "มีวินัยจนทำฝันใหญ่สำเร็จ", category: "ทักษะ", slots: 1, startPrice: 12 }
    ]
  }
];

function send(res, status, data, headers = {}) {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": typeof data === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? roomCode() : code;
}

function publicState(room) {
  const currentItem = room.items[room.currentIndex] || null;
  return {
    code: room.code,
    status: room.status,
    settings: room.settings,
    items: room.items,
    currentIndex: room.currentIndex,
    currentItem,
    players: [...room.players.values()].map(player => ({
      id: player.id,
      name: player.name,
      money: player.money,
      wins: player.wins
    })),
    bids: room.bids,
    history: room.history,
    endsAt: room.endsAt,
    remainingMs: room.remainingMs
  };
}

function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  const payload = `data: ${JSON.stringify(publicState(room))}\n\n`;
  for (const res of clients.get(code) || []) res.write(payload);
}

function makeRoom(payload) {
  const template = templates.find(item => item.id === payload.templateId) || templates[0];
  const customItems = Array.isArray(payload.items) && payload.items.length ? payload.items : template.items;
  const code = roomCode();
  const room = {
    code,
    status: "lobby",
    settings: {
      title: payload.title || "ประมูลอนาคต",
      teacherName: payload.teacherName || "ครู",
      templateName: payload.templateName || template.name,
      startingMoney: Number(payload.startingMoney || template.startingMoney || 100),
      roundSeconds: Number(payload.roundSeconds || template.roundSeconds || 30),
      anonymousBids: Boolean(payload.anonymousBids)
    },
    items: customItems.map((item, index) => ({
      id: crypto.randomUUID(),
      title: String(item.title || `รายการที่ ${index + 1}`),
      category: String(item.category || "อนาคต"),
      slots: Math.max(1, Number(item.slots || 1)),
      startPrice: Math.max(1, Number(item.startPrice || 1))
    })),
    players: new Map(),
    currentIndex: -1,
    bids: [],
    history: [],
    endsAt: null,
    remainingMs: null,
    timer: null
  };
  rooms.set(code, room);
  return room;
}

function winningBids(room, item) {
  const seen = new Set();
  const ranked = room.bids
    .slice()
    .sort((a, b) => b.amount - a.amount || a.createdAt - b.createdAt)
    .filter(bid => {
      if (seen.has(bid.playerId)) return false;
      seen.add(bid.playerId);
      return true;
    });
  const baseWinners = ranked.slice(0, item.slots);
  const cutoff = baseWinners[baseWinners.length - 1]?.amount;
  if (!cutoff || cutoff < room.settings.startingMoney) return baseWinners;

  const baseIds = new Set(baseWinners.map(bid => bid.playerId));
  const tiedAllIns = ranked.filter(bid => !baseIds.has(bid.playerId) && bid.amount === cutoff);
  return baseWinners.concat(tiedAllIns);
}

function finishRound(room) {
  if (room.status !== "bidding" && room.status !== "paused") return;
  const item = room.items[room.currentIndex];
  const winners = winningBids(room, item);

  const resolvedWinners = winners.map(bid => {
    const player = room.players.get(bid.playerId);
    if (!player) return null;
    player.money -= bid.amount;
    player.wins.push({ title: item.title, category: item.category, amount: bid.amount });
    return { playerId: player.id, name: player.name, amount: bid.amount };
  }).filter(Boolean);

  room.history.push({
    item,
    winners: resolvedWinners,
    skipped: resolvedWinners.length === 0,
    finishedAt: Date.now()
  });

  room.status = room.currentIndex >= room.items.length - 1 ? "finished" : "round-ended";
  room.endsAt = null;
  room.remainingMs = null;
  room.bids = [];
  clearTimeout(room.timer);
  room.timer = null;
  broadcast(room.code);
}

function applyBidOvertime(room) {
  if (!room.endsAt) return;
  const remainingMs = room.endsAt - Date.now();
  if (remainingMs <= 3000) {
    room.endsAt = Date.now() + 5000;
    clearTimeout(room.timer);
    room.timer = setTimeout(() => finishRound(room), 5000);
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");

  fs.readFile(filePath, (error, content) => {
    if (error) return send(res, 404, "Not found");
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/templates") return send(res, 200, { templates });

  if (url.pathname === "/api/health") {
    return send(res, 200, {
      storage: "memory",
      redisOk: false,
      env: {
        hasUpstashUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
        hasUpstashToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        hasKvUrl: Boolean(process.env.KV_REST_API_URL),
        hasKvToken: Boolean(process.env.KV_REST_API_TOKEN)
      }
    });
  }

  if (url.pathname === "/api/rooms" && req.method === "POST") {
    const room = makeRoom(await readBody(req));
    return send(res, 200, publicState(room));
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/([^/]+))?$/);
  if (roomMatch) {
    const code = roomMatch[1].toUpperCase();
    const action = roomMatch[2] || "";
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: "ไม่พบห้องนี้" });

    if (req.method === "GET" && !action) return send(res, 200, publicState(room));

    if (req.method === "POST" && action === "join") {
      const body = await readBody(req);
      if (room.status === "closed") return send(res, 400, { error: "ห้องนี้ถูกปิดแล้ว" });
      const id = crypto.randomUUID();
      const player = {
        id,
        name: String(body.name || "นักเรียน").slice(0, 30),
        money: room.settings.startingMoney,
        wins: []
      };
      room.players.set(id, player);
      broadcast(code);
      return send(res, 200, { playerId: id, state: publicState(room) });
    }

    if (req.method === "POST" && action === "start") {
      if (room.players.size === 0) return send(res, 400, { error: "ต้องมีนักเรียนอย่างน้อย 1 คนก่อนเริ่ม" });
      room.status = "round-ended";
      room.currentIndex = -1;
      room.history = [];
      room.bids = [];
      room.endsAt = null;
      room.remainingMs = null;
      for (const player of room.players.values()) {
        player.money = room.settings.startingMoney;
        player.wins = [];
      }
      broadcast(code);
      return send(res, 200, publicState(room));
    }

    if (req.method === "POST" && action === "next") {
      if (room.currentIndex >= room.items.length - 1) return send(res, 400, { error: "ไม่มีรายการถัดไปแล้ว" });
      clearTimeout(room.timer);
      room.currentIndex += 1;
      room.status = "bidding";
      room.bids = [];
      room.endsAt = Date.now() + room.settings.roundSeconds * 1000;
      room.remainingMs = null;
      room.timer = setTimeout(() => finishRound(room), room.settings.roundSeconds * 1000);
      broadcast(code);
      return send(res, 200, publicState(room));
    }

    if (req.method === "POST" && action === "pause") {
      if (room.status !== "bidding") return send(res, 400, { error: "หยุดได้เฉพาะตอนเปิดประมูล" });
      room.remainingMs = Math.max(0, room.endsAt - Date.now());
      room.status = "paused";
      room.endsAt = null;
      clearTimeout(room.timer);
      room.timer = null;
      broadcast(code);
      return send(res, 200, publicState(room));
    }

    if (req.method === "POST" && action === "resume") {
      if (room.status !== "paused") return send(res, 400, { error: "ยังไม่ได้หยุดเกม" });
      const remainingMs = Math.max(1000, room.remainingMs || room.settings.roundSeconds * 1000);
      room.status = "bidding";
      room.endsAt = Date.now() + remainingMs;
      room.remainingMs = null;
      clearTimeout(room.timer);
      room.timer = setTimeout(() => finishRound(room), remainingMs);
      broadcast(code);
      return send(res, 200, publicState(room));
    }

    if (req.method === "POST" && action === "close") {
      room.status = "closed";
      room.endsAt = null;
      room.remainingMs = null;
      clearTimeout(room.timer);
      room.timer = null;
      broadcast(code);
      return send(res, 200, publicState(room));
    }

    if (req.method === "POST" && action === "finish") {
      finishRound(room);
      return send(res, 200, publicState(room));
    }

    if (req.method === "POST" && action === "bid") {
      const body = await readBody(req);
      const player = room.players.get(body.playerId);
      const item = room.items[room.currentIndex];
      const amount = Math.floor(Number(body.amount || 0));
      if (room.status !== "bidding" || !item) return send(res, 400, { error: "ยังไม่มีรายการเปิดประมูล" });
      if (!player) return send(res, 403, { error: "ไม่พบนักเรียนในห้องนี้" });
      if (amount < item.startPrice) return send(res, 400, { error: `ต้อง bid อย่างน้อย ${item.startPrice}` });
      if (amount > player.money) return send(res, 400, { error: "เงินไม่พอสำหรับ bid นี้" });
      room.bids.push({
        playerId: player.id,
        playerName: player.name,
        amount,
        createdAt: Date.now()
      });
      applyBidOvertime(room);
      broadcast(code);
      return send(res, 200, publicState(room));
    }
  }

  if (url.pathname.startsWith("/events/")) {
    const code = url.pathname.split("/").pop().toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "Connection": "keep-alive"
    });
    res.write(`data: ${JSON.stringify(publicState(room))}\n\n`);
    if (!clients.has(code)) clients.set(code, new Set());
    clients.get(code).add(res);
    req.on("close", () => clients.get(code)?.delete(res));
    return;
  }

  serveStatic(req, res);
}

const server = http.createServer((req, res) => {
  route(req, res).catch(error => send(res, 500, { error: error.message || "Server error" }));
});

server.listen(PORT, () => {
  console.log(`Future Bidding War is running at http://localhost:${PORT}`);
});

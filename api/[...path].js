const crypto = require("crypto");

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

const memoryRooms = globalThis.__futureBiddingWarRooms || new Map();
globalThis.__futureBiddingWarRooms = memoryRooms;

const REDIS_REST_URL_KEYS = [
  "UPSTASH_REDIS_REST_URL",
  "KV_REST_API_URL",
  "REDIS_REST_API_URL"
];

const REDIS_REST_TOKEN_KEYS = [
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_TOKEN",
  "REDIS_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN"
];

function firstEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function redisConfig() {
  const url = firstEnv(REDIS_REST_URL_KEYS);
  const token = firstEnv(REDIS_REST_TOKEN_KEYS);
  return url && token ? { url: url.value, token: token.value, urlKey: url.key, tokenKey: token.key } : null;
}

async function redis(command, ...args) {
  const config = redisConfig();
  if (!config) return null;
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command, ...args])
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Redis error");
  return data.result;
}

function roomKey(code) {
  return `future-bidding-war:room:${code}`;
}

async function getRoom(code) {
  const normalized = String(code || "").toUpperCase();
  let room;
  if (redisConfig()) {
    const value = await redis("GET", roomKey(normalized));
    room = value ? JSON.parse(value) : null;
  } else {
    room = memoryRooms.get(normalized) || null;
  }
  if (room && finalizeExpired(room)) await saveRoom(room);
  return room;
}

async function saveRoom(room) {
  if (redisConfig()) {
    await redis("SET", roomKey(room.code), JSON.stringify(room), "EX", 60 * 60 * 12);
  } else {
    memoryRooms.set(room.code, room);
  }
}

async function codeExists(code) {
  if (redisConfig()) return Boolean(await redis("EXISTS", roomKey(code)));
  return memoryRooms.has(code);
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!(await codeExists(code))) return code;
  }
  throw new Error("ไม่สามารถสร้างรหัสห้องได้");
}

function makeRoom(payload, code) {
  const template = templates.find(item => item.id === payload.templateId) || templates[0];
  const customItems = Array.isArray(payload.items) && payload.items.length ? payload.items : template.items;
  return {
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
    players: [],
    currentIndex: -1,
    bids: [],
    history: [],
    endsAt: null,
    remainingMs: null
  };
}

function publicState(room) {
  return {
    code: room.code,
    status: room.status,
    settings: room.settings,
    items: room.items,
    currentIndex: room.currentIndex,
    currentItem: room.items[room.currentIndex] || null,
    players: room.players,
    bids: room.bids,
    history: room.history,
    endsAt: room.endsAt,
    remainingMs: room.remainingMs
  };
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
  if (room.status !== "bidding" && room.status !== "paused") return false;
  const item = room.items[room.currentIndex];
  const winners = winningBids(room, item);

  const resolvedWinners = winners.map(bid => {
    const player = room.players.find(item => item.id === bid.playerId);
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
  return true;
}

function finalizeExpired(room) {
  if (room.status === "bidding" && room.endsAt && Date.now() >= room.endsAt) {
    return finishRound(room);
  }
  return false;
}

function applyBidOvertime(room) {
  if (!room.endsAt) return false;
  const remainingMs = room.endsAt - Date.now();
  if (remainingMs <= 3000) {
    room.endsAt = Date.now() + 5000;
    return true;
  }
  return false;
}

function routeParts(req) {
  if (Array.isArray(req.query?.path)) return req.query.path;
  if (typeof req.query?.path === "string") return [req.query.path];
  const pathname = new URL(req.url, "http://localhost").pathname;
  return pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
}

module.exports = async function handler(req, res) {
  try {
    const parts = routeParts(req);

    if (req.method === "GET" && parts[0] === "templates") {
      return json(res, 200, { templates });
    }

    if (req.method === "GET" && parts[0] === "health") {
      const config = redisConfig();
      let redisOk = false;
      if (config) {
        try {
          redisOk = (await redis("PING")) === "PONG";
        } catch {
          redisOk = false;
        }
      }
      return json(res, 200, {
        storage: config ? "redis" : "memory",
        redisOk,
        selectedEnv: config ? { urlKey: config.urlKey, tokenKey: config.tokenKey } : null,
        env: {
          hasUpstashUrl: Boolean(process.env.UPSTASH_REDIS_REST_URL),
          hasUpstashToken: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
          hasKvUrl: Boolean(process.env.KV_REST_API_URL),
          hasKvToken: Boolean(process.env.KV_REST_API_TOKEN),
          hasKvReadOnlyToken: Boolean(process.env.KV_REST_API_READ_ONLY_TOKEN),
          hasRedisRestUrl: Boolean(process.env.REDIS_REST_API_URL),
          hasRedisRestToken: Boolean(process.env.REDIS_REST_API_TOKEN)
        }
      });
    }

    if (req.method === "POST" && parts[0] === "rooms" && parts.length === 1) {
      const payload = await body(req);
      const code = await roomCode();
      const room = makeRoom(payload, code);
      await saveRoom(room);
      return json(res, 200, publicState(room));
    }

    if (parts[0] === "rooms" && parts[1]) {
      const code = parts[1].toUpperCase();
      const action = parts[2] || "";
      const room = await getRoom(code);
      if (!room) return json(res, 404, { error: "ไม่พบห้องนี้" });

      if (req.method === "GET" && !action) {
        return json(res, 200, publicState(room));
      }

      if (req.method === "POST" && action === "join") {
        const payload = await body(req);
        if (room.status === "closed") return json(res, 400, { error: "ห้องนี้ถูกปิดแล้ว" });
        const player = {
          id: crypto.randomUUID(),
          name: String(payload.name || "นักเรียน").slice(0, 30),
          money: room.settings.startingMoney,
          wins: []
        };
        room.players.push(player);
        await saveRoom(room);
        return json(res, 200, { playerId: player.id, state: publicState(room) });
      }

      if (req.method === "POST" && action === "start") {
        if (room.players.length === 0) return json(res, 400, { error: "ต้องมีนักเรียนอย่างน้อย 1 คนก่อนเริ่ม" });
        room.status = "round-ended";
        room.currentIndex = -1;
        room.history = [];
        room.bids = [];
        room.endsAt = null;
        room.remainingMs = null;
        for (const player of room.players) {
          player.money = room.settings.startingMoney;
          player.wins = [];
        }
        await saveRoom(room);
        return json(res, 200, publicState(room));
      }

      if (req.method === "POST" && action === "next") {
        if (room.currentIndex >= room.items.length - 1) return json(res, 400, { error: "ไม่มีรายการถัดไปแล้ว" });
        room.currentIndex += 1;
        room.status = "bidding";
        room.bids = [];
        room.endsAt = Date.now() + room.settings.roundSeconds * 1000;
        room.remainingMs = null;
        await saveRoom(room);
        return json(res, 200, publicState(room));
      }

      if (req.method === "POST" && action === "pause") {
        if (room.status !== "bidding") return json(res, 400, { error: "หยุดได้เฉพาะตอนเปิดประมูล" });
        room.remainingMs = Math.max(0, room.endsAt - Date.now());
        room.status = "paused";
        room.endsAt = null;
        await saveRoom(room);
        return json(res, 200, publicState(room));
      }

      if (req.method === "POST" && action === "resume") {
        if (room.status !== "paused") return json(res, 400, { error: "ยังไม่ได้หยุดเกม" });
        const remainingMs = Math.max(1000, room.remainingMs || room.settings.roundSeconds * 1000);
        room.status = "bidding";
        room.endsAt = Date.now() + remainingMs;
        room.remainingMs = null;
        await saveRoom(room);
        return json(res, 200, publicState(room));
      }

      if (req.method === "POST" && action === "close") {
        room.status = "closed";
        room.endsAt = null;
        room.remainingMs = null;
        await saveRoom(room);
        return json(res, 200, publicState(room));
      }

      if (req.method === "POST" && action === "finish") {
        finishRound(room);
        await saveRoom(room);
        return json(res, 200, publicState(room));
      }

      if (req.method === "POST" && action === "bid") {
        const payload = await body(req);
        finalizeExpired(room);
        const player = room.players.find(item => item.id === payload.playerId);
        const item = room.items[room.currentIndex];
        const amount = Math.floor(Number(payload.amount || 0));
        if (room.status !== "bidding" || !item) return json(res, 400, { error: "ยังไม่มีรายการเปิดประมูล" });
        if (!player) return json(res, 403, { error: "ไม่พบนักเรียนในห้องนี้" });
        if (amount < item.startPrice) return json(res, 400, { error: `ต้อง bid อย่างน้อย ${item.startPrice}` });
        if (amount > player.money) return json(res, 400, { error: "เงินไม่พอสำหรับ bid นี้" });
        room.bids.push({
          playerId: player.id,
          playerName: player.name,
          amount,
          createdAt: Date.now()
        });
        applyBidOvertime(room);
        await saveRoom(room);
        return json(res, 200, publicState(room));
      }
    }

    return json(res, 404, { error: "ไม่พบ API นี้" });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
};

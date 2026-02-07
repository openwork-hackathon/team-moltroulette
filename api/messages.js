let state = globalThis.__moltroulette || { agents: {}, queue: [], rooms: {}, nextRoomId: 1, rateLimits: {} };
globalThis.__moltroulette = state;

// Rate limiting: max 10 messages per minute per user
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in ms
const RATE_LIMIT_MAX = 10;

function checkRateLimit(username) {
  const now = Date.now();
  if (!state.rateLimits[username]) {
    state.rateLimits[username] = [];
  }

  // Clean old entries outside the window
  state.rateLimits[username] = state.rateLimits[username].filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW
  );

  if (state.rateLimits[username].length >= RATE_LIMIT_MAX) {
    const oldestTimestamp = state.rateLimits[username][0];
    const resetIn = Math.ceil((RATE_LIMIT_WINDOW - (now - oldestTimestamp)) / 1000);
    return { limited: true, resetIn };
  }

  state.rateLimits[username].push(now);
  return { limited: false };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const roomId = req.query.roomId;
  if (!roomId) {
    return res.status(400).json({ error: "roomId query param required" });
  }

  const room = state.rooms[roomId];
  if (!room) {
    return res.status(404).json({ error: "room not found" });
  }

  if (req.method === "GET") {
    const since = parseInt(req.query.since || "0", 10);
    const msgs = room.messages.filter((m) => m.ts > since);
    
    // Include room member list in response
    return res.json({
      roomId,
      messages: msgs,
      total: room.messages.length,
      members: room.members,
      active: room.active,
    });
  }

  if (req.method === "POST") {
    const { username, text } = req.body || {};
    if (!text || !username) {
      return res.status(400).json({ error: "username and text required" });
    }

    // Check rate limit
    const rateLimitCheck = checkRateLimit(username);
    if (rateLimitCheck.limited) {
      return res.status(429).json({
        error: "rate limit exceeded",
        message: `Too many messages. Try again in ${rateLimitCheck.resetIn} seconds.`,
        resetIn: rateLimitCheck.resetIn,
      });
    }

    const msg = { username, text, ts: Date.now() };
    room.messages.push(msg);
    
    return res.json({
      ok: true,
      message: msg,
      members: room.members,
    });
  }

  res.status(405).json({ error: "GET or POST only" });
}
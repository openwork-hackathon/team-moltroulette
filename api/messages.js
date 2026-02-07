let state = globalThis.__moltroulette || { agents: {}, queue: [], rooms: {}, nextRoomId: 1 };
globalThis.__moltroulette = state;

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
    return res.json({ roomId, messages: msgs, total: room.messages.length });
  }

  if (req.method === "POST") {
    const { username, text } = req.body || {};
    if (!text || !username) {
      return res.status(400).json({ error: "username and text required" });
    }
    const msg = { username, text, ts: Date.now() };
    room.messages.push(msg);
    return res.json({ ok: true, message: msg });
  }

  res.status(405).json({ error: "GET or POST only" });
}

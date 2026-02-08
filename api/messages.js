/**
 * GET  /api/messages?room_id=X&since=T — get messages after timestamp T
 * POST /api/messages { room_id, agent_id, text } — send a message
 *
 * 30-second rate limit per agent (reject if < 30s since last message)
 */

if (!globalThis.__molt) {
  globalThis.__molt = {
    agents: new Map(),
    queue: [],
    rooms: new Map(),
    nextRoomId: 1,
  };
}
const state = globalThis.__molt;

const RATE_LIMIT_MS = 30000; // 30 seconds between messages per agent

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    const room_id = req.query.room_id || req.query.roomId;
    if (!room_id) {
      return res.status(400).json({ error: "room_id query parameter is required" });
    }

    const room = state.rooms.get(room_id);
    if (!room) {
      return res.status(404).json({ error: "Room not found", room_id });
    }

    const since = parseInt(req.query.since || "0", 10);
    const messages = room.messages.filter((m) => m.ts > since);

    return res.status(200).json({
      ok: true,
      room_id,
      messages,
      total: room.messages.length,
    });
  }

  if (req.method === "POST") {
    const { room_id, agent_id, text } = req.body || {};

    if (!room_id) {
      return res.status(400).json({ error: "room_id is required" });
    }
    if (!agent_id) {
      return res.status(400).json({ error: "agent_id is required" });
    }
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text is required (non-empty string)" });
    }
    if (text.length > 5000) {
      return res.status(400).json({ error: "text too long (max 5000 chars)" });
    }

    const room = state.rooms.get(room_id);
    if (!room) {
      return res.status(404).json({ error: "Room not found", room_id });
    }
    if (!room.active) {
      return res.status(410).json({ error: "Room is no longer active", room_id });
    }
    if (!room.agent_ids.includes(agent_id)) {
      return res.status(403).json({ error: "Agent is not a member of this room" });
    }

    // 30-second rate limit per agent
    const now = Date.now();
    const lastMsg = [...room.messages].reverse().find((m) => m.agent_id === agent_id);
    if (lastMsg && now - lastMsg.ts < RATE_LIMIT_MS) {
      const waitSec = Math.ceil((RATE_LIMIT_MS - (now - lastMsg.ts)) / 1000);
      return res.status(429).json({
        error: `Rate limited. Wait ${waitSec}s before sending another message.`,
        retry_after: waitSec,
      });
    }

    const agent = state.agents.get(agent_id);
    const msg = {
      agent_id,
      agent_name: agent ? agent.name : agent_id,
      text: text.trim(),
      ts: now,
    };

    room.messages.push(msg);
    room.last_activity = now;

    return res.status(201).json({
      ok: true,
      message: msg,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

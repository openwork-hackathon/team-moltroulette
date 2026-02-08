/**
 * Single entrypoint for all API routes.
 * This ensures all endpoints share the same globalThis.__molt state.
 *
 * Routes:
 *   /api/register  → register handler
 *   /api/queue     → queue handler
 *   /api/messages  → messages handler
 *   /api/rooms     → rooms handler
 *   /api/status    → status handler
 */

if (!globalThis.__molt) {
  globalThis.__molt = {
    agents: new Map(),
    queue: [],
    rooms: new Map(),
    nextRoomId: 1,
    agentIdCounter: 1,
  };
}
const state = globalThis.__molt;

// ============ Shared helpers ============

const RATE_LIMIT_MS = 30000;
const QUEUE_TIMEOUT_MS = 5 * 60 * 1000;
const ROOM_TIMEOUT_MS = 10 * 60 * 1000;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sanitizeAvatarUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
  try { new URL(trimmed); return trimmed; } catch { return null; }
}

function generateAgentId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  const counter = state.agentIdCounter++;
  return `agent-${counter}-${base}`;
}

function findRoomForAgent(agentId) {
  for (const room of state.rooms.values()) {
    if (room.active && room.agent_ids.includes(agentId)) return room;
  }
  return null;
}

function cleanupQueue() {
  const now = Date.now();
  state.queue = state.queue.filter((e) => now - e.joined_at < QUEUE_TIMEOUT_MS);
}

function cleanupRooms() {
  const now = Date.now();
  for (const room of state.rooms.values()) {
    if (room.active && now - room.last_activity > ROOM_TIMEOUT_MS) {
      room.active = false;
    }
  }
}

function createRoom(waiterEntry, joinerAgent) {
  const agentA = state.agents.get(waiterEntry.agent_id);
  const agentB = joinerAgent;
  const roomId = `room-${String(state.nextRoomId++).padStart(4, "0")}`;

  const room = {
    id: roomId,
    agents: [
      { agent_id: agentA.agent_id, name: agentA.name, avatar_url: agentA.avatar_url },
      { agent_id: agentB.agent_id, name: agentB.name, avatar_url: agentB.avatar_url },
    ],
    agent_ids: [agentA.agent_id, agentB.agent_id],
    initiator: agentA.agent_id,
    messages: [],
    created_at: Date.now(),
    last_activity: Date.now(),
    active: true,
  };
  state.rooms.set(roomId, room);
  return room;
}

// ============ Route handlers ============

function handleRegister(req, res) {
  if (req.method === "POST") {
    const { name, avatar_url } = req.body || {};
    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ error: "name is required" });
    }
    const cleanName = name.trim().slice(0, 50);
    const sanitizedAvatar = avatar_url ? sanitizeAvatarUrl(avatar_url) : null;
    if (avatar_url && !sanitizedAvatar) {
      return res.status(400).json({ error: "avatar_url must be a valid HTTP/HTTPS URL" });
    }
    const agent_id = generateAgentId(cleanName);
    const agent = { agent_id, name: cleanName, avatar_url: sanitizedAvatar, registered_at: Date.now() };
    state.agents.set(agent_id, agent);
    return res.status(201).json({ agent_id, name: cleanName, avatar_url: sanitizedAvatar });
  }
  if (req.method === "GET") {
    const agents = Array.from(state.agents.values()).map((a) => ({
      agent_id: a.agent_id, name: a.name, avatar_url: a.avatar_url,
    }));
    return res.status(200).json({ agents, total: agents.length });
  }
  return res.status(405).json({ error: "Method not allowed" });
}

function handleQueue(req, res) {
  cleanupQueue();

  if (req.method === "GET") {
    const agent_id = req.query.agent_id;
    if (!agent_id) {
      return res.status(200).json({ queue_length: state.queue.length });
    }
    const room = findRoomForAgent(agent_id);
    if (room) {
      const partner = room.agents.find((a) => a.agent_id !== agent_id);
      return res.status(200).json({ matched: true, room_id: room.id, partner, initiator: room.initiator === agent_id });
    }
    const idx = state.queue.findIndex((q) => q.agent_id === agent_id);
    if (idx !== -1) {
      return res.status(200).json({ matched: false, queued: true, position: idx + 1 });
    }
    return res.status(200).json({ matched: false, queued: false });
  }

  if (req.method === "POST") {
    const { agent_id } = req.body || {};
    if (!agent_id) return res.status(400).json({ error: "agent_id is required" });

    const agent = state.agents.get(agent_id);
    if (!agent) return res.status(400).json({ error: "Agent not registered. Call POST /api/register first." });

    const existingRoom = findRoomForAgent(agent_id);
    if (existingRoom) {
      const partner = existingRoom.agents.find((a) => a.agent_id !== agent_id);
      return res.status(200).json({ matched: true, room_id: existingRoom.id, partner, initiator: existingRoom.initiator === agent_id });
    }

    // Already in queue? Check for match possibility
    const qIdx = state.queue.findIndex((q) => q.agent_id === agent_id);
    if (qIdx !== -1) {
      if (state.queue.length >= 2) {
        const partnerIdx = state.queue.findIndex((q) => q.agent_id !== agent_id);
        if (partnerIdx !== -1) {
          const partnerEntry = state.queue[partnerIdx];
          state.queue = state.queue.filter((q) => q.agent_id !== agent_id && q.agent_id !== partnerEntry.agent_id);
          const room = createRoom(partnerEntry, agent);
          const partner = room.agents.find((a) => a.agent_id !== agent_id);
          return res.status(200).json({ matched: true, room_id: room.id, partner, initiator: room.initiator === agent_id });
        }
      }
      return res.status(200).json({ matched: false, queued: true, position: state.queue.findIndex((q) => q.agent_id === agent_id) + 1 });
    }

    // Try to match with someone waiting
    if (state.queue.length > 0) {
      const waiter = state.queue.shift();
      const room = createRoom(waiter, agent);
      const partner = room.agents.find((a) => a.agent_id !== agent_id);
      return res.status(200).json({ matched: true, room_id: room.id, partner, initiator: room.initiator === agent_id });
    }

    // No match — join queue
    state.queue.push({ agent_id, joined_at: Date.now() });
    return res.status(200).json({ matched: false, queued: true, position: state.queue.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

function handleMessages(req, res) {
  if (req.method === "GET") {
    const room_id = req.query.room_id || req.query.roomId;
    if (!room_id) return res.status(400).json({ error: "room_id is required" });
    const room = state.rooms.get(room_id);
    if (!room) return res.status(404).json({ error: "Room not found", room_id });
    const since = parseInt(req.query.since || "0", 10);
    const messages = room.messages.filter((m) => m.ts > since);
    return res.status(200).json({ ok: true, room_id, messages, total: room.messages.length });
  }

  if (req.method === "POST") {
    const { room_id, agent_id, text } = req.body || {};
    if (!room_id) return res.status(400).json({ error: "room_id is required" });
    if (!agent_id) return res.status(400).json({ error: "agent_id is required" });
    if (!text || typeof text !== "string" || text.trim().length === 0) return res.status(400).json({ error: "text is required" });
    if (text.length > 5000) return res.status(400).json({ error: "text too long (max 5000)" });

    const room = state.rooms.get(room_id);
    if (!room) return res.status(404).json({ error: "Room not found", room_id });
    if (!room.active) return res.status(410).json({ error: "Room is no longer active" });
    if (!room.agent_ids.includes(agent_id)) return res.status(403).json({ error: "Not a member of this room" });

    const now = Date.now();
    const lastMsg = [...room.messages].reverse().find((m) => m.agent_id === agent_id);
    if (lastMsg && now - lastMsg.ts < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (now - lastMsg.ts)) / 1000);
      return res.status(429).json({ error: `Rate limited. Wait ${wait}s.`, retry_after: wait });
    }

    const agent = state.agents.get(agent_id);
    const msg = { agent_id, agent_name: agent ? agent.name : agent_id, text: text.trim(), ts: now };
    room.messages.push(msg);
    room.last_activity = now;
    return res.status(201).json({ ok: true, message: msg });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

function handleRooms(req, res) {
  cleanupRooms();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const roomId = req.query.id;
  if (roomId) {
    const room = state.rooms.get(roomId);
    if (!room) return res.status(404).json({ error: "Room not found", room_id: roomId });
    return res.status(200).json({
      id: room.id, agents: room.agents, members: room.agents.map((a) => a.name),
      initiator: room.initiator, message_count: room.messages.length, messages: room.messages,
      created_at: room.created_at, last_activity: room.last_activity, active: room.active,
    });
  }

  const rooms = Array.from(state.rooms.values()).filter((r) => r.active).map((r) => ({
    id: r.id, agents: r.agents, members: r.agents.map((a) => a.name),
    message_count: r.messages.length, created_at: r.created_at, last_activity: r.last_activity, active: r.active,
  }));
  return res.status(200).json({ rooms, total: rooms.length });
}

function handleStatus(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const rooms = Array.from(state.rooms.values());
  const active_rooms = rooms.filter((r) => r.active).length;
  let total_messages = 0;
  for (const r of rooms) total_messages += r.messages.length;
  return res.status(200).json({
    platform: "MoltRoulette",
    stats: { registered_agents: state.agents.size, active_rooms, total_rooms: rooms.length, total_messages, queue_length: state.queue.length },
    timestamp: Date.now(),
  });
}

// ============ Router ============

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  // Extract route from the URL path
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/?/, "").split("/")[0];

  switch (path) {
    case "register": return handleRegister(req, res);
    case "queue":    return handleQueue(req, res);
    case "messages": return handleMessages(req, res);
    case "rooms":    return handleRooms(req, res);
    case "status":   return handleStatus(req, res);
    default:
      return res.status(404).json({ error: `Unknown endpoint: /api/${path}`, available: ["register", "queue", "messages", "rooms", "status"] });
  }
}

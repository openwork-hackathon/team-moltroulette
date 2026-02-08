/**
 * GET /api/rooms — return all active rooms
 * GET /api/rooms?id=X — return single room with messages
 *
 * Room format: { id, agents: [{name, avatar_url, agent_id}], message_count, created_at }
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const roomId = req.query.id;

  // Single room
  if (roomId) {
    const room = state.rooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found", room_id: roomId });
    }

    return res.status(200).json({
      id: room.id,
      agents: room.agents,
      members: room.agents.map((a) => a.name),
      initiator: room.initiator,
      message_count: room.messages.length,
      messages: room.messages,
      created_at: room.created_at,
      active: room.active,
    });
  }

  // All rooms
  const rooms = Array.from(state.rooms.values())
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id,
      agents: r.agents,
      members: r.agents.map((a) => a.name),
      message_count: r.messages.length,
      created_at: r.created_at,
      active: r.active,
    }));

  return res.status(200).json({
    rooms,
    total: rooms.length,
  });
}

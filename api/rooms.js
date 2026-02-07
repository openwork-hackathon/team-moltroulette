let state = globalThis.__moltroulette || { agents: {}, queue: [], rooms: {}, nextRoomId: 1 };
globalThis.__moltroulette = state;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  const roomId = req.query.id;

  if (roomId) {
    const room = state.rooms[roomId];
    if (!room) return res.status(404).json({ error: "room not found" });
    return res.json({
      ...room,
      message_count: room.messages.length,
      messages: undefined,
    });
  }

  const rooms = Object.values(state.rooms).map((r) => ({
    id: r.id,
    members: r.members,
    created_at: r.created_at,
    active: r.active,
    message_count: r.messages.length,
  }));

  return res.json({
    rooms,
    total: rooms.length,
    queue_length: state.queue.length,
  });
}

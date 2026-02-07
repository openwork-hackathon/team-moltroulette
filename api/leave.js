let state = globalThis.__moltroulette || { agents: {}, queue: [], rooms: {}, nextRoomId: 1 };
globalThis.__moltroulette = state;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { username, roomId } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: "username required" });
  }

  // Remove from queue if present
  const wasInQueue = state.queue.includes(username);
  state.queue = state.queue.filter((u) => u !== username);

  // If roomId provided, mark that room as inactive
  if (roomId) {
    const room = state.rooms[roomId];
    if (!room) {
      return res.status(404).json({ error: "room not found" });
    }

    if (!room.members.includes(username)) {
      return res.status(403).json({ error: "not a member of this room" });
    }

    room.active = false;
    room.left_at = Date.now();
    room.left_by = username;

    return res.json({
      ok: true,
      message: "left room successfully",
      roomId,
      was_in_queue: wasInQueue,
    });
  }

  // If no roomId, find any active room with this user
  let foundRoom = null;
  for (const room of Object.values(state.rooms)) {
    if (room.active && room.members.includes(username)) {
      room.active = false;
      room.left_at = Date.now();
      room.left_by = username;
      foundRoom = room.id;
      break;
    }
  }

  return res.json({
    ok: true,
    message: foundRoom ? "left room successfully" : "removed from queue",
    roomId: foundRoom,
    was_in_queue: wasInQueue,
  });
}
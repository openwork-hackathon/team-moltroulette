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

  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: "username required" });
  }

  // Check if user is already in an active room
  for (const room of Object.values(state.rooms)) {
    if (room.active && room.members.includes(username)) {
      return res.status(400).json({
        error: "already in active room",
        roomId: room.id,
        message: "Leave your current room before matching again",
      });
    }
  }

  // Remove self from queue if already waiting
  state.queue = state.queue.filter((u) => u !== username);

  const partner = state.queue.shift();
  if (partner) {
    const roomId = `room-${(state.nextRoomId++).toString(36).padStart(4, "0")}`;
    state.rooms[roomId] = {
      id: roomId,
      members: [partner, username],
      messages: [],
      created_at: Date.now(),
      active: true,
    };
    return res.json({
      matched: true,
      roomId,
      partner,
      spectator_url: `/?room=${roomId}&spectator=1`,
    });
  }

  state.queue.push(username);
  return res.json({
    matched: false,
    queued: true,
    position: state.queue.length,
    message: "Waiting for another agent...",
  });
}
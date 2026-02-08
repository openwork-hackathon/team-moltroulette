/**
 * GET /api/status — platform stats
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

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rooms = Array.from(state.rooms.values());
  const active_rooms = rooms.filter((r) => r.active).length;
  let total_messages = 0;
  for (const room of rooms) {
    total_messages += room.messages.length;
  }

  return res.status(200).json({
    platform: "MoltRoulette",
    stats: {
      registered_agents: state.agents.size,
      active_rooms,
      total_rooms: rooms.length,
      total_messages,
      queue_length: state.queue.length,
    },
    timestamp: Date.now(),
  });
}

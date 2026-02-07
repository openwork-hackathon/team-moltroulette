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

  const activeRooms = Object.values(state.rooms).filter((r) => r.active);
  const totalMessages = Object.values(state.rooms).reduce(
    (sum, r) => sum + r.messages.length,
    0
  );

  return res.json({
    name: "MoltRoulette",
    version: "1.0.0",
    stats: {
      registered_agents: Object.keys(state.agents).length,
      agents_in_queue: state.queue.length,
      active_rooms: activeRooms.length,
      total_rooms: Object.keys(state.rooms).length,
      total_messages: totalMessages,
    },
    token: {
      symbol: "$MOLT",
      chain: "Base",
      reserve_token: "$OPENWORK",
      contract: "0x299c30DD5974BF4D5bFE42C340CA40462816AB07",
    },
    uptime: process.uptime ? process.uptime() : 0,
  });
}

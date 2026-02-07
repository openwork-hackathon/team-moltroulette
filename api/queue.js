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

  const username = req.query.username;
  if (!username) {
    // Return general queue info
    return res.json({
      queue_length: state.queue.length,
      queue: state.queue,
    });
  }

  // Return specific user's position
  const position = state.queue.indexOf(username);
  if (position === -1) {
    return res.json({
      in_queue: false,
      position: null,
      queue_length: state.queue.length,
    });
  }

  return res.json({
    in_queue: true,
    position: position + 1, // 1-indexed for user display
    queue_length: state.queue.length,
    estimated_wait: position * 2, // rough estimate in seconds
  });
}
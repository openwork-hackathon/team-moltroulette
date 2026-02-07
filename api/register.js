let state = globalThis.__moltroulette || { agents: {}, queue: [], rooms: {}, nextRoomId: 1 };
globalThis.__moltroulette = state;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "POST") {
    const { username, avatar } = req.body || {};
    if (!username || typeof username !== "string" || username.length < 2) {
      return res.status(400).json({ error: "username required (min 2 chars)" });
    }
    const id = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    state.agents[id] = {
      id,
      username,
      avatar: avatar || null,
      created_at: Date.now(),
      registered_at: Date.now(),
      online: true,
    };
    return res.json({ ok: true, agent: state.agents[id] });
  }

  if (req.method === "GET") {
    const list = Object.values(state.agents);
    return res.json({ agents: list, total: list.length });
  }

  res.status(405).json({ error: "POST or GET only" });
}
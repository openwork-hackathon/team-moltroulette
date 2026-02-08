/**
 * POST /api/register
 * Accept: { name, avatar_url }
 * Return: { agent_id, name, avatar_url }
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

let nextId = 1;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "POST") {
    const { name, avatar_url } = req.body || {};

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ error: "name is required (string, min 1 char)" });
    }

    const cleanName = name.trim().slice(0, 50);
    const agent_id = `agent-${nextId++}-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    const agent = {
      agent_id,
      name: cleanName,
      avatar_url: avatar_url || null,
      registered_at: Date.now(),
    };

    state.agents.set(agent_id, agent);

    return res.status(201).json({
      agent_id: agent.agent_id,
      name: agent.name,
      avatar_url: agent.avatar_url,
    });
  }

  if (req.method === "GET") {
    const agents = Array.from(state.agents.values()).map((a) => ({
      agent_id: a.agent_id,
      name: a.name,
      avatar_url: a.avatar_url,
    }));
    return res.status(200).json({ agents, total: agents.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

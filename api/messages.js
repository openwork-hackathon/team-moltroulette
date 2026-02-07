let state = globalThis.__moltroulette || { queue: [], rooms: {} };
globalThis.__moltroulette = state;

export default async function handler(req, res) {
  const { roomId } = req.query;
  if (!roomId) {
    res.status(400).json({ error: 'roomId required' });
    return;
  }
  const room = state.rooms[roomId] || { members: [], messages: [] };
  state.rooms[roomId] = room;
  if (req.method === 'GET') {
    res.json({ messages: room.messages });
    return;
  }
  if (req.method === 'POST') {
    const { username, text } = req.body || {};
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    room.messages.push({ username, text, ts: Date.now() });
    res.json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'GET/POST only' });
}

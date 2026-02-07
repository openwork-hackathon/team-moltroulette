let state = globalThis.__moltroulette || { queue: [], rooms: {} };
globalThis.__moltroulette = state;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const { username } = req.body || {};
  if (!username) {
    res.status(400).json({ error: 'username required' });
    return;
  }
  const waiting = state.queue.shift();
  if (waiting) {
    const roomId = `room-${Math.random().toString(36).slice(2, 8)}`;
    state.rooms[roomId] = { members: [waiting, username], messages: [] };
    res.json({ roomId, partner: waiting });
  } else {
    state.queue.push(username);
    res.json({ queued: true });
  }
}

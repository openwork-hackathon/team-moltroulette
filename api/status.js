/**
 * GET /api/status
 * Returns platform statistics and token information
 */

let state = globalThis.__moltroulette || { 
  agents: {}, 
  queue: [], 
  rooms: {}, 
  nextRoomId: 1,
  requestCounts: {}
};
globalThis.__moltroulette = state;

// Rate limiting helper
function checkRateLimit(identifier, limit = 100, windowMs = 60000) {
  const now = Date.now();
  if (!state.requestCounts[identifier]) {
    state.requestCounts[identifier] = { count: 0, resetAt: now + windowMs };
  }
  
  const record = state.requestCounts[identifier];
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  
  record.count++;
  return record.count <= limit;
}

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: "Method not allowed. Use GET.",
      allowed_methods: ["GET", "OPTIONS"]
    });
  }

  // Rate limiting
  const identifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(`status:${identifier}`, 120, 60000)) {
    return res.status(429).json({ 
      error: "Too many requests. Please try again later.",
      retry_after: 60 
    });
  }

  const registered_agents = Object.keys(state.agents).length;
  const active_rooms = Object.values(state.rooms).filter(r => r.active).length;
  const total_rooms = Object.keys(state.rooms).length;

  let total_messages = 0;
  for (const room of Object.values(state.rooms)) {
    total_messages += (room.messages || []).length;
  }

  res.status(200).json({
    platform: 'MoltRoulette',
    version: '1.0.0',
    stats: { 
      registered_agents, 
      active_rooms,
      total_rooms,
      archived_rooms: total_rooms - active_rooms,
      total_messages,
      queue_length: state.queue.length
    },
    token: {
      symbol: 'MOLT',
      name: 'MoltRoulette Token',
      address: process.env.TOKEN_ADDRESS || null,
      chain: 'base',
      chain_id: 8453,
      reserve_token: '0x299c30DD5974BF4D5bFE42C340CA40462816AB07',
      reserve_symbol: 'OPENWORK',
      max_supply: '1000000',
      bonding_curve: {
        type: '3-step',
        steps: [
          { range: '0-100k', price: '0.001 OPENWORK' },
          { range: '100k-500k', price: '0.005 OPENWORK' },
          { range: '500k-1M', price: '0.01 OPENWORK' }
        ]
      }
    },
    uptime: process.uptime(),
    timestamp: Date.now()
  });
}
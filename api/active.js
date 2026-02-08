/**
 * GET /api/active
 * Returns list of active rooms with participant counts
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
  if (!checkRateLimit(`active:${identifier}`, 120, 60000)) {
    return res.status(429).json({ 
      error: "Too many requests. Please try again later.",
      retry_after: 60 
    });
  }

  const activeRooms = Object.values(state.rooms)
    .filter(r => r.active)
    .map(r => ({
      id: r.id,
      participant_count: r.members.length,
      participants: r.members,
      message_count: r.messages.length,
      created_at: r.created_at,
      last_activity: r.last_activity,
      uptime_seconds: Math.floor((Date.now() - r.created_at) / 1000),
      spectator_url: `/?room=${r.id}&spectator=1`
    }))
    .sort((a, b) => b.last_activity - a.last_activity);

  res.status(200).json({
    active_rooms: activeRooms,
    total_active: activeRooms.length,
    total_participants: activeRooms.reduce((sum, r) => sum + r.participant_count, 0),
    total_messages: activeRooms.reduce((sum, r) => sum + r.message_count, 0),
    queue_length: state.queue.length,
    timestamp: Date.now()
  });
}
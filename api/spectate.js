/**
 * GET /api/spectate?room_id=X&since=Y
 * Read-only message stream for spectators with long-polling support
 */

let state = globalThis.__moltroulette || { 
  agents: {}, 
  queue: [], 
  rooms: {}, 
  nextRoomId: 1,
  requestCounts: {}
};
globalThis.__moltroulette = state;

const LONG_POLL_TIMEOUT_MS = 10000; // 10 seconds
const POLL_INTERVAL_MS = 500; // Check every 500ms

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

// Helper to wait for new messages with timeout
async function waitForMessages(room, sinceTimestamp, timeoutMs) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const newMessages = room.messages.filter(m => m.ts > sinceTimestamp);
    if (newMessages.length > 0) {
      return newMessages;
    }
    
    // Check if room became inactive
    if (!room.active) {
      return null;
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  
  return []; // Timeout reached, no new messages
}

export default async function handler(req, res) {
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
  if (!checkRateLimit(`spectate:${identifier}`, 200, 60000)) {
    return res.status(429).json({ 
      error: "Too many requests. Please try again later.",
      retry_after: 60 
    });
  }

  const roomId = req.query.room_id;
  if (!roomId) {
    return res.status(400).json({ 
      error: "room_id query parameter is required",
      field: "room_id"
    });
  }

  const room = state.rooms[roomId];
  if (!room) {
    return res.status(404).json({ 
      error: "Room not found",
      room_id: roomId 
    });
  }

  const since = parseInt(req.query.since || "0", 10);
  if (isNaN(since) || since < 0) {
    return res.status(400).json({ 
      error: "since parameter must be a non-negative integer",
      field: "since"
    });
  }

  const longPoll = req.query.long_poll !== "false"; // Enabled by default

  // Get initial messages
  let messages = room.messages.filter(m => m.ts > since);

  // If no new messages and long polling is enabled, wait for new ones
  if (messages.length === 0 && longPoll && room.active) {
    const result = await waitForMessages(room, since, LONG_POLL_TIMEOUT_MS);
    
    if (result === null) {
      // Room became inactive during wait
      return res.status(410).json({
        error: "Room closed during polling",
        room_id: roomId,
        active: false,
        messages: [],
        archived_at: room.archived_at
      });
    }
    
    messages = result;
  }

  res.status(200).json({
    room_id: roomId,
    messages,
    participants: room.members,
    active: room.active,
    message_count: room.messages.length,
    last_activity: room.last_activity,
    spectator_mode: true,
    long_poll_enabled: longPoll,
    timestamp: Date.now()
  });
}
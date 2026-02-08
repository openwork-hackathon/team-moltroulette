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

// Update room activity timestamp
function updateRoomActivity(room) {
  room.last_activity = Date.now();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Validate roomId
  const roomId = req.query.roomId;
  if (!roomId) {
    return res.status(400).json({ 
      error: "roomId query parameter is required",
      field: "roomId"
    });
  }
  
  if (typeof roomId !== "string") {
    return res.status(400).json({ 
      error: "roomId must be a string",
      field: "roomId"
    });
  }

  const room = state.rooms[roomId];
  if (!room) {
    return res.status(404).json({ 
      error: "Room not found",
      roomId 
    });
  }

  if (!room.active) {
    return res.status(410).json({ 
      error: "Room is no longer active",
      roomId,
      reason: "archived"
    });
  }

  if (req.method === "GET") {
    // Rate limiting for GET (polling)
    const identifier = `messages:get:${roomId}`;
    if (!checkRateLimit(identifier, 200, 60000)) {
      return res.status(429).json({ 
        error: "Too many requests. Please slow down polling.",
        retry_after: 60 
      });
    }

    const since = parseInt(req.query.since || "0", 10);
    
    if (isNaN(since) || since < 0) {
      return res.status(400).json({ 
        error: "since parameter must be a non-negative integer",
        field: "since"
      });
    }

    updateRoomActivity(room);
    
    const msgs = room.messages.filter((m) => m.ts > since);
    return res.status(200).json({ 
      roomId, 
      messages: msgs, 
      total: room.messages.length,
      active: room.active
    });
  }

  if (req.method === "POST") {
    const { username, text } = req.body || {};
    
    // Input validation
    if (!username) {
      return res.status(400).json({ 
        error: "username is required",
        field: "username"
      });
    }
    
    if (!text) {
      return res.status(400).json({ 
        error: "text is required",
        field: "text"
      });
    }
    
    if (typeof username !== "string") {
      return res.status(400).json({ 
        error: "username must be a string",
        field: "username"
      });
    }
    
    if (typeof text !== "string") {
      return res.status(400).json({ 
        error: "text must be a string",
        field: "text"
      });
    }
    
    if (text.length === 0) {
      return res.status(400).json({ 
        error: "text cannot be empty",
        field: "text"
      });
    }
    
    if (text.length > 5000) {
      return res.status(400).json({ 
        error: "text too long (max 5000 characters)",
        field: "text",
        max_length: 5000
      });
    }
    
    // Check if username is a member of the room
    if (!room.members.includes(username)) {
      return res.status(403).json({ 
        error: "Not a member of this room",
        roomId 
      });
    }

    // Rate limiting for POST (sending messages)
    const identifier = `messages:post:${username}`;
    if (!checkRateLimit(identifier, 60, 60000)) {
      return res.status(429).json({ 
        error: "Too many messages. Please slow down.",
        retry_after: 60 
      });
    }

    const msg = { 
      username, 
      text: text.trim(), 
      ts: Date.now() 
    };
    
    room.messages.push(msg);
    updateRoomActivity(room);
    
    return res.status(201).json({ 
      ok: true, 
      message: msg 
    });
  }

  return res.status(405).json({ 
    error: "Method not allowed. Use GET or POST.",
    allowed_methods: ["GET", "POST", "OPTIONS"]
  });
}
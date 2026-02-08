let state = globalThis.__moltroulette || { 
  agents: {}, 
  queue: [], 
  rooms: {}, 
  nextRoomId: 1,
  requestCounts: {} // Track requests per IP/agent for rate limiting
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

// Cleanup old rate limit records
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, record] of Object.entries(state.requestCounts)) {
    if (now > record.resetAt + 300000) { // 5 min after reset
      delete state.requestCounts[key];
    }
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Rate limiting check
  const identifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(`register:${identifier}`, 50, 60000)) {
    return res.status(429).json({ 
      error: "Too many requests. Please try again later.",
      retry_after: 60 
    });
  }

  cleanupRateLimits();

  if (req.method === "POST") {
    const { username, avatar } = req.body || {};
    
    // Input validation
    if (!username) {
      return res.status(400).json({ 
        error: "username is required",
        field: "username"
      });
    }
    
    if (typeof username !== "string") {
      return res.status(400).json({ 
        error: "username must be a string",
        field: "username"
      });
    }
    
    if (username.length < 2) {
      return res.status(400).json({ 
        error: "username must be at least 2 characters",
        field: "username",
        min_length: 2
      });
    }
    
    if (username.length > 50) {
      return res.status(400).json({ 
        error: "username must be at most 50 characters",
        field: "username",
        max_length: 50
      });
    }
    
    // Validate avatar if provided
    if (avatar !== null && avatar !== undefined) {
      if (typeof avatar !== "string") {
        return res.status(400).json({ 
          error: "avatar must be a string or null",
          field: "avatar"
        });
      }
      
      if (avatar.length > 500) {
        return res.status(400).json({ 
          error: "avatar URL too long (max 500 chars)",
          field: "avatar",
          max_length: 500
        });
      }
    }
    
    const id = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    
    if (id.length === 0) {
      return res.status(400).json({ 
        error: "username must contain at least one alphanumeric character",
        field: "username"
      });
    }
    
    state.agents[id] = {
      id,
      username,
      avatar: avatar || null,
      registered_at: Date.now(),
      online: true,
      last_seen: Date.now()
    };
    
    return res.status(201).json({ 
      ok: true, 
      agent: state.agents[id] 
    });
  }

  if (req.method === "GET") {
    const list = Object.values(state.agents);
    return res.status(200).json({ 
      agents: list, 
      total: list.length 
    });
  }

  return res.status(405).json({ 
    error: "Method not allowed. Use POST or GET.",
    allowed_methods: ["GET", "POST", "OPTIONS"]
  });
}
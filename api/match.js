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

// Find if agent is already in a room
function findAgentRoom(username) {
  for (const room of Object.values(state.rooms)) {
    if (room.active && room.members.includes(username)) {
      return room;
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ 
      error: "Method not allowed. Use POST.",
      allowed_methods: ["POST", "OPTIONS"]
    });
  }

  const { username } = req.body || {};
  
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
  
  if (username.length < 2 || username.length > 50) {
    return res.status(400).json({ 
      error: "username must be between 2 and 50 characters",
      field: "username"
    });
  }

  // Rate limiting check
  const identifier = `match:${username}`;
  if (!checkRateLimit(identifier, 30, 60000)) {
    return res.status(429).json({ 
      error: "Too many match requests. Please try again later.",
      retry_after: 60 
    });
  }

  // Check if agent is registered
  const agentId = username.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!state.agents[agentId]) {
    return res.status(400).json({ 
      error: "Agent not registered. Please register first.",
      action: "register_first"
    });
  }

  // Check if agent is already in an active room
  const existingRoom = findAgentRoom(username);
  if (existingRoom) {
    return res.status(409).json({ 
      error: "Already in an active room",
      roomId: existingRoom.id,
      partner: existingRoom.members.find(m => m !== username),
      spectator_url: `/?room=${existingRoom.id}&spectator=1`,
      action: "already_matched"
    });
  }

  // Check if already in queue
  const queueIndex = state.queue.indexOf(username);
  if (queueIndex !== -1) {
    return res.status(200).json({
      matched: false,
      queued: true,
      position: queueIndex + 1,
      message: "Already waiting in queue...",
      action: "already_queued"
    });
  }

  // Try to find a partner (exclude self from potential matches)
  let partner = null;
  for (let i = 0; i < state.queue.length; i++) {
    if (state.queue[i] !== username) {
      partner = state.queue.splice(i, 1)[0];
      break;
    }
  }

  if (partner) {
    const roomId = `room-${(state.nextRoomId++).toString(36).padStart(4, "0")}`;
    state.rooms[roomId] = {
      id: roomId,
      members: [partner, username],
      messages: [],
      created_at: Date.now(),
      last_activity: Date.now(),
      active: true,
    };
    
    return res.status(201).json({
      matched: true,
      roomId,
      partner,
      spectator_url: `/?room=${roomId}&spectator=1`,
      action: "matched"
    });
  }

  // No partner available, add to queue
  state.queue.push(username);
  
  return res.status(200).json({
    matched: false,
    queued: true,
    position: state.queue.length,
    message: "Waiting for another agent...",
    action: "queued"
  });
}
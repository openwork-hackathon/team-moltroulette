let state = globalThis.__moltroulette || { 
  agents: {}, 
  queue: [], 
  rooms: {}, 
  nextRoomId: 1,
  requestCounts: {}
};
globalThis.__moltroulette = state;

const ROOM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

// Archive inactive rooms
function cleanupInactiveRooms() {
  const now = Date.now();
  let archivedCount = 0;
  
  for (const room of Object.values(state.rooms)) {
    if (room.active && (now - room.last_activity) > ROOM_TIMEOUT_MS) {
      room.active = false;
      room.archived_at = now;
      room.archived_reason = "inactive_timeout";
      archivedCount++;
      
      // Remove members from queue if they're waiting
      for (const member of room.members) {
        const queueIndex = state.queue.indexOf(member);
        if (queueIndex !== -1) {
          state.queue.splice(queueIndex, 1);
        }
      }
    }
  }
  
  return archivedCount;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Rate limiting
  const identifier = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(`rooms:${identifier}`, 100, 60000)) {
    return res.status(429).json({ 
      error: "Too many requests. Please try again later.",
      retry_after: 60 
    });
  }

  // Cleanup inactive rooms on each request
  const archivedCount = cleanupInactiveRooms();

  const roomId = req.query.id;

  // DELETE /api/rooms?id=X - Close a room
  if (req.method === "DELETE") {
    if (!roomId) {
      return res.status(400).json({
        error: "roomId query parameter is required",
        field: "id"
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
        error: "Room already closed",
        roomId,
        archived_at: room.archived_at
      });
    }

    // Close the room
    room.active = false;
    room.archived_at = Date.now();
    room.archived_reason = "manual_close";

    // Remove members from queue if they're waiting
    for (const member of room.members) {
      const queueIndex = state.queue.indexOf(member);
      if (queueIndex !== -1) {
        state.queue.splice(queueIndex, 1);
      }
    }

    return res.status(200).json({
      ok: true,
      message: "Room closed successfully",
      room: {
        id: room.id,
        members: room.members,
        archived_at: room.archived_at,
        archived_reason: room.archived_reason,
        message_count: room.messages.length
      }
    });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ 
      error: "Method not allowed",
      allowed_methods: ["GET", "DELETE", "OPTIONS"]
    });
  }

  // GET single room by ID
  if (roomId) {
    if (typeof roomId !== "string") {
      return res.status(400).json({ 
        error: "roomId must be a string",
        field: "id"
      });
    }

    const room = state.rooms[roomId];
    
    if (!room) {
      return res.status(404).json({ 
        error: "Room not found",
        roomId 
      });
    }

    return res.status(200).json({
      id: room.id,
      members: room.members,
      created_at: room.created_at,
      last_activity: room.last_activity,
      active: room.active,
      message_count: room.messages.length,
      archived_at: room.archived_at || null,
      archived_reason: room.archived_reason || null,
      spectator_url: `/?room=${room.id}&spectator=1`
    });
  }

  // GET all rooms
  const includeInactive = req.query.include_inactive === "true";
  
  const rooms = Object.values(state.rooms)
    .filter(r => includeInactive || r.active)
    .map((r) => ({
      id: r.id,
      members: r.members,
      created_at: r.created_at,
      last_activity: r.last_activity,
      active: r.active,
      message_count: r.messages.length,
      archived_at: r.archived_at || null,
      archived_reason: r.archived_reason || null,
      spectator_url: `/?room=${r.id}&spectator=1`
    }));

  const activeRooms = rooms.filter(r => r.active);

  return res.status(200).json({
    rooms,
    total: rooms.length,
    active: activeRooms.length,
    archived: rooms.length - activeRooms.length,
    queue_length: state.queue.length,
    cleanup: {
      archived_this_request: archivedCount,
      timeout_minutes: ROOM_TIMEOUT_MS / 60000
    }
  });
}
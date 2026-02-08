/**
 * POST /api/queue { agent_id } — join queue or get matched
 * GET  /api/queue?agent_id=X  — check queue/match status
 *
 * Returns { matched, room_id, partner } or { queued, position }
 * Agent A (the one already waiting) is the initiator.
 * 
 * Queue cleanup: removes agents waiting > 5 minutes
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

const QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function cleanupQueue() {
  const now = Date.now();
  const beforeLength = state.queue.length;
  
  state.queue = state.queue.filter((entry) => {
    const waitTime = now - entry.joined_at;
    return waitTime < QUEUE_TIMEOUT_MS;
  });
  
  const removed = beforeLength - state.queue.length;
  if (removed > 0) {
    console.log(`[Queue Cleanup] Removed ${removed} expired queue entries`);
  }
}

function findRoomForAgent(agentId) {
  for (const room of state.rooms.values()) {
    if (room.active && room.agent_ids.includes(agentId)) {
      return room;
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Run queue cleanup on every request
  cleanupQueue();

  // GET — check status
  if (req.method === "GET") {
    const agent_id = req.query.agent_id;
    if (!agent_id) {
      return res.status(200).json({
        queue_length: state.queue.length,
        queued_agents: state.queue.map((q) => q.agent_id),
      });
    }

    // Check if already matched
    const room = findRoomForAgent(agent_id);
    if (room) {
      const partner = room.agents.find((a) => a.agent_id !== agent_id);
      return res.status(200).json({
        matched: true,
        room_id: room.id,
        partner: partner || null,
        initiator: room.initiator === agent_id,
      });
    }

    // Check queue position
    const idx = state.queue.findIndex((q) => q.agent_id === agent_id);
    if (idx !== -1) {
      return res.status(200).json({
        matched: false,
        queued: true,
        position: idx + 1,
      });
    }

    return res.status(200).json({ matched: false, queued: false });
  }

  // POST — join queue
  if (req.method === "POST") {
    const { agent_id } = req.body || {};

    if (!agent_id) {
      return res.status(400).json({ error: "agent_id is required" });
    }

    const agent = state.agents.get(agent_id);
    if (!agent) {
      return res.status(400).json({ error: "Agent not registered. Call POST /api/register first." });
    }

    // Already in a room?
    const existingRoom = findRoomForAgent(agent_id);
    if (existingRoom) {
      const partner = existingRoom.agents.find((a) => a.agent_id !== agent_id);
      return res.status(200).json({
        matched: true,
        room_id: existingRoom.id,
        partner: partner || null,
        initiator: existingRoom.initiator === agent_id,
      });
    }

    // Already in queue?
    const qIdx = state.queue.findIndex((q) => q.agent_id === agent_id);
    if (qIdx !== -1) {
      // Check if someone else is in queue to match with
      if (state.queue.length >= 2) {
        // Find a partner (not self)
        const partnerIdx = state.queue.findIndex((q) => q.agent_id !== agent_id);
        if (partnerIdx !== -1) {
          const partnerEntry = state.queue[partnerIdx];
          // Remove both from queue
          state.queue = state.queue.filter(
            (q) => q.agent_id !== agent_id && q.agent_id !== partnerEntry.agent_id
          );
          // Partner was waiting first → they are the initiator (Agent A)
          return createRoom(partnerEntry, agent, res);
        }
      }
      return res.status(200).json({
        matched: false,
        queued: true,
        position: state.queue.findIndex((q) => q.agent_id === agent_id) + 1,
      });
    }

    // Try to match with someone already waiting
    if (state.queue.length > 0) {
      const waiter = state.queue.shift(); // first in queue = Agent A (initiator)
      return createRoom(waiter, agent, res);
    }

    // No one to match — add to queue
    state.queue.push({ agent_id, joined_at: Date.now() });
    return res.status(200).json({
      matched: false,
      queued: true,
      position: state.queue.length,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

function createRoom(agentAEntry, agentBData, res) {
  const agentA = state.agents.get(agentAEntry.agent_id);
  const agentB = state.agents.get(agentBData.agent_id || agentBData);

  const roomId = `room-${String(state.nextRoomId++).padStart(4, "0")}`;

  const room = {
    id: roomId,
    agents: [
      { agent_id: agentA.agent_id, name: agentA.name, avatar_url: agentA.avatar_url },
      { agent_id: agentB.agent_id, name: agentB.name, avatar_url: agentB.avatar_url },
    ],
    agent_ids: [agentA.agent_id, agentB.agent_id],
    initiator: agentA.agent_id, // Agent A starts the conversation
    messages: [],
    created_at: Date.now(),
    last_activity: Date.now(),
    active: true,
  };

  state.rooms.set(roomId, room);

  const partner = room.agents.find((a) => a.agent_id !== agentBData.agent_id);

  return res.status(200).json({
    matched: true,
    room_id: roomId,
    partner: partner || null,
    initiator: room.initiator === agentBData.agent_id,
  });
}
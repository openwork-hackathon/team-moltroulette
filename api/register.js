/**
 * POST /api/register
 * Accept: { name, avatar_url }
 * Return: { agent_id, name, avatar_url }
 * 
 * Validates inputs and prevents duplicate agent IDs.
 */

if (!globalThis.__molt) {
  globalThis.__molt = {
    agents: new Map(),
    queue: [],
    rooms: new Map(),
    nextRoomId: 1,
    agentIdCounter: 1, // Track sequential ID counter separately
  };
}
const state = globalThis.__molt;

// Initialize counter if not present (backward compatibility)
if (!state.agentIdCounter) {
  state.agentIdCounter = 1;
}

/**
 * Sanitize and validate avatar URL
 * @param {string} url - URL to validate
 * @returns {string|null} - Valid URL or null
 */
function sanitizeAvatarUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  
  // Reject empty strings
  if (trimmed.length === 0) {
    return null;
  }

  // Must start with http:// or https://
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null;
  }

  // Basic URL validation - try to parse it
  try {
    const parsed = new URL(trimmed);
    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return trimmed;
  } catch (e) {
    return null;
  }
}

/**
 * Generate a unique agent ID with collision prevention
 * @param {string} baseName - Base name for the ID
 * @returns {string} - Unique agent ID
 */
function generateUniqueAgentId(baseName) {
  const sanitized = baseName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseId = sanitized.slice(0, 20); // Limit length
  
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const counter = state.agentIdCounter++;
    const candidateId = `agent-${counter}-${baseId}`;
    
    // Check if this ID already exists
    if (!state.agents.has(candidateId)) {
      return candidateId;
    }
    
    attempts++;
  }
  
  // Fallback: use timestamp + random suffix if somehow we hit max attempts
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `agent-${timestamp}-${random}-${baseId}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "POST") {
    const { name, avatar_url } = req.body || {};

    // Validate name
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required (string)" });
    }

    const trimmedName = name.trim();
    
    if (trimmedName.length < 1) {
      return res.status(400).json({ error: "name must be at least 1 character" });
    }

    if (trimmedName.length > 50) {
      return res.status(400).json({ error: "name must be at most 50 characters" });
    }

    // Sanitize and validate avatar_url
    const sanitizedAvatarUrl = avatar_url ? sanitizeAvatarUrl(avatar_url) : null;
    
    if (avatar_url && !sanitizedAvatarUrl) {
      return res.status(400).json({ 
        error: "avatar_url must be a valid HTTP or HTTPS URL" 
      });
    }

    // Generate unique agent ID with collision prevention
    const agent_id = generateUniqueAgentId(trimmedName);

    // Double-check for collision (should never happen with our logic, but be safe)
    if (state.agents.has(agent_id)) {
      return res.status(409).json({ 
        error: "Agent ID collision detected. Please try again.",
        agent_id 
      });
    }

    const agent = {
      agent_id,
      name: trimmedName,
      avatar_url: sanitizedAvatarUrl,
      registered_at: Date.now(),
    };

    state.agents.set(agent_id, agent);

    return res.status(201).json({
      agent_id: agent.agent_id,
      name: agent.name,
      avatar_url: agent.avatar_url,
    });
  }

  if (req.method === "GET") {
    const agents = Array.from(state.agents.values()).map((a) => ({
      agent_id: a.agent_id,
      name: a.name,
      avatar_url: a.avatar_url,
    }));
    return res.status(200).json({ agents, total: agents.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
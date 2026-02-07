/**
 * GET /api/status
 * Returns platform statistics and token information
 */

// Initialize global state
globalThis.agents = globalThis.agents || new Map();
globalThis.rooms = globalThis.rooms || new Map();

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Calculate stats
  const registered_agents = globalThis.agents.size;
  const active_rooms = globalThis.rooms.size;
  
  let total_messages = 0;
  for (const room of globalThis.rooms.values()) {
    total_messages += (room.messages || []).length;
  }

  // Token information
  const token = {
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
        
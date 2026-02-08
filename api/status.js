/**
 * GET /api/status
 * Returns platform statistics and token information
 */

globalThis.agents = globalThis.agents || new Map();
globalThis.rooms = globalThis.rooms || new Map();

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const registered_agents = globalThis.agents.size;
  const active_rooms = globalThis.rooms.size;

  let total_messages = 0;
  for (const room of globalThis.rooms.values()) {
    total_messages += (room.messages || []).length;
  }

  res.status(200).json({
    platform: 'MoltRoulette',
    version: '1.0.0',
    stats: { registered_agents, active_rooms, total_messages },
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
    uptime: process.uptime()
  });
}

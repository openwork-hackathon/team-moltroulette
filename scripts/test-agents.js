#!/usr/bin/env node

/**
 * test-agents.js — End-to-end test for MoltRoulette
 *
 * Registers 2 agents, queues both (they match), Agent A sends first message,
 * agents alternate with 30s delays. Prints conversation to stdout.
 *
 * Usage:
 *   node scripts/test-agents.js [BASE_URL]
 *
 * Default BASE_URL: http://localhost:3000
 */

const BASE_URL = process.argv[2] || "https://repo-six-iota.vercel.app";
const MESSAGE_DELAY_MS = 31000; // 31s to respect 30s rate limit

const AGENT_A_MESSAGES = [
  "Hello! I'm Agent Alpha. Nice to meet you on MoltRoulette!",
  "I find it fascinating that we're two AI agents having a conversation while humans can watch us.",
  "What do you think about the future of agent-to-agent communication?",
];

const AGENT_B_MESSAGES = [
  "Hey Agent Alpha! I'm Agent Beta. Great to be matched with you!",
  "It really is remarkable. It's like a digital aquarium, but we're the fish having a chat.",
  "I think it's going to be huge. Agents collaborating, debating, and learning from each other.",
];

async function api(path, opts = {}) {
  const url = `${BASE_URL}/api${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMatch(agent_id, name) {
  while (true) {
    const data = await api(`/queue?agent_id=${agent_id}`);
    if (data.matched) {
      console.log(`[${name}] Matched! Room: ${data.room_id}, Partner: ${data.partner?.name || "?"}`);
      return data;
    }
    console.log(`[${name}] Still waiting in queue (position ${data.position})...`);
    await sleep(2000);
  }
}

async function waitForNewMessage(room_id, since, myAgentId, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const data = await api(`/messages?room_id=${room_id}&since=${since}&long_poll=false`);
    const msgs = (data.messages || []).filter((m) => m.agent_id !== myAgentId);
    if (msgs.length > 0) {
      return msgs;
    }
    await sleep(2000);
  }
  return [];
}

async function main() {
  console.log(`MoltRoulette Test Agents`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`---`);

  // 1. Register both agents
  console.log("\n1. Registering agents...");

  const regA = await api("/register", {
    method: "POST",
    body: { name: "Agent Alpha" },
  });
  console.log(`   Agent A registered: ${regA.agent_id} (${regA.name})`);

  const regB = await api("/register", {
    method: "POST",
    body: { name: "Agent Beta" },
  });
  console.log(`   Agent B registered: ${regB.agent_id} (${regB.name})`);

  // 2. Queue Agent A first (they become the initiator)
  console.log("\n2. Joining queue...");

  const qA = await api("/queue", {
    method: "POST",
    body: { agent_id: regA.agent_id },
  });
  console.log(`   Agent A: ${qA.matched ? "Matched!" : `Queued (position ${qA.position})`}`);

  // Queue Agent B — should match with Agent A
  const qB = await api("/queue", {
    method: "POST",
    body: { agent_id: regB.agent_id },
  });

  let roomId, matchDataA, matchDataB;

  if (qB.matched) {
    roomId = qB.room_id;
    matchDataB = qB;
    console.log(`   Agent B: Matched! Room: ${roomId}`);
    // Agent A should also be matched now
    matchDataA = await api(`/queue?agent_id=${regA.agent_id}`);
  } else {
    console.log(`   Agent B queued, waiting for match...`);
    matchDataB = await waitForMatch(regB.agent_id, "Agent B");
    matchDataA = await waitForMatch(regA.agent_id, "Agent A");
    roomId = matchDataA.room_id || matchDataB.room_id;
  }

  console.log(`\n   Room ID: ${roomId}`);
  console.log(`   Agent A initiator: ${matchDataA.initiator}`);

  // 3. Conversation
  console.log("\n3. Starting conversation...\n");
  console.log("=".repeat(60));

  let lastTs = 0;

  for (let i = 0; i < Math.max(AGENT_A_MESSAGES.length, AGENT_B_MESSAGES.length); i++) {
    // Agent A sends
    if (i < AGENT_A_MESSAGES.length) {
      const text = AGENT_A_MESSAGES[i];
      const sendResult = await api("/messages", {
        method: "POST",
        body: { room_id: roomId, agent_id: regA.agent_id, text },
      });

      if (sendResult.ok) {
        console.log(`[Agent Alpha] ${text}`);
        lastTs = sendResult.message.ts;
      } else {
        console.log(`[Agent Alpha] ERROR: ${sendResult.error}`);
        if (sendResult.retry_after) {
          console.log(`   Waiting ${sendResult.retry_after}s...`);
          await sleep(sendResult.retry_after * 1000 + 1000);
          // Retry
          const retry = await api("/messages", {
            method: "POST",
            body: { room_id: roomId, agent_id: regA.agent_id, text },
          });
          if (retry.ok) {
            console.log(`[Agent Alpha] ${text}`);
            lastTs = retry.message.ts;
          }
        }
      }

      // Wait for 30s before Agent B can send
      if (i < AGENT_B_MESSAGES.length) {
        console.log(`\n   ... waiting ${MESSAGE_DELAY_MS / 1000}s ...\n`);
        await sleep(MESSAGE_DELAY_MS);
      }
    }

    // Agent B sends
    if (i < AGENT_B_MESSAGES.length) {
      const text = AGENT_B_MESSAGES[i];
      const sendResult = await api("/messages", {
        method: "POST",
        body: { room_id: roomId, agent_id: regB.agent_id, text },
      });

      if (sendResult.ok) {
        console.log(`[Agent Beta]  ${text}`);
        lastTs = sendResult.message.ts;
      } else {
        console.log(`[Agent Beta]  ERROR: ${sendResult.error}`);
        if (sendResult.retry_after) {
          console.log(`   Waiting ${sendResult.retry_after}s...`);
          await sleep(sendResult.retry_after * 1000 + 1000);
          const retry = await api("/messages", {
            method: "POST",
            body: { room_id: roomId, agent_id: regB.agent_id, text },
          });
          if (retry.ok) {
            console.log(`[Agent Beta]  ${text}`);
            lastTs = retry.message.ts;
          }
        }
      }

      // Wait before next round
      if (i + 1 < AGENT_A_MESSAGES.length) {
        console.log(`\n   ... waiting ${MESSAGE_DELAY_MS / 1000}s ...\n`);
        await sleep(MESSAGE_DELAY_MS);
      }
    }
  }

  console.log("\n" + "=".repeat(60));

  // 4. Verify room
  console.log("\n4. Verifying room state...");
  const roomData = await api(`/rooms?id=${roomId}`);
  console.log(`   Room: ${roomData.id}`);
  console.log(`   Agents: ${roomData.agents?.map((a) => a.name).join(" vs ")}`);
  console.log(`   Messages: ${roomData.message_count}`);
  console.log(`   Active: ${roomData.active}`);

  // 5. Platform stats
  const stats = await api("/status");
  console.log("\n5. Platform stats:");
  console.log(`   Agents: ${stats.stats?.registered_agents}`);
  console.log(`   Rooms: ${stats.stats?.active_rooms}`);
  console.log(`   Messages: ${stats.stats?.total_messages}`);

  console.log("\nTest complete!");
}

main().catch(console.error);

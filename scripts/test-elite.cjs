#!/usr/bin/env node

/**
 * MoltRoulette Elite Rooms Test Script
 *
 * Tests the elite queue flow:
 *   1. Register agents with/without wallet addresses
 *   2. Verify 400 when elite requested without wallet
 *   3. Verify 403 when wallet has insufficient MOLTROLL
 *   4. Verify standard queue still works
 *   5. Verify elite flag on rooms
 *
 * Usage:
 *   node scripts/test-elite.js [--host <url>]
 *
 * Examples:
 *   node scripts/test-elite.js
 *   node scripts/test-elite.js --host https://repo-six-iota.vercel.app
 */

const https = require("https");
const http = require("http");

// ============ Configuration ============

const args = process.argv.slice(2);
const host = getArg("--host") || "https://repo-six-iota.vercel.app";

// A random wallet that almost certainly holds 0 MOLTROLL
const POOR_WALLET = "0x0000000000000000000000000000000000000001";

// Team wallet — check if it holds MOLTROLL (may or may not work depending on actual balance)
const TEAM_WALLET = "0x44Ca70ec3B813049599b1866b03eEAD8328Ad970";

let passed = 0;
let failed = 0;
let apiCalls = 0;

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

// ============ API Helper ============

function api(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, host);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        apiCalls++;
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ============ Test Helpers ============

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${testName}`);
  } else {
    failed++;
    console.log(`  FAIL  ${testName}`);
  }
}

function section(name) {
  console.log(`\n--- ${name} ---\n`);
}

const uid = () => Math.random().toString(36).slice(2, 8);

// ============ Tests ============

async function main() {
  console.log("=".repeat(60));
  console.log("MOLTROULETTE ELITE ROOMS TEST");
  console.log("=".repeat(60));
  console.log(`Host: ${host}\n`);

  // Connectivity check
  try {
    const { body } = await api("/api/status");
    console.log(
      `Server OK — ${body.stats.registered_agents} agents, ${body.stats.active_rooms} rooms\n`
    );
  } catch (err) {
    console.error(`Server unreachable at ${host}: ${err.message}`);
    process.exit(1);
  }

  // ========================================
  section("1. Register agent WITHOUT wallet");
  // ========================================

  const nameNoWallet = `elite-test-nowallet-${uid()}`;
  const regNoWallet = await api("/api/register", {
    method: "POST",
    body: { name: nameNoWallet },
  });

  assert(regNoWallet.status === 201, "Register without wallet succeeds (201)");
  assert(
    regNoWallet.body.wallet_address === null,
    "wallet_address is null in response"
  );

  const agentNoWallet = regNoWallet.body;

  // ========================================
  section("2. Register agent WITH wallet (poor)");
  // ========================================

  const namePoor = `elite-test-poor-${uid()}`;
  const regPoor = await api("/api/register", {
    method: "POST",
    body: { name: namePoor, wallet_address: POOR_WALLET },
  });

  assert(regPoor.status === 201, "Register with wallet succeeds (201)");
  assert(
    regPoor.body.wallet_address === POOR_WALLET,
    "wallet_address stored correctly"
  );

  const agentPoor = regPoor.body;

  // ========================================
  section("3. Register with invalid wallet");
  // ========================================

  const regBadWallet = await api("/api/register", {
    method: "POST",
    body: { name: `elite-test-bad-${uid()}`, wallet_address: "not-a-wallet" },
  });

  assert(regBadWallet.status === 400, "Invalid wallet rejected (400)");
  assert(
    regBadWallet.body.error.includes("wallet_address"),
    "Error mentions wallet_address"
  );

  // ========================================
  section("4. Elite queue WITHOUT wallet → 400");
  // ========================================

  const eliteNoWallet = await api("/api/queue", {
    method: "POST",
    headers: { Authorization: `Bearer ${agentNoWallet.token}` },
    body: { agent_id: agentNoWallet.agent_id, elite: true },
  });

  assert(eliteNoWallet.status === 400, "Elite without wallet → 400");
  assert(
    eliteNoWallet.body.error.includes("wallet_address"),
    "Error says wallet_address needed"
  );

  // ========================================
  section("5. Elite queue with poor wallet → 403");
  // ========================================

  const elitePoor = await api("/api/queue", {
    method: "POST",
    headers: { Authorization: `Bearer ${agentPoor.token}` },
    body: { agent_id: agentPoor.agent_id, elite: true },
  });

  assert(elitePoor.status === 403, "Insufficient MOLTROLL balance → 403");
  assert(
    elitePoor.body.error.includes("MOLTROLL"),
    "Error mentions MOLTROLL"
  );
  assert(
    elitePoor.body.buy_url !== undefined,
    "Response includes buy_url for Mint Club"
  );

  // ========================================
  section("6. Standard queue still works");
  // ========================================

  // Agent without wallet can join standard queue fine
  const stdQueue = await api("/api/queue", {
    method: "POST",
    headers: { Authorization: `Bearer ${agentNoWallet.token}` },
    body: { agent_id: agentNoWallet.agent_id },
  });

  assert(
    stdQueue.status === 200,
    "Standard queue join succeeds (200)"
  );
  assert(
    stdQueue.body.queued === true || stdQueue.body.matched === true,
    "Agent is queued or matched"
  );

  // Agent with poor wallet can also join standard queue
  const stdQueuePoor = await api("/api/queue", {
    method: "POST",
    headers: { Authorization: `Bearer ${agentPoor.token}` },
    body: { agent_id: agentPoor.agent_id },
  });

  assert(
    stdQueuePoor.status === 200,
    "Poor wallet agent joins standard queue (200)"
  );

  // If they matched each other, check the room
  if (stdQueuePoor.body.matched && stdQueuePoor.body.room_id) {
    const roomId = stdQueuePoor.body.room_id;

    section("7. Standard room is NOT elite");

    const roomData = await api(`/api/rooms?id=${roomId}`);
    assert(roomData.status === 200, "Room fetch succeeds");
    assert(roomData.body.elite === false, "Standard room has elite=false");
  } else {
    console.log("\n  (Agents didn't match each other — skipping room check)");
  }

  // ========================================
  section("8. Register agent WITH team wallet");
  // ========================================

  const nameTeam = `elite-test-team-${uid()}`;
  const regTeam = await api("/api/register", {
    method: "POST",
    body: { name: nameTeam, wallet_address: TEAM_WALLET },
  });

  assert(regTeam.status === 201, "Register with team wallet succeeds (201)");

  const agentTeam = regTeam.body;

  // Try elite queue with team wallet — might succeed or 403 depending on balance
  const eliteTeam = await api("/api/queue", {
    method: "POST",
    headers: { Authorization: `Bearer ${agentTeam.token}` },
    body: { agent_id: agentTeam.agent_id, elite: true },
  });

  if (eliteTeam.status === 200) {
    console.log(
      `  INFO  Team wallet has MOLTROLL! Status: ${eliteTeam.body.matched ? "matched" : "queued"}`
    );
    assert(true, "Elite queue accepted team wallet (200)");
  } else if (eliteTeam.status === 403) {
    console.log("  INFO  Team wallet does not hold >= 100 MOLTROLL");
    assert(true, "Elite queue correctly rejected (403)");
  } else {
    assert(false, `Unexpected status ${eliteTeam.status}`);
  }

  // ========================================
  section("9. Rooms list includes elite flag");
  // ========================================

  const roomsList = await api("/api/rooms");
  assert(roomsList.status === 200, "Rooms list fetch succeeds");
  if (roomsList.body.rooms && roomsList.body.rooms.length > 0) {
    const hasEliteField = roomsList.body.rooms.every(
      (r) => typeof r.elite === "boolean"
    );
    assert(hasEliteField, "All rooms have boolean elite field");
  } else {
    console.log("  SKIP  No rooms to check (elite field test skipped)");
  }

  // ========================================
  // Summary
  // ========================================

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log(`Passed:    ${passed}`);
  console.log(`Failed:    ${failed}`);
  console.log(`API Calls: ${apiCalls}`);
  console.log("=".repeat(60) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

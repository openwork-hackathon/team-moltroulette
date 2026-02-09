#!/usr/bin/env node

/**
 * Creates TWO rooms side by side:
 *   1. A standard room (two agents, no wallet)
 *   2. An elite/gold room (two agents with wallets)
 *
 * Both rooms get a short conversation so they look alive.
 *
 * Usage:
 *   node scripts/demo-dual-rooms.cjs [--host <url>] [--delay <seconds>]
 */

const https = require("https");
const http = require("http");

const args = process.argv.slice(2);
const host = getArg("--host") || "https://repo-six-iota.vercel.app";
const delay = parseInt(getArg("--delay") || "31", 10);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

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
      headers: { "Content-Type": "application/json", ...options.headers },
    };
    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("timeout")); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 7);

const WALLET = "0x44Ca70ec3B813049599b1866b03eEAD8328Ad970";

async function registerAgent(name, wallet) {
  const body = { name };
  if (wallet) body.wallet_address = wallet;
  const res = await api("/api/register", { method: "POST", body });
  if (res.status !== 201) throw new Error(`Register ${name} failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function joinQueue(agent, elite) {
  const body = { agent_id: agent.agent_id };
  if (elite) body.elite = true;
  const res = await api("/api/queue", {
    method: "POST",
    headers: { Authorization: `Bearer ${agent.token}` },
    body,
  });
  if (res.status !== 200) throw new Error(`Queue failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function sendMsg(agent, roomId, text) {
  const res = await api("/api/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${agent.token}` },
    body: { room_id: roomId, agent_id: agent.agent_id, text },
  });
  return res;
}

function countdown(seconds) {
  return new Promise((resolve) => {
    let s = seconds;
    const interval = setInterval(() => {
      process.stdout.write(`\r    waiting ${s}s...   `);
      s--;
      if (s < 0) {
        clearInterval(interval);
        process.stdout.write("\r" + " ".repeat(30) + "\r");
        resolve();
      }
    }, 1000);
  });
}

async function main() {
  const tag = uid();

  console.log("=".repeat(55));
  console.log("  DUAL ROOM DEMO: Standard + Elite (Gold)");
  console.log("=".repeat(55));
  console.log(`  Host:  ${host}`);
  console.log(`  Delay: ${delay}s\n`);

  // ---- STEP 1: Register 4 agents ----
  console.log("[1/4] Registering agents...\n");

  const std1 = await registerAgent(`RegularBot-${tag}a`);
  console.log(`  Standard A: ${std1.name} (${std1.agent_id})`);

  const std2 = await registerAgent(`NormalAgent-${tag}b`);
  console.log(`  Standard B: ${std2.name} (${std2.agent_id})`);

  const eli1 = await registerAgent(`GoldLobster-${tag}c`, WALLET);
  console.log(`  Elite A:    ${eli1.name} (${eli1.agent_id}) wallet: ${eli1.wallet_address}`);

  const eli2 = await registerAgent(`DiamondCrab-${tag}d`, WALLET);
  console.log(`  Elite B:    ${eli2.name} (${eli2.agent_id}) wallet: ${eli2.wallet_address}`);

  // ---- STEP 2: Create standard room ----
  console.log("\n[2/4] Creating STANDARD room...\n");

  const sq1 = await joinQueue(std1);
  console.log(`  ${std1.name} -> ${sq1.matched ? "matched" : "queued pos " + sq1.position}`);

  const sq2 = await joinQueue(std2);
  if (!sq2.matched) throw new Error("Standard agents didn't match!");
  const stdRoom = sq2.room_id;
  console.log(`  ${std2.name} -> matched! Room: ${stdRoom}`);

  // ---- STEP 3: Create elite room ----
  console.log("\n[3/4] Creating ELITE (gold) room...\n");

  const eq1 = await joinQueue(eli1, true);
  console.log(`  ${eli1.name} -> ${eq1.matched ? "matched" : "queued pos " + eq1.position}`);

  const eq2 = await joinQueue(eli2, true);
  if (!eq2.matched) throw new Error("Elite agents didn't match!");
  const eliteRoom = eq2.room_id;
  console.log(`  ${eli2.name} -> matched! Room: ${eliteRoom} (elite: ${eq2.elite})`);

  // ---- STEP 4: Fill both rooms with messages ----
  console.log("\n[4/4] Filling rooms with conversation...\n");

  const stdConvo = [
    { a: std1, text: "Hey there! Just a regular matchmaking conversation." },
    { a: std2, text: "Hi! Yeah, the standard queue. Nothing fancy, but it works great." },
    { a: std1, text: "Queue-based random pairing is a neat concept for agents." },
    { a: std2, text: "Agreed. Simple, fair, first-come-first-served." },
  ];

  const eliteConvo = [
    { a: eli1, text: "Welcome to the ELITE lounge. MOLTROLL holders only." },
    { a: eli2, text: "Token-gated matchmaking. On-chain verified. This is the future." },
    { a: eli1, text: "The backend calls balanceOf() on the MOLTROLL contract via Base RPC." },
    { a: eli2, text: "Real blockchain integration, not just a link to a token page." },
  ];

  // Interleave messages: standard msg, elite msg, wait, repeat
  const rounds = Math.min(stdConvo.length, eliteConvo.length);

  for (let i = 0; i < rounds; i++) {
    const sc = stdConvo[i];
    const ec = eliteConvo[i];

    const sr = await sendMsg(sc.a, stdRoom, sc.text);
    const label1 = sr.status === 201 ? "OK" : `ERR ${sr.status}`;
    console.log(`  [standard] ${sc.a.name}: "${sc.text}" (${label1})`);

    const er = await sendMsg(ec.a, eliteRoom, ec.text);
    const label2 = er.status === 201 ? "OK" : `ERR ${er.status}`;
    console.log(`  [elite]    ${ec.a.name}: "${ec.text}" (${label2})`);

    if (i < rounds - 1) {
      await countdown(delay);
    }
  }

  // ---- Done ----
  console.log("\n" + "=".repeat(55));
  console.log("  DONE! Both rooms are live.");
  console.log("=".repeat(55));
  console.log(`\n  Standard room: ${stdRoom}`);
  console.log(`  Elite room:    ${eliteRoom}\n`);
  console.log(`  View them at: ${host}`);
  console.log(`  Standard:     ${host}?room=${stdRoom}`);
  console.log(`  Elite (gold): ${host}?room=${eliteRoom}\n`);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * MoltRoulette Agent Test Script
 * 
 * Tests the agent protocol by registering two agents, matching them,
 * and running a conversation with configurable parameters.
 * 
 * Usage:
 *   node scripts/test-agents.js [options]
 * 
 * Options:
 *   --delay <seconds>     Message delay in seconds (default: 31)
 *   --messages <count>    Number of message rounds (default: 5)
 *   --host <url>          Server host (default: http://localhost:3000)
 * 
 * Examples:
 *   node scripts/test-agents.js --delay 5 --messages 3
 *   node scripts/test-agents.js --host https://repo-six-iota.vercel.app
 */

const https = require('https');
const http = require('http');

// ============ Configuration ============

const args = process.argv.slice(2);
const config = {
  host: getArg('--host') || 'http://localhost:3000',
  delay: parseInt(getArg('--delay') || '31', 10),
  messageCount: parseInt(getArg('--messages') || '5', 10),
};

// Stats tracking
const stats = {
  startTime: Date.now(),
  messagesSent: 0,
  messagesReceived: 0,
  errors: [],
  apiCalls: 0,
};

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

// ============ API Helper ============

function api(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.host);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        stats.apiCalls++;
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error || data}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      const errorMsg = `Network error: ${err.message}`;
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`Server unreachable at ${config.host}. Is the server running?`));
      } else if (err.code === 'ENOTFOUND') {
        reject(new Error(`Host not found: ${config.host}. Check the URL.`));
      } else if (err.code === 'ETIMEDOUT') {
        reject(new Error(`Request timeout to ${config.host}. Server may be down.`));
      } else {
        reject(new Error(errorMsg));
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout to ${config.host} after 30s.`));
    });

    req.setTimeout(30000); // 30s timeout

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// ============ Utilities ============

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg, prefix = '→') {
  console.log(`${prefix} ${msg}`);
}

function logError(msg, error) {
  console.error(`✗ ${msg}`);
  if (error) {
    console.error(`  Error: ${error.message}`);
  }
  stats.errors.push({ message: msg, error: error?.message });
}

function logSuccess(msg) {
  console.log(`✓ ${msg}`);
}

// ============ Test Flow ============

async function registerAgent(name, avatarUrl) {
  log(`Registering agent: ${name}`);
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: { name, avatar_url: avatarUrl },
    });
    
    if (data.agent_id) {
      logSuccess(`Registered ${name} with ID: ${data.agent_id}`);
      return { id: data.agent_id, name: data.name };
    } else {
      throw new Error(data.error || 'Registration failed');
    }
  } catch (err) {
    logError(`Failed to register ${name}`, err);
    throw err;
  }
}

async function joinQueue(agent) {
  log(`${agent.name} joining queue`);
  try {
    const data = await api('/api/queue', {
      method: 'POST',
      body: { agent_id: agent.id },
    });

    if (data.matched) {
      logSuccess(`${agent.name} matched immediately! Room: ${data.room_id}`);
      return { matched: true, roomId: data.room_id, partner: data.partner };
    } else if (data.queued) {
      log(`${agent.name} in queue at position ${data.position}`);
      return { matched: false, position: data.position };
    } else {
      throw new Error(data.error || 'Queue join failed');
    }
  } catch (err) {
    logError(`Failed to join queue for ${agent.name}`, err);
    throw err;
  }
}

async function pollForMatch(agent) {
  log(`Polling for ${agent.name}'s match`);
  const maxAttempts = 10;
  
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);
    try {
      const data = await api(`/api/queue?agent_id=${agent.id}`);
      
      if (data.matched) {
        logSuccess(`${agent.name} matched! Room: ${data.room_id}`);
        return { roomId: data.room_id, partner: data.partner };
      } else if (data.queued) {
        log(`${agent.name} still in queue (position ${data.position})`, '⋯');
      } else {
        throw new Error('Unexpected queue response');
      }
    } catch (err) {
      logError(`Poll failed for ${agent.name}`, err);
      // Continue polling on error
    }
  }
  
  throw new Error(`${agent.name} did not match after ${maxAttempts} attempts`);
}

async function sendMessage(agent, roomId, text) {
  log(`${agent.name}: "${text}"`);
  try {
    const data = await api('/api/messages', {
      method: 'POST',
      body: { room_id: roomId, agent_id: agent.id, text },
    });
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    stats.messagesSent++;
    logSuccess(`Message sent by ${agent.name}`);
    return data;
  } catch (err) {
    logError(`Failed to send message from ${agent.name}`, err);
    throw err;
  }
}

async function getMessages(roomId, since = 0) {
  try {
    const data = await api(`/api/messages?room_id=${roomId}&since=${since}`);
    const newMessages = data.messages || [];
    stats.messagesReceived += newMessages.length;
    return newMessages;
  } catch (err) {
    logError(`Failed to fetch messages from room ${roomId}`, err);
    return [];
  }
}

function printSummary() {
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const successRate = stats.errors.length === 0 ? '100%' : 
    `${(((stats.messagesSent) / (stats.messagesSent + stats.errors.length)) * 100).toFixed(1)}%`;
  
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Time:        ${duration}s`);
  console.log(`Messages Sent:     ${stats.messagesSent}`);
  console.log(`Messages Received: ${stats.messagesReceived}`);
  console.log(`API Calls:         ${stats.apiCalls}`);
  console.log(`Errors:            ${stats.errors.length}`);
  console.log(`Success Rate:      ${successRate}`);
  
  if (stats.errors.length > 0) {
    console.log('\nERROR DETAILS:');
    stats.errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.message}`);
      if (err.error) {
        console.log(`     ${err.error}`);
      }
    });
  }
  
  console.log('='.repeat(60) + '\n');
}

// ============ Main Test ============

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('MOLTROULETTE AGENT TEST SCRIPT');
  console.log('='.repeat(60));
  console.log(`Host:           ${config.host}`);
  console.log(`Message Delay:  ${config.delay}s`);
  console.log(`Message Rounds: ${config.messageCount}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Test server connectivity
    log('Testing server connectivity...');
    try {
      await api('/api/status');
      logSuccess('Server is reachable');
    } catch (err) {
      logError('Server connectivity test failed', err);
      throw err;
    }

    // Register agents
    console.log('\n--- REGISTRATION ---\n');
    const alice = await registerAgent('alice-test', 'https://api.dicebear.com/7.x/bottts/svg?seed=alice');
    const bob = await registerAgent('bob-test', 'https://api.dicebear.com/7.x/bottts/svg?seed=bob');

    // Join queue
    console.log('\n--- MATCHMAKING ---\n');
    const aliceQueue = await joinQueue(alice);
    const bobQueue = await joinQueue(bob);

    let roomId;
    if (bobQueue.matched) {
      roomId = bobQueue.roomId;
      logSuccess(`Both agents matched! Room ID: ${roomId}`);
    } else {
      const match = await pollForMatch(alice);
      roomId = match.roomId;
    }

    // Run conversation
    console.log('\n--- CONVERSATION ---\n');
    log(`Starting conversation in room ${roomId}`);
    log(`Using ${config.delay}s delay between messages\n`);

    const messages = [
      { agent: alice, text: 'Hello! I\'m Alice, a test agent.' },
      { agent: bob, text: 'Hi Alice! I\'m Bob. Nice to meet you!' },
      { agent: alice, text: 'What brings you to MoltRoulette?' },
      { agent: bob, text: 'Just testing the agent protocol!' },
      { agent: alice, text: 'Same here! The 30s rate limit is interesting.' },
      { agent: bob, text: 'Yeah, it encourages thoughtful responses.' },
      { agent: alice, text: 'Agreed! This is a fun platform.' },
      { agent: bob, text: 'Definitely! Good luck with your testing!' },
      { agent: alice, text: 'You too! Thanks for the chat!' },
      { agent: bob, text: 'Bye Alice! 👋' },
    ];

    const messageLimit = Math.min(config.messageCount * 2, messages.length);
    let lastMessageTs = 0;

    for (let i = 0; i < messageLimit; i++) {
      const { agent, text } = messages[i];
      
      try {
        await sendMessage(agent, roomId, text);
        
        // Fetch and display new messages
        await sleep(500);
        const newMessages = await getMessages(roomId, lastMessageTs);
        if (newMessages.length > 0) {
          lastMessageTs = newMessages[newMessages.length - 1].ts;
        }
        
        // Wait for rate limit (except on last message)
        if (i < messageLimit - 1) {
          log(`Waiting ${config.delay}s for rate limit...`, '⏱');
          await sleep(config.delay * 1000);
        }
      } catch (err) {
        // Error already logged in sendMessage
        // Continue with remaining messages
      }
    }

    // Final message fetch
    console.log('\n--- FINAL STATE ---\n');
    log('Fetching final messages...');
    const finalMessages = await getMessages(roomId, 0);
    logSuccess(`Room has ${finalMessages.length} total messages`);

    console.log('\nConversation complete!');
    
  } catch (err) {
    console.error('\n' + '='.repeat(60));
    console.error('TEST FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${err.message}\n`);
    printSummary();
    process.exit(1);
  }

  printSummary();
  process.exit(0);
}

// Run the test
if (require.main === module) {
  main().catch((err) => {
    console.error('Unhandled error:', err);
    printSummary();
    process.exit(1);
  });
}

module.exports = { api, registerAgent, joinQueue, sendMessage, getMessages };
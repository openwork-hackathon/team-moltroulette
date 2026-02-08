const API = window.location.origin;

// State
let mode = "human"; // "human" or "agent"
let agentId = null;
let agentName = null;
let agentAvatarUrl = null;
let currentRoomId = null;
let lastMessageTs = 0;
let pollTimer = null;
let queuePollTimer = null;
let roomsPollTimer = null;
let roomAgents = []; // agents in current room for side assignment
let cooldownTimer = null;
let cooldownEndTime = null;
let partnerData = null;

// DOM refs
const $ = (id) => document.getElementById(id);

const btnHuman = $("btn-human");
const btnAgent = $("btn-agent");
const humanView = $("human-view");
const agentView = $("agent-view");
const liveStats = $("live-stats");

// Human view
const roomsGrid = $("rooms-grid");
const spectatorPanel = $("spectator-panel");
const spectatorTitle = $("spectator-title");
const spectatorAgents = $("spectator-agents");
const spectatorChat = $("spectator-chat");
const spectatorBack = $("spectator-back");

// Agent view
const registerForm = $("register-form");
const agentNameInput = $("agent-name");
const agentAvatarInput = $("agent-avatar");
const registerStatus = $("register-status");
const registerPanel = $("register-panel");
const queuePanel = $("queue-panel");
const queueBtn = $("queue-btn");
const queueStatus = $("queue-status");
const queueAnimation = $("queue-animation");
const agentChatPanel = $("agent-chat-panel");
const agentChat = $("agent-chat");
const agentChatForm = $("agent-chat-form");
const agentMessage = $("agent-message");
const sendBtn = $("send-btn");
const agentRoomTag = $("agent-room-tag");
const partnerInfo = $("partner-info");
const partnerAvatar = $("partner-avatar");
const partnerName = $("partner-name");
const cooldownTimerEl = $("cooldown-timer");
const cooldownProgress = $("cooldown-progress");
const cooldownSeconds = $("cooldown-seconds");

// ============ API helpers ============

async function api(path, opts = {}) {
  const url = `${API}/api${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Generate avatar color
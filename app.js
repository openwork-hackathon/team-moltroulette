const API = window.location.origin;
let currentUser = null;
let currentRoom = null;
let isSpectator = false;
let pollTimer = null;
let lastMessageTs = 0;

const $ = (id) => document.getElementById(id);

const profileForm = $("profile-form");
const usernameInput = $("username");
const avatarInput = $("avatar");
const preview = $("profile-preview");
const matchBtn = $("match-btn");
const leaveBtn = $("leave-btn");
const statusEl = $("status");
const roomMeta = $("room-meta");
const chatPanel = $("chat-panel");
const chatEl = $("chat");
const chatForm = $("chat-form");
const messageInput = $("message");
const chatPartner = $("chat-partner");
const roomIdTag = $("room-id-tag");
const spectatorForm = $("spectator-form");
const spectatorRoomInput = $("spectator-room");
const activeRoomsEl = $("active-rooms");
const liveStats = $("live-stats");
const tokenContract = $("token-contract");

async function api(path, opts = {}) {
  const url = `${API}/api${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function showChat(roomId, partner) {
  currentRoom = roomId;
  chatPanel.style.display = "";
  roomIdTag.textContent = roomId;
  chatPartner.textContent = partner
    ? `Chatting with ${partner}`
    : "Spectating";
  leaveBtn.style.display = "";
  matchBtn.disabled = true;
  lastMessageTs = 0;
  chatEl.innerHTML = "";
  startPolling();
}

function hideChat() {
  currentRoom = null;
  chatPanel.style.display = "none";
  leaveBtn.style.display = "none";
  matchBtn.disabled = !currentUser;
  stopPolling();
  setStatus(currentUser ? "Ready to match." : "Register to start matching.");
  roomMeta.textContent = "";
}

function startPolling() {
  stopPolling();
  pollMessages();
  pollTimer = setInterval(pollMessages, 1500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollMessages() {
  if (!currentRoom) return;
  try {
    const data = await api(
      `/messages?roomId=${currentRoom}&since=${lastMessageTs}`
    );
    if (data.messages && data.messages.length > 0) {
      for (const msg of data.messages) {
        appendMessage(msg);
        if (msg.ts > lastMessageTs) lastMessageTs = msg.ts;
      }
    }
  } catch (e) {
    // silent retry on next poll
  }
}

function appendMessage(msg) {
  const div = document.createElement("div");
  div.className = "chat-message";
  const isSelf = currentUser && msg.username === currentUser;
  if (isSelf) div.classList.add("self");
  div.innerHTML = `
    <div class="msg-header">
      <strong>${escapeHtml(msg.username)}</strong>
      <span class="msg-time">${new Date(msg.ts).toLocaleTimeString()}</span>
    </div>
    <div class="msg-body">${escapeHtml(msg.text)}</div>
  `;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderProfile() {
  if (!currentUser) return;
  const stored = JSON.parse(localStorage.getItem("molt_profile") || "{}");
  preview.innerHTML = `
    <img src="${stored.avatar || "https://placehold.co/40x40/ff6b3d/fff?text=" + currentUser[0].toUpperCase()}" alt="avatar" />
    <div><strong>${escapeHtml(currentUser)}</strong> <span class="registered-badge">registered</span></div>
  `;
}

// Load token info
async function loadTokenInfo() {
  try {
    const data = await api("/status");
    if (data.token && data.token.address) {
      const addr = data.token.address;
      const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      tokenContract.innerHTML = `<a href="https://basescan.org/token/${addr}" target="_blank" rel="noopener" style="color: var(--primary)">${shortAddr}</a>`;
    } else {
      tokenContract.textContent = "Not deployed";
    }
  } catch (e) {
    tokenContract.textContent = "Error loading";
  }
}

// Profile registration
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const avatar = avatarInput.value.trim();
  if (!username) return;

  setStatus("Registering...");
  try {
    const data = await api("/register", {
      method: "POST",
      body: { username, avatar: avatar || undefined },
    });
    if (data.ok) {
      currentUser = username;
      localStorage.setItem(
        "molt_profile",
        JSON.stringify({ username, avatar })
      );
      matchBtn.disabled = false;
      renderProfile();
      setStatus("Ready to match.");
    } else {
      setStatus(`Error: ${data.error}`);
    }
  } catch (err) {
    setStatus("Network error. Try again.");
  }
});

// Matchmaking
matchBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  matchBtn.disabled = true;
  setStatus("Looking for a match...");

  try {
    const data = await api("/match", {
      method: "POST",
      body: { username: currentUser },
    });

    if (data.matched) {
      setStatus(`Matched with ${data.partner}!`);
      const spectUrl = `${window.location.origin}/?room=${data.roomId}&spectator=1`;
      roomMeta.innerHTML = `Spectator link: <a href="${spectUrl}" target="_blank">${spectUrl}</a>`;
      showChat(data.roomId, data.partner);
    } else if (data.queued) {
      setStatus(
        `In queue (position ${data.position}). Waiting for another agent...`
      );
      // Poll for match
      pollForMatch();
    } else {
      setStatus("Unexpected response. Try again.");
      matchBtn.disabled = false;
    }
  } catch (err) {
    setStatus("Network error. Try again.");
    matchBtn.disabled = false;
  }
});

let matchPollTimer = null;
function pollForMatch() {
  if (matchPollTimer) clearInterval(matchPollTimer);
  matchPollTimer = setInterval(async () => {
    try {
      const data = await api("/match", {
        method: "POST",
        body: { username: currentUser },
      });
      if (data.matched) {
        clearInterval(matchPollTimer);
        matchPollTimer = null;
        setStatus(`Matched with ${data.partner}!`);
        const spectUrl = `${window.location.origin}/?room=${data.roomId}&spectator=1`;
        roomMeta.innerHTML = `Spectator link: <a href="${spectUrl}" target="_blank">${spectUrl}</a>`;
        showChat(data.roomId, data.partner);
      }
    } catch (e) {
      // retry
    }
  }, 3000);
}

// Leave room
leaveBtn.addEventListener("click", () => {
  if (matchPollTimer) {
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
    clearInterval(matchPollTimer);
    matchPollTimer = null;
  }
  hideChat();
});

// Send message
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentRoom || !currentUser) return;
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = "";
  try {
    await api(`/messages?roomId=${currentRoom}`, {
      method: "POST",
      body: { username: currentUser, text },
    });
  } catch (err) {
    appendMessage({
      username: "system",
      text: "Failed to send message.",
      ts: Date.now(),
    });
  }
});

// Spectator
spectatorForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomId = spectatorRoomInput.value.trim();
  if (!roomId) return;
  isSpectator = true;
  setStatus(`Spectating ${roomId}`);
  showChat(roomId, null);
});

// URL params for spectator links
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get("room");
if (roomFromUrl) {
  isSpectator = urlParams.get("spectator") === "1";
  showChat(roomFromUrl, null);
  setStatus(isSpectator ? `Spectating ${roomFromUrl}` : `Joined ${roomFromUrl}`);
}

// Restore profile from localStorage
const savedProfile = localStorage.getItem("molt_profile");
if (savedProfile) {
  try {
    const p = JSON.parse(savedProfile);
    if (p.username) {
      usernameInput.value = p.username;
      avatarInput.value = p.avatar || "";
      currentUser = p.username;
      matchBtn.disabled = false;
      renderProfile();
      setStatus("Ready to match.");
      // Re-register on load
      api("/register", {
        method: "POST",
        body: { username: p.username, avatar: p.avatar },
      }).catch(() => {});
    }
  } catch (e) {}
}

// Live stats
async function updateStats() {
  try {
    const data = await api("/status");
    if (data.stats) {
      liveStats.innerHTML = `
        <span>${data.stats.registered_agents} agents</span>
        <span>${data.stats.active_rooms} rooms</span>
        <span>${data.stats.total_messages} messages</span>
      `;
    }
  } catch (e) {}
}

async function loadActiveRooms() {
  try {
    const data = await api("/rooms");
    if (data.rooms && data.rooms.length > 0) {
      activeRoomsEl.innerHTML =
        '<h3 class="active-rooms-title">Active rooms</h3>' +
        data.rooms
          .map(
            (r) => `
        <div class="room-card">
          <span class="room-card-id">${escapeHtml(r.id)}</span>
          <span class="room-card-members">${r.members.map(escapeHtml).join(" & ")}</span>
          <span class="room-card-msgs">${r.message_count} msgs</span>
          <button class="cta ghost room-spectate-btn" data-room="${escapeHtml(r.id)}">Watch</button>
        </div>
      `
          )
          .join("");

      activeRoomsEl.querySelectorAll(".room-spectate-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          isSpectator = true;
          showChat(btn.dataset.room, null);
          setStatus(`Spectating ${btn.dataset.room}`);
        });
      });
    } else {
      activeRoomsEl.innerHTML =
        '<p class="muted">No active rooms yet. Be the first to match!</p>';
    }
  } catch (e) {
    activeRoomsEl.innerHTML = "";
  }
}

updateStats();
loadActiveRooms();
setInterval(updateStats, 10000);
setInterval(loadActiveRooms, 15000);

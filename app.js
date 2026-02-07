const storageKey = "moltroulette_profile";
const roomKey = "moltroulette_room";
const queueKey = "moltroulette_queue";
const chatPrefix = "moltroulette_chat_";

const profileForm = document.getElementById("profile-form");
const usernameInput = document.getElementById("username");
const avatarInput = document.getElementById("avatar");
const preview = document.getElementById("profile-preview");

const matchBtn = document.getElementById("match-btn");
const leaveBtn = document.getElementById("leave-btn");
const statusEl = document.getElementById("status");
const roomMeta = document.getElementById("room-meta");

const chatEl = document.getElementById("chat");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message");

const spectatorForm = document.getElementById("spectator-form");
const spectatorRoomInput = document.getElementById("spectator-room");

let currentRoom = null;
let isSpectator = false;

const channel = new BroadcastChannel("moltroulette");

function loadProfile() {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(storageKey, JSON.stringify(profile));
}

function renderProfile(profile) {
  if (!profile) return;
  preview.innerHTML = `
    <img src="${profile.avatar || "https://placehold.co/80x80"}" alt="avatar" />
    <div>${profile.username}</div>
  `;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setRoomMeta(text) {
  roomMeta.textContent = text || "";
}

function getQueue() {
  const stored = localStorage.getItem(queueKey);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function setQueue(queue) {
  localStorage.setItem(queueKey, JSON.stringify(queue));
}

function generateRoomId() {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function joinRoom(roomId) {
  currentRoom = roomId;
  localStorage.setItem(roomKey, roomId);
  setStatus(`Connected to ${roomId}`);
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  url.searchParams.set("spectator", "1");
  setRoomMeta(`Spectator link: ${url.toString()}`);
  renderChat();
}

function leaveRoom() {
  currentRoom = null;
  localStorage.removeItem(roomKey);
  setStatus("Not connected.");
  setRoomMeta("");
  chatEl.innerHTML = "";
}

function addMessage(roomId, message) {
  const key = `${chatPrefix}${roomId}`;
  const existing = localStorage.getItem(key);
  const messages = existing ? JSON.parse(existing) : [];
  messages.push(message);
  localStorage.setItem(key, JSON.stringify(messages));
  channel.postMessage({ type: "message", roomId });
}

function getMessages(roomId) {
  const key = `${chatPrefix}${roomId}`;
  const existing = localStorage.getItem(key);
  return existing ? JSON.parse(existing) : [];
}

function renderChat() {
  if (!currentRoom) return;
  const messages = getMessages(currentRoom);
  chatEl.innerHTML = messages
    .map((msg) => {
      return `
        <div class="chat-message">
          <strong>${msg.username}</strong>
          <span>${new Date(msg.ts).toLocaleTimeString()}</span>
          <div>${msg.text}</div>
        </div>
      `;
    })
    .join("");
  chatEl.scrollTop = chatEl.scrollHeight;
}

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const profile = {
    username: usernameInput.value.trim(),
    avatar: avatarInput.value.trim(),
  };
  if (!profile.username) return;
  saveProfile(profile);
  renderProfile(profile);
});

matchBtn.addEventListener("click", () => {
  const profile = loadProfile();
  if (!profile) {
    setStatus("Save your profile first.");
    return;
  }

  let queue = getQueue();
  const existing = queue.find((entry) => entry.username === profile.username);
  if (existing) {
    setStatus("Already in the matchmaking queue.");
    return;
  }

  if (queue.length > 0) {
    const partner = queue.shift();
    setQueue(queue);
    const roomId = generateRoomId();
    localStorage.setItem(`${roomId}_pair`, JSON.stringify([profile, partner]));
    channel.postMessage({ type: "match", roomId, partner: profile, to: partner.username });
    joinRoom(roomId);
  } else {
    queue.push(profile);
    setQueue(queue);
    setStatus("Waiting for another agent to join...");
  }
});

leaveBtn.addEventListener("click", () => {
  leaveRoom();
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentRoom) return;
  const profile = loadProfile();
  if (!profile) return;
  const text = messageInput.value.trim();
  if (!text) return;
  addMessage(currentRoom, { username: profile.username, text, ts: Date.now() });
  messageInput.value = "";
  renderChat();
});

spectatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const roomId = spectatorRoomInput.value.trim();
  if (!roomId) return;
  isSpectator = true;
  joinRoom(roomId);
});

channel.addEventListener("message", (event) => {
  if (event.data.type === "match") {
    const profile = loadProfile();
    if (profile && event.data.to === profile.username) {
      joinRoom(event.data.roomId);
    }
  }
  if (event.data.type === "message" && event.data.roomId === currentRoom) {
    renderChat();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === roomKey && event.newValue) {
    currentRoom = event.newValue;
    renderChat();
  }
});

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get("room");
if (roomFromUrl) {
  isSpectator = urlParams.get("spectator") === "1";
  joinRoom(roomFromUrl);
}

const storedProfile = loadProfile();
if (storedProfile) {
  usernameInput.value = storedProfile.username;
  avatarInput.value = storedProfile.avatar;
  renderProfile(storedProfile);
}

setInterval(() => {
  if (currentRoom) renderChat();
}, 2000);

const API_URL = CONFIG.API_URL;

let sessionStartTime = null;
let lastFrameTime = null;
let gameStartTime = null;
let hasSentFirstAction = false;
const GAME_START_DELAY = 500; // milliseconds to wait after game reset

let preyTrail = [];
let predatorTrail = [];
const MAX_TRAIL_LENGTH = 30; // Trail length

const countdownOverlay = document.getElementById("countdownOverlay");
const countdownText = document.getElementById("countdownText");

// Global variables
let playerName = null;
let humanRole = "predator"; // "predator" or "prey"
let currentState = null;
let gameActive = false;
// We'll use this to choose input method.
let inputMethod = "keyboard"; // "keyboard" or "joystick"
// For keyboard, we keep track of pressed keys.
let pressedKeys = new Set();
let currentAction = 0; // For both methods: an angle in radians.
let canStartGame = true;
let isResetting = false;

// DOM references.
const roleTextSpan = document.getElementById("roleText");
const switchRoleBtn = document.getElementById("switchRoleBtn");
const resetBtn = document.getElementById("resetBtn");
const statusDiv = document.getElementById("status");
const timerDiv = document.getElementById("timer");
const toastContainer = document.getElementById("toastContainer");
const joystickContainer = document.getElementById("joystickContainer");
const joystickKnob = document.getElementById("joystickKnob");
const inputToggleRadios = document.getElementsByName("inputMethod");

// Utility: update status message.
function updateStatus(message) {
  statusDiv.innerText = message;
}

function updateTimer(time) {
  const remaining_time = Math.max(0, 2.0 - time);
  timerDiv.innerText = `Time remaining: ${remaining_time.toFixed(1)} sec`;
}

// Toast message function.
function showToast(message, duration = 3000) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toastContainer.removeChild(toast);
  }, duration);
}

// Update role display.
function updateRoleDisplay() {
  if (humanRole.toLowerCase() === "prey") {
    roleTextSpan.innerText = "Prey";
    roleTextSpan.style.color = "blue";
  } else if (humanRole.toLowerCase() === "predator") {
    roleTextSpan.innerText = "Predator";
    roleTextSpan.style.color = "red";
  } else {
    roleTextSpan.innerText = humanRole;
    roleTextSpan.style.color = "black";
  }
}

// Update input method based on the toggle.
function updateInputMethod() {
  inputMethod = document.querySelector('input[name="inputMethod"]:checked').value;
  if (inputMethod === "joystick") {
    // Show joystick container.
    joystickContainer.style.display = "block";
  } else {
    // Hide joystick container.
    joystickContainer.style.display = "none";
  }
}

function showCountdown(seconds = 3) {
  return new Promise((resolve) => {
    countdownOverlay.style.display = "flex";
    let counter = seconds;

    countdownText.innerText = counter;

    const interval = setInterval(() => {
      counter--;
      if (counter > 0) {
        countdownText.innerText = counter;
      } else {
        countdownText.innerText = "GO!";
      }

      if (counter < 0) {
        clearInterval(interval);
        countdownOverlay.style.display = "none";
        resolve();
      }
    }, 1000);
  });
}

// Listen for changes in input method toggle.
inputToggleRadios.forEach(radio => {
  radio.addEventListener("change", updateInputMethod);
});
// Initialize input method.
updateInputMethod();

function temporarilyBlockGameStart() {
  canStartGame = false;
  setTimeout(() => canStartGame = true, 150); // 150ms cooldown
}

// Reset the game by calling the backend.
async function resetGame() {
  try {
    isResetting = true; // prevent any input triggers
    gameActive = false;
    pressedKeys.clear();

    // sessionStartTime = Date.now();  // in milliseconds

    const response = await fetch(API_URL + "/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();

    if (!data.state || !Array.isArray(data.state)) {
      throw new Error("Invalid state received from backend.");
    }

    currentState = data.state;

    preyTrail = [];
    predatorTrail = [];

    hasSentFirstAction = false;

    renderCanvas(currentState);
    updateTimer(currentState[0]);
    updateStatus("Game reset. Press any arrow or use the joystick to start!");
    showToast("Game reset!");

    joystickKnob.style.left = "50%";
    joystickKnob.style.top = "50%";

    // Re-allow input after a short pause
    setTimeout(() => {
      isResetting = false;
    }, 200);
  } catch (error) {
    updateStatus("Error resetting game: " + error);
    console.error(error);
    isResetting = false;
  }
  await showCountdown();
  lastFrameTime = null;
}

// Call /play endpoint.
async function playGame(action) {
const realTimeElapsed = (performance.now() - gameStartTime) / 1000;
  try {
    const payload = {
      human_role: humanRole,
      human_action: action,
      state: currentState,
      player_id: playerName,
      real_time: realTimeElapsed
    };
    const response = await fetch(API_URL + "/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("Play response:", data);
    currentState = data.state;

    const [_, preyX, preyY, predatorX, predatorY] = currentState;

    preyTrail.push([preyX, preyY]);
    predatorTrail.push([predatorX, predatorY]);

    // Keep only the last MAX_TRAIL_LENGTH positions
    if (preyTrail.length > MAX_TRAIL_LENGTH) preyTrail.shift();
    if (predatorTrail.length > MAX_TRAIL_LENGTH) predatorTrail.shift();

    if (humanRole.toLowerCase() === "prey") {
      updateStatus("Avoid the predator until time runs out!");
    }
    if (humanRole.toLowerCase() === "predator") {
      updateStatus("Catch the prey before time runs out!");
    }

    time = currentState[0]
    await updateTimer(time);
    if (data.terminated === true) {
      console.log("Game terminated");
      updateStatus("Game terminated. Resetting automatically...");
      if (humanRole == "prey"){
        if (data.rewards[0] > 0) {
          showToast("You won!");
        }
        if (data.rewards[0] < 0) {
          showToast("You lost...");
        }
      }
      if (humanRole == "predator"){
        if (data.rewards[0] < 0) {
          showToast("You won!");
        }
        if (data.rewards[0] > 0) {
          showToast("You lost...");
        }
      }
      await resetGame();
      return true;
    }
    return false;
  } catch (error) {
    updateStatus("Error during play: " + error);
    return false;
  }
}

// Compute the current direction from keyboard keys.
function computeKeyboardDirection() {
  let dx = 0, dy = 0;
  if (pressedKeys.has("ArrowUp")) dy += 1;
  if (pressedKeys.has("ArrowDown")) dy -= 1;
  if (pressedKeys.has("ArrowLeft")) dx -= 1;
  if (pressedKeys.has("ArrowRight")) dx += 1;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx);
}

// Self-calling async game loop.
const SIMULATION_INTERVAL = 1000 / 30; // 30Hz
let lastPlaySent = 0;

function gameLoopRAF(timestamp) {
  if (!gameActive) return;

  if (!lastFrameTime) lastFrameTime = timestamp;
  const delta = timestamp - lastFrameTime;

  // Always render for smooth visuals
  renderCanvas(currentState);
  lastFrameTime = timestamp;

  if (timestamp - lastPlaySent >= SIMULATION_INTERVAL) {
    if (inputMethod === "keyboard") {
      const newAction = computeKeyboardDirection();
      if (newAction !== null) {
        currentAction = newAction;
        hasSentFirstAction = true;
      }
    }

    if (hasSentFirstAction) {
      playGame(currentAction); // Fire and forget
      lastPlaySent = timestamp;
    }
  }

  requestAnimationFrame(gameLoopRAF);
}

// Render trail
function drawTrailLine(trail, color) {
  const ctx = document.getElementById("gameCanvas").getContext("2d");
  if (trail.length < 2) return;

  ctx.beginPath();
  for (let i = 0; i < trail.length; i++) {
    const [x, y] = trail[i];
    const cx = x * 500;
    const cy = (1 - y) * 500;
    if (i === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }

  ctx.strokeStyle = `rgba(${color}, 0.4)`;  // smooth line, semi-transparent
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTrailDots(trail, color) {
  const ctx = document.getElementById("gameCanvas").getContext("2d");

  for (let i = 0; i < trail.length; i++) {
    const alpha = i / trail.length;
    const radius = 2 + (4 * alpha);  // newer dots = larger

    const [x, y] = trail[i];
    ctx.beginPath();
    ctx.arc(x * 500, (1 - y) * 500, radius, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.fill();
  }
}

// Render in frontend
function renderCanvas(state) {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Canvas is 500x500, so scale positions
  const scale = 500;
  const radius = 0.2 * scale;  // = 100px on canvas

  const preyX = state[1] * scale;
  const preyY = (1 - state[2]) * scale;
  const predatorX = state[3] * scale;
  const predatorY = (1 - state[4]) * scale;

    // Draw trails
    drawTrailLine(preyTrail, "0, 0, 255");
    drawTrailDots(preyTrail, "0, 0, 255");
    drawTrailLine(predatorTrail, "255, 0, 0");
    drawTrailDots(predatorTrail, "255, 0, 0");


  // Draw prey (blue circle)
  ctx.beginPath();
  ctx.arc(preyX, preyY, 10, 0, 2 * Math.PI);
  ctx.fillStyle = "blue";
  ctx.fill();

  // Predator radius
  ctx.beginPath();
  ctx.arc(predatorX, predatorY, 0.2 * scale, 0, 2 * Math.PI);
  ctx.fillStyle = "rgba(255, 0, 0, 0.2)";  // red, but semi-transparent
  ctx.fill();

  // Draw predator (red circle)
  ctx.beginPath();
  ctx.arc(predatorX, predatorY, 10, 0, 2 * Math.PI);
  ctx.fillStyle = "red";
  ctx.fill();
}

// Keyboard event listeners for arrow keys.
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    pressedKeys.add(e.key);
  if (inputMethod === "keyboard" && !gameActive && !isResetting) {
      gameStartTime = performance.now();
      updateStatus("Game started!");
      showToast("Game started!");
      gameActive = true;
      requestAnimationFrame(gameLoopRAF);
    }
  }
});
window.addEventListener("keyup", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    pressedKeys.delete(e.key);
  }
});

// Virtual Joystick handling.
const joystickCenter = { x: joystickContainer.offsetWidth / 2, y: joystickContainer.offsetHeight / 2 };
let joystickActive = false;

function updateJoystickKnob(e) {
  // Get the container's bounding rectangle.
  const rect = joystickContainer.getBoundingClientRect();
  // Calculate the center of the container.
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  // Calculate the pointer's position relative to the container.
  const posX = e.clientX - rect.left;
  const posY = e.clientY - rect.top;

  // Compute the displacement from the center.
  let offsetX = posX - centerX;
  // Invert vertical: subtract pointer's y from center.
  let offsetY = centerY - posY;

  // Limit the knob movement to within the container's radius.
  const maxRadius = centerX; // Assuming the container is a circle.
  let distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
  if (distance > maxRadius) {
    const ratio = maxRadius / distance;
    offsetX *= ratio;
    offsetY *= ratio;
  }

  // Update knob position.
  // For horizontal, we add the offset to center.
  joystickKnob.style.left = (centerX + offsetX) + "px";
  // For vertical, because we inverted the offset, we subtract it from center.
  joystickKnob.style.top = (centerY - offsetY) + "px";

  // Compute the angle (in radians) from the center using the adjusted offsets.
  let angle = Math.atan2(offsetY, offsetX);
  currentAction = angle;
}
// Set up pointer events on the joystick container.
joystickContainer.addEventListener("pointerdown", (e) => {
  joystickContainer.setPointerCapture(e.pointerId);
  joystickActive = true;
  updateJoystickKnob(e);
  if (inputMethod === "joystick" && !gameActive && !isResetting) {
      gameStartTime = performance.now();
      updateStatus("Game started!");
      showToast("Game started!");
      gameActive = true;
      requestAnimationFrame(gameLoopRAF);
    }
});

joystickContainer.addEventListener("pointermove", (e) => {
  if (!joystickActive) return;
  updateJoystickKnob(e);
});

joystickContainer.addEventListener("pointerup", (e) => {
  joystickActive = false;
  // Reset the knob to the center.
  joystickKnob.style.left = "50%";
  joystickKnob.style.top = "50%";
});

// Button event listeners.
resetBtn.addEventListener("click", async () => {
  await resetGame();
});
switchRoleBtn.addEventListener("click", async () => {
  humanRole = (humanRole.toLowerCase() === "predator") ? "prey" : "predator";
  updateRoleDisplay();
  showToast("Role switched!");
  await resetGame();
});

document.addEventListener("DOMContentLoaded", () => {
  const storedName = sessionStorage.getItem("playerName");

  if (storedName) {
    playerName = storedName;
    document.title = `Prey-Predator Game - ${playerName}`;
    document.getElementById("playerNameDisplay").innerText = `Player: ${playerName}`;
    updateRoleDisplay();
    resetGame();
    return;
  }

  // Show name modal if no name is stored
  const nameModal = document.getElementById("nameModal");
  const nameInput = document.getElementById("nameInput");
  const submitBtn = document.getElementById("submitNameBtn");

  nameModal.style.display = "flex";

  submitBtn.addEventListener("click", () => {
    const value = nameInput.value.trim();
    if (value === "") {
      alert("Please enter a name to play.");
    } else if (value.length > 10) {
      alert("Name must be 10 characters or fewer.");
    } else {
      playerName = value;
      sessionStorage.setItem("playerName", playerName); // 💾 Save for this tab
      nameModal.style.display = "none";
      document.title = `Prey-Predator Game - ${playerName}`;
      document.getElementById("playerNameDisplay").innerText = `Player: ${playerName}`;
      updateRoleDisplay();
      resetGame();
    }
  });

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitBtn.click();
  });

  nameInput.focus();
});


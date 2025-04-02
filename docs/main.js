
const API_URL = CONFIG.API_URL; // Ensure config.js is loaded before this file

// Global variables
let humanRole = "predator"; // "predator" or "prey"
let currentState = null;
let gameActive = false;
// We'll use this to choose input method.
let inputMethod = "keyboard"; // "keyboard" or "joystick"
// For keyboard, we keep track of pressed keys.
let pressedKeys = new Set();
let currentAction = 0; // For both methods: an angle in radians.

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
  remaining_time = 2.0 - time;
  const floored_remaining_time = Math.floor(remaining_time * 10) / 10;
  timerDiv.innerText = "Time remaining: " + floored_remaining_time.toFixed(1) + " sec";
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

// Listen for changes in input method toggle.
inputToggleRadios.forEach(radio => {
  radio.addEventListener("change", updateInputMethod);
});
// Initialize input method.
updateInputMethod();

// Reset the game by calling the backend.
async function resetGame() {
  try {
    const response = await fetch(API_URL + "/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const data = await response.json();
    currentState = data.state;
    updateStatus("Game reset. Press any arrow or use the joystick to start!");
    showToast("Game reset!");
    updateTimer(0.)
    await updateRender();
    gameActive = false;
    // Reset joystick position.
    joystickKnob.style.left = "50%";
    joystickKnob.style.top = "50%";
  } catch (error) {
    updateStatus("Error resetting game: " + error);
  }
}

// Call /play endpoint.
async function playGame(action) {
  try {
    const payload = {
      human_role: humanRole,
      human_action: action,
      state: currentState
    };
    const response = await fetch(API_URL + "/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("Play response:", data);
    currentState = data.state;
    if (humanRole.toLowerCase() === "prey") {
      updateStatus("Avoid the predator until time runs out!");
    }
    if (humanRole.toLowerCase() === "predator") {
      updateStatus("Catch the prey before time runs out!");
    }
    await updateRender();
    time = currentState[0]
    await updateTimer(time);
    if (data.terminated === true) {
      console.log("Game terminated detected.");
      updateStatus("Game terminated. Resetting automatically...");
      // showToast("Game terminated!");
      if (data.rewards[0] == +1 && humanRole == "prey") {
        showToast("You won!");
      }
      if (data.rewards[0] == +1 && humanRole == "predator") {
        showToast("You lost...");
      }
      if (data.rewards[0] == -1 && humanRole == "predator") {
        showToast("You won!");
      }
      if (data.rewards[0] == -1 && humanRole == "prey") {
        showToast("You lost...");
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

// Fetch the rendered image.
async function updateRender() {
  try {
    const payload = { state: currentState };
    const response = await fetch(API_URL + "/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    document.getElementById("renderedImage").src = "data:image/png;base64," + data.image;
  } catch (error) {
    console.error("Error fetching render:", error);
  }
}

// Compute the current direction from keyboard keys.
function computeKeyboardDirection() {
  let dx = 0, dy = 0;
  if (pressedKeys.has("ArrowUp")) dy += 1;
  if (pressedKeys.has("ArrowDown")) dy -= 1;
  if (pressedKeys.has("ArrowLeft")) dx -= 1;
  if (pressedKeys.has("ArrowRight")) dx += 1;
  if (dx === 0 && dy === 0) return currentAction;
  return Math.atan2(dy, dx);
}

// Self-calling async game loop.
async function gameLoop() {
  if (!gameActive) return;
  if (inputMethod === "keyboard") {
    currentAction = computeKeyboardDirection();
  }
  // For joystick, currentAction is updated via joystick events.
  const terminated = await playGame(currentAction);
  if (terminated) {
    gameActive = false;
  } else {
    await new Promise(resolve => setTimeout(resolve, 10));
    gameLoop();
  }
}

// Keyboard event listeners for arrow keys.
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    pressedKeys.add(e.key);
    if (inputMethod === "keyboard" && !gameActive) {
      updateStatus("Game started!");
      showToast("Game started!");
      gameActive = true;
      gameLoop();
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
  if (inputMethod === "joystick" && !gameActive) {
    updateStatus("Game started!");
    showToast("Game started!");
    gameActive = true;
    gameLoop();
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

// Initialize game on page load.
window.onload = async () => {
  updateRoleDisplay();
  await resetGame();
  // Game loop starts only when an arrow key or joystick is used.
};
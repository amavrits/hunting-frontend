const API_URL = CONFIG.API_URL;

let sessionStartTime = null;
let lastFrameTime = null;
let gameStartTime = null;
let hasSentFirstAction = false;
const GAME_START_DELAY = 500;

let preyTrail = [];
let predatorTrail = [];
const MAX_TRAIL_LENGTH = 30;

let joystickCenter = { x: 0, y: 0 };
let keyboardStartRequested = false;
let joystickStartRequested = false;
let joystickActive = false;

let playerName = null;
let humanRole = "predator";
let currentState = null;
let gameActive = false;
let inputMethod = "keyboard";
let pressedKeys = new Set();
let currentAction = 0;
let canStartGame = true;
let isResetting = false;

const SIMULATION_INTERVAL = 1000 / 30;
let lastPlaySent = 0;

document.addEventListener("DOMContentLoaded", () => {
  const roleTextSpan = document.getElementById("roleText");
  const switchRoleBtn = document.getElementById("switchRoleBtn");
  const resetBtn = document.getElementById("resetBtn");
  const statusDiv = document.getElementById("status");
  const timerDiv = document.getElementById("timer");
  const toastContainer = document.getElementById("toastContainer");
  const countdownOverlay = document.getElementById("countdownOverlay");
  const countdownText = document.getElementById("countdownText");
  const inputToggleRadios = document.getElementsByName("inputMethod");
  const splashOverlay = document.getElementById("splashOverlay");
  const splashBtn = document.getElementById("splashStartBtn");
  const nameModal = document.getElementById("nameModal");
  const nameInput = document.getElementById("nameInput");
  const submitBtn = document.getElementById("submitNameBtn");

  const joystickContainer = document.getElementById("joystickContainer");
  const joystickKnob = document.getElementById("joystickKnob");

  joystickCenter = {
    x: joystickContainer.offsetWidth / 2,
    y: joystickContainer.offsetHeight / 2,
  };

  // Update UI
  function updateRoleDisplay() {
    if (humanRole === "prey") {
      roleTextSpan.innerText = "Prey";
      roleTextSpan.style.color = "blue";
    } else {
      roleTextSpan.innerText = "Predator";
      roleTextSpan.style.color = "red";
    }
  }

  function updateInputMethod() {
    inputMethod = "joystick";
    joystickContainer.style.display = "block";
  }

  function updateStatus(message) {
    statusDiv.innerText = message;
  }

  function showToast(message, duration = 3000) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toastContainer.removeChild(toast), duration);
  }

  function updateTimer(time) {
    const remaining = Math.max(0, 20.0 - time * 10);
    timerDiv.innerText = `⏱️ Time left: ${remaining.toFixed(0)}s`;

    if (remaining <= 5) {
      timerDiv.style.color = "#f00"; // red
      // timerDiv.style.boxShadow = "0 0 10px rgba(255, 0, 0, 0.5)";
    } else {
      timerDiv.style.color = "#0f0"; // green
      // timerDiv.style.boxShadow = "0 0 10px rgba(0, 255, 0, 0.4)";
    }
  }

  function showCountdown(seconds = 3) {
    return new Promise((resolve) => {
      countdownOverlay.style.display = "flex";
      let counter = seconds;
      countdownText.innerText = counter;

      const interval = setInterval(() => {
        counter--;
        countdownText.innerText = counter > 0 ? counter : "GO!";
        if (counter < 0) {
          clearInterval(interval);
          countdownOverlay.style.display = "none";
          resolve();
        }
      }, 1000);
    });
  }

  async function resetGame() {
    try {
      isResetting = true;
      gameActive = false;
      pressedKeys.clear();

      const res = await fetch(API_URL + "/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!data.state || !Array.isArray(data.state)) throw new Error("Invalid state");

      currentState = data.state;
      preyTrail = [];
      predatorTrail = [];
      hasSentFirstAction = false;
      renderCanvas(currentState);
      updateTimer(currentState[0]);
      updateStatus("Move the joystick to start the game!");
      showToast("Game reset!");

      joystickKnob.style.left = "50%";
      joystickKnob.style.top = "50%";

      setTimeout(() => (isResetting = false), 200);
    } catch (err) {
      updateStatus("Error resetting game: " + err);
      console.error(err);
      isResetting = false;
    }

    await showCountdown();
    lastFrameTime = null;

    if (joystickStartRequested && !gameActive) {
      joystickStartRequested = false;
      inputMethod = "joystick";
      updateInputMethod();
      gameStartTime = performance.now();
      updateStatus("Game started!");
      showToast("Game started!");
      gameActive = true;
      requestAnimationFrame(gameLoopRAF);
    }

    if (keyboardStartRequested && !gameActive) {
      keyboardStartRequested = false;
      inputMethod = "keyboard";
      document.querySelector('input[value="keyboard"]').checked = true;
      updateInputMethod();
      gameStartTime = performance.now();
      updateStatus("Game started!");
      showToast("Game started!");
      gameActive = true;
      requestAnimationFrame(gameLoopRAF);
    }
  }

  async function playGame(action) {
    const realTimeElapsed = (performance.now() - gameStartTime) / 1000;
    try {
      const payload = {
        human_role: humanRole,
        human_action: action,
        state: currentState,
        player_id: playerName,
        real_time: realTimeElapsed,
        input_method: inputMethod,
      };
      const res = await fetch(API_URL + "/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      currentState = data.state;

      const [_, preyX, preyY, predatorX, predatorY] = currentState;
      preyTrail.push([preyX, preyY]);
      predatorTrail.push([predatorX, predatorY]);
      if (preyTrail.length > MAX_TRAIL_LENGTH) preyTrail.shift();
      if (predatorTrail.length > MAX_TRAIL_LENGTH) predatorTrail.shift();

      updateStatus(
        humanRole === "prey"
          ? "Avoid the predator until the time runs out!"
          : "Catch the prey before the time runs out!"
      );
      updateTimer(currentState[0]);

      if (data.terminated) {
        updateStatus("Game terminated. Resetting...");
        let reward;
        if (humanRole === "prey") {
          reward = data.rewards[0];
        }
        if (humanRole === "predator") {
          reward = data.rewards[1];
        }
        showToast(reward > 0 ? "You won!" : "You lost...");
        await resetGame();
      }
    } catch (err) {
      updateStatus("Error during play: " + err);
    }
  }

  function renderCanvas(state) {
    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = 500;
    const [_, px, py, rx, ry] = state;
    const preyX = px * scale;
    const preyY = (1 - py) * scale;
    const predatorX = rx * scale;
    const predatorY = (1 - ry) * scale;

    function drawTrail(trail, color) {
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const [x, y] = trail[i];
        const cx = x * 500;
        const cy = (1 - y) * 500;
        i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = `rgba(${color}, 0.4)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      for (let i = 0; i < trail.length; i++) {
        const alpha = i / trail.length;
        const radius = 2 + 4 * alpha;
        const [x, y] = trail[i];
        ctx.beginPath();
        ctx.arc(x * 500, (1 - y) * 500, radius, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.fill();
      }
    }

    drawTrail(preyTrail, "0, 0, 255");
    drawTrail(predatorTrail, "255, 0, 0");

    ctx.beginPath();
    ctx.arc(preyX, preyY, 10, 0, 2 * Math.PI);
    ctx.fillStyle = "blue";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(predatorX, predatorY, 0.2 * scale, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(predatorX, predatorY, 10, 0, 2 * Math.PI);
    ctx.fillStyle = "red";
    ctx.fill();
  }

  function gameLoopRAF(timestamp) {
    if (!gameActive) return;
    if (!lastFrameTime) lastFrameTime = timestamp;
    const delta = timestamp - lastFrameTime;
    renderCanvas(currentState);
    lastFrameTime = timestamp;

    if (timestamp - lastPlaySent >= SIMULATION_INTERVAL) {
      if (inputMethod === "joystick" && joystickActive) hasSentFirstAction = true;
      if (hasSentFirstAction) {
        playGame(currentAction);
        lastPlaySent = timestamp;
      }
    }
    requestAnimationFrame(gameLoopRAF);
  }

  joystickContainer.addEventListener("pointerdown", (e) => {
    joystickContainer.setPointerCapture(e.pointerId);
    joystickActive = true;
    updateJoystickKnob(e);
    if (!gameActive && !isResetting) {
      joystickStartRequested = true;
      inputMethod = "joystick";
      updateInputMethod();
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

  joystickContainer.addEventListener("pointerup", () => {
    joystickActive = false;
    joystickKnob.style.left = "50%";
    joystickKnob.style.top = "50%";
  });

  function updateJoystickKnob(e) {
    const rect = joystickContainer.getBoundingClientRect();
    const posX = e.clientX - rect.left;
    const posY = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    let offsetX = posX - centerX;
    let offsetY = posY - centerY;

    const maxRadius = centerX;
    const distance = Math.sqrt(offsetX ** 2 + offsetY ** 2);
    if (distance > maxRadius) {
      const ratio = maxRadius / distance;
      offsetX *= ratio;
      offsetY *= ratio;
    }

    joystickKnob.style.left = `${centerX + offsetX}px`;
    joystickKnob.style.top = `${centerY + offsetY}px`;
    currentAction = Math.atan2(-offsetY, offsetX);
    hasSentFirstAction = true;
  }

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      pressedKeys.add(e.key);
      if (inputMethod === "keyboard" && !gameActive) {
        keyboardStartRequested = true;
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      pressedKeys.delete(e.key);
    }
  });

  // Splash start logic
  splashBtn.addEventListener("click", () => {
    splashOverlay.style.display = "none";
    const storedName = sessionStorage.getItem("playerName");
    if (storedName) {
      playerName = storedName;
      document.title = `Prey-Predator Game - ${playerName}`;
      document.getElementById("playerNameDisplay").innerText = `Player: ${playerName}`;
      updateRoleDisplay();
      resetGame();
    } else {
      nameModal.style.display = "flex";
      nameInput.focus();

      submitBtn.addEventListener("click", () => {
        const value = nameInput.value.trim();
        if (value === "" || value.length > 10) {
          alert("Name must be 1–10 characters.");
        } else {
          playerName = value;
          sessionStorage.setItem("playerName", playerName);
          nameModal.style.display = "none";
          splashOverlay.style.display = "none";
          document.title = `Prey-Predator Game - ${playerName}`;
          document.getElementById("playerNameDisplay").innerText = `Player: ${playerName}`;
          updateRoleDisplay();
          resetGame();
        }
      });

      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitBtn.click();
      });
    }
  });

  switchRoleBtn.addEventListener("click", async () => {
    humanRole = humanRole === "predator" ? "prey" : "predator";
    updateRoleDisplay();
    showToast("Role switched!");
    await resetGame();
  });

  resetBtn.addEventListener("click", async () => {
    await resetGame();
  });

  inputToggleRadios.forEach((radio) => {
    radio.addEventListener("change", updateInputMethod);
  });
});

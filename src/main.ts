import Phaser from 'phaser'
import './style.css'
import { TetrisScene } from './scenes/TetrisScene'
import type { GameSnapshot, RenderState } from './tetrisLogic'
import { SavingService } from './saving'
import { createWakeLockManager } from './wakelock'

const savingService = new SavingService()
const wakeLock = createWakeLockManager()

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('Missing #app container')
}

app.innerHTML = `
  <main class="screen">
    <div id="game-shell">
      <div id="game-container" aria-live="off"></div>
      <div id="menu" class="menu" aria-live="polite">
        <div class="menu-card">
          <h1>Tetris</h1>
          <p>Low battery Tetris built with Phaser 4 Canvas. No account required.</p>
          <div class="menu-buttons">
            <button id="startButton" class="primary" type="button">Start New Game</button>
            <button id="loadButton" class="secondary" type="button" disabled>Load Saved Game</button>
          </div>
          <p id="menuStatus" class="menu-status">Checking storage…</p>
        </div>
      </div>
    </div>
  </main>
`

const menuEl = document.querySelector<HTMLDivElement>('#menu')!
const menuStatus = document.querySelector<HTMLParagraphElement>('#menuStatus')!
const startButton = document.querySelector<HTMLButtonElement>('#startButton')!
const loadButton = document.querySelector<HTMLButtonElement>('#loadButton')!

let sceneReadyResolve: () => void = () => {}
const sceneReady = new Promise<void>((resolve) => {
  sceneReadyResolve = resolve
})

const scene = new TetrisScene({
  onSceneReady: () => sceneReadyResolve(),
  onStateUpdate: (state) => handleStateUpdate(state),
  onRequestSave: () => {
    void persistSession()
  },
  onRequestRestart: () => {
    void beginSession()
  }
})

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game-container',
  backgroundColor: '#05070c',
  pixelArt: true,
  scene: [scene],
  fps: {
    target: 30,
    min: 30,
    forceSetTimeOut: true
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 720
  },
  render: {
    antialias: false,
    transparent: false
  }
})

preventGestureZoom()
void refreshLoadState()

startButton.addEventListener('click', () => {
  void beginSession()
})

loadButton.addEventListener('click', () => {
  void loadSavedSession()
})

async function beginSession(snapshot?: GameSnapshot) {
  await sceneReady
  scene.startNewGame(snapshot)
  menuEl.classList.add('hidden')
  if (!wakeLock.isActive()) {
    await wakeLock.enable()
  }
  scene.showStatus(snapshot ? 'Loaded saved game' : 'New game ready', 2000)
}

async function loadSavedSession() {
  loadButton.disabled = true
  menuStatus.textContent = 'Loading save…'
  const payload = await savingService.load()
  if (payload?.snapshot) {
    await beginSession(payload.snapshot)
    menuStatus.textContent = `Loaded from ${new Date(payload.savedAt).toLocaleString()}`
  } else {
    menuStatus.textContent = 'No saved data available'
  }
  await refreshLoadState()
}

async function persistSession() {
  scene.setSaveBusy(true)
  scene.showStatus('Saving progress…')
  const snapshot = scene.getSnapshot()
  const payload = await savingService.save(snapshot)
  await refreshLoadState()
  scene.setSaveBusy(false)
  scene.showStatus('Progress saved', 2400)
  menuStatus.textContent = `Last saved ${new Date(payload.savedAt).toLocaleTimeString()}`
}

async function refreshLoadState() {
  const payload = await savingService.load()
  if (payload) {
    loadButton.disabled = false
    menuStatus.textContent = `Save found (${new Date(payload.savedAt).toLocaleString()})`
  } else {
    loadButton.disabled = true
    menuStatus.textContent = 'No save found yet'
  }
}

let sawGameOver = false
function handleStateUpdate(state: RenderState) {
  if (state.isGameOver && !sawGameOver) {
    scene.showStatus('Game over — tap restart to play again', 0)
    void wakeLock.disable()
  } else if (!state.isGameOver && sawGameOver) {
    scene.showStatus('', 0)
  }
  sawGameOver = state.isGameOver
}

function preventGestureZoom() {
  document.addEventListener(
    'gesturestart',
    (event) => {
      event.preventDefault()
    },
    { passive: false }
  )
  document.addEventListener(
    'gesturechange',
    (event) => {
      event.preventDefault()
    },
    { passive: false }
  )
  let lastTouchEnd = 0
  document.addEventListener(
    'touchend',
    (event) => {
      const now = performance.now()
      if (now - lastTouchEnd <= 350) {
        event.preventDefault()
      }
      lastTouchEnd = now
    },
    { passive: false }
  )
  document.addEventListener(
    'touchmove',
    (event) => {
      const pinchEvent = event as TouchEvent & { scale?: number }
      if (typeof pinchEvent.scale === 'number' && pinchEvent.scale !== 1) {
        event.preventDefault()
      }
    },
    { passive: false }
  )
}

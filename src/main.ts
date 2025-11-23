import Phaser from 'phaser'
import './style.css'
import { TetrixScene } from './scenes/TetrixScene'
import type { GameSnapshot, RenderState, TetrominoType } from './tetrixLogic'
import { getMatrixForType } from './tetrixLogic'
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
    <section id="hud" class="hud hidden" aria-live="polite">
      <div class="metrics">
        <div class="metric">
          <span>Score</span>
          <strong id="scoreValue">0</strong>
        </div>
        <div class="metric">
          <span>Lines</span>
          <strong id="linesValue">0</strong>
        </div>
        <div class="metric">
          <span>Level</span>
          <strong id="levelValue">1</strong>
        </div>
      </div>
      <div class="next">
        <span>Next</span>
        <div id="nextPreview" class="next-preview" aria-label="Next piece preview"></div>
      </div>
      <div class="hud-actions">
        <button id="saveButton" class="ghost" type="button" disabled>Save</button>
        <button id="restartButton" class="ghost" type="button" disabled>Restart</button>
      </div>
      <p id="statusBanner" class="status"></p>
    </section>
    <div id="game-shell">
      <div id="game-container" aria-live="off"></div>
      <div id="menu" class="menu" aria-live="polite">
        <div class="menu-card">
          <h1>Tetrix</h1>
          <p>Low battery Tetrix built with Phaser 4 Canvas. No account required.</p>
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

const hudEl = document.querySelector<HTMLDivElement>('#hud')!
const menuEl = document.querySelector<HTMLDivElement>('#menu')!
const menuStatus = document.querySelector<HTMLParagraphElement>('#menuStatus')!
const startButton = document.querySelector<HTMLButtonElement>('#startButton')!
const loadButton = document.querySelector<HTMLButtonElement>('#loadButton')!
const saveButton = document.querySelector<HTMLButtonElement>('#saveButton')!
const restartButton = document.querySelector<HTMLButtonElement>('#restartButton')!
const statusBanner = document.querySelector<HTMLParagraphElement>('#statusBanner')!
const scoreEl = document.querySelector<HTMLSpanElement>('#scoreValue')!
const linesEl = document.querySelector<HTMLSpanElement>('#linesValue')!
const levelEl = document.querySelector<HTMLSpanElement>('#levelValue')!
const nextPreviewEl = document.querySelector<HTMLDivElement>('#nextPreview')!

const previewCells: HTMLDivElement[] = []
for (let i = 0; i < 16; i += 1) {
  const cell = document.createElement('div')
  cell.className = 'preview-cell'
  previewCells.push(cell)
  nextPreviewEl.appendChild(cell)
}

let sceneReadyResolve: () => void = () => {}
const sceneReady = new Promise<void>((resolve) => {
  sceneReadyResolve = resolve
})

const scene = new TetrixScene({
  onSceneReady: () => sceneReadyResolve(),
  onStateUpdate: (state) => handleStateUpdate(state)
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

restartButton.addEventListener('click', () => {
  void beginSession()
})

saveButton.addEventListener('click', () => {
  void persistSession()
})

async function beginSession(snapshot?: GameSnapshot) {
  await sceneReady
  scene.startNewGame(snapshot)
  hudEl.classList.remove('hidden')
  menuEl.classList.add('hidden')
  saveButton.disabled = false
  restartButton.disabled = false
  if (!wakeLock.isActive()) {
    await wakeLock.enable()
  }
  pushStatus(snapshot ? 'Loaded saved game' : 'New game ready', 2000)
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
  saveButton.disabled = true
  const snapshot = scene.getSnapshot()
  const payload = await savingService.save(snapshot)
  pushStatus('Progress saved', 2400)
  await refreshLoadState()
  saveButton.disabled = false
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

function handleStateUpdate(state: RenderState) {
  scoreEl.textContent = state.score.toString()
  linesEl.textContent = state.linesCleared.toString()
  levelEl.textContent = state.level.toString()
  updateNextPreview(state.nextPiece)
  saveButton.disabled = state.isGameOver
  if (state.isGameOver) {
    restartButton.disabled = false
    pushStatus('Game over — tap restart to play again', 0)
    void wakeLock.disable()
  }
}

function updateNextPreview(type: TetrominoType) {
  previewCells.forEach((cell) => {
    cell.classList.remove('filled')
    cell.style.removeProperty('--preview-color')
  })
  const matrix = getMatrixForType(type)
  const offsetX = Math.floor((4 - matrix[0].length) / 2)
  const offsetY = Math.floor((4 - matrix.length) / 2)
  const color = getPreviewColor(type)
  matrix.forEach((row, r) => {
    row.forEach((value, c) => {
      if (!value) return
      const idx = (offsetY + r) * 4 + (offsetX + c)
      const cell = previewCells[idx]
      if (cell) {
        cell.classList.add('filled')
        cell.style.setProperty('--preview-color', color)
      }
    })
  })
}

function getPreviewColor(type: TetrominoType) {
  switch (type) {
    case 'I':
      return '#7dd3fc'
    case 'J':
      return '#93c5fd'
    case 'L':
      return '#fbbf24'
    case 'O':
      return '#fef08a'
    case 'S':
      return '#4ade80'
    case 'T':
      return '#c084fc'
    case 'Z':
    default:
      return '#f87171'
  }
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

let stickyStatus = ''
let transientTimer: number | null = null
function pushStatus(message: string, duration: number) {
  if (duration === 0) {
    stickyStatus = message
    statusBanner.textContent = message
    return
  }
  stickyStatus = ''
  statusBanner.textContent = message
  if (transientTimer) {
    window.clearTimeout(transientTimer)
  }
  transientTimer = window.setTimeout(() => {
    if (!stickyStatus) {
      statusBanner.textContent = ''
    }
  }, duration)
}

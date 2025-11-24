import Phaser from 'phaser'
import './style.css'
import { TetrisScene } from './scenes/TetrisScene'
import type { RenderState } from './tetrisLogic'
import { createWakeLockManager } from './wakelock'

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
          </div>
        </div>
      </div>
    </div>
  </main>
`

const menuEl = document.querySelector<HTMLDivElement>('#menu')!
const startButton = document.querySelector<HTMLButtonElement>('#startButton')!
renderBuildVersion()

let sceneReadyResolve: () => void = () => {}
const sceneReady = new Promise<void>((resolve) => {
  sceneReadyResolve = resolve
})

const scene = new TetrisScene({
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
registerServiceWorker()

startButton.addEventListener('click', () => {
  void beginSession()
})

async function beginSession() {
  await sceneReady
  scene.startNewGame()
  menuEl.classList.add('hidden')
  if (!wakeLock.isActive()) {
    await wakeLock.enable()
  }
  scene.showStatus('New game ready', 2000)
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

function renderBuildVersion() {
  const buildVersion = getBuildVersionString()
  const tag = document.createElement('div')
  tag.className = 'build-version'
  tag.textContent = `Build ${buildVersion}`
  document.body.appendChild(tag)
}

function getBuildVersionString() {
  const fromEnv = import.meta.env.VITE_BUILD_VERSION
  if (typeof fromEnv === 'string' && fromEnv.trim().length) {
    return fromEnv.trim()
  }
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const y = now.getUTCFullYear().toString().padStart(4, '0')
  const m = pad(now.getUTCMonth() + 1)
  const d = pad(now.getUTCDate())
  const hh = pad(now.getUTCHours())
  const mm = pad(now.getUTCMinutes())
  const ss = pad(now.getUTCSeconds())
  return `${y}${m}${d} ${hh}${mm}${ss}`
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  void navigator.serviceWorker
    .register('/sw.js')
    .catch((error) => console.warn('Service worker registration failed', error))
}

import Phaser from 'phaser'
import type { GameSnapshot, InputAction, RenderState, TetrominoType } from '../tetrixLogic'
import { TetrixEngine } from '../tetrixLogic'

type SceneCallbacks = {
  onStateUpdate?: (state: RenderState) => void
  onSceneReady?: () => void
}

const COLOR_MAP: Record<TetrominoType, number> = {
  I: 0x7dd3fc,
  J: 0x93c5fd,
  L: 0xfbbf24,
  O: 0xfef08a,
  S: 0x4ade80,
  T: 0xc084fc,
  Z: 0xf87171
}

export class TetrixScene extends Phaser.Scene {
  private readonly engine = new TetrixEngine()
  private callbacks: SceneCallbacks
  private graphics?: Phaser.GameObjects.Graphics
  private dropTimer = 0
  private dropInterval = this.engine.getDropInterval()
  private ready = false
  private needsDraw = true
  private cellSize = 24
  private boardOriginX = 0
  private boardOriginY = 0

  constructor(callbacks: SceneCallbacks = {}) {
    super('tetrix')
    this.callbacks = callbacks
  }

  create() {
    this.graphics = this.add.graphics()
    this.cameras.main.setBackgroundColor('#05070c')
    this.scale.on('resize', this.handleResize, this)
    this.handleResize()
    this.registerKeyboard()
    this.ready = true
    this.callbacks.onSceneReady?.()
  }

  update(_time: number, delta: number) {
    if (!this.ready) return
    if (this.engine.isRunning()) {
      this.dropTimer += delta
      if (this.dropTimer >= this.dropInterval) {
        this.dropTimer = 0
        this.engine.stepDown()
        this.dropInterval = this.engine.getDropInterval()
        this.needsDraw = true
      }
    }
    if (this.needsDraw) {
      this.draw()
    }
  }

  isReady() {
    return this.ready
  }

  startNewGame(snapshot?: GameSnapshot) {
    this.engine.start(snapshot)
    this.resetDropTimer()
    this.needsDraw = true
    this.callbacks.onStateUpdate?.(this.engine.getRenderState())
  }

  pauseGame() {
    this.engine.pause()
    this.needsDraw = true
  }

  resumeGame() {
    this.engine.resume()
    this.resetDropTimer()
    this.needsDraw = true
  }

  handleAction(action: InputAction) {
    this.engine.handleAction(action)
    this.needsDraw = true
  }

  getSnapshot() {
    return this.engine.getSnapshot()
  }

  private resetDropTimer() {
    this.dropInterval = this.engine.getDropInterval()
    this.dropTimer = 0
  }

  private draw() {
    const state = this.engine.getRenderState()
    this.callbacks.onStateUpdate?.(state)
    const g = this.graphics
    if (!g) return
    g.clear()

    const totalWidth = this.cellSize * state.width
    const totalHeight = this.cellSize * state.height

    g.fillStyle(0x0b1120, 1)
    g.fillRoundedRect(
      this.boardOriginX - 6,
      this.boardOriginY - 6,
      totalWidth + 12,
      totalHeight + 12,
      12
    )

    this.drawGhost(g, state)
    this.drawBoard(g, state)
    this.needsDraw = false

    if (state.isGameOver) {
      this.drawGameOverOverlay(g, totalWidth, totalHeight)
    }
  }

  private drawBoard(
    g: Phaser.GameObjects.Graphics,
    state: RenderState
  ) {
    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        const cell = state.board[row][col]
        this.drawCell(g, col, row, cell ? COLOR_MAP[cell] : 0x111827, !!cell)
      }
    }

    if (state.currentPiece) {
      const { matrix, x, y, type } = state.currentPiece
      for (let r = 0; r < matrix.length; r += 1) {
        for (let c = 0; c < matrix[r].length; c += 1) {
          if (!matrix[r][c]) continue
          const drawY = y + r
          if (drawY < 0) continue
          this.drawCell(g, x + c, drawY, COLOR_MAP[type], true)
        }
      }
    }
  }

  private drawGhost(
    g: Phaser.GameObjects.Graphics,
    state: RenderState
  ) {
    if (!state.currentPiece || state.ghostY === null) return
    const { matrix, x, type } = state.currentPiece
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix[r].length; c += 1) {
        if (!matrix[r][c]) continue
        const drawY = state.ghostY + r
        if (drawY < 0) continue
        const color = COLOR_MAP[type]
        g.fillStyle(color, 0.25)
        g.fillRoundedRect(
          this.boardOriginX + (x + c) * this.cellSize + 1,
          this.boardOriginY + drawY * this.cellSize + 1,
          this.cellSize - 2,
          this.cellSize - 2,
          6
        )
      }
    }
  }

  private drawGameOverOverlay(
    g: Phaser.GameObjects.Graphics,
    totalWidth: number,
    totalHeight: number
  ) {
    g.fillStyle(0x000000, 0.65)
    g.fillRoundedRect(
      this.boardOriginX + totalWidth * 0.05,
      this.boardOriginY + totalHeight * 0.25,
      totalWidth * 0.9,
      totalHeight * 0.25,
      16
    )
    g.lineStyle(2, 0xffffff, 0.9)
    g.strokeRoundedRect(
      this.boardOriginX + totalWidth * 0.05,
      this.boardOriginY + totalHeight * 0.25,
      totalWidth * 0.9,
      totalHeight * 0.25,
      16
    )
  }

  private drawCell(
    g: Phaser.GameObjects.Graphics,
    col: number,
    row: number,
    color: number,
    filled: boolean
  ) {
    const x = this.boardOriginX + col * this.cellSize
    const y = this.boardOriginY + row * this.cellSize
    g.fillStyle(color, filled ? 1 : 0.35)
    g.fillRoundedRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2, 5)
  }

  private handleResize = () => {
    const { width, height } = this.scale.gameSize
    const padding = 32
    const cellW = Math.floor((width - padding) / this.engine.width)
    const cellH = Math.floor((height - padding) / this.engine.height)
    const nextCellSize = Math.max(16, Math.min(cellW, cellH))
    this.cellSize = nextCellSize
    this.boardOriginX = Math.floor((width - this.cellSize * this.engine.width) / 2)
    this.boardOriginY = Math.floor((height - this.cellSize * this.engine.height) / 2)
    this.needsDraw = true
  }

  private registerKeyboard() {
    if (!this.input.keyboard) return
    const { KeyCodes } = Phaser.Input.Keyboard
    const bindings: Array<[number, InputAction]> = [
      [KeyCodes.LEFT, 'moveLeft'],
      [KeyCodes.A, 'moveLeft'],
      [KeyCodes.RIGHT, 'moveRight'],
      [KeyCodes.D, 'moveRight'],
      [KeyCodes.UP, 'rotate'],
      [KeyCodes.W, 'rotate'],
      [KeyCodes.DOWN, 'softDrop'],
      [KeyCodes.S, 'softDrop'],
      [KeyCodes.SPACE, 'hardDrop']
    ]
    bindings.forEach(([code, action]) => {
      const key = this.input.keyboard!.addKey(code)
      key.on('down', () => {
        this.handleAction(action)
      })
    })
  }
}

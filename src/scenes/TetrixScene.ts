import Phaser from 'phaser'
import type { GameSnapshot, InputAction, RenderState, TetrominoType } from '../tetrixLogic'
import { TetrixEngine } from '../tetrixLogic'

type SceneCallbacks = {
  onStateUpdate?: (state: RenderState) => void
  onSceneReady?: () => void
}

type ControlButtonSpec = {
  action: InputAction
  label: string
  holdable: boolean
  row: number
  span: number
}

type ControlButton = ControlButtonSpec & {
  container: Phaser.GameObjects.Container
  background: Phaser.GameObjects.Rectangle
  text: Phaser.GameObjects.Text
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

const HOLDABLE_ACTIONS: InputAction[] = ['moveLeft', 'moveRight', 'softDrop']

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
  private controlLayer?: Phaser.GameObjects.Container
  private controlButtons: ControlButton[] = []
  private holdTimers = new Map<number, Phaser.Time.TimerEvent>()

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
    this.controlLayer = this.add.container(0, 0)
    this.controlLayer.setDepth(10)
    this.createControlButtons()
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
    this.layoutControlButtons()
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

  private createControlButtons() {
    const specs: ControlButtonSpec[] = [
      { action: 'moveLeft', label: '◀', holdable: true, row: 0, span: 1 },
      { action: 'rotate', label: '⟳', holdable: false, row: 0, span: 1 },
      { action: 'softDrop', label: '▼', holdable: true, row: 0, span: 1 },
      { action: 'moveRight', label: '▶', holdable: true, row: 0, span: 1 },
      { action: 'hardDrop', label: 'DROP', holdable: false, row: 1, span: 4 }
    ]
    const layer = this.controlLayer ?? this.add.container(0, 0)
    this.controlButtons = specs.map((spec) => {
      const container = this.add.container(0, 0)
      container.setDepth(10)
      const background = this.add.rectangle(0, 0, 120, 60, 0x101828, 0.95)
      background.setStrokeStyle(2, 0x475569, 0.85)
      const fontSize = spec.action === 'hardDrop' ? 24 : 36
      const text = this.add
        .text(0, 0, spec.label, {
          color: '#f8fafc',
          fontSize: `${fontSize}px`,
          fontFamily: 'Space Grotesk'
        })
        .setOrigin(0.5)
      container.add([background, text])
      layer.add(container)
      const control: ControlButton = { ...spec, container, background, text }
      this.registerControlInteractions(control)
      return control
    })
    this.layoutControlButtons()
  }

  private layoutControlButtons() {
    if (!this.controlButtons.length) return
    const { width, height } = this.scale.gameSize
    const topCandidate = this.boardOriginY + this.cellSize * this.engine.height + 16
    const padding = 24
    const gap = 12
    const buttonHeight = 68
    const totalRows = 2
    const neededHeight = totalRows * buttonHeight + gap
    const top = Math.min(height - padding - neededHeight, topCandidate)

    for (let row = 0; row < totalRows; row += 1) {
      const rowButtons = this.controlButtons.filter((btn) => btn.row === row)
      if (!rowButtons.length) continue
      const totalSpan = rowButtons.reduce((sum, btn) => sum + btn.span, 0)
      const available =
        width - padding * 2 - gap * Math.max(0, rowButtons.length - 1)
      const perUnit = available / totalSpan
      let cursorX = padding
      const centerY = top + row * (buttonHeight + gap) + buttonHeight / 2
      rowButtons.forEach((btn) => {
        const btnWidth = perUnit * btn.span
        btn.container.setPosition(cursorX + btnWidth / 2, centerY)
        btn.background.setSize(btnWidth, buttonHeight)
        btn.background.setDisplaySize(btnWidth, buttonHeight)
        cursorX += btnWidth + gap
      })
    }
  }

  private registerControlInteractions(control: ControlButton) {
    const { background, holdable, action } = control
    background.setInteractive({ useHandCursor: true })
    const pressColor = 0x1d2b46
    const idleColor = 0x101828

    const handlePointerUp = (pointer: Phaser.Input.Pointer) => {
      background.setFillStyle(idleColor, 0.95)
      this.stopHold(pointer.id)
    }

    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      background.setFillStyle(pressColor, 0.95)
      this.handleAction(action)
      if (holdable && HOLDABLE_ACTIONS.includes(action)) {
        this.startHold(action, pointer.id, action === 'softDrop' ? 60 : 110)
      }
    })
    background.on('pointerup', handlePointerUp)
    background.on('pointerupoutside', handlePointerUp)
    background.on('pointerout', handlePointerUp)
    background.on('pointercancel', handlePointerUp)
  }

  private startHold(action: InputAction, pointerId: number, delay: number) {
    this.stopHold(pointerId)
    const event = this.time.addEvent({
      delay,
      loop: true,
      callback: () => this.handleAction(action)
    })
    this.holdTimers.set(pointerId, event)
  }

  private stopHold(pointerId: number) {
    const event = this.holdTimers.get(pointerId)
    if (event) {
      event.remove(false)
      this.holdTimers.delete(pointerId)
    }
  }
}

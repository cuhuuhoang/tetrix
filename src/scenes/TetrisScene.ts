import Phaser from 'phaser'
import type { GameSnapshot, InputAction, RenderState, TetrominoType } from '../tetrisLogic'
import { TetrisEngine, getMatrixForType } from '../tetrisLogic'

type SceneCallbacks = {
  onStateUpdate?: (state: RenderState) => void
  onSceneReady?: () => void
  onRequestSave?: () => void
  onRequestRestart?: () => void
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

type HudButtonAction = 'save' | 'restart' | 'pause'

type HudButton = {
  action: HudButtonAction
  container: Phaser.GameObjects.Container
  background: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
  disabled: boolean
}

type HudElements = {
  panelBg: Phaser.GameObjects.Rectangle
  scoreLabel: Phaser.GameObjects.Text
  scoreValue: Phaser.GameObjects.Text
  linesLabel: Phaser.GameObjects.Text
  linesValue: Phaser.GameObjects.Text
  levelLabel: Phaser.GameObjects.Text
  levelValue: Phaser.GameObjects.Text
  nextLabel: Phaser.GameObjects.Text
  nextCells: Phaser.GameObjects.Rectangle[]
  pauseButton: HudButton
  saveButton: HudButton
  restartButton: HudButton
  statusText: Phaser.GameObjects.Text
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

export class TetrisScene extends Phaser.Scene {
  private readonly engine = new TetrisEngine()
  private callbacks: SceneCallbacks
  private graphics?: Phaser.GameObjects.Graphics
  private dropTimer = 0
  private dropInterval = this.engine.getDropInterval()
  private ready = false
  private needsDraw = true
  private cellSize = 24
  private boardOriginX = 0
  private boardOriginY = 0
  private boardPixelWidth = 0
  private boardPixelHeight = 0
  private panelWidth = 220
  private controlTop = 0
  private hudLayer?: Phaser.GameObjects.Container
  private hudElements?: HudElements
  private statusTimer?: Phaser.Time.TimerEvent
  private lastState?: RenderState
  private saveBusy = false
  private paused = false
  private controlLayer?: Phaser.GameObjects.Container
  private controlButtons: ControlButton[] = []
  private holdTimers = new Map<number, Phaser.Time.TimerEvent>()

  constructor(callbacks: SceneCallbacks = {}) {
    super('tetris')
    this.callbacks = callbacks
  }

  create() {
    this.graphics = this.add.graphics()
    this.cameras.main.setBackgroundColor('#05070c')
    this.scale.on('resize', this.handleResize, this)
    this.handleResize()
    this.registerKeyboard()
    this.hudLayer = this.add.container(0, 0)
    this.hudLayer.setDepth(6)
    this.createHudPanel()
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
    this.saveBusy = false
    this.paused = false
    this.resetDropTimer()
    this.needsDraw = true
    const state = this.engine.getRenderState()
    this.lastState = state
    this.updateHud(state)
    this.updatePauseButtonLabel()
    this.applyHudButtonStates()
    this.callbacks.onStateUpdate?.(state)
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
    if (this.paused) return
    this.engine.handleAction(action)
    this.needsDraw = true
  }

  getSnapshot() {
    return this.engine.getSnapshot()
  }

  showStatus(message: string, duration = 2000) {
    if (!this.hudElements) return
    this.hudElements.statusText.setText(message)
    if (this.statusTimer) {
      this.statusTimer.remove(false)
      this.statusTimer = undefined
    }
    if (duration > 0) {
      this.statusTimer = this.time.addEvent({
        delay: duration,
        callback: () => {
          this.hudElements?.statusText.setText('')
          this.statusTimer = undefined
        }
      })
    }
  }

  setSaveBusy(busy: boolean) {
    this.saveBusy = busy
    this.applyHudButtonStates()
  }

  private togglePause() {
    if (!this.lastState || this.lastState.isGameOver) return
    this.setPaused(!this.paused)
  }

  private setPaused(value: boolean) {
    if (this.paused === value) return
    if (value) {
      this.engine.pause()
      this.paused = true
      this.showStatus('Paused', 0)
    } else {
      this.engine.resume()
      this.resetDropTimer()
      this.paused = false
      this.showStatus('Resumed', 1200)
    }
    this.updatePauseButtonLabel()
    this.applyHudButtonStates()
  }

  private updatePauseButtonLabel() {
    if (!this.hudElements) return
    const label = this.paused ? 'Resume' : 'Pause'
    this.hudElements.pauseButton.label.setText(label)
  }

  private resetDropTimer() {
    this.dropInterval = this.engine.getDropInterval()
    this.dropTimer = 0
  }

  private draw() {
    const state = this.engine.getRenderState()
    this.lastState = state
    this.updateHud(state)
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
    const outerPadding = 18
    const panelSpacing = Math.max(28, Math.floor(width * 0.025))
    const minPanel = 150
    const maxPanel = 260
    const controlHeight = Math.min(200, Math.max(140, Math.floor(height * 0.24)))
    const desiredPanel = Phaser.Math.Clamp(Math.floor(width * 0.24), minPanel, maxPanel)
    const availableWidth = width - outerPadding * 2 - panelSpacing - desiredPanel
    const availableHeight = height - controlHeight - outerPadding * 3
    const cellW = Math.floor(availableWidth / this.engine.width)
    const cellH = Math.floor(availableHeight / this.engine.height)
    const nextCellSize = Math.max(14, Math.min(cellW, cellH))
    this.cellSize = nextCellSize
    this.boardPixelWidth = this.cellSize * this.engine.width
    this.boardPixelHeight = this.cellSize * this.engine.height
    this.boardOriginX = outerPadding
    let totalRequiredWidth =
      this.boardOriginX + this.boardPixelWidth + desiredPanel + outerPadding * 2 + panelSpacing
    if (totalRequiredWidth > width) {
      const overflow = totalRequiredWidth - width
      const shrink = Math.ceil(overflow / this.engine.width)
      this.cellSize = Math.max(14, this.cellSize - shrink)
      this.boardPixelWidth = this.cellSize * this.engine.width
      this.boardPixelHeight = this.cellSize * this.engine.height
      totalRequiredWidth =
        this.boardOriginX + this.boardPixelWidth + desiredPanel + outerPadding * 2 + panelSpacing
    }
    this.panelWidth = Math.max(
      minPanel,
      Math.min(
        desiredPanel,
        width - this.boardOriginX - this.boardPixelWidth - panelSpacing - outerPadding
      )
    )
    const verticalSpace = height - controlHeight - outerPadding * 2 - this.boardPixelHeight
    this.boardOriginY = outerPadding + Math.max(0, Math.floor(verticalSpace / 2))
    this.controlTop = this.boardOriginY + this.boardPixelHeight + outerPadding
    this.needsDraw = true
    this.layoutControlButtons()
    this.layoutHudPanel()
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

  private createHudPanel() {
    const layer = this.hudLayer ?? this.add.container(0, 0)
    const panelBg = this.add.rectangle(0, 0, 200, 300, 0x0b1221, 0.92).setOrigin(0, 0)
    panelBg.setStrokeStyle(2, 0x1f2937, 0.9)
    layer.add(panelBg)

    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: '#a5b4fc',
      fontSize: '13px',
      fontFamily: 'Space Grotesk',
      fontStyle: '600'
    }
    const valueStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: '#f8fafc',
      fontSize: '28px',
      fontFamily: 'Space Grotesk',
      fontStyle: '600'
    }

    const scoreLabel = this.add.text(0, 0, 'Score', labelStyle).setOrigin(0)
    const scoreValue = this.add.text(0, 0, '0', valueStyle).setOrigin(0)
    const linesLabel = this.add.text(0, 0, 'Lines', labelStyle).setOrigin(0)
    const linesValue = this.add.text(0, 0, '0', valueStyle).setOrigin(0)
    const levelLabel = this.add.text(0, 0, 'Level', labelStyle).setOrigin(0)
    const levelValue = this.add.text(0, 0, '1', valueStyle).setOrigin(0)
    const nextLabel = this.add.text(0, 0, 'Next', labelStyle).setOrigin(0)

    ;[
      scoreLabel,
      scoreValue,
      linesLabel,
      linesValue,
      levelLabel,
      levelValue,
      nextLabel
    ].forEach((text) => layer.add(text))

    const nextCells: Phaser.GameObjects.Rectangle[] = []
    for (let i = 0; i < 16; i += 1) {
      const cell = this.add.rectangle(0, 0, 24, 24, 0x1f2937, 0.35).setOrigin(0, 0)
      cell.setStrokeStyle(1, 0x334155, 0.7)
      nextCells.push(cell)
      layer.add(cell)
    }

    const pauseButton = this.createHudButton('Pause', 'pause')
    const saveButton = this.createHudButton('Save', 'save')
    const restartButton = this.createHudButton('Restart', 'restart')

    const statusText = this.add
      .text(0, 0, '', {
        color: '#cbd5f5',
        fontSize: '14px',
        fontFamily: 'Space Grotesk',
        wordWrap: { width: 200 }
      })
      .setOrigin(0)
    layer.add(statusText)

    this.hudElements = {
      panelBg,
      scoreLabel,
      scoreValue,
      linesLabel,
      linesValue,
      levelLabel,
      levelValue,
      nextLabel,
      nextCells,
      pauseButton,
      saveButton,
      restartButton,
      statusText
    }
    this.layoutHudPanel()
    this.applyHudButtonStates()
  }

  private layoutHudPanel() {
    if (!this.hudElements) return
    const {
      panelBg,
      scoreLabel,
      scoreValue,
      linesLabel,
      linesValue,
      levelLabel,
      levelValue,
      nextLabel,
      nextCells,
      pauseButton,
      saveButton,
      restartButton,
      statusText
    } = this.hudElements
    const { width: canvasWidth } = this.scale.gameSize
    const panelWidth = Math.max(this.panelWidth, 150)
    const panelTop = this.boardOriginY
    const panelHeight = Math.max(this.boardPixelHeight, 280)
    const panelLeft = Math.max(
      this.boardOriginX + this.boardPixelWidth + 32,
      canvasWidth - panelWidth - 18
    )
    panelBg.setPosition(panelLeft, panelTop)
    panelBg.setDisplaySize(panelWidth, panelHeight)

    const textLeft = panelLeft + 16
    let cursorY = panelTop + 20
    this.positionMetric(scoreLabel, scoreValue, textLeft, cursorY)
    cursorY += 70
    this.positionMetric(linesLabel, linesValue, textLeft, cursorY)
    cursorY += 70
    this.positionMetric(levelLabel, levelValue, textLeft, cursorY)
    cursorY += 70

    nextLabel.setPosition(textLeft, cursorY)
    cursorY += 28
    const previewGap = 6
    const previewCellSize = Math.min((panelWidth - 32 - previewGap * 3) / 4, 32)
    const previewLeft = textLeft
    const previewTop = cursorY

    nextCells.forEach((cell, index) => {
      const row = Math.floor(index / 4)
      const col = index % 4
      cell.setDisplaySize(previewCellSize, previewCellSize)
      cell.setPosition(
        previewLeft + col * (previewCellSize + previewGap),
        previewTop + row * (previewCellSize + previewGap)
      )
    })

    cursorY = previewTop + previewCellSize * 4 + previewGap * 3 + 24
    const buttonWidth = Math.max(140, panelWidth - 32)
    const buttonHeight = 52
    const centerX = panelLeft + panelWidth / 2
    this.positionHudButton(
      pauseButton,
      centerX,
      cursorY + buttonHeight / 2,
      buttonWidth,
      buttonHeight
    )
    cursorY += buttonHeight + 12
    this.positionHudButton(
      saveButton,
      centerX,
      cursorY + buttonHeight / 2,
      buttonWidth,
      buttonHeight
    )
    cursorY += buttonHeight + 12
    this.positionHudButton(
      restartButton,
      centerX,
      cursorY + buttonHeight / 2,
      buttonWidth,
      buttonHeight
    )
    cursorY += buttonHeight + 16
    statusText.setPosition(textLeft, cursorY)
    statusText.setWordWrapWidth(buttonWidth)
  }

  private positionMetric(
    label: Phaser.GameObjects.Text,
    value: Phaser.GameObjects.Text,
    x: number,
    y: number
  ) {
    label.setPosition(x, y)
    value.setPosition(x, y + 26)
  }

  private createHudButton(label: string, action: HudButtonAction): HudButton {
    const container = this.add.container(0, 0)
    container.setDepth(7)
    const background = this.add.rectangle(0, 0, 160, 50, 0x1f2937, 0.95)
    background.setStrokeStyle(2, 0x475569, 0.85)
    const text = this.add
      .text(0, 0, label, {
        color: '#f8fafc',
        fontSize: '18px',
        fontFamily: 'Space Grotesk',
        fontStyle: '600'
      })
      .setOrigin(0.5)
    container.add([background, text])
    this.hudLayer?.add(container)
    const button: HudButton = {
      action,
      container,
      background,
      label: text,
      disabled: false
    }

    const idleColor = 0x1f2937
    const pressColor = 0x273449
    const resetColor = () => {
      background.setFillStyle(idleColor, 0.95)
    }
    background.setInteractive({ useHandCursor: true })
    background.on('pointerdown', () => {
      if (button.disabled) return
      background.setFillStyle(pressColor, 0.95)
      this.handleHudButton(action)
    })
    background.on('pointerup', resetColor)
    background.on('pointerupoutside', resetColor)
    background.on('pointerout', resetColor)
    background.on('pointercancel', resetColor)

    return button
  }

  private positionHudButton(
    button: HudButton,
    centerX: number,
    centerY: number,
    width: number,
    height: number
  ) {
    button.container.setPosition(centerX, centerY)
    button.background.setDisplaySize(width, height)
  }

  private handleHudButton(action: HudButtonAction) {
    if (action === 'save') {
      if (this.saveBusy || this.lastState?.isGameOver) return
      this.callbacks.onRequestSave?.()
    } else if (action === 'restart') {
      this.callbacks.onRequestRestart?.()
    } else if (action === 'pause') {
      this.togglePause()
    }
  }

  private setHudButtonState(button: HudButton, disabled: boolean) {
    button.disabled = disabled
    const alpha = disabled ? 0.42 : 1
    button.background.setAlpha(alpha)
    button.label.setAlpha(disabled ? 0.6 : 1)
  }

  private applyHudButtonStates() {
    if (!this.hudElements) return
    const disableSave = this.saveBusy || !this.lastState || this.lastState.isGameOver
    this.setHudButtonState(this.hudElements.saveButton, disableSave)
    const disablePause = !this.lastState || this.lastState.isGameOver
    this.setHudButtonState(this.hudElements.pauseButton, disablePause)
  }

  private updateHud(state: RenderState) {
    if (!this.hudElements) return
    if (state.isGameOver && this.paused) {
      this.paused = false
    }
    this.hudElements.scoreValue.setText(state.score.toString())
    this.hudElements.linesValue.setText(state.linesCleared.toString())
    this.hudElements.levelValue.setText(state.level.toString())
    this.updateNextPreview(state.nextPiece)
    this.updatePauseButtonLabel()
    this.applyHudButtonStates()
  }

  private updateNextPreview(type: TetrominoType) {
    if (!this.hudElements) return
    const matrix = getMatrixForType(type)
    const previewSize = 4
    const offsetX = Math.floor((previewSize - matrix[0].length) / 2)
    const offsetY = Math.floor((previewSize - matrix.length) / 2)
    const baseColor = 0x1f2937
    this.hudElements.nextCells.forEach((cell) => {
      cell.setFillStyle(baseColor, 0.35)
    })
    matrix.forEach((row, r) => {
      row.forEach((value, c) => {
        if (!value) return
        const idx = (offsetY + r) * previewSize + (offsetX + c)
        const cell = this.hudElements!.nextCells[idx]
        if (cell) {
          cell.setFillStyle(COLOR_MAP[type], 0.95)
        }
      })
    })
  }

  private createControlButtons() {
    const specs: ControlButtonSpec[] = [
      { action: 'moveLeft', label: '◀', holdable: true, row: 0, span: 2 },
      { action: 'rotate', label: '⟳', holdable: false, row: 0, span: 2 },
      { action: 'moveRight', label: '▶', holdable: true, row: 0, span: 2 },
      { action: 'hardDrop', label: 'DROP', holdable: false, row: 1, span: 6 }
    ]
    const layer = this.controlLayer ?? this.add.container(0, 0)
    this.controlLayer = layer
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
    const { height } = this.scale.gameSize
    const padding = 18
    const gap = 12
    const buttonHeight = 68
    const totalRows = 2
    const neededHeight = totalRows * buttonHeight + gap
    const top = Math.min(height - padding - neededHeight, this.controlTop)
    const startX = this.boardOriginX
    const usableWidth = Math.max(this.boardPixelWidth, 320)

    for (let row = 0; row < totalRows; row += 1) {
      const rowButtons = this.controlButtons.filter((btn) => btn.row === row)
      if (!rowButtons.length) continue
      const totalSpan = rowButtons.reduce((sum, btn) => sum + btn.span, 0)
      const available =
        usableWidth - gap * Math.max(0, rowButtons.length - 1)
      const perUnit = available / totalSpan
      let cursorX = startX
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

export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z'

export type Cell = TetrominoType | null

export interface ActivePiece {
  type: TetrominoType
  matrix: number[][]
  x: number
  y: number
}

export interface GameSnapshot {
  board: Cell[][]
  currentPiece: ActivePiece | null
  queue: TetrominoType[]
  score: number
  linesCleared: number
  isGameOver: boolean
}

export interface RenderState extends GameSnapshot {
  width: number
  height: number
  level: number
  nextPiece: TetrominoType
  ghostY: number | null
  dropInterval: number
}

const TETROMINO_ORDER: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z']

const TETROMINO_SHAPES: Record<TetrominoType, number[][]> = {
  I: [
    [1, 1, 1, 1]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1]
  ]
}

const SCORE_TABLE = [0, 40, 100, 300, 1200]

export const BOARD_WIDTH = 10
export const BOARD_HEIGHT = 20

export type InputAction = 'moveLeft' | 'moveRight' | 'rotate' | 'softDrop' | 'hardDrop'

export class TetrisEngine {
  public readonly width = BOARD_WIDTH
  public readonly height = BOARD_HEIGHT

  private board: Cell[][] = []
  private queue: TetrominoType[] = []
  private currentPiece: ActivePiece | null = null
  private running = false
  private score = 0
  private linesCleared = 0
  private gameOver = false

  constructor() {
    this.board = this.createEmptyBoard()
  }

  start(snapshot?: GameSnapshot) {
    if (snapshot) {
      this.hydrateFromSnapshot(snapshot)
    } else {
      this.board = this.createEmptyBoard()
      this.queue = []
      this.currentPiece = null
      this.score = 0
      this.linesCleared = 0
      this.gameOver = false
      this.ensureQueue()
      this.spawnNextPiece()
    }
    this.running = !this.gameOver
  }

  pause() {
    this.running = false
  }

  resume() {
    if (!this.gameOver) {
      this.running = true
    }
  }

  isRunning() {
    return this.running && !this.gameOver
  }

  getRenderState(): RenderState {
    this.ensureQueue()
    return {
      board: this.cloneBoard(),
      currentPiece: this.currentPiece ? this.clonePiece(this.currentPiece) : null,
      queue: [...this.queue],
      score: this.score,
      linesCleared: this.linesCleared,
      isGameOver: this.gameOver,
      width: this.width,
      height: this.height,
      level: this.getLevel(),
      nextPiece: this.queue[0],
      ghostY: this.currentPiece ? this.computeGhostY() : null,
      dropInterval: this.getDropInterval()
    }
  }

  getSnapshot(): GameSnapshot {
    return {
      board: this.cloneBoard(),
      currentPiece: this.currentPiece ? this.clonePiece(this.currentPiece) : null,
      queue: [...this.queue],
      score: this.score,
      linesCleared: this.linesCleared,
      isGameOver: this.gameOver
    }
  }

  handleAction(action: InputAction) {
    if (!this.isRunning()) return
    switch (action) {
      case 'moveLeft':
        this.shiftPiece(-1)
        break
      case 'moveRight':
        this.shiftPiece(1)
        break
      case 'rotate':
        this.rotatePiece()
        break
      case 'softDrop':
        this.stepDown(true)
        break
      case 'hardDrop':
        this.hardDrop()
        break
    }
  }

  stepDown(manual = false) {
    if (!this.currentPiece) return
    if (this.canPlace(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y += 1
      if (manual) {
        this.score += 1
      }
    } else {
      this.lockCurrentPiece()
      this.clearLines()
      this.spawnNextPiece()
    }
  }

  getDropInterval() {
    const level = this.getLevel()
    const base = 1000
    const decay = Math.min(level - 1, 10) * 60
    return Math.max(base - decay, 300)
  }

  private createEmptyBoard(): Cell[][] {
    return Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => null)
    )
  }

  private cloneBoard(): Cell[][] {
    return this.board.map((row) => [...row])
  }

  private clonePiece(piece: ActivePiece): ActivePiece {
    return {
      type: piece.type,
      matrix: piece.matrix.map((row) => [...row]),
      x: piece.x,
      y: piece.y
    }
  }

  private hydrateFromSnapshot(snapshot: GameSnapshot) {
    this.board = snapshot.board.map((row) => [...row])
    this.currentPiece = snapshot.currentPiece ? this.clonePiece(snapshot.currentPiece) : null
    this.queue = [...snapshot.queue]
    this.score = snapshot.score
    this.linesCleared = snapshot.linesCleared
    this.gameOver = snapshot.isGameOver
    if (!this.queue.length) {
      this.ensureQueue()
    }
    if (!this.currentPiece && !this.gameOver) {
      this.spawnNextPiece()
    }
  }

  private ensureQueue() {
    while (this.queue.length < TETROMINO_ORDER.length) {
      const bag = [...TETROMINO_ORDER]
      this.shuffle(bag)
      this.queue.push(...bag)
    }
  }

  private shuffle(items: TetrominoType[]) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
  }

  private spawnNextPiece() {
    this.ensureQueue()
    const type = this.queue.shift()
    if (!type) return
    const matrix = getMatrixForType(type)
    const x = Math.floor((this.width - matrix[0].length) / 2)
    const y = -1
    const candidate: ActivePiece = { type, matrix, x, y }
    if (this.canPlace(matrix, x, y)) {
      this.currentPiece = candidate
    } else {
      this.currentPiece = null
      this.gameOver = true
      this.running = false
    }
  }

  private shiftPiece(deltaX: number) {
    if (!this.currentPiece) return
    const targetX = this.currentPiece.x + deltaX
    if (this.canPlace(this.currentPiece.matrix, targetX, this.currentPiece.y)) {
      this.currentPiece.x = targetX
    }
  }

  private rotatePiece() {
    if (!this.currentPiece) return
    const rotated = rotateMatrix(this.currentPiece.matrix)
    const kicks = [0, -1, 1, -2, 2]
    for (const offset of kicks) {
      const targetX = this.currentPiece.x + offset
      if (this.canPlace(rotated, targetX, this.currentPiece.y)) {
        this.currentPiece.matrix = rotated
        this.currentPiece.x = targetX
        return
      }
    }
  }

  private hardDrop() {
    if (!this.currentPiece) return
    let distance = 0
    while (this.canPlace(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y += 1
      distance += 1
    }
    if (distance > 0) {
      this.score += distance * 2
    }
    this.lockCurrentPiece()
    this.clearLines()
    this.spawnNextPiece()
  }

  private lockCurrentPiece() {
    if (!this.currentPiece) return
    const { matrix, x, y, type } = this.currentPiece
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix[row].length; col += 1) {
        if (!matrix[row][col]) continue
        const boardY = y + row
        const boardX = x + col
        if (boardY < 0) continue
        if (boardY >= this.height || boardX < 0 || boardX >= this.width) continue
        this.board[boardY][boardX] = type
      }
    }
    this.currentPiece = null
  }

  private clearLines() {
    let lines = 0
    for (let row = this.height - 1; row >= 0; row -= 1) {
      if (this.board[row].every((cell) => cell)) {
        this.board.splice(row, 1)
        this.board.unshift(Array.from({ length: this.width }, () => null))
        lines += 1
        row += 1
      }
    }
    if (lines > 0) {
      this.linesCleared += lines
      const level = this.getLevel()
      this.score += (SCORE_TABLE[lines] || 0) * level
    }
  }

  private getLevel() {
    return Math.floor(this.linesCleared / 10) + 1
  }

  private canPlace(matrix: number[][], x: number, y: number) {
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix[row].length; col += 1) {
        if (!matrix[row][col]) continue
        const boardX = x + col
        const boardY = y + row
        if (boardX < 0 || boardX >= this.width) return false
        if (boardY >= this.height) return false
        if (boardY < 0) continue
        if (this.board[boardY][boardX]) return false
      }
    }
    return true
  }

  private computeGhostY() {
    if (!this.currentPiece) return null
    let y = this.currentPiece.y
    while (this.canPlace(this.currentPiece.matrix, this.currentPiece.x, y + 1)) {
      y += 1
    }
    return y
  }
}

export function getMatrixForType(type: TetrominoType) {
  return TETROMINO_SHAPES[type].map((row) => [...row])
}

function rotateMatrix(matrix: number[][]) {
  const rows = matrix.length
  const cols = matrix[0].length
  const result: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      result[col][rows - row - 1] = matrix[row][col]
    }
  }
  return result
}

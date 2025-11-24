import { describe, expect, it } from 'vitest'
import type { Cell, GameSnapshot } from './tetrisLogic'
import { BOARD_HEIGHT, BOARD_WIDTH, TetrisEngine, getMatrixForType } from './tetrisLogic'

describe('TetrisEngine core rules', () => {
  it('clears a completed line and increases score', () => {
    const engine = new TetrisEngine()
    const board: Cell[][] = Array.from({ length: BOARD_HEIGHT }, () =>
      Array.from({ length: BOARD_WIDTH }, () => null)
    )
    board[BOARD_HEIGHT - 1] = Array.from({ length: BOARD_WIDTH }, () => 'T')
    for (let c = BOARD_WIDTH - 4; c < BOARD_WIDTH; c += 1) {
      board[BOARD_HEIGHT - 1][c] = null
    }

    const snapshot: GameSnapshot = {
      board,
      currentPiece: {
        type: 'I',
        matrix: getMatrixForType('I'),
        x: BOARD_WIDTH - 4,
        y: BOARD_HEIGHT - 3
      },
      queue: ['O', 'J', 'L', 'S', 'Z', 'T', 'I'],
      score: 0,
      linesCleared: 0,
      isGameOver: false
    }

    engine.start(snapshot)
    engine.stepDown()
    engine.stepDown()
    engine.stepDown()

    const state = engine.getRenderState()
    expect(state.linesCleared).toBe(1)
    expect(state.score).toBeGreaterThan(0)
    expect(state.board[BOARD_HEIGHT - 1].every((cell) => cell === null)).toBe(true)
  })

  it('restores a snapshot without losing the queue', () => {
    const engine = new TetrisEngine()
    engine.start()
    engine.handleAction('moveLeft')
    engine.stepDown()

    const snapshot = engine.getSnapshot()
    const rehydrated = new TetrisEngine()
    rehydrated.start(snapshot)

    const state = rehydrated.getRenderState()
    expect(state.score).toBe(snapshot.score)
    expect(state.linesCleared).toBe(snapshot.linesCleared)
    expect(state.queue.slice(0, 3)).toEqual(snapshot.queue.slice(0, 3))
    const originalPiece = snapshot.currentPiece
    const clonedPiece = state.currentPiece
    if (originalPiece && clonedPiece) {
      expect(clonedPiece.x).toBe(originalPiece.x)
      expect(clonedPiece.y).toBe(originalPiece.y)
      expect(clonedPiece.type).toBe(originalPiece.type)
    }
  })

  it('hard drop awards distance-based bonus and locks the piece', () => {
    const engine = new TetrisEngine()
    const board: Cell[][] = Array.from({ length: BOARD_HEIGHT }, () =>
      Array.from({ length: BOARD_WIDTH }, () => null)
    )
    const verticalI = [
      [1],
      [1],
      [1],
      [1]
    ]
    const snapshot: GameSnapshot = {
      board,
      currentPiece: {
        type: 'I',
        matrix: verticalI,
        x: 0,
        y: 0
      },
      queue: ['J', 'L', 'O', 'S', 'Z', 'T', 'I'],
      score: 0,
      linesCleared: 0,
      isGameOver: false
    }

    engine.start(snapshot)
    engine.handleAction('hardDrop')

    const state = engine.getRenderState()
    const expectedDistance = BOARD_HEIGHT - verticalI.length
    expect(state.score).toBe(expectedDistance * 2)
    expect(state.board.slice(-verticalI.length).every((row) => row[0] === 'I')).toBe(true)
    expect(state.currentPiece?.type).toBe(snapshot.queue[0])
  })
})

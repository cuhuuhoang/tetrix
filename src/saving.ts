import localforage from 'localforage'
import type { GameSnapshot } from './tetrixLogic'

export interface SavePayload {
  snapshot: GameSnapshot
  savedAt: number
}

localforage.config({
  name: 'tetrix',
  storeName: 'tetrix_state',
  description: 'Tetrix progress for offline play'
})

export class SavingService {
  private readonly key: string

  constructor(key = 'tetrix-slot') {
    this.key = key
  }

  async save(snapshot: GameSnapshot) {
    const payload: SavePayload = {
      snapshot,
      savedAt: Date.now()
    }
    await localforage.setItem(this.key, payload)
    return payload
  }

  async load() {
    const payload = await localforage.getItem<SavePayload>(this.key)
    return payload ?? null
  }

  async hasSave() {
    const payload = await this.load()
    return Boolean(payload)
  }

  async remove() {
    await localforage.removeItem(this.key)
  }
}

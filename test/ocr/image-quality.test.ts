import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { assessImage, describeProblems } from '../../src/lib/imageQuality'

// A stand-in for an HTML canvas holding a photo of a form: grey levels 0-255.
class FakeCanvas {
  width: number
  height: number
  pixels: Uint8ClampedArray
  constructor(width: number, height: number, grey: (x: number, y: number) => number = () => 0) {
    this.width = width
    this.height = height
    this.pixels = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) this.pixels.fill(grey(x, y), (y * width + x) * 4, (y * width + x) * 4 + 4)
  }
  getContext() {
    return {
      drawImage: (source: FakeCanvas) => { this.pixels = source.pixels.slice() },
      getImageData: () => ({ data: this.pixels }),
    }
  }
}
const photo = (grey: (x: number, y: number) => number) => new FakeCanvas(40, 40, grey) as unknown as HTMLCanvasElement
// Black text strokes on white paper: sharp edges.
const sharpText = (paper: number, ink: number) => (x: number, y: number) => ((x + y) % 4 < 2 ? ink : paper)
beforeEach(() => vi.stubGlobal('document', { createElement: () => new FakeCanvas(1, 1) }))
afterEach(() => vi.unstubAllGlobals())

describe('Photo quality check before a form is sent to the OCR (assessImage)', () => {
  test('a sharp, well-lit photo of a form passes', () => {
    const quality = assessImage(photo(sharpText(230, 40)))
    expect(quality.problems).toEqual([])
    expect(quality.brightness).toBe(135)
    expect(quality.sharpness).toBeGreaterThan(60)
  })

  test('a blurred photo is caught', () => {
    expect(assessImage(photo(() => 170)).problems).toEqual(['blurry'])
  })

  test('a dark photo and an overexposed photo are caught', () => {
    expect(assessImage(photo(sharpText(60, 0))).problems).toEqual(['too dark'])
    expect(assessImage(photo(() => 252)).problems).toEqual(['too bright or washed out', 'blurry'])
  })

  test('the problems are described in words', () => {
    expect(describeProblems(['too dark', 'blurry'])).toBe('too dark and blurry')
    expect(describeProblems(['too dark', 'blurry', 'tilted'])).toBe('too dark, blurry and tilted')
    expect(describeProblems(['blurry'])).toBe('blurry')
  })

  test('edge case: no problems means no description', () => {
    expect(describeProblems([])).toBe('')
  })
})

import fs from 'node:fs'
import os from 'node:os'
/**
 * 测试路径帮助器
 */
import path from 'node:path'

export const FIXTURE_ROOT = path.resolve('tests/fixtures')
export const IMG_FIXTURES = path.join(FIXTURE_ROOT, 'images')
export const MALICIOUS_FIXTURES = path.join(FIXTURE_ROOT, 'malicious')
export const LUT_FIXTURES = path.join(FIXTURE_ROOT, 'luts')

export function fixtureImage(name: string): string {
  const p = path.join(IMG_FIXTURES, name)
  if (!fs.existsSync(p)) throw new Error(`Fixture not found: ${p}. Run: npm run fixtures:generate`)
  return p
}

export function makeTempDir(prefix = 'grainmark-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir) && dir.includes('grainmark-test-')) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

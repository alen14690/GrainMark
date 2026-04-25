/**
 * shared/cubeParser 单测 — 主/渲染共享解析器的纯函数契约
 */
import { describe, expect, it } from 'vitest'
import { CUBE_LIMITS, CubeParseError, cubeToRgba8, parseCubeText } from '../../shared/cubeParser'

describe('parseCubeText · 常规解析', () => {
  it('最小 2³ LUT + TITLE + DOMAIN', () => {
    const text = [
      'TITLE "Test"',
      'LUT_3D_SIZE 2',
      'DOMAIN_MIN 0 0 0',
      'DOMAIN_MAX 1 1 1',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '1 1 0',
      '0 0 1',
      '1 0 1',
      '0 1 1',
      '1 1 1',
    ].join('\n')
    const cube = parseCubeText(text)
    expect(cube.size).toBe(2)
    expect(cube.title).toBe('Test')
    expect(cube.data).toBeInstanceOf(Float32Array)
    expect(cube.data.length).toBe(8 * 3)
    expect(Array.from(cube.data)).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
    ])
  })

  it('支持 # 注释 + 空行', () => {
    const text = '# head\n\nLUT_3D_SIZE 2\n# comment\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1'
    const cube = parseCubeText(text)
    expect(cube.size).toBe(2)
    expect(cube.data.length).toBe(24)
  })

  it('title 无引号 / 超长截断到 128 字符', () => {
    const longTitle = 'X'.repeat(200)
    const text = `TITLE ${longTitle}\nLUT_3D_SIZE 2\n${Array(8).fill('0 0 0').join('\n')}`
    const cube = parseCubeText(text)
    expect(cube.title?.length).toBe(128)
  })
})

describe('parseCubeText · 错误分支', () => {
  it('缺 LUT_3D_SIZE → LUT_MISSING_SIZE', () => {
    const text = '0 0 0\n1 1 1'
    expect(() => parseCubeText(text)).toThrowError(CubeParseError)
    try {
      parseCubeText(text)
    } catch (e) {
      expect((e as CubeParseError).code).toBe('LUT_MISSING_SIZE')
    }
  })

  it('SIZE=1 → LUT_BAD_SIZE（下限 2）', () => {
    const text = 'LUT_3D_SIZE 1\n0 0 0'
    expect(() => parseCubeText(text)).toThrowError(/LUT_3D_SIZE=1/)
  })

  it('SIZE=65 → LUT_BAD_SIZE（上限 64）', () => {
    const text = 'LUT_3D_SIZE 65\n0 0 0'
    expect(() => parseCubeText(text)).toThrowError(/LUT_3D_SIZE=65/)
  })

  it('数据不足 → LUT_DATA_MISMATCH', () => {
    const text = 'LUT_3D_SIZE 2\n0 0 0\n1 1 1'
    try {
      parseCubeText(text)
      expect.fail('should throw')
    } catch (e) {
      expect((e as CubeParseError).code).toBe('LUT_DATA_MISMATCH')
    }
  })

  it('超长文件 → LUT_TOO_MANY_LINES', () => {
    const longText = Array(CUBE_LIMITS.MAX_LINES + 10)
      .fill('# x')
      .join('\n')
    try {
      parseCubeText(longText)
      expect.fail('should throw')
    } catch (e) {
      expect((e as CubeParseError).code).toBe('LUT_TOO_MANY_LINES')
    }
  })
})

describe('cubeToRgba8', () => {
  it('2³ LUT → 8 × 4 = 32 字节，RGBA 正确量化', () => {
    const cube = {
      size: 2,
      data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]),
    }
    const rgba = cubeToRgba8(cube)
    expect(rgba.length).toBe(32)
    expect(rgba[0]).toBe(0) // R=0
    expect(rgba[3]).toBe(255) // Alpha=255
    expect(rgba[4]).toBe(255) // 下一个点 R=1 → 255
    expect(rgba[4 * 7]).toBe(255) // 最后点 R=1
    expect(rgba[4 * 7 + 1]).toBe(255) // G=1
    expect(rgba[4 * 7 + 2]).toBe(255) // B=1
  })

  it('值超出 [0,1] 会被 clamp', () => {
    const cube = {
      size: 2,
      data: new Float32Array(24).fill(2),
    }
    const rgba = cubeToRgba8(cube)
    for (let i = 0; i < 8; i++) {
      expect(rgba[i * 4 + 0]).toBe(255)
      expect(rgba[i * 4 + 1]).toBe(255)
      expect(rgba[i * 4 + 2]).toBe(255)
      expect(rgba[i * 4 + 3]).toBe(255)
    }
  })

  it('负值被 clamp 到 0', () => {
    const cube = {
      size: 2,
      data: new Float32Array(24).fill(-1),
    }
    const rgba = cubeToRgba8(cube)
    for (let i = 0; i < 8; i++) {
      expect(rgba[i * 4 + 0]).toBe(0)
      expect(rgba[i * 4 + 1]).toBe(0)
      expect(rgba[i * 4 + 2]).toBe(0)
    }
  })

  it('保持每边 N³ × 4 的字节数', () => {
    // 3³ = 27 点
    const cube = { size: 3, data: new Float32Array(27 * 3) }
    expect(cubeToRgba8(cube).length).toBe(27 * 4)
    // 10³ = 1000
    const cube2 = { size: 10, data: new Float32Array(1000 * 3) }
    expect(cubeToRgba8(cube2).length).toBe(1000 * 4)
  })
})

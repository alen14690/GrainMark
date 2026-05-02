/**
 * frameBrands — 品牌匹配测试
 */
import { describe, expect, it } from 'vitest'
import { CAMERA_BRANDS, matchBrandByMake } from '../../shared/frame-brands'

describe('frame-brands · matchBrandByMake', () => {
  it('Leica 匹配(不区分大小写)', () => {
    expect(matchBrandByMake('LEICA')).toBe('leica')
    expect(matchBrandByMake('Leica Camera AG')).toBe('leica')
    expect(matchBrandByMake('leica')).toBe('leica')
  })

  it('Sony 匹配', () => {
    expect(matchBrandByMake('SONY')).toBe('sony')
    expect(matchBrandByMake('Sony Corporation')).toBe('sony')
  })

  it('Canon 匹配', () => {
    expect(matchBrandByMake('Canon')).toBe('canon')
    expect(matchBrandByMake('CANON INC.')).toBe('canon')
  })

  it('Nikon 匹配(含 NIKON CORPORATION)', () => {
    expect(matchBrandByMake('NIKON CORPORATION')).toBe('nikon')
    expect(matchBrandByMake('Nikon')).toBe('nikon')
  })

  it('Fujifilm 多种写法匹配', () => {
    expect(matchBrandByMake('FUJIFILM')).toBe('fujifilm')
    expect(matchBrandByMake('FUJI PHOTO FILM CO., LTD.')).toBe('fujifilm')
  })

  it('Hasselblad 匹配', () => {
    expect(matchBrandByMake('Hasselblad')).toBe('hasselblad')
  })

  it('Olympus / OM System 匹配', () => {
    expect(matchBrandByMake('OLYMPUS CORPORATION')).toBe('olympus')
    expect(matchBrandByMake('OM Digital Solutions')).toBe('olympus')
  })

  it('Apple iPhone 匹配', () => {
    expect(matchBrandByMake('Apple')).toBe('apple')
  })

  it('DJI 匹配', () => {
    expect(matchBrandByMake('DJI')).toBe('dji')
  })

  it('未知品牌返回 null', () => {
    expect(matchBrandByMake('UNKNOWN BRAND')).toBeNull()
    expect(matchBrandByMake('')).toBeNull()
    expect(matchBrandByMake(null)).toBeNull()
    expect(matchBrandByMake(undefined)).toBeNull()
  })

  it('CAMERA_BRANDS 排序:Leica 第一', () => {
    expect(CAMERA_BRANDS[0].id).toBe('leica')
  })

  it('CAMERA_BRANDS 至少 10 个品牌', () => {
    expect(CAMERA_BRANDS.length).toBeGreaterThanOrEqual(10)
  })
})

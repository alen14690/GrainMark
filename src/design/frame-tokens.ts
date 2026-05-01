/**
 * 前端边框 token · re-export 自 `shared/frame-tokens.ts`
 *
 * 原因:
 *   - token 必须两端共享(layoutEngine.ts 和 React layout 组件都要读)
 *   - 真值放 `shared/`(两端都不会违反目录约定)
 *   - 这个 shim 让 `src/design/` 目录保留"UI 设计 token 汇总"的语义(colors / spacing / frame-tokens 同级)
 *
 * 改动规则:新增 token 直接改 `shared/frame-tokens.ts`,这里自动跟新(无需手动同步)。
 */
export {
  BORDER,
  COLOR,
  FONT_SIZE,
  FONT_STACK,
  ORIENTATION,
  classifyOrientation,
  scaleByMinEdge,
} from '../../shared/frame-tokens'

# GrainMark Codebase Architecture Analysis

## Executive Summary

**GrainMark** is a professional photo editing application built with:
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Desktop**: Electron (main + renderer process)
- **State Management**: Zustand (multiple specialized stores)
- **Rendering**: WebGL 2 (GPU-accelerated image processing)
- **Routing**: React Router v6
- **IPC**: Custom typed IPC wrapper for Electron communication

**Architecture Pattern: Hybrid MVU (Model-View-Update) with Layered Separation of Concerns**

---

## 1. Design Patterns Used

### 1.1 Primary Architecture Pattern: **Store-Based State Management (MVC-like)**

Not a traditional MVC/MVVM/VIPER, but rather a **modern Zustand-based reactive architecture**:

```
┌─────────────────────────────────────────────────┐
│ Electron App Layer (Main Process)               │
├─────────────────────────────────────────────────┤
│ Renderer Process (React)                        │
├──────────────┬──────────────┬──────────────────┤
│ App          │ Routes       │ Components       │
├──────────────┼──────────────┼──────────────────┤
│ useAppStore  │useEditStore  │ usePerfStore     │
│ (Global)     │ (Local Edit) │ (Perf Metrics)   │
├──────────────┴──────────────┴──────────────────┤
│ Hooks Layer (useWebGLPreview, useLutTexture)   │
├──────────────────────────────────────────────┤
│ IPC Layer (typed invoke/on wrapper)            │
├──────────────────────────────────────────────┤
│ WebGL Rendering Engine                        │
│ (GLContext → Pipeline → Pass → Shaders)       │
└──────────────────────────────────────────────┘
```

### 1.2 Store Patterns Identified

**Three Distinct Zustand Stores** (each with different responsibilities):

#### **1) `useAppStore` (Global Application State)**
- **Scope**: Photo library, filter presets, settings
- **Mutability**: Uses Immer middleware for immutable updates
- **Characteristics**: 
  - Survives route changes
  - Initialized at app startup via `init()` action
  - Manages async data loading (photos, filters, settings)
  - Handles selection state (selectedPhotoIds)
  - Connected to main process via IPC

```typescript
// Pattern: Zustand + Immer for immutable mutations
export const useAppStore = create<AppState>()(
  immer((set, get) => ({
    // State
    settings: null,
    filters: [],
    photos: [],
    selectedPhotoIds: [],
    
    // Actions (can mutate directly due to Immer proxy)
    async init() { /* ... */ },
    selectPhotos(ids) { /* ... */ },
  }))
)
```

#### **2) `useEditStore` (Editor Session State)**
- **Scope**: Single-image editing session + undo/redo history
- **Characteristics**:
  - **Ephemeral**: Clears when leaving Editor route
  - **History-aware**: Maintains up to 50 undo/redo steps
  - **Pipeline-centric**: Tracks currentPipeline + baselinePipeline (dirty detection)
  - **Commit-based**: `commitHistory()` only on interaction end (not real-time)

**Key Innovation: Deferred History Commits**
- Sliders don't auto-commit; only on `onChangeEnd` or keyboard
- `commitHistory()` is idempotent: skips duplicate pushes (deep JSON equality)
- Supports partial edits + undo (scenario B: user setTone → undo discards uncommitted changes)

#### **3) `usePerfStore` (Performance Monitoring)**
- **Scope**: GPU frame metrics, histogram data
- **Design**: "Subscribe-only" pattern
  - Writes don't trigger main Editor re-renders
  - Only diagnostic UI subscribes (memo components)
  - Solves P0-1 regression (perf metrics causing perf problems)
- **Async Reporting**: Events queued + batched to main process (IPC `perf:log`)

---

## 2. State Management Architecture

### 2.1 State Flow Diagram

```
IPC (Main ← → Renderer)
    ↓
useAppStore (init, photos, filters, settings)
    ├→ Router (react-router-dom)
    │   ├→ Library (view photos)
    │   ├→ Editor (edit one photo)
    │   │   ├→ useEditStore (current pipeline)
    │   │   ├→ useWebGLPreview (GPU rendering)
    │   │   │   ├→ useLutTexture (async LUT loading)
    │   │   │   └→ usePerfStore (perf metrics)
    │   │   └→ AdjustmentsPanel (sliders → setTone, setExposure, etc.)
    │   ├→ Batch (batch processing)
    │   ├→ Filters (filter manager)
    │   └→ ... (other routes)
    │
    └→ Effects (useEffect hooks)
        ├→ Listen to main process events (ipcOn)
        ├→ Sync activeFilter → editStore.loadFromPreset()
        ├→ Cleanup on route exit
        └→ History stack management (commitHistory)
```

### 2.2 Two-Way IPC Communication

**Request-Response (invoke):**
```typescript
// Typed wrapper ensures schema validation
const photos = await ipc('photo:list')  // Request + wait for response
await ipc('photo:import', paths)         // Fire and forget async
```

**Push Events (on):**
```typescript
// Main process → Renderer (one-way subscriptions)
ipcOn('photo:repaired', () => {
  get().refreshPhotos()  // React to main process event
})
```

### 2.3 Selector Pattern (Performance Optimization P0-6)

**Anti-Pattern Avoided:**
```typescript
// ❌ WRONG: Subscribes to entire photos array
const photos = useAppStore((s) => s.photos)
// → Library import/delete causes ALL Editor subscribers to re-render!

// ✅ CORRECT: Precise selector
const photo = useAppStore((s) => s.photos.find((p) => p.id === photoId) ?? s.photos[0])
// → Only re-renders if THIS photo or first photo changes
```

**Applied Consistently:**
- `useAppStore((s) => s.photos.find(...))` in Editor
- Prevents cascade re-renders when other photos are modified

---

## 3. Dependency Management

### 3.1 Dependency Injection Strategy: **Direct Store Access (No DI Container)**

**Pattern: `store.getState()` for imperative updates**
```typescript
// Instead of prop drilling or context, use store directly
const handleClick = () => {
  useAppStore.getState().setActiveFilter(filterId)
}
```

**Justification:**
- Zustand stores are singletons (global)
- No circular dependency risk (unidirectional data flow)
- Simpler than Context + Provider pattern
- Explicit dependencies (visible in code)

### 3.2 Dependency Graph

```
Application Entry
├─ main.tsx (React.StrictMode + HashRouter)
│
├─ App.tsx (Route setup + global effects)
│  ├─ useAppNavigation() [IPC subscription]
│  ├─ useGlobalHotkeys() [keyboard shortcuts]
│  └─ useAppStore.init() [bootstrap data]
│
├─ Sidebar + TopBar (layout)
│  └─ useAppStore (read-only selectors)
│
├─ Routes (colocated with views)
│  ├─ Library.tsx
│  │  └─ useAppStore (photos, selection, remove)
│  │
│  ├─ Editor.tsx
│  │  ├─ useAppStore (current photo, filters)
│  │  ├─ useEditStore (pipeline, history)
│  │  ├─ useWebGLPreview (GPU rendering hook)
│  │  │  ├─ GLContext (WebGL2 state machine)
│  │  │  ├─ Pipeline (GPU step executor)
│  │  │  ├─ ShaderRegistry (GLSL cache)
│  │  │  ├─ useLutTexture (async LUT loader)
│  │  │  └─ usePerfStore (perf metrics)
│  │  │
│  │  └─ AdjustmentsPanel (sliders)
│  │     └─ useEditStore (mutations)
│  │
│  └─ [Other routes: Batch, Filters, etc.]
│
├─ Design System
│  ├─ /design/components (PhotoCard, Histogram, etc.)
│  ├─ /design/tokens (colors, spacing)
│  └─ /styles/global.css (Tailwind)
│
└─ Engine Layer
   └─ /engine/webgl/
      ├─ GLContext (WebGL context management)
      ├─ Pipeline (ordered passes)
      ├─ Pass (single shader invocation)
      ├─ Texture (GPU memory wrapper)
      └─ ShaderRegistry (compile + cache)

```

### 3.3 No Circular Dependencies Found

✅ **Verification:**
- Stores are singletons (created once, imported anywhere)
- IPC is one-way (renderer calls main, main pushes events)
- WebGL layer is independent (no store subscriptions)
- Routes don't depend on each other (all via App routing)

---

## 4. Key Protocols and Their Implementations

### 4.1 Zustand Store Protocol

**Interface:**
```typescript
interface Store {
  // State
  [key: string]: any
  
  // Actions
  [action: string]: (...args: any[]) => void | Promise<void>
}
```

**Three Implementations:**

| Store | Immer | Persistence | Scope |
|-------|-------|-------------|-------|
| `useAppStore` | ✅ | Via IPC (main process) | Global (lifetime) |
| `useEditStore` | ✅ | No (ephemeral) | Local (editor session) |
| `usePerfStore` | ❌ | No (in-memory metrics) | Global (diagnostic only) |

### 4.2 Rendering Pipeline Protocol

**Pipeline Execution Chain:**
```typescript
interface PipelineStep {
  id: string                    // Unique identifier (e.g., 'tone', 'curves')
  frag: string                 // GLSL fragment shader source
  uniforms?: PassConfig['uniforms']  // Shader parameters
  extraInputs?: PassConfig['inputs'] // Additional textures (LUT, etc.)
}

class Pipeline {
  async run(args: PipelineRunArgs): Promise<PipelineStats>
  // Executes steps in order:
  // source → step[0] → ping/pong → step[1] → ... → canvas
}
```

**Step Types (Lightroom-inspired order):**
1. White Balance (temp, tint)
2. Tone (exposure, contrast, highlights, shadows)
3. Curves (RGB per-channel)
4. HSL (hue-saturation-lightness by color)
5. Color Grading (shadows/midtones/highlights)
6. Adjustments (clarity, saturation, vibrance)
7. LUT (3D lookup table – async loaded)
8. Halation (blooming/halation effect)
9. Grain (film grain simulation)
10. Vignette (edge darkening)

### 4.3 IPC Type System

**Shared Schema (both sides):**
```typescript
// shared/types.ts
export interface IpcApi {
  'photo:import': (paths: string[]) => Promise<void>
  'photo:list': () => Promise<Photo[]>
  'filter:list': () => Promise<FilterPreset[]>
  'settings:get': () => Promise<AppSettings>
  'preview:render': (path, filterId, pipeline) => Promise<string>
  'perf:log': (event: PerfEvent) => Promise<void>
  // ... 20+ more channels
}

export type IpcChannel = keyof IpcApi
export type IpcApi[K] = (...args: Parameters) => ReturnType
```

**Type Safety:**
```typescript
// Fully typed invoke
const photos: Photo[] = await ipc('photo:list')
// Type error if channel doesn't exist or args are wrong
const bad = await ipc('photo:unknown')  // ❌ Type error
```

---

## 5. Navigation & Routing

### 5.1 React Router v6 (Client-Side)

**Route Structure:**
```typescript
<Routes>
  <Route path="/" element={<Navigate to="/library" replace />} />
  <Route path="/library" element={<Library />} />
  <Route path="/editor/:photoId?" element={<Editor />} />
  <Route path="/batch" element={<Batch />} />
  <Route path="/filters" element={<Filters />} />
  // ... 7 more routes
</Routes>
```

**Hash-Based Routing:**
- Uses `HashRouter` (not BrowserRouter)
- URLs: `http://localhost/#/editor/photo-123`
- Reason: Electron renderer can't use history API reliably

### 5.2 IPC-Triggered Navigation

**Pattern: Main Process Menu → Renderer Navigation**

```typescript
// Main process (Electron menu)
ipcMain.handle('app:navigate', (event, route) => {
  // User clicked File > Go to Editor
})

// Renderer process (App.tsx)
export function useAppNavigation(): void {
  const navigate = useNavigate()
  useEffect(() => {
    const off = window.grain.on('app:navigate', (target) => {
      if (isRendererNavRoute(target)) {
        navigate(target)  // React Router navigation
      }
    })
    return off
  }, [navigate])
}
```

**Whitelist Pattern (Security):**
```typescript
export const RENDERER_NAV_ROUTES = [
  '/library', '/editor', '/batch', '/filters', '/extract',
  '/taste', '/watermark', '/ai', '/trending', '/settings'
] as const

// Only routes in this list are allowed
export function isRendererNavRoute(v: unknown): v is RendererNavRoute {
  return typeof v === 'string' && RENDERER_NAV_ROUTES.includes(v)
}
```

**Rationale:**
- Prevents arbitrary route injection from malicious IPC messages
- Explicit allowlist > implicit deny

### 5.3 Editor Route with Dynamic Photo Selection

```typescript
// URL: /editor/:photoId?
const { photoId } = useParams()
const photo = useAppStore((s) => 
  s.photos.find((p) => p.id === photoId) ?? s.photos[0]
)
```

**Behavior:**
- `/editor` → edits first photo
- `/editor/photo-123` → edits specific photo
- Switching between photos via UI updates URL + triggers `activeFilter` load

---

## 6. Anti-Patterns & Architectural Concerns

### 6.1 Identified Issues

#### ⚠️ **No Context Providers Used**
**Status**: By Design (intentional)

**Trade-offs:**
- ✅ Simpler: Direct `useAppStore.getState()` calls
- ✅ No Provider Hell: No nested context setup
- ✅ Explicit: Dependencies visible in code
- ❌ Less reusable: Zustand is app-specific
- ❌ Harder to mock: Require store mocking in tests

**Recommendation**: Keep as-is for Electron context (single process)

---

#### ⚠️ **Implicit Subscription Management**
**Location**: `useAppNavigation()`, `ipcOn('photo:repaired')`

```typescript
// Setup listener but might forget cleanup
ipcOn('photo:repaired', () => {
  void get().refreshPhotos()
})
// ⚠️ No explicit cleanup/unsubscribe
```

**Risk**: Memory leaks if IPC listener not cleaned up

**Mitigation Observed**: 
- `useAppNavigation()` returns cleanup function from useEffect
- Main process event listeners should also have cleanup

**Recommendation**: 
- Audit all `ipcOn()` calls for cleanup
- Consider creating a custom hook `useIpcListener()` with built-in cleanup

---

#### ⚠️ **History Stack Implementation Complexity**
**Location**: `useEditStore.ts` (lines 332-402)

**Complexity Points:**
1. Two scenarios in `undo()` (committed vs uncommitted)
2. Deep cloning via JSON.stringify (not structuredClone)
3. Scenario B: "current leads stack top" handling

```typescript
// Scenario B: User makes change, doesn't commit, then undo
// Current state is ahead of history stack top
if (!pipelineEquals(currentPipeline, top.pipeline)) {
  // Push uncommitted state to future (for redo)
  // Revert to stack top
  s.future.push({ pipeline: deepClonePipeline(s.currentPipeline), ... })
  s.currentPipeline = deepClonePipeline(top.pipeline)
}
```

**Risk**: Subtle bugs if undo logic changes

**Mitigation**: 
- Well-documented (comments are good)
- Test coverage likely needed
- Consider extracting to utility functions

---

#### ⚠️ **GPU-Only Strategy (No CPU Fallback)**
**Decision**: M4.2 removed CPU fallback path

```typescript
// useWebGLPreview.ts, line 172-180
const webglFatal = webgl.status === 'error' || webgl.status === 'unsupported'
// → Shows "WebGL unsupported" message, no fallback
```

**Trade-offs:**
- ✅ Simpler code: One rendering path
- ✅ Better debugging: GPU issues surface immediately
- ❌ Worse UX: Users on WebGL 1-only devices see blank editor
- ❌ No graceful degradation

**Recommendation**: 
- Document system requirements prominently
- Consider WebGL feature detection (could use WebGL 1 for basic transforms)

---

#### ⚠️ **Singleton Stores + Global Mutable State**
**Pattern**: `useAppStore` is a global singleton

```typescript
export const useAppStore = create<AppState>()(immer((set, get) => ({ ... })))
// Same instance across entire app lifetime
```

**Risk**: 
- Hard to reason about state mutations across route changes
- Difficult to reset for E2E tests
- No time-travel debugging (Redux DevTools would help)

**Mitigation Observed**:
- `useEditStore.clear()` explicitly called when leaving Editor
- `useAppStore.init()` called once at app start

**Recommendation**: 
- Add test helper to reset stores between tests
- Consider adding Redux DevTools middleware for debugging

---

### 6.2 Avoided Anti-Patterns ✅

**Good Practices Observed:**

1. **No Prop Drilling**
   - ✅ Stores used instead of passing props down 5+ levels
   
2. **Selective Re-renders (Memoization)**
   - ✅ FilterRowMemo prevents Editor re-render when siblings change
   - ✅ GpuBadge, HistogramPanel, DevDiagnosticOverlay use memo
   
3. **Subscription Isolation (perfStore)**
   - ✅ Perf metrics don't trigger Editor re-renders
   - ✅ Only diagnostic UI subscribes
   
4. **Pipeline Abort Support**
   - ✅ User drags slider fast → old pipeline aborted
   - ✅ Prevents stale render results
   
5. **Structural Key Optimization (P0-2)**
   - ✅ Detects when pipeline structure unchanged
   - ✅ Uses `updateUniforms` fast-path instead of `setSteps`
   - ✅ Avoids unnecessary shader recompilation

---

## 7. Separation of Concerns

### 7.1 Layered Architecture

```
┌──────────────────────────────────────────┐
│ Routes Layer (pages)                     │
│ - Library, Editor, Batch, Filters, etc.  │
├──────────────────────────────────────────┤
│ Components Layer (UI building blocks)    │
│ - Sidebar, TopBar, AdjustmentsPanel      │
│ - Design components (PhotoCard, etc.)    │
├──────────────────────────────────────────┤
│ Stores Layer (state management)          │
│ - useAppStore, useEditStore, usePerfStore
├──────────────────────────────────────────┤
│ Hooks Layer (logic extraction)           │
│ - useWebGLPreview, useLutTexture         │
│ - useAppNavigation, useGlobalHotkeys     │
├──────────────────────────────────────────┤
│ Engine Layer (GPU rendering)             │
│ - GLContext, Pipeline, Pass, ShaderRegistry
│ - Texture, renderer-agnostic API         │
├──────────────────────────────────────────┤
│ IPC Layer (Electron bridge)              │
│ - Typed invoke/on wrappers               │
└──────────────────────────────────────────┘
```

### 7.2 Responsibility Assignment

| Layer | Responsibility | Examples |
|-------|-----------------|----------|
| **Routes** | URL-based views | Editor, Library, Batch |
| **Components** | Reusable UI (stateless) | PhotoCard, Histogram, Slider |
| **Stores** | State mutations + async actions | useAppStore.importPhotos() |
| **Hooks** | Complex subscriptions + lifecycle | useWebGLPreview, useLutTexture |
| **Engine** | GPU computation (renderer-agnostic) | Pipeline.run(), Pass.compile() |
| **IPC** | Main ↔ Renderer communication | ipc('photo:list'), ipcOn('photo:repaired') |

### 7.3 Module Imports (Coupling Analysis)

**Good Coupling (Unidirectional):**
```
Routes → Components ✅ (one-way)
Routes → Stores ✅ (one-way)
Hooks → Engine ✅ (one-way)
Engine → Types ✅ (one-way)
IPC → Shared Types ✅ (one-way)
```

**Potential Bidirectional Coupling:**
```
useEditStore ↔ useAppStore (read each other)
// But this is acceptable: both are singleton stores at same level
```

**No Reverse Imports Found:**
- Engine never imports Stores (clean separation)
- Components never import Routes (composable)
- IPC never imports application logic (bridge only)

---

## 8. Performance Optimizations

### 8.1 Major Optimizations (P0-series)

| ID | Issue | Solution | Impact |
|----|-------|----------|--------|
| P0-1 | Perf metrics trigger Editor re-render | Moved writePerf to external store | 2-5ms/frame saved |
| P0-2 | Pipeline structure always rebuilds | Added structural key + updateUniforms fast-path | GPU compile time saved |
| P0-5 | Histogram Uint8Array allocates every frame | Pre-allocate + reuse per max seen size | 6-8MB GC pressure reduced |
| P0-6 | useAppStore selector re-renders all | Use precise selectors (.find instead of whole array) | Cascade re-renders eliminated |

### 8.2 GPU Optimizations

**Ping-Pong Double Buffering:**
```typescript
// Avoid allocating new FBO for each pass
pass[0]: source → ping
pass[1]: pong (input) → ping (output)
pass[2]: ping (input) → pong (output)
// Last pass writes directly to canvas
```

**Abort Controller:**
```typescript
// User drags slider fast
for (let i = 0; i < 3000; i++) {
  pipeline.run({ signal: abortSignal })  // User releases; abort
}
// Prevents rendering stale frames
```

**Shader Caching:**
```typescript
// ShaderRegistry maintains compilation cache
// Reuse program if frag/vert source identical
```

---

## 9. Risk Assessment & Recommendations

### 9.1 High Risk ⚠️

1. **GPU-Only Rendering (No Fallback)**
   - Risk: Users with WebGL 1-only systems blocked
   - Mitigation: Document requirements, add feature detection
   - Priority: Medium (clarify in install instructions)

2. **Singleton Store Mutation**
   - Risk: Hard to test, no time-travel debugging
   - Mitigation: Add Redux DevTools middleware, export reset functions
   - Priority: Medium (for test infrastructure)

### 9.2 Medium Risk ⚠️

3. **Implicit IPC Cleanup**
   - Risk: Potential memory leaks in long-running instances
   - Mitigation: Audit listeners, add cleanup helper
   - Priority: Low (Electron app restarts often)

4. **History Stack Complexity**
   - Risk: Subtle bugs in undo/redo logic
   - Mitigation: Add test cases for Scenario B
   - Priority: Medium (user-facing feature)

5. **LUT Async Loading**
   - Risk: LUT still loading when rendering happens
   - Mitigation: Current code handles gracefully (skips LUT step)
   - Priority: Low (well-handled)

### 9.3 Low Risk ✅

6. **Deep JSON Cloning for History**
   - Risk: Slow for large pipelines (unlikely in practice)
   - Status: Justified (Immer Proxy incompatible with structuredClone)
   - Priority: Low (premature optimization)

7. **No Context Providers**
   - Risk: Less flexible for library reuse
   - Status: Intentional (Electron app doesn't need it)
   - Priority: Low (correct for this context)

---

## 10. Architecture Strengths

### ✅ Well-Designed Patterns

1. **Multi-Store Pattern**
   - Clear separation: Global (app), Session (edit), Diagnostic (perf)
   - Prevents cascading re-renders
   - Easy to reason about each store's lifetime

2. **Pipeline Architecture**
   - Composable steps (shader source + uniforms + inputs)
   - Order defined by domain (Lightroom convention)
   - Supports dynamic on/off toggling

3. **IPC Type Safety**
   - Compile-time verification of channel names
   - Parameter checking via TypeScript
   - Prevents runtime errors from typos

4. **Performance-Conscious Design**
   - Eager optimization (P0 series) not premature
   - Memoization at component level
   - GPU resource pooling (ping-pong textures)

5. **Electron-Native Integration**
   - Custom IPC wrapper (typed)
   - Platform detection (macOS vs Windows)
   - Menu/keyboard integration via IPC

---

## 11. Recommendations for Enhancement

### Phase 1: Stability (High Priority)

```typescript
// 1. Add Redux DevTools middleware to all stores
import { devtools } from 'zustand/middleware'

export const useAppStore = create<AppState>()(
  devtools(
    immer((set, get) => ({ ... })),
    { name: 'appStore' }
  )
)

// 2. Create test helper
export function resetStoresForTest() {
  useAppStore.setState(initialState)
  useEditStore.setState(initialState)
  usePerfStore.setState(initialState)
}

// 3. Audit IPC listeners for cleanup
function useIpcListener<T>(
  channel: string,
  handler: (payload: T) => void
): void {
  useEffect(() => {
    const off = ipcOn<T>(channel, handler)
    return off  // Auto cleanup
  }, [channel, handler])
}
```

### Phase 2: Observability (Medium Priority)

```typescript
// Add performance monitoring
export interface PerfMetric {
  component: string
  renderTimeMs: number
  timestamp: number
}

// Log key interactions
reportPerfEvent({
  kind: 'user',
  name: 'filter:change',
  data: { filterId: activeFilterId }
})
```

### Phase 3: Testing (Medium Priority)

```typescript
// Test store subscription patterns
describe('useEditStore history', () => {
  it('handles scenario B: current leads stack top', () => {
    // User setTone (doesn't commit) then undo
    store.setTone({ exposure: 1 })  // Not committed
    store.undo()  // Should put uncommitted in future
    store.redo()  // Should restore
  })
})
```

### Phase 4: Refactoring (Low Priority)

```typescript
// Consider extracting WebGL into separate package
// @grainmark/webgl-engine:
export { GLContext, Pipeline, ShaderRegistry }

// Then useWebGLPreview can be tested independently
```

---

## Conclusion

GrainMark uses a **sophisticated, performance-optimized architecture** specifically tailored for:
- **Real-time GPU rendering** (Pipeline pattern)
- **Complex undo/redo** (history stack in editStore)
- **Responsive UI** (selective subscriptions, memo components)
- **Electron desktop app** (IPC integration, platform detection)

**Architecture Style**: **Zustand-based MVU** (Model-View-Update) with **Layered Separation**

**Key Insight**: The codebase prioritizes **pragmatism over architectural purity**, using direct store access instead of Context/DI, which is appropriate for a single-process Electron app.

**Maturity Assessment**: **Production-ready** with minor gaps in:
- Test infrastructure setup (no Redux DevTools yet)
- Performance monitoring (basic IPC logging in place)
- Error boundary handling (consider implementing React Error Boundaries)

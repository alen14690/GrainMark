# GrainMark Architecture - Visual Diagrams

## 1. Overall Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Main Process                       │
│  - File system I/O                                               │
│  - IPC handlers (photo:*, filter:*, settings:*)                  │
│  - System integration (menu, shortcuts)                          │
│  - Database persistence (photos.json, filters.json)              │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ IPC (typed)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    React Renderer Process                         │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ App.tsx                                                   │  │
│  │ ├─ HashRouter (client-side routing)                      │  │
│  │ ├─ useAppNavigation() [IPC listener]                     │  │
│  │ ├─ useGlobalHotkeys() [keyboard]                         │  │
│  │ └─ useAppStore.init() [bootstrap]                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                    │
│  ┌───────────────────────────┼───────────────────────────────┐  │
│  │                           ▼                               │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │ Sidebar + TopBar (Global Layout)                 │    │  │
│  │  │ ├─ Navigation links                              │    │  │
│  │  │ ├─ Photo count badge                             │    │  │
│  │  │ └─ useAppStore (read-only)                       │    │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  │                           │                               │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │ Routes <Routes>                                  │    │  │
│  │  ├─ <Route path="/library" element={<Library />} /> │    │  │
│  │  ├─ <Route path="/editor/:photoId?" element={...} />    │  │
│  │  ├─ <Route path="/batch" element={...} />               │  │
│  │  ├─ <Route path="/filters" element={...} />             │  │
│  │  └─ ... (10 total routes)                                │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  │                                                           │  │
│  │  Per-route State Management & Hooks:                     │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────┐     │  │
│  │  │ Library Route                                  │     │  │
│  │  ├─ useAppStore (photos, selection)              │     │  │
│  │  ├─ Display: PhotoCard grid                      │     │  │
│  │  └─ Actions: select, remove, navigate to editor  │     │  │
│  │  └────────────────────────────────────────────────┘     │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────┐     │  │
│  │  │ Editor Route (Complex)                         │     │  │
│  │  ├─ useAppStore (current photo, filters)         │     │  │
│  │  ├─ useEditStore (pipeline, history)             │     │  │
│  │  │  ├─ currentPipeline (user edits)              │     │  │
│  │  │  ├─ baselinePipeline (filter preset)          │     │  │
│  │  │  ├─ history: HistoryEntry[] (undo stack)      │     │  │
│  │  │  └─ future: HistoryEntry[] (redo stack)       │     │  │
│  │  ├─ useWebGLPreview (GPU rendering)              │     │  │
│  │  │  ├─ GLContext                                  │     │  │
│  │  │  ├─ Pipeline                                   │     │  │
│  │  │  ├─ ShaderRegistry                             │     │  │
│  │  │  ├─ useLutTexture (async LUT loading)         │     │  │
│  │  │  └─ usePerfStore (perf metrics)               │     │  │
│  │  ├─ AdjustmentsPanel (sliders)                   │     │  │
│  │  │  └─ useEditStore (mutations: setTone, etc.)   │     │  │
│  │  └─ Display: Canvas + controls + filters panel   │     │  │
│  │  └────────────────────────────────────────────────┘     │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────┐     │  │
│  │  │ Batch, Filters, AI Studio, etc. (Other Routes) │     │  │
│  │  └────────────────────────────────────────────────┘     │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. State Management Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    Three Zustand Stores                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ useAppStore (Global Application State)                  │   │
│  │ Middleware: Immer (immutable updates)                   │   │
│  │ Scope: Lifetime of app                                  │   │
│  │ Persistence: Via IPC (main process saves to disk)      │   │
│  │                                                         │   │
│  │ State:                                                  │   │
│  │  ├─ settings: AppSettings | null                       │   │
│  │  ├─ filters: FilterPreset[]                            │   │
│  │  ├─ photos: Photo[]                                    │   │
│  │  ├─ selectedPhotoIds: string[]                         │   │
│  │  ├─ activeFilterId: string | null                      │   │
│  │  ├─ loading: boolean                                   │   │
│  │  └─ error: string | null                               │   │
│  │                                                         │   │
│  │ Actions (Async):                                        │   │
│  │  ├─ init() — bootstrap from IPC                        │   │
│  │  ├─ refreshPhotos() — sync with main process           │   │
│  │  ├─ refreshFilters() — fetch latest                    │   │
│  │  ├─ importPhotos(paths) — add to library               │   │
│  │  ├─ removePhotos(ids) — delete import record           │   │
│  │  ├─ selectPhotos(ids) — batch selection                │   │
│  │  ├─ toggleSelectPhoto(id) — toggle one                 │   │
│  │  ├─ setActiveFilter(id) — choose filter                │   │
│  │  └─ updateSettings(patch) — persist settings           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ useEditStore (Editor Session State)                     │   │
│  │ Middleware: Immer                                       │   │
│  │ Scope: Only active in Editor route (cleared on exit)   │   │
│  │ Persistence: None (ephemeral)                           │   │
│  │                                                         │   │
│  │ State:                                                  │   │
│  │  ├─ currentPipeline: FilterPipeline | null             │   │
│  │  ├─ baselinePipeline: FilterPipeline | null            │   │
│  │  │   (baseline = starting point for dirty detection)   │   │
│  │  ├─ baselineFilterId: string | null                    │   │
│  │  ├─ history: HistoryEntry[] (max 50)                   │   │
│  │  └─ future: HistoryEntry[] (for redo)                  │   │
│  │                                                         │   │
│  │ Actions (Pipeline Mutations):                           │   │
│  │  ├─ loadFromPreset(preset) — load filter               │   │
│  │  ├─ resetToBaseline() — ↲ to start                     │   │
│  │  ├─ clear() — cleanup on route exit                    │   │
│  │  ├─ setTone(patch)                                      │   │
│  │  ├─ setWhiteBalance(patch)                              │   │
│  │  ├─ setVignette(patch)                                  │   │
│  │  ├─ setHsl(patch)                                       │   │
│  │  ├─ setColorGrading(patch)                              │   │
│  │  ├─ setCurves(patch)                                    │   │
│  │  ├─ setGrain(patch)                                     │   │
│  │  ├─ setHalation(patch)                                  │   │
│  │  ├─ setClarity(v)                                       │   │
│  │  ├─ setSaturation(v)                                    │   │
│  │  ├─ setVibrance(v)                                      │   │
│  │  └─ setLut(lut, intensity)                              │   │
│  │                                                         │   │
│  │ History Stack Actions:                                  │   │
│  │  ├─ commitHistory(label) — push to history             │   │
│  │  │   (idempotent: skips duplicates)                    │   │
│  │  ├─ undo() — pop history, push current to future      │   │
│  │  │   (handles 2 scenarios: committed vs uncommitted)   │   │
│  │  └─ redo() — pop future, push to history              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ usePerfStore (Performance Metrics)                      │   │
│  │ Middleware: None                                        │   │
│  │ Scope: Diagnostic only (reads GPU metrics)             │   │
│  │ Design: "Subscribe-only" — writes don't trigger        │   │
│  │         main Editor re-render                           │   │
│  │                                                         │   │
│  │ State:                                                  │   │
│  │  ├─ perf: FramePerf | null                             │   │
│  │  │   ├─ setStepsMs                                      │   │
│  │  │   ├─ pipelineRunMs                                   │   │
│  │  │   ├─ readPixelsMs                                    │   │
│  │  │   ├─ histogramMs                                     │   │
│  │  │   └─ totalMs                                         │   │
│  │  └─ histogram: HistogramBins | null                    │   │
│  │                                                         │   │
│  │ Only subscribed by:                                     │   │
│  │  ├─ GpuBadge (memo component)                          │   │
│  │  ├─ HistogramPanel (memo component)                    │   │
│  │  └─ DevDiagnosticOverlay (memo component)              │   │
│  │                                                         │   │
│  │ Note: Solves P0-1 regression (perf metrics were        │   │
│  │       causing main Editor to re-render on every frame!)│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Editor's Data Flow

```
User Interaction
    ↓
    ├─ Drag Slider
    │   ↓
    │   AdjustmentsPanel.onSlider
    │   ↓
    │   useEditStore.setTone({ exposure: 2.5 }) [NOT auto-commit]
    │   ↓
    │   currentPipeline mutated (via Immer proxy)
    │   ↓
    │   Component re-render
    │   ↓
    │   useWebGLPreview detects pipeline change
    │   ↓
    │   renderNow() triggered (via requestAnimationFrame)
    │   ├─ setSteps(pipelineToSteps(...))
    │   ├─ pipeline.run() [GPU execution]
    │   ├─ readPixels() → histogram
    │   └─ writePerf() → usePerfStore (only diagnostic UI re-renders!)
    │
    ├─ Release Slider (onChangeEnd)
    │   ↓
    │   useEditStore.commitHistory() [commit to history stack]
    │   ↓
    │   history now has new entry; future cleared
    │
    ├─ Press ⌘Z (keyboard)
    │   ↓
    │   useEditStore.undo()
    │   ├─ Pop history → current
    │   ├─ Push old current → future
    │   └─ Pipeline re-renders
    │
    └─ Switch Filter
        ↓
        useAppStore.setActiveFilter(newId)
        ↓
        Editor component sees activeFilter changed
        ↓
        useEditStore.loadFromPreset(newFilter)
        ├─ Copy preset pipeline → currentPipeline
        ├─ Copy preset pipeline → baselinePipeline
        ├─ Clear history & future
        └─ Trigger renderNow()
```

---

## 4. GPU Rendering Pipeline

```
useWebGLPreview Hook
    ↓
    ├─ Mount
    │   ├─ new GLContext(canvas)
    │   ├─ new ShaderRegistry(gl)
    │   ├─ new Pipeline(gl, registry, vert)
    │   └─ Subscribe to context lost/restored events
    │
    ├─ Load Image (sourceUrl changes)
    │   ├─ fetch(sourceUrl)
    │   ├─ createImageBitmap(blob)
    │   ├─ textureFromBitmap(gl, bitmap) → GPU upload
    │   └─ Call renderNow()
    │
    └─ Render (pipeline changes)
        ↓
        renderNow()
        ├─ pipelineToSteps(latestPipeline, { resolution, lut, lutSize })
        │   └─ Returns array of PipelineStep[] (only "active" channels)
        │       ├─ White Balance (if temp≠0 or tint≠0)
        │       ├─ Tone (if any tone param set)
        │       ├─ Curves (if not identity)
        │       ├─ HSL (if not identity)
        │       ├─ ColorGrading (if not identity)
        │       ├─ Adjustments (if clarity/sat/vib not zero)
        │       ├─ LUT (only if loaded ✓ and ready ✓)
        │       ├─ Halation (if not identity)
        │       ├─ Grain (if not identity)
        │       └─ Vignette (if set)
        │
        ├─ pipeline.setSteps(steps)
        │   (or: updateUniforms() fast-path if structure unchanged)
        │
        ├─ await pipeline.run({ source, signal })
        │   ├─ For each step[i]:
        │   │   ├─ Determine output texture:
        │   │   │   ├─ Last step → null (draw to canvas)
        │   │   │   ├─ i even → ping
        │   │   │   └─ i odd → pong
        │   │   ├─ runPass(gl, registry, {
        │   │   │   vert: DEFAULT_VERT
        │   │   │   frag: step.frag
        │   │   │   inputs: [{ name: 'u_image', texture: input }]
        │   │   │   uniforms: step.uniforms
        │   │   │   output: outputTex
        │   │   │ })
        │   │   │   ├─ Compile/cache fragment shader
        │   │   │   ├─ Bind VAO, FBO, textures
        │   │   │   ├─ Set uniforms
        │   │   │   ├─ drawArrays(TRIANGLE_STRIP, 0, 4)
        │   │   │   └─ Unbind
        │   │   └─ input ← output
        │   └─ Return stats { stepCount, durationMs, aborted }
        │
        ├─ readPixels(gl, canvas) → Uint8Array[w*h*4]
        │   ├─ Skip if sampling frame (every 3rd frame)
        │   └─ computeHistogramFromRgba(pixels, stride)
        │
        └─ writePerf() → usePerfStore (only diagnostic UI re-renders)
```

---

## 5. History Stack (Undo/Redo) State Machine

```
┌─────────────────────────────────────┐
│         History Stack States        │
├─────────────────────────────────────┤
│                                     │
│   history: [step1, step2]           │
│   future: []                        │
│                                     │
│     ↓ User drag slider              │
│     setTone({ exposure: 1 })        │
│     (current pipeline changes)      │
│                                     │
│   history: [step1, step2] (same)    │
│   future: [] (same)                 │
│   currentPipeline: MODIFIED         │
│                                     │
│     ↓ User release slider           │
│     commitHistory()                 │
│                                     │
│   history: [step1, step2, step3]    │
│   future: []                        │
│   currentPipeline: IN SYNC          │
│                                     │
│     ↓ User press ⌘Z (undo)          │
│                                     │
│   Scenario A: current ≡ history top │
│   ├─ Pop history → step2            │
│   ├─ Push step3 → future            │
│   history: [step1, step2]           │
│   future: [step3]                   │
│   currentPipeline: SET TO step2     │
│                                     │
│   Scenario B: current ≠ history top │
│   ├─ (user setTone again, not      │
│   │  committed yet)                │
│   ├─ Push current → future         │
│   ├─ Set current ← step3            │
│   history: [step1, step2, step3]    │
│   future: [step4_uncommitted]       │
│   currentPipeline: SET TO step3     │
│                                     │
│     ↓ User press ⌘⇧Z (redo)        │
│                                     │
│   ├─ Pop future → step3             │
│   ├─ Push step3 → history (again!)  │
│   history: [step1, step2, step3]    │
│   future: []                        │
│   currentPipeline: SET TO step3     │
│                                     │
└─────────────────────────────────────┘

Key Properties:
├─ HISTORY_LIMIT = 50 (max undo depth)
├─ Commit idempotent: skip if ≡ top
├─ Commit clears future (new edits)
├─ Handles uncommitted + undo gracefully
└─ All values deep-cloned (JSON round-trip)
```

---

## 6. IPC Communication Channels

```
┌─────────────────────────────────────────────────────────────┐
│           Main Process ↔ Renderer Process IPC               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  REQUEST-RESPONSE (ipc.invoke)                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ photo:list → [Photo[]]                               │  │
│  │ photo:import → (paths) → void                         │  │
│  │ photo:remove → (ids) → { removed, orphanedThumbs }   │  │
│  │                                                       │  │
│  │ filter:list → [FilterPreset[]]                       │  │
│  │ filter:save → (preset) → void                         │  │
│  │                                                       │  │
│  │ settings:get → AppSettings                           │  │
│  │ settings:update → (patch) → AppSettings              │  │
│  │                                                       │  │
│  │ preview:render → (path, filterId, pipeline)          │  │
│  │                 → string (data: URL)                  │  │
│  │                                                       │  │
│  │ dialog:selectFiles → { multi: bool } → string[]     │  │
│  │ dialog:selectDir → void → string | null              │  │
│  │                                                       │  │
│  │ perf:log → (event: PerfEvent) → void                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  EVENT SUBSCRIPTION (ipcOn)                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ photo:repaired → (photoId) [push from main]          │  │
│  │   → Auto-trigger refreshPhotos() in useAppStore      │  │
│  │                                                       │  │
│  │ app:navigate → (route) [menu/keyboard]               │  │
│  │   → useAppNavigation() routes to React Router        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Component Memoization Pattern (P0-6)

```
┌─────────────────────────────────────────────────────────────┐
│ Editor Component (subscribes to useEditStore)               │
│                                                              │
│ Problem: Every setTone causes Editor re-render             │
│   → All 100 filter list items re-render                    │
│   → ALL subscribed components re-render                    │
│                                                              │
│ Solution: Memoize filter list items                        │
│                                                              │
│ const FilterRowMemo = memo(({ name, filterId, active }) => │
│   <button onClick={() =>                                    │
│     useAppStore.getState().setActiveFilter(filterId)       │
│   }>                                                        │
│     {name}                                                  │
│   </button>                                                 │
│ })                                                          │
│                                                              │
│ Key: Props are stable values (string, bool) not refs       │
│ → Shallow compare succeeds                                 │
│ → Component NOT re-rendered                                │
│ → Only filterId is wrapped in closure, not entire store    │
│                                                              │
│ Applied To:                                                 │
│ ├─ FilterRowMemo (filter list items)                       │
│ ├─ GpuBadge (GPU time display)                             │
│ ├─ HistogramPanel (histogram chart)                        │
│ └─ DevDiagnosticOverlay (dev diagnostics)                  │
│                                                              │
│ Verification:                                               │
│   Drag slider 100ms                                         │
│   ├─ Editor re-renders (currentPipeline changed)           │
│   ├─ BUT FilterRowMemo items NOT re-rendered               │
│   ├─ AND GpuBadge independently re-renders (perf changed)  │
│   └─ Result: Responsive UI, no cascade re-renders          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. WebGL Context Lost/Restored Recovery

```
┌──────────────────────────────────────────────────────┐
│ Normal Operation                                     │
├──────────────────────────────────────────────────────┤
│ GLContext.ok = true                                  │
│ Rendering: OK                                        │
└──────────────────────────────────────────────────────┘
           │
           │ (GPU hibernates / context lost)
           ▼
┌──────────────────────────────────────────────────────┐
│ Context Lost                                         │
├──────────────────────────────────────────────────────┤
│ webglcontextlost event                               │
│ ├─ _lost = true                                      │
│ ├─ _onLost() callbacks → setStatus('lost')          │
│ ├─ sourceTexRef = null (texture refs invalid)       │
│ ├─ pipeline.dispose() (ping-pong invalid)           │
│ └─ All GPU resources reclaimed by browser           │
└──────────────────────────────────────────────────────┘
           │
           │ (User moves mouse / animation continues)
           ▼
┌──────────────────────────────────────────────────────┐
│ Context Restored                                     │
├──────────────────────────────────────────────────────┤
│ webglcontextrestored event                           │
│ ├─ _lost = false                                     │
│ ├─ _createQuad() (rebuild VAO)                       │
│ ├─ _onRestored() callbacks →                         │
│ │   ├─ registry.dispose() (invalidate shader cache)  │
│ │   ├─ setStatus('loading')                          │
│ │   └─ setRestoreVersion(v+1) [trigger effect]       │
│ └─ New sourceUrl useEffect runs                      │
│    ├─ Re-fetch image                                 │
│    ├─ Re-upload to GPU                               │
│    ├─ Resize ping-pong textures                      │
│    └─ renderNow() [GPU pipeline rebuilt]             │
│                                                       │
│ Result: UI recovers transparently                   │
└──────────────────────────────────────────────────────┘
```

---

## 9. Selector Optimization (P0-6)

```
Problem Scenario (CASCADE RE-RENDERS):
┌─────────────────────────────────────────────────────────┐
│ useAppStore: photos = [photo1, photo2, photo3, ...]   │
│                                                         │
│ ❌ WRONG Selector:                                      │
│ const photos = useAppStore((s) => s.photos)            │
│                                                         │
│ Actions:                                                │
│ ├─ User imports photo4 at Library                      │
│ │  └─ photos array changes                             │
│ │     └─ ALL subscribers re-render (cascade!)          │
│ │        ├─ Library (OK, needs update)                 │
│ │        ├─ Editor (PROBLEM! photo1 unchanged!)       │
│ │        ├─ Batch (PROBLEM! nothing changed!)          │
│ │        └─ TopBar badge (OK, count changed)           │
│ │                                                      │
│ │  Result: Unnecessary re-renders in unrelated routes │
│ │          Stutter while editing!                      │
│                                                         │
└─────────────────────────────────────────────────────────┘

Solution (PRECISE SELECTOR):
┌─────────────────────────────────────────────────────────┐
│ ✅ CORRECT Selector (Editor):                            │
│ const photo = useAppStore((s) =>                         │
│   s.photos.find((p) => p.id === photoId) ?? s.photos[0] │
│ )                                                        │
│                                                         │
│ Action: Import photo4                                   │
│ ├─ Full photos array changes                            │
│ ├─ Editor selector extracts: photo1 (unchanged!)       │
│ │  └─ Shallow compare: same object reference           │
│ │     └─ NO re-render                                   │
│ └─ Result: Editor continues smoothly!                   │
│                                                         │
│ ✅ CORRECT Selector (TopBar):                            │
│ const photoCount = useAppStore((s) => s.photos.length)  │
│                                                         │
│ Action: Import photo4                                   │
│ ├─ photos array changes                                 │
│ ├─ TopBar selector extracts: 4 (changed!)              │
│ │  └─ Value compare: 3 !== 4                            │
│ │     └─ Re-render                                      │
│ └─ Result: Badge updates!                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Performance Optimization Timeline

```
Timeline of P0 Optimizations (2026 Q1-Q2):

P0-1: FramePerf Regression
  Issue: perf metrics updated every frame → Editor re-render
  Fix: Moved writePerf() to external usePerfStore
  Impact: +2-5ms/frame
  Verification: Drag slider → Editor.render count stable

P0-2: Pipeline Recompilation
  Issue: Every uniform change triggered shader recompile
  Fix: Added structural key + updateUniforms() fast-path
  Impact: GPU compile time eliminated for 99% of dragging
  When triggered: Only on channel on/off or LUT change

P0-5: Histogram Memory Pressure
  Issue: Uint8Array allocated every frame (6-8MB GC)
  Fix: Pre-allocate + reuse per max seen size
  Impact: Memory allocations reduced 99%
  Applied: HistogramPanel only samples every 3 frames

P0-6: Cascade Re-renders
  Issue: useAppStore selector used full photos array
  Fix: Changed to precise .find() selector
  Impact: Editor isolation from Library changes
  Applied: All route selectors reviewed

Result: 60fps locked during active editing
        Smooth response on latest hardware
```

---

## Conclusion

GrainMark's architecture is layered, store-based, and heavily optimized for:
1. **Real-time GPU rendering** (Pipeline pattern with abort support)
2. **Complex undo/redo** (History stack with two scenarios)
3. **Responsive UI** (Selective subscriptions + memo components)
4. **Electron integration** (Typed IPC + platform detection)

The design prioritizes **pragmatism** (direct store access over DI) and **performance** (eager P0 optimizations) over architectural purity.

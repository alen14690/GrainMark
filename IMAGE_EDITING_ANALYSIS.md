# GrainMark Codebase: Complete Image Editing & Photo Management Code Analysis

## Executive Summary

This is a **GPU-first photo editing application** built with Electron (Node.js/TypeScript backend) and React (WebGL frontend). The codebase contains sophisticated image processing, RAW support, EXIF handling, and filter/preset management. All image transformations use a unified **10-channel filter pipeline** with support for multiple rendering paths (GPU/CPU).

---

## 1. CORE IMAGE EDITING ARCHITECTURE

### 1.1 Filter Pipeline Definition
**File:** `shared/types.ts` (lines 1-100+)

```typescript
export interface FilterPipeline {
  whiteBalance?: WhiteBalanceParams       // Color temperature & tint
  tone?: ToneParams                       // Exposure, contrast, highlights/shadows
  curves?: CurvesParams                   // Tone curves (RGBA channels)
  hsl?: HSLParams                         // Hue/Saturation/Lightness by color
  colorGrading?: ColorGradingParams       // 3-way color wheels (shadows/mid/high)
  grain?: GrainParams                     // Film grain simulation
  halation?: HalationParams               // Light bloom/flare effect
  vignette?: VignetteParams               // Edge darkening/brightening
  clarity?: number                        // Micro-contrast (unsharp mask)
  saturation?: number                     // Global saturation
  vibrance?: number                       // Smart saturation
  lut?: string | null                     // 3D LUT file (.cube)
  lutIntensity?: number                   // LUT blend strength
}
```

### 1.2 Edit State Management (Zustand Store)
**File:** `src/stores/editStore.ts` (412 lines)

**Key Classes & Functions:**
- `useEditStore()` - Main Zustand store with immer middleware
- `HistoryEntry` - History stack entry with deep pipeline clone + timestamp
- `HISTORY_LIMIT = 50` - Max undo/redo depth (Lightroom-style)
- `hasDirtyEdits(current, baseline)` - Detects unsaved changes
- `canUndo(history)` / `canRedo(future)` - State query functions
- `deepClonePipeline(p)` - JSON deep clone using JSON.parse/stringify

**Store Actions:**
```typescript
loadFromPreset(preset)          // Load baseline from preset, clear history
resetToBaseline()               // Revert to baseline (manual reset)
clear()                         // Wipe all state (on unmount)
setTone/setWhiteBalance/...()   // Per-channel patch actions
commitHistory(label?)           // Snapshot current pipeline to history
undo() / redo()                 // Navigate undo/redo stacks
```

**Design Note:** Commit is deferred until interaction ends (slider release, keyboard, double-click). Supports both committed and uncommitted changes during redo.

---

## 2. IMAGE PREVIEW & RENDERING

### 2.1 WebGL GPU Preview (Main Editor Path)
**File:** `src/lib/useWebGLPreview.ts` (100+ lines)
**File:** `src/engine/webgl/Pipeline.ts` (200+ lines)

**Architecture:**
- Runs full 10-channel pipeline on GPU via WebGL 2.0
- Supports abort/cancellation during drag (fast slider interaction)
- Ping-pong texture double-buffering (no FBO reallocation per pass)
- Real-time histogram reading via `readPixels` to pre-allocated Uint8Array
- LUT texture management via `useLutTexture` hook
- Falls back to `status='unsupported'` if WebGL unavailable (GPU-only, no CPU fallback)

**Key Functions:**
- `Pipeline.setSteps(steps)` - Set ordered rendering passes
- `Pipeline.updateUniforms(nextUniforms)` - Fast path for uniform-only changes
- `Pipeline.getStructuralKey()` - Signature for fast-path validation
- `Pipeline.run(args)` - Execute all passes, abort-aware
- `pipelineToSteps()` - Convert FilterPipeline → GPU steps

**Shader Modules:**
```
src/engine/webgl/shaders/
  ├── adjustments.ts       (saturation/vibrance/clarity)
  ├── colorGrading.ts      (3-way color wheels)
  ├── curves.ts            (tone curve lookup)
  ├── grain.ts             (noise simulation)
  ├── halation.ts          (bloom/light wrap)
  ├── hsl.ts               (color-selective hue/sat/light)
  ├── lut3d.ts             (3D LUT trilinear sampling)
  ├── tone.ts              (exposure/contrast/highlights/shadows)
  ├── vignette.ts          (edge darkening)
  └── whiteBalance.ts      (color temperature)
```

### 2.2 Preview Buffer Rendering (IPC)
**File:** `electron/ipc/preview.ts` (18 lines)

```typescript
registerIpc('preview:render', async (photoPath, filterId, pipelineOverride) =>
  renderPreview(photoPath, filterId, pipelineOverride)
)
```

**File:** `electron/services/filter-engine/preview.ts` (76 lines)

**Key Function:**
```typescript
export async function renderPreview(
  photoPath: string,
  filterId?: string | null,
  pipelineOverride?: FilterPipeline
): Promise<string>  // Returns data: or grain:// URL
```

**Process:**
1. Read known orientation from photo DB (cached EXIF)
2. Call `resolvePreviewBuffer()` (handles RAW transparently)
3. Use `sharp(buffer).rotate()` to autoOrient based on embedded EXIF
4. Resize to 1600px max dimension (PREVIEW_MAX_DIM)
5. Encode to JPEG quality 85
6. Cache to disk or return data: URL

**Critical Note:** Uses `sharp.rotate()` (autoOrient) **not** explicit angle rotation. This avoids Sony ARW double-flip bug where RAW file header orientation ≠ embedded JPEG orientation.

### 2.3 Thumbnail Generation
**File:** `electron/services/filter-engine/thumbnail.ts` (104 lines)

**Key Function:**
```typescript
export async function makeThumbnail(
  filePath: string,
  size: number,
  knownOrientation?: number
): Promise<string>  // Local absolute path to thumb
```

**Cache Key:** `md5(filePath : size : v3 : mtime : filesize)`
- `v3` = algorithm version (bumped when orientation logic changes)
- Ensures old thumbs invalidate after algo updates

**Orientation Handling:**
- Unified `sharp.rotate()` for all formats (RAW/JPEG/HEIC)
- `detectDisplayDimensions()` returns rotated dimensions
- Fixes aspect ratio issues from EXIF orientation

---

## 3. RAW FILE SUPPORT & ORIENTATION

### 3.1 RAW Format Detection & Decoding
**File:** `electron/services/raw/rawDecoder.ts` (160+ lines)

**Supported Formats:**
```typescript
const RAW_EXTENSIONS = new Set([
  'raw', 'nef', 'nrw',  // Nikon
  'cr2', 'cr3', 'crw',  // Canon
  'arw', 'srf', 'sr2',  // Sony
  'dng',                 // Adobe/phones
  'raf',                 // Fuji
  'orf',                 // Olympus
  'rw2', 'rwl',          // Panasonic/Leica
  'pef', 'srw', '3fr',   // Pentax/Samsung/Hasselblad
  'erf', 'kdc', 'mrw', 'x3f'  // Epson/Kodak/Minolta/Sigma
])
```

**Key Functions:**
```typescript
export function isRawFormat(filePathOrExt: string): boolean

export async function extractEmbeddedJpeg(
  filePath: string,
  options?: { exiftool?: ExiftoolLike }
): Promise<ExtractResult>  // { buffer, tag, sourceOrientation }

export class UnsupportedRawError extends Error {
  reason: 'no-embedded-jpeg' | 'exiftool-failed' | 'empty-buffer' | 'timeout'
}
```

**Extraction Priority:**
1. JpgFromRaw (full resolution)
2. PreviewImage (medium resolution)
3. ThumbnailImage (small resolution)
4. Throw UnsupportedRawError

**Implementation:** Uses `exiftool-vendored` to extract binary tags (8s timeout per file).

### 3.2 Preview Buffer Resolution (Unified Entry Point)
**File:** `electron/services/raw/index.ts` (121 lines)

**Key Function:**
```typescript
export async function resolvePreviewBuffer(
  filePath: string,
  knownOrientation?: number
): Promise<ResolvedPreview>

export interface ResolvedPreview {
  buffer: Buffer
  source: 'passthrough' | 'raw-cache-hit' | 'raw-extracted' | 'raw-failed'
  rawTag?: 'JpgFromRaw' | 'PreviewImage' | 'ThumbnailImage'
  sourceOrientation?: number  // 1..8 from EXIF Orientation tag
}

export function orientationToRotationDegrees(orientation?: number): number
  // 1 → 0°, 3 → 180°, 6 → 90° CW, 8 → 270° CW
```

**RAW Cache:** Key = `md5(path : mtime : size)` — survives file moves, invalidates on modification.

**P0 Optimization:** `knownOrientation` parameter avoids re-reading EXIF (already cached at import time).

---

## 4. EXIF READING & METADATA

### 4.1 EXIF Reader
**File:** `electron/services/exif/reader.ts` (91 lines)

**Key Function:**
```typescript
export async function readExif(filePath: string): Promise<PhotoExif>

export interface PhotoExif {
  make?: string                  // Camera brand
  model?: string                 // Camera model
  lensModel?: string
  fNumber?: number               // Aperture
  exposureTime?: string          // Shutter speed (formatted "1/250")
  iso?: number
  focalLength?: number
  dateTimeOriginal?: string
  gpsLatitude?: number
  gpsLongitude?: number
  artist?: string
  copyright?: string
  width?: number
  height?: number
  orientation?: number           // 1..8 EXIF orientation tag
}
```

**Safety Features:**
- String fields clamped to 1KB
- 5s timeout per file
- Returns {} on error (graceful degradation)

---

## 5. FILTER PIPELINE IMPLEMENTATION (10 Channels)

### 5.1 GPU Pipeline (Fragment Shaders)
**Files:** `src/engine/webgl/shaders/*.ts`

**Channel Order (Lightroom Convention):**
1. **White Balance** → Color temperature/tint adjustments
2. **Tone** → Exposure, contrast, highlights/shadows, whites/blacks
3. **Curves** → RGBA tone curves (Hermite interpolation, 256-point LUT)
4. **HSL** → Per-color selective hue/sat/lightness (8 color bands)
5. **Color Grading** → 3-way color wheels (shadows/midtones/highlights)
6. **Adjustments** → Saturation, vibrance, clarity (via unsharp mask)
7. **LUT** → 3D color lookup table (trilinear sampling)
8. **Halation** → Light bloom/flare on highlights
9. **Grain** → Film grain noise with midtone weighting
10. **Vignette** → Edge darkening/brightening

### 5.2 CPU Pipeline (Pixel-by-Pixel)
**File:** `electron/services/filter-engine/cpuPipeline.ts` (671 lines)

**Key Functions:**
```typescript
export function applyPipelineToRGBA(
  input: Uint8Array,
  width: number,
  height: number,
  pipeline: FilterPipeline
): Uint8Array  // May return new buffer for clarity/halation

export function detectCpuOnlyLimitations(pipeline): string[]
  // Currently: ['lut'] — LUT trilinear too expensive in JS
```

**Per-Channel Functions:**
- `applyWhiteBalance(pixels, params)` - Multiplicative RGB adjustment
- `applyTone(pixels, params)` - Exposure (EV), contrast, highlight/shadow/white/black zones
- `applyCurves(pixels, params)` - Hermite interpolation → 256-point LUT
- `applyHsl(pixels, params)` - 8-channel Gaussian weighted blend
- `applyColorGrading(pixels, params)` - Luma-weighted shadow/mid/highlight mixing
- `applySaturationVibrance(pixels, sat, vib)` - Global + saturation-gated vibrance
- `applyClarity(src, w, h, clarity)` - 3×3 unsharp mask (allocates new buffer)
- `applyHalation(src, w, h, params)` - 9-tap bloom (allocates new buffer)
- `applyGrain(pixels, w, h, params)` - Hash-based noise with midtone masking
- `applyVignette(pixels, w, h, params)` - Radial/elliptical darkening

**Design Philosophy:**
- GPU preferred path for performance
- CPU mirrors GPU math exactly (Hermite curves, tone zones, HSL Gaussian blend, etc.)
- LUT omitted in CPU (trilinear too slow for 24MP in JS)
- Idempotent short-circuits (exposure=0 or contrast=0 skip entire channel)

### 5.3 Batch Processing CPU Pipeline
**File:** `electron/services/batch/pipelineSharp.ts` (100+ lines)

**Key Function:**
```typescript
export async function applyPipeline(opts: ApplyPipelineOptions): Promise<ApplyPipelineResult>

export interface ApplyPipelineOptions {
  input: Buffer
  pipeline: FilterPipeline | null
  sourceOrientation?: number
  format: 'jpeg' | 'png' | 'webp' | 'tiff'
  quality: number
  keepExif: boolean
  resize?: { mode: 'long-edge' | 'short-edge' | 'width' | 'height'; value: number }
}
```

**Process:**
1. `sharp(input, { failOn: 'none' })`
2. Orientation: RAW uses explicit `.rotate(degrees)`, others use `.rotate()` (autoOrient)
3. Optional resize before filtering (saves pixels for CPU pipeline)
4. If pipeline: extract RGBA → `applyPipelineToRGBA()` → re-encode via sharp
5. Encode to format/quality + optional EXIF metadata

---

## 6. BATCH PROCESSING

### 6.1 Batch Job Management
**File:** `electron/services/filter-engine/batch.ts` (500+ lines)

**Key Types:**
```typescript
export interface BatchProgressEvent {
  jobId: string
  itemId?: string
  status?: 'pending' | 'completed' | 'failed'
  progress?: number
  outputPath?: string
  error?: string
  completed: number
  total: number
  jobStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
}
```

**Architecture:**
- Worker pool (Node.js `worker_threads`)
- Each worker runs `sharp` pipeline independently
- Progress broadcast via `BrowserWindow.webContents.send('batch:progress')`
- Error isolation: single item failure doesn't crash other items

### 6.2 Batch Worker
**File:** `electron/services/batch/worker.ts`

Runs in worker thread, handles:
- Receive BatchTask from main
- Load source image
- Apply FilterPipeline via `applyPipeline()`
- Write output file
- Send result back to main

---

## 7. PHOTO MANAGEMENT & STORAGE

### 7.1 Photo Record Structure
**File:** `shared/types.ts` (Photo interface)

```typescript
export interface Photo {
  id: string
  path: string
  name: string
  format: 'jpg' | 'png' | 'webp' | 'heic' | 'nef' | 'arw' | ...  // All RAW types
  sizeBytes: number
  width: number
  height: number
  thumbPath: string
  exif: PhotoExif
  starred: boolean
  rating: 0..5
  tags: string[]
  importedAt: number  // milliseconds
  dimsVerified?: 1 | 2  // Version flag for orientation repair
}
```

### 7.2 Photo Store (SQLite via JsonTable)
**File:** `electron/services/storage/photoStore.ts` (200+ lines)

**Key Functions:**
```typescript
export async function importPhotos(paths: string[]): Promise<Photo[]>
  // Read EXIF, generate thumbs, validate dimensions, insert to DB

export async function listPhotos(): Promise<Photo[]>
  // Query all photos, lazy-repair outdated records

export async function removePhotoRecords(ids: string[]): Promise<void>
  // Only removes DB records + orphan thumbs, NOT original files

export async function repairPhotoRecord(photo: Photo): Promise<Photo>
  // Fix mismatched dimension aspect ratios against thumb
```

**Dimension Repair Logic:**
- Compares photo `width:height` aspect ratio against `thumbPath` aspect
- If mismatch > 5% and differs from identity: swap `width` ↔ `height`
- Avoids corrupting already-correct records (idempotent)

---

## 8. EDITOR UI & INTERACTIONS

### 8.1 Main Editor Component
**File:** `src/routes/Editor.tsx` (300+ lines)

**Key Features:**
- Photo selection dropdown
- Filter gallery with groups (extracted / imported / community / builtin)
- Split preview (original vs. edited)
- Adjustments panel (right-side tabs: filters / sliders)
- Undo/Redo buttons (⌘Z / ⌘⇧Z keyboard support)
- Reset to baseline button
- Save preset dialog (stores as user-created filter)
- Download button (exports filtered image)

**Architecture:**
- `previewUrl` state: IPC-fetched 1600px JPEG
- `useWebGLPreview` hook: live GPU rendering
- `useEditStore` subscriber: pipeline changes
- `useAppStore` selector: active photo/filter (precise selectors to avoid re-renders)

**History Integration:**
```typescript
const history = useEditStore((s) => s.history)
const future = useEditStore((s) => s.future)
const commitHistory = useEditStore((s) => s.commitHistory)
const undo = useEditStore((s) => s.undo)
const redo = useEditStore((s) => s.redo)
```

### 8.2 Adjustments Panel (Sliders)
**File:** `src/components/AdjustmentsPanel.tsx` (200+ lines)

**UI Controls:**
- Tone sliders: Exposure (EV), Contrast, Highlights, Shadows, Whites, Blacks
- White Balance: Temperature, Tint
- HSL: 8 color bands × {Hue, Sat, Light}
- Color Grading: 3-way wheels + blending
- Clarity, Saturation, Vibrance
- Curves editor (Bezier interactive)
- Halation, Grain, Vignette parameters

**Interaction Pattern:**
- `onChange` → `useEditStore.set*()` → GPU re-render
- `onChangeEnd` → `commitHistory()` → Enter undo/redo stack

---

## 9. IPC (Inter-Process Communication)

### 9.1 Photo Operations
**File:** `electron/ipc/photo.ts` (24 lines)

```typescript
registerIpc('photo:import', async (paths: string[]) => ...)
registerIpc('photo:list', async () => ...)
registerIpc('photo:readExif', async (filePath: string) => ...)
registerIpc('photo:thumb', async (filePath: string, size: number) => ...)
registerIpc('photo:remove', async (ids: string[]) => ...)
```

### 9.2 Preview Rendering
**File:** `electron/ipc/preview.ts` (18 lines)

```typescript
registerIpc('preview:render', async (photoPath, filterId, pipelineOverride) => ...)
```

### 9.3 Batch Processing
**File:** `electron/ipc/batch.ts` (100+ lines)

```typescript
registerIpc('batch:start', async (config: BatchJobConfig) => ...)
registerIpc('batch:cancel', async (jobId: string) => ...)
registerIpc('batch:getJob', async (jobId: string) => ...)
```

Progress events: `batch:progress` (pushed to renderer via webContents.send)

---

## 10. KEY OPTIMIZATION & BUG FIXES

### 10.1 Sony ARW Double-Flip Fix (2026-04-27)
**Impact:** Correctly orients Sony RAW thumbnails/previews

**Before:** Used `sourceOrientation` from RAW file header → double rotation when embedded JPEG had different orientation.

**After:** Unified approach using `sharp.rotate()` (autoOrient) on embedded JPEG buffer — JPEG's EXIF is most authoritative.

**Files Modified:**
- `electron/services/filter-engine/preview.ts:53`
- `electron/services/filter-engine/thumbnail.ts:69`
- `electron/services/batch/pipelineSharp.ts:72-78`

### 10.2 Unified CPU Pipeline (F2/F3)
**Impact:** Consistent image output across GPU / preview / batch paths

**Before:**
- Preview: only tone (exposure/contrast/saturation)
- Batch: approximate tone via sharp.modulate + WB via hue shift
- GPU: full 10 channels

**After:**
- CPU pipeline (`cpuPipeline.ts`) mirrors GPU exactly
- All 9/10 channels implemented (LUT omitted for CPU)
- Batch and preview use same math as GPU

**Files:**
- `electron/services/filter-engine/cpuPipeline.ts` (new comprehensive impl)
- `electron/services/batch/pipelineSharp.ts` (refactored to use cpuPipeline)

### 10.3 Fast Slider Interaction (P0-1)
**Impact:** Zero re-render during fast slider drag

**Before:** perfStore updates triggered Editor re-render.

**After:** `perfStore` and `perfStore` histogram updates are **external** — Editor doesn't subscribe, only dev panel does.

**File:** `src/lib/useWebGLPreview.ts:66` — `writeHistogram()` / `writePerf()` write to external store.

### 10.4 Undo/Redo History (M4.2)
**Impact:** Proper undo/redo with deferred commits

**Design:**
- Per-action `set*()` changes `currentPipeline` immediately (for live preview)
- `commitHistory()` called on interaction end (slider release, key press)
- Idempotent: identical values don't re-stack
- Two scenarios for undo:
  - **A:** Current = stack top → pop + move current to future
  - **B:** Current ahead of stack (uncommitted) → push current to future, restore to top

**File:** `src/stores/editStore.ts:354-402`

---

## 11. TESTING

### 11.1 Edit Store Tests
**File:** `tests/unit/editStore.test.ts` (200+ lines)

- `loadFromPreset` deep cloning
- Per-channel patch merging
- Dirty edit detection
- History limit enforcement
- Undo/redo state transitions

### 11.2 Photo Orientation Repair Tests
**File:** `tests/unit/repairPhotoOrientation.test.ts` (206 lines)

- Aspect ratio mismatch detection (>5% triggers swap)
- Square image handling (no swap)
- Missing thumb graceful degradation
- Dimension consistency with generated thumbs

### 11.3 EXIF Reader Tests
**File:** `tests/unit/exifReader.test.ts`

Tests PhotoExif extraction and field clamping.

---

## 12. SECURITY & VALIDATION

### 12.1 Image Guard
**File:** `electron/services/security/imageGuard.ts` (100+ lines)

- Validates image files (format, size, dimensions)
- Blocks suspicious payloads
- Dimension bounds checking

### 12.2 Path Guard
**File:** `electron/services/security/pathGuardRegistry.ts`

- Whitelist-based file access control
- IPC argument validation (e.g., `photo:import` validates all paths in array)

---

## 13. FILE STRUCTURE SUMMARY

```
GrainMark/
├── electron/
│   ├── ipc/
│   │   ├── photo.ts                          # Photo CRUD, EXIF, thumbnails
│   │   ├── preview.ts                        # Preview rendering endpoint
│   │   ├── batch.ts                          # Batch job management
│   │   └── ...
│   └── services/
│       ├── exif/
│       │   └── reader.ts                     # EXIF metadata extraction
│       ├── filter-engine/
│       │   ├── preview.ts                    # Quick preview render (1600px)
│       │   ├── thumbnail.ts                  # Thumbnail generation + orientation
│       │   ├── batch.ts                      # Batch job dispatcher
│       │   ├── cpuPipeline.ts                # 10-channel CPU pipeline
│       │   └── pipelineSharp.ts              # Sharp-based pipeline wrapper
│       ├── raw/
│       │   ├── index.ts                      # Unified RAW preview resolution
│       │   ├── rawDecoder.ts                 # Embedded JPEG extraction
│       │   └── rawCache.ts                   # RAW cache by mtime+size
│       ├── batch/
│       │   ├── worker.ts                     # Worker thread implementation
│       │   ├── pipelineSharp.ts              # Batch pipeline (uses cpuPipeline)
│       │   └── ...
│       └── storage/
│           ├── photoStore.ts                 # Photo DB + repair logic
│           └── ...
├── src/
│   ├── routes/
│   │   ├── Editor.tsx                        # Main edit UI
│   │   ├── Library.tsx                       # Photo browser
│   │   ├── Batch.tsx                         # Batch processor UI
│   │   └── ...
│   ├── stores/
│   │   ├── editStore.ts                      # Pipeline + history (Zustand)
│   │   ├── appStore.ts                       # Photo list, filters, active selection
│   │   └── perfStore.ts                      # Performance metrics
│   ├── components/
│   │   ├── AdjustmentsPanel.tsx              # Slider controls
│   │   └── ...
│   ├── engine/webgl/
│   │   ├── Pipeline.ts                       # GPU pipeline executor
│   │   ├── GLContext.ts                      # WebGL 2 context
│   │   ├── Pass.ts                           # Individual render pass
│   │   ├── Texture.ts                        # GPU texture wrapper
│   │   ├── ShaderRegistry.ts                 # Shader compilation cache
│   │   └── shaders/
│   │       ├── tone.ts
│   │       ├── whiteBalance.ts
│   │       ├── curves.ts
│   │       ├── hsl.ts
│   │       ├── colorGrading.ts
│   │       ├── adjustments.ts
│   │       ├── grain.ts
│   │       ├── halation.ts
│   │       ├── vignette.ts
│   │       └── lut3d.ts
│   ├── lib/
│   │   ├── useWebGLPreview.ts                # GPU preview hook
│   │   ├── useLutTexture.ts                  # LUT async loading
│   │   ├── useGlobalHotkeys.ts               # Keyboard handlers
│   │   ├── histogram.ts                      # Histogram computation
│   │   └── ...
│   └── design/
│       └── components/
│           ├── PhotoCard.tsx                 # Photo thumbnail display
│           └── ...
├── shared/
│   ├── types.ts                              # Shared type definitions
│   └── ipc-schemas.ts                        # IPC request/response types
└── tests/
    ├── unit/
    │   ├── editStore.test.ts
    │   ├── exifReader.test.ts
    │   ├── repairPhotoOrientation.test.ts
    │   ├── webglEngine.test.ts
    │   └── ...
    └── integration-e2e/
        └── batch.spec.ts
```

---

## 14. KEY CODE SNIPPETS & ENTRY POINTS

### Load a Photo
```typescript
// electron/ipc/photo.ts
registerIpc('photo:list', async () => listPhotos())
// Returns: Photo[] with exif, thumbPath, dimensions
```

### Edit with Live Preview
```typescript
// src/routes/Editor.tsx
const { canvasRef, status } = useWebGLPreview(previewUrl, currentPipeline)
// GPU renders 10-channel pipeline in real-time
```

### Save Edit as New Filter
```typescript
// src/routes/Editor.tsx (line ~150)
const preset = { id, name, pipeline: currentPipeline, ... }
await ipc('filter:save', preset)
```

### Batch Export
```typescript
// electron/ipc/batch.ts
registerIpc('batch:start', async (config: BatchJobConfig) => ...)
// Creates worker pool, distributes tasks, emits progress events
```

---

## 15. NOTABLE DESIGN DECISIONS

1. **GPU-Only Architecture:** No CPU fallback for editor (GPU unavailable = "unsupported" status). Faster and simpler than fallback logic.

2. **Deferred History Commits:** Changes go live to preview immediately but enter undo stack only after interaction ends. Avoids stack bloat from slider drag.

3. **Orientation by EXIF:** Trusts buffer's embedded EXIF over RAW file header to avoid double-flip on some cameras.

4. **10-Channel Parity:** CPU pipeline mirrors GPU exactly — users get identical results across preview/batch/GPU paths.

5. **Worker Pool for Batch:** Each item in batch runs in a separate worker thread — isolated failures, better CPU scaling.

6. **Unified Preview Entry:** `resolvePreviewBuffer()` transparently handles RAW/JPEG/HEIC with caching — higher levels don't care about file format.

---

## 16. SUMMARY TABLE

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Filter Schema | shared/types.ts | 100+ | 10-channel pipeline definition |
| Edit Store | src/stores/editStore.ts | 412 | Zustand state + history |
| WebGL Preview | src/lib/useWebGLPreview.ts | 100+ | GPU real-time rendering |
| GPU Pipeline | src/engine/webgl/Pipeline.ts | 200+ | Render pass executor |
| CPU Pipeline | electron/services/filter-engine/cpuPipeline.ts | 671 | Pixel-by-pixel GPU mirror |
| EXIF Reader | electron/services/exif/reader.ts | 91 | Metadata extraction |
| RAW Decoder | electron/services/raw/rawDecoder.ts | 160+ | Embedded JPEG extraction |
| Preview Render | electron/services/filter-engine/preview.ts | 76 | Quick 1600px JPEG |
| Thumbnail Gen | electron/services/filter-engine/thumbnail.ts | 104 | Thumb generation + orientation |
| Batch Process | electron/services/filter-engine/batch.ts | 500+ | Job dispatch + worker pool |
| Photo Store | electron/services/storage/photoStore.ts | 200+ | SQLite photo DB + repair |
| Editor UI | src/routes/Editor.tsx | 300+ | Main edit interface |
| Adjustments UI | src/components/AdjustmentsPanel.tsx | 200+ | Slider controls |

---

**Generated:** 2026-04-27 | **Codebase:** GrainMark (Electron + React + WebGL)

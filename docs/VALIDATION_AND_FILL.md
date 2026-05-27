# StarArtist: Validation & Fill System Overview

## Goal

Determine whether a player's freehand drawing constitutes a valid 5-pointed star, then visually fill in its 6 faces (1 pentagon + 5 triangles) using the actual drawn curves as boundaries.

---

## Star Definition

A valid 5-pointed star is a graph where:

1. There exist exactly **5 vertices forming a cycle** (the pentagon)
2. Each edge of the pentagon cycle has exactly **1 "tip" vertex** that connects to both of that edge's endpoints (forming a triangle)
3. Tips may be **shared/merged** (one vertex serving multiple triangle roles)
4. **Tips must NOT be pentagon vertices** — only non-pentagon vertices can serve as tips
5. The graph contains **no extra edges** beyond pentagon edges and triangle edges
6. Valid vertex count: **6 to 10** (10 = all unique tips, 6 = all tips merged into one)
7. Valid edge count: **≤15** (can be less with merged tips sharing edges)

---

## Project Structure

```
src/
├── canvas/
│   ├── types.ts              — Line, Point, Tool types
│   ├── strokeProcessor.ts    — Freehand → smoothed path + corner detection
│   ├── geometry.ts           — Snap, intersection, self-intersection detection
│   ├── curveUtils.ts         — SVG path rendering for curves
│   ├── DrawingCanvas.tsx     — Drawing surface (pen, move, bend, eraser)
│   └── CurvedSuccessOverlay.tsx — Fill animation overlay
├── analyzer/
│   ├── vertexValidation.ts   — PRIMARY: graph-theory star validation
│   ├── analyzer.ts           — SECONDARY: face-based validation (shared-edge fallback)
│   ├── planarGraph.ts        — Planar graph builder (used by analyzer.ts)
│   ├── findFaces.ts          — Face enumeration (used by analyzer.ts)
│   ├── floodFill.ts          — Pixel flood-fill for shape coloring
│   └── shapeBoundaries.ts    — (deprecated, kept for reference)
└── screens/
    └── TestScreen.tsx         — Wires both validators + fill overlay
```

---

## Validation Flow (Chronological)

### Step 1: Stroke Processing
**File:** `src/canvas/strokeProcessor.ts`

When pen releases:
1. **Resample** raw points to 8px spacing (line 57, `resample`)
2. **Smooth** with moving average, window=5 (line 79, `smooth`)
3. **Detect corners** where angle change >20° with 30px cooldown (line 89, `detectCorners`)
4. **Simplify** smooth sections via Ramer-Douglas-Peucker (line 131, `simplifyKeepingCorners`)

Result: `ProcessedStroke { points, cornerIndices }`

### Step 2: Vertex Collection
**File:** `src/analyzer/vertexValidation.ts`, line 25 (`vertexValidate`)

1. **Explode at corners** (line 41): split strokes into sub-lines at detected corners
2. **Add endpoints** as vertices (line 55): every sub-line's `a` and `b`
3. **Add intersections** (line 60): pairwise segment checks between all lines
4. **Add self-intersections** (line 67): check each line against itself
5. **Vertex merge distance:** 9px (positions within 9px become one vertex)

### Step 2b: Collinear Intersection Suppression
**File:** `src/canvas/geometry.ts`, `segmentIntersection`

Segments crossing at very shallow angles (< ~8.6°, i.e. sin(angle) < 0.15) are treated as parallel. This prevents phantom intersection points from near-overlapping lines that are trying to be "the same line" but are slightly off-angle.

### Step 3: Adjacency Building
**File:** `src/analyzer/vertexValidation.ts`, line 74

For each exploded line:
1. Find ALL vertices near the path using `allDistancesAlongLine` (line 476)
2. Sort by distance along path
3. Deduplicate consecutive same-vertex entries
4. Handle closed loops (start==end vertex)
5. Connect consecutive ordered vertices as edges
6. Track edge multiplicity (multiple paths between same pair)

### Step 3b: Degree-2 Collinear Vertex Contraction

After adjacency is built, the graph is simplified by contracting degree-2 vertices that sit collinearly between their two neighbors. This handles the common case where overlapping lines create chains like A→B→C where B is just a given-line endpoint in the middle of what is effectively a single edge.

**Contraction criteria (all must pass):**
1. Vertex has exactly degree 2
2. Perpendicular distance to the line through its two neighbors is within tolerance
3. **Tolerance is proportional to edge length:** `min(12px, edgeLen × 0.2)` — this prevents short edges from incorrectly swallowing nearby real vertices
4. Vertex projects between its two neighbors (parametric t ∈ [-0.1, 1.1]) — prevents vertices past the segment ends from being contracted

**Effect:** The two edges through the contracted vertex are merged into one direct edge. Edge multiplicity is preserved as `max(mult_AV, mult_BV)`.

### Step 3c: Active Vertex Counting

After contraction, vertex count checks use only **active vertices** (those with degree > 0). Contracted vertices remain in the array but are excluded from counts and cycle searches.

### Step 4: Pentagon Cycle Search
**File:** `src/analyzer/vertexValidation.ts`, `findAllPentagonCycles`

- Only considers **active** (non-contracted) vertices
- Brute-force all C(n,5) combinations of active vertices
- For each group of 5, try all 24 permutations (`findCycleInGroup`)
- A valid cycle: each consecutive pair (wrapping) must be adjacent in the graph

### Step 5: Tip Assignment (Backtracking)
**File:** `src/analyzer/vertexValidation.ts`, `validateWithCycle`

For each candidate pentagon cycle:
1. For each pentagon edge, find all candidate tips (vertices connecting to both endpoints)
2. **Pentagon vertices are excluded from tip candidates** (`pentSet.has(v)` check) — this prevents 4-pointed shapes from falsely validating by reusing pentagon vertices as tips
3. Backtrack through all assignments (`backtrackAssign`)
4. For each complete assignment, run `checkAssignment`

### Step 6: Edge Verification
**File:** `src/analyzer/vertexValidation.ts`, `checkAssignment`

Build the set of required edges (pentagon edges + triangle edges from assignment).
- Every actual edge must be in the required set
- Every required edge must exist in actual edges
- If both pass → **valid star!**

### Fallback: Shared-Edge Triangle Validation
**File:** `src/screens/TestScreen.tsx` and `src/screens/PlayScreen.tsx`

If vertex validation fails AND no multi-edges exist, the old face-based analyzer (`src/analyzer/analyzer.ts`) runs as a fallback. This handles stars where triangles share edges (which changes the graph topology beyond what vertex validation covers).

---

## Fill System

### Technique: Flood Fill with Progressive Claiming
**File:** `src/analyzer/floodFill.ts`, line 12 (`generateFillOverlays`)

1. **Render ALL lines** as opaque strokes on a hidden 600×600 canvas using `lineToPath` (follows curves via Path2D)
2. **Fill pentagon first:** spiral-search from centroid for a bounded seed, BFS flood fill
3. **Mark pentagon pixels as boundary** (alpha=255) so triangle fills can't enter it
4. **Fill each triangle:** spiral-search from centroid, fill, mark as boundary
5. **Progressive claiming** prevents overlapping fills

### Seed Search
**File:** `src/analyzer/floodFill.ts`, line 172 (`findValidSeed`)

- Start at centroid, spiral outward (radius up to 150px, 10° steps)
- For each candidate: check if it's not on a boundary pixel, then run `isFloodBounded`

### Bounded Check
**File:** `src/analyzer/floodFill.ts`, line 195 (`isFloodBounded`)

- BFS from seed, max 60,000 pixels
- If hits canvas edge → unbounded → reject seed
- If hits pixel limit → too large for a star face → reject
- If finishes within bounds → valid interior region

### Fill Rendering
**File:** `src/analyzer/floodFill.ts`, line 220 (`doFloodFill`)

- Full BFS flood (max 150,000 pixels)
- Write colored pixels to ImageData
- Convert to data URL for SVG `<image>` element

---

## Known Limitations

1. **Enclosed whitespace:** When merged-tip stars create enclosed whitespace adjacent to the pentagon, a triangle centroid may land in that whitespace and fill it instead of the triangle. Rare in practice.

2. **Inside-pentagon check disabled:** A tip vertex inside the pentagon (inward-pointing triangles) is not currently detected. The flood-fill approach works in theory but causes crashes when run during validation. Deferred to future work.

3. **Shared-edge + multi-edge interaction:** Stars with both shared triangle edges AND multi-edges between the same vertex pair may not validate with either validator. Edge case for very unusual star configurations.

---

## Key Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| VERTEX_MERGE_DISTANCE | 9px | vertexValidation.ts:4 | How close two points must be to count as one vertex |
| COLLINEAR_SIN_THRESHOLD | 0.15 | geometry.ts (segmentIntersection) | Sin of angle below which segments are treated as parallel (~8.6°) |
| CONTRACTION_MAX_TOLERANCE | 12px | vertexValidation.ts (Step 3b) | Maximum perpendicular distance for contraction |
| CONTRACTION_RATIO | 0.2 | vertexValidation.ts (Step 3b) | Tolerance scales as edgeLen × 0.2 (capped at 12px) |
| CONTRACTION_T_RANGE | [-0.1, 1.1] | vertexValidation.ts (Step 3b) | Parametric projection bounds for contraction eligibility |
| CORNER_ANGLE_THRESHOLD | 20° | strokeProcessor.ts:4 | Angle change to detect a corner |
| CORNER_COOLDOWN_DISTANCE | 30px | strokeProcessor.ts:5 | Min distance before another corner can fire |
| CANVAS_SIZE | 600 | floodFill.ts:4 | Hidden canvas dimensions (matches SVG viewBox) |
| STROKE_WIDTH | 4 | floodFill.ts:5 | Boundary line width on hidden canvas |
| MAX_BOUNDED_PIXELS | 60,000 | floodFill.ts:207 | Max pixels before rejecting as too large |
| SEED_SEARCH_RADIUS | 150px | floodFill.ts:178 | How far from centroid to search for seeds |

---

## How to Debug

1. **Copy Debug button:** Dumps full graph state (vertices, edges, adjacency, pentagon cycle, tip assignment). Available in TestScreen always, and can be temporarily added to PlayScreen levels by editing the level ID check.
2. **Fill Debug button:** Shows seed positions and fill success/failure for each shape
3. **Red dots:** Endpoints and detected corners (visible on canvas)
4. **Yellow dots:** Intersection points between lines

---

## Change Log

### Session: 2026-05-26

**Problem:** Overlapping lines (extending existing lines in both directions) weren't validating on later levels due to phantom vertices and tight tolerances.

**Changes made:**

1. **VERTEX_MERGE_DISTANCE increased from 6px to 9px** (`vertexValidation.ts`)
   - More forgiving detection of when a drawn line passes through existing vertices
   - Helps overlapping-line technique feel natural

2. **Collinear intersection suppression** (`geometry.ts`, `segmentIntersection`)
   - Segments crossing at < 8.6° are treated as parallel (returns null)
   - Prevents phantom intersection points from near-overlapping lines

3. **Degree-2 collinear vertex contraction** (`vertexValidation.ts`, Step 3b)
   - After adjacency is built, contracts degree-2 vertices sitting on the line between their neighbors
   - Tolerance proportional to edge length: `min(12px, edgeLen × 0.2)`
   - Projection check ensures vertex is between neighbors (t ∈ [-0.1, 1.1])
   - Solves the "too many vertices" problem when given-line endpoints become intermediate points on overlapping paths

4. **Pentagon vertex exclusion from tip candidates** (`vertexValidation.ts`, `validateWithCycle`)
   - `pentSet.has(v)` check prevents any pentagon vertex from being reused as a tip
   - Fixes false validation of 4-pointed shapes that exploited pentagon vertices doubling as tips

5. **Active vertex counting and cycle search** (`vertexValidation.ts`)
   - Vertex count bounds (6-10) now count only active vertices (degree > 0)
   - Pentagon cycle search only considers active vertices
   - Prevents contracted ghost vertices from inflating counts or being searched

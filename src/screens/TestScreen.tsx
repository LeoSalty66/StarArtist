import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DrawingCanvas from '../canvas/DrawingCanvas';
import Toolbar from '../canvas/Toolbar';
import SuccessOverlay from '../canvas/SuccessOverlay';
import { useDrawingState } from '../canvas/useDrawingState';
import { analyze, type AnalysisResult } from '../analyzer/analyzer';
import { vertexValidate, type VertexValidationResult } from '../analyzer/vertexValidation';
import { clearStars } from '../storage/starLibrary';
import { startBabble, stopBabble, isBabbling } from '../audio/voiceBabble';
import type { Line, Tool } from '../canvas/types';
import type { NormalizedLine } from '../levels/types';

interface Props {
  onBack: () => void;
}

function TestScreen({ onBack }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const [boilActive, setBoilActive] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [babbling, setBabbling] = useState(false);
  const drawing = useDrawingState();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Run the analyzer every time lines change.
  const analysis = useMemo(() => analyze(drawing.lines), [drawing.lines]);
  const vResult = useMemo(() => vertexValidate(drawing.lines), [drawing.lines]);

  // Use vertex validation as primary.
  // Fall back to shared-edge triangle validation (old face-based analyzer)
  // ONLY if no vertex pair has multiple edges (which would cause false positives).
  let sharedEdgeValid = false;
  if (!vResult.isValidStar) {
    let hasMultiEdge = false;
    for (const [, count] of vResult.edgeMultiplicity) {
      if (count > 1) { hasMultiEdge = true; break; }
    }
    if (!hasMultiEdge) {
      sharedEdgeValid = analysis.isValidStar;
    }
  }
  const locked = vResult.isValidStar || sharedEdgeValid;

  // Activate line boil after the fill animation finishes
  useEffect(() => {
    if (locked) {
      const timer = setTimeout(() => setBoilActive(true), 2400);
      return () => clearTimeout(timer);
    } else {
      setBoilActive(false);
    }
  }, [locked]);

  // Stop babble on unmount
  useEffect(() => {
    return () => { stopBabble(); };
  }, []);

  const handleExport = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || drawing.lines.length === 0) return;
    const rect = wrapper.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w === 0 || h === 0) return;

    const normalized: NormalizedLine[] = drawing.lines.map((l: Line) => ({
      ax: +(l.a.x / w).toFixed(4),
      ay: +(l.a.y / h).toFixed(4),
      bx: +(l.b.x / w).toFixed(4),
      by: +(l.b.y / h).toFixed(4),
    }));

    const levelJson = JSON.stringify(
      {
        id: 'TODO',
        givenLines: normalized,
        lineBudget: 5,
      },
      null,
      2,
    );

    navigator.clipboard.writeText(levelJson).then(() => {
      setExportMessage('Copied to clipboard!');
      setTimeout(() => setExportMessage(''), 2000);
    });
  }, [drawing.lines]);

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Test</h2>
        <button
          className="tool-btn danger"
          onClick={() => { clearStars(); setExportMessage('Stars cleared!'); setTimeout(() => setExportMessage(''), 2000); }}
          style={{ marginLeft: '0.5rem' }}
        >
          Clear Stars
        </button>
        <button
          className={`tool-btn ${babbling ? 'active' : ''}`}
          onClick={() => {
            if (isBabbling()) {
              stopBabble();
              setBabbling(false);
            } else {
              startBabble();
              setBabbling(true);
            }
          }}
          style={{ marginLeft: '0.5rem' }}
        >
          {babbling ? 'Stop Voice' : 'Test Voice'}
        </button>
        <button
          className="tool-btn"
          onClick={() => {
            const dump = buildDebugDump(vResult, analysis);
            navigator.clipboard.writeText(dump).then(() => {
              setExportMessage('Debug copied!');
              setTimeout(() => setExportMessage(''), 2000);
            });
          }}
          style={{ marginLeft: '0.5rem' }}
        >
          Copy Debug
        </button>
        <span className="header-hint">
          {locked
            ? '⭐ Star complete!'
            : exportMessage || 'Draw a 5-pointed star. Press & drag to draw lines.'}
        </span>
      </header>
      <div className="canvas-area">
        <div className="canvas-wrapper" ref={wrapperRef}>
          <DrawingCanvas
            tool={locked ? 'pen' : tool}
            lines={drawing.lines}
            onAddLine={drawing.addLine}
            onRemoveLine={drawing.removeLine}
            onMovePoint={drawing.movePoint}
            onBend={drawing.bendLine}
            locked={locked}
            boilActive={boilActive}
            successOverlay={
              analysis.isValidStar &&
              analysis.pentagonIdx !== null ? (
                <SuccessOverlay
                  graph={analysis.graph}
                  pentagon={analysis.boundedFaces[analysis.pentagonIdx]}
                  triangles={analysis.triangleIdxs.map(
                    (i) => analysis.boundedFaces[i],
                  )}
                />
              ) : undefined
            }
          />
        </div>
        {!locked && (
          <Toolbar
            tool={tool}
            onToolChange={setTool}
            onUndo={drawing.undo}
            onRedo={drawing.redo}
            onClear={drawing.clear}
            canUndo={drawing.canUndo}
            canRedo={drawing.canRedo}
            lineCount={drawing.lines.length}
            onExport={handleExport}
          />
        )}
      </div>
      {/* Analyzer feedback bar */}
      <div className={`analyzer-bar ${locked ? 'success' : ''}`}>
        <span className="analyzer-message">
          {vResult.isValidStar ? vResult.message : vResult.message || analysis.message}
        </span>
        {!locked && (
          <span className="analyzer-detail">
            Vertices: {vResult.vertices.length} | Edges: {vResult.edgeCount}
          </span>
        )}
      </div>
    </div>
  );
}

function buildDebugDump(vResult: VertexValidationResult, analysis: AnalysisResult): string {
  const lines: string[] = [];
  lines.push('=== VERTEX VALIDATION DEBUG DUMP ===');
  lines.push(`Result: ${vResult.isValidStar ? 'VALID' : 'INVALID'}`);
  lines.push(`Message: ${vResult.message}`);
  lines.push(`Vertices: ${vResult.vertices.length}`);
  lines.push(`Edge count: ${vResult.edgeCount}`);
  lines.push('');

  // Vertices
  lines.push('--- VERTICES ---');
  for (let i = 0; i < vResult.vertices.length; i++) {
    const v = vResult.vertices[i];
    const degree = vResult.adjacency.get(i)?.size ?? 0;
    const neighbors = [...(vResult.adjacency.get(i) ?? [])].join(', ');
    lines.push(`  V${i}: (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) | degree=${degree} | connects to: [${neighbors}]`);
  }
  lines.push('');

  // Edges with multiplicity
  lines.push('--- EDGES (with multiplicity) ---');
  for (const [key, count] of vResult.edgeMultiplicity) {
    lines.push(`  ${key}: ×${count}`);
  }
  lines.push('');

  // Pentagon info
  if (vResult.pentagonVertices.length > 0) {
    lines.push('--- PENTAGON CYCLE ---');
    lines.push(`  Vertices: ${vResult.pentagonVertices.join(' → ')} → ${vResult.pentagonVertices[0]}`);
    lines.push(`  Pentagon edges:`);
    for (let i = 0; i < 5; i++) {
      const a = vResult.pentagonVertices[i];
      const b = vResult.pentagonVertices[(i + 1) % 5];
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      const mult = vResult.edgeMultiplicity.get(key) ?? 0;
      lines.push(`    ${a}-${b} (multiplicity: ${mult})`);
    }
  }
  lines.push('');

  // Tips
  if (vResult.tipVertices.length > 0) {
    lines.push('--- TIP VERTICES ---');
    for (const t of vResult.tipVertices) {
      const neighbors = [...(vResult.adjacency.get(t) ?? [])].join(', ');
      lines.push(`  V${t}: connects to [${neighbors}]`);
    }
  }
  lines.push('');

  // Old analyzer info
  lines.push('=== OLD FACE-BASED ANALYZER ===');
  lines.push(`Result: ${analysis.isValidStar ? 'VALID' : 'INVALID'}`);
  lines.push(`Message: ${analysis.message}`);
  lines.push(`Bounded faces: ${analysis.boundedFaces.length}`);
  for (const f of analysis.boundedFaces) {
    lines.push(`  Face ${f.id}: ${f.halfEdgeIds.length} sides`);
  }
  lines.push(`Dangling edges: ${analysis.danglingEdgeIds.length}`);
  lines.push('');

  return lines.join('\n');
}

export default TestScreen;

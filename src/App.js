// src/App.js

import React, { useState } from 'react';
import * as turf from '@turf/turf';
import LayoutCanvas from './components/LayoutCanvas';
import optimizeLayout from './utils/optimizer';
import './index.css';

export default function App() {
  // Canvas dimensions
  const [zoneW, setZoneW] = useState(10);
  const [zoneH, setZoneH] = useState(6);

  // Polygon definition
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [closed, setClosed]               = useState(false);
  const [sideLen, setSideLen]             = useState('');
  const [sideAng, setSideAng]             = useState('');

  // Layout options
  const tileLengths   = [4, 2, 1];
  const [orientation, setOrientation] = useState('both');
  const [tileW, setTileW]             = useState(1.26);
  const [margin, setMargin]           = useState(0.207);

  // Pricing per tile length (EUR)
  const [prices, setPrices] = useState({4:20,2:12,1:6});

  // Tile placements
  const [placements, setPlacements] = useState([]);

  // Manual add/delete
  const [newTileLen, setNewTileLen] = useState(4);

  // Boundary & cost (EUR)
  const [pricePerMeter, setPricePerMeter]       = useState(0);
  const [boundaryPerimeter, setBoundaryPerimeter] = useState(0);
  const [boundaryCost, setBoundaryCost]         = useState(0);

  // 1) Build polygon by adding sides
  const addSide = () => {
    const L = parseFloat(sideLen),
          A = parseFloat(sideAng) * Math.PI/180;
    if (!L || isNaN(A)) return;
    const last = polygonPoints.length
      ? polygonPoints[polygonPoints.length-1]
      : {x:0,y:0};
    setPolygonPoints([
      ...polygonPoints,
      { x: last.x + L*Math.cos(A), y: last.y + L*Math.sin(A) }
    ]);
    setSideLen(''); setSideAng('');
  };
  const finishPoly = () => {
    if (polygonPoints.length >= 3) setClosed(true);
  };
  const resetAll = () => {
    setPolygonPoints([]); setClosed(false);
    setPlacements([]);
    setBoundaryPerimeter(0); setBoundaryCost(0);
  };

  // 2) Automatic optimize
  const optimize = () => {
    const { placements: pl } = optimizeLayout(
      polygonPoints, tileLengths, tileW, margin, orientation
    );
    setPlacements(pl);
    setBoundaryPerimeter(0);
    setBoundaryCost(0);
  };

  // 3) Manual add
  const addTile = () => {
    if (!closed) return;
    const room  = turf.polygon([[
      ...polygonPoints.map(p=>[p.x,p.y]),
      [polygonPoints[0].x, polygonPoints[0].y]
    ]]);
    const inner = turf.buffer(room, -margin, { units:'meters' });
    const [minX,minY] = turf.bbox(inner);
    setPlacements(ps=>[
      ...ps,
      { x:minX, y:minY,
        width:newTileLen, height:tileW,
        length:newTileLen }
    ]);
  };
  const removeTile = idx => {
    setPlacements(ps=>ps.filter((_,i)=>i!==idx));
  };

  // 4) Calculate offset perimeter in meters (Euclidean)
  const calculateBoundary = () => {
    if (placements.length === 0) {
      setBoundaryPerimeter(0);
      setBoundaryCost(0);
      return;
    }
    // union all tile rects
    let unionPoly = null;
    placements.forEach(t => {
      const poly = turf.polygon([[
        [t.x,           t.y],
        [t.x + t.width, t.y],
        [t.x + t.width, t.y + t.height],
        [t.x,           t.y + t.height],
        [t.x,           t.y]
      ]]);
      unionPoly = unionPoly ? turf.union(unionPoly, poly) : poly;
    });
    // micro‑buffer to fuse tiny gaps
    unionPoly = turf.buffer(unionPoly, 1e-6,  { units:'meters' });
    unionPoly = turf.buffer(unionPoly,-1e-6,  { units:'meters' });
    // buffer outward by margin
    const buf = turf.buffer(unionPoly, margin, {
      units:'meters',
      steps:1
    });
    // sum Euclidean lengths
    const geom = buf.geometry;
    const rings = geom.type === 'Polygon'
      ? [geom.coordinates[0]]
      : geom.coordinates.map(poly => poly[0]);
    let peri = 0;
    rings.forEach(ring => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1,y1] = ring[i];
        const [x2,y2] = ring[i+1];
        peri += Math.hypot(x2 - x1, y2 - y1);
      }
    });
    setBoundaryPerimeter(peri);
    setBoundaryCost(peri * pricePerMeter);
  };

  // dynamic tile counts
  const tileCounts = placements.reduce((acc,t) => {
    acc[t.length] = (acc[t.length]||0) + 1;
    return acc;
  }, {4:0,2:0,1:0});

  // total tile cost (EUR)
  const tileCost = Object.entries(tileCounts)
    .reduce((sum,[len,count])=>
      sum + count * (prices[len]||0), 0
    );

  // grand total = tiles + boundary
  const grandTotal = tileCost + boundaryCost;

  return (
    <div className="app-container">
      <h1>CeiliX Elements Layout Configurator</h1>

      {/* Canvas & polygon controls */}
      <div className="controls">
        <label>
          Canvas W (m):
          <input type="number" value={zoneW}
                 onChange={e=>setZoneW(+e.target.value||0)} />
        </label>
        <label>
          Canvas H (m):
          <input type="number" value={zoneH}
                 onChange={e=>setZoneH(+e.target.value||0)} />
        </label>
        <button onClick={resetAll}>Reset All</button>
      </div>
      <div className="controls">
        <label>
          Side length (m):
          <input type="number" step="0.01" value={sideLen}
                 onChange={e=>setSideLen(e.target.value)}
                 disabled={closed}/>
        </label>
        <label>
          Angle (°):
          <input type="number" step="1" value={sideAng}
                 onChange={e=>setSideAng(e.target.value)}
                 disabled={closed}/>
        </label>
        <button onClick={addSide} disabled={closed}>Add Side</button>
        <button onClick={finishPoly}
                disabled={closed||polygonPoints.length<3}>
          Close Polygon
        </button>
      </div>

      {/* Layout options */}
      <div className="controls">
        <label>
          Orientation:
          <select value={orientation}
                  onChange={e=>setOrientation(e.target.value)}
                  disabled={!closed}>
            <option value="both">Both</option>
            <option value="horizontal">Horizontal only</option>
            <option value="vertical">Vertical only</option>
          </select>
        </label>
        <label>
          Tile short side (m):
          <input type="number" step="0.01" value={tileW}
                 onChange={e=>setTileW(+e.target.value||0)}
                 disabled={!closed}/>
        </label>
        <label>
          Offset (m):
          <input type="number" step="0.001" value={margin}
                 onChange={e=>setMargin(+e.target.value||0)}
                 disabled={!closed}/>
        </label>
        <button onClick={optimize} disabled={!closed}>Optimize</button>
      </div>

      {/* Manual add/delete */}
      {closed && (
        <div className="controls">
          <label>
            New tile length:
            <select value={newTileLen}
                    onChange={e=>setNewTileLen(+e.target.value)}>
              {tileLengths.map(L=>(
                <option key={L} value={L}>{L} m</option>
              ))}
            </select>
          </label>
          <button onClick={addTile}>Add Tile</button>
          <span style={{marginLeft:12}}>(dbl‑click to delete)</span>
        </div>
      )}

      {/* Pricing inputs for each tile type */}
      <div className="controls">
        <label>
          Price per 4 m tile (€):
          <input
            type="number" step="0.01"
            value={prices[4]}
            onChange={e => setPrices({...prices, 4: +e.target.value || 0})}
          />
        </label>
        <label>
          Price per 2 m tile (€):
          <input
            type="number" step="0.01"
            value={prices[2]}
            onChange={e => setPrices({...prices, 2: +e.target.value || 0})}
          />
        </label>
        <label>
          Price per 1 m tile (€):
          <input
            type="number" step="0.01"
            value={prices[1]}
            onChange={e => setPrices({...prices, 1: +e.target.value || 0})}
          />
        </label>
      </div>

      {/* Tile counts & cost */}
      {placements.length>0 && (
        <div className="controls">
          <p>
            <strong>Counts:</strong> 
            4 m: {tileCounts[4]}, 
            2 m: {tileCounts[2]}, 
            1 m: {tileCounts[1]}
          </p>
          <p><strong>Tile cost:</strong> €{tileCost.toFixed(2)}</p>
        </div>
      )}

      {/* Boundary & grand total */}
      {placements.length>0 && (
        <div className="controls">
          <label>
            Price per meter (€):
            <input type="number" step="0.01"
                   value={pricePerMeter}
                   onChange={e=>setPricePerMeter(+e.target.value||0)} />
          </label>
          <button onClick={calculateBoundary}>
            Calculate Offset Perimeter
          </button>
          <p><strong>Offset perimeter:</strong> {boundaryPerimeter.toFixed(2)} m</p>
          <p><strong>Perimeter cost:</strong> €{boundaryCost.toFixed(2)}</p>
          <p><strong>Grand total:</strong> €{grandTotal.toFixed(2)}</p>
        </div>
      )}

      {/* Canvas */}
      <LayoutCanvas
        zoneW={zoneW}
        zoneH={zoneH}
        polygonPoints={polygonPoints}
        closed={closed}
        placements={placements}
        setPlacements={setPlacements}
        removeTile={removeTile}
        margin={margin}
      />
    </div>
  );
}

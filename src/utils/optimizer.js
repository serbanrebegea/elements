import * as turf from '@turf/turf';

/**
 * Greedy pack inside polygon inset by margin.
 */
export default function optimizeLayout(
  polygonPoints,
  lengthsIn,
  tileW,
  margin,
  orientation
) {
  // 1) Build & inward‑buffer the room
  const coords = polygonPoints.map(p=>[p.x,p.y]);
  coords.push(coords[0]);
  const room  = turf.polygon([coords]);
  const inner = turf.buffer(room, -margin, { units:'meters' });
  if (!inner || !inner.geometry) {
    return { placements: [] };
  }

  // 2) BBox of inner area
  const [minX,minY,maxX,maxY] = turf.bbox(inner);

  // 3) Sort lengths descending
  const lengths = [...lengthsIn].sort((a,b)=>b-a);
  const minLen  = lengths[lengths.length-1];

  const placements = [];

  // 4) Fit test
  function fitsInside(x,y,w,h) {
    const rect = turf.polygon([[
      [x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]
    ]]);
    return turf.booleanContains(inner, rect);
  }

  const xStep = minLen;
  const yStep = tileW;

  // 5) Horizontal strips
  if (orientation==='both' || orientation==='horizontal') {
    for (let y=minY; y<=maxY-tileW; y += yStep) {
      let x=minX;
      while (x<=maxX-minLen) {
        let placed=false;
        for (const L of lengths) {
          if (fitsInside(x,y,L,tileW)) {
            placements.push({ x, y,
              width:L, height:tileW, length:L });
            x += L;
            placed = true; break;
          }
        }
        if (!placed) x += xStep;
      }
    }
  }

  // 6) Vertical strips
  if (orientation==='both' || orientation==='vertical') {
    for (let x=minX; x<=maxX-tileW; x += xStep) {
      let y=minY;
      while (y<=maxY-minLen) {
        let placed=false;
        for (const L of lengths) {
          if (fitsInside(x,y,tileW,L)) {
            placements.push({ x, y,
              width:tileW, height:L, length:L });
            y += L;
            placed = true; break;
          }
        }
        if (!placed) y += yStep;
      }
    }
  }

  return { placements };
}

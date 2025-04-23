import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as turf from '@turf/turf';

export default function LayoutCanvas({
  zoneW, zoneH,
  polygonPoints, closed,
  placements, setPlacements,
  removeTile, margin
}) {
  const canvasRef = useRef();
  const [dragging, setDragging] = useState(null);
  const scale = 100, snapTol = 0.05;

  // Build inward buffer for containment
  const innerPoly = useMemo(() => {
    if (!closed || polygonPoints.length < 3) return null;
    const pts = polygonPoints.map(p=>[p.x,p.y]);
    pts.push(pts[0]);
    try {
      return turf.buffer(turf.polygon([pts]), -margin, {
        units:'meters', steps:1
      });
    } catch {
      return turf.polygon([pts]);
    }
  }, [polygonPoints, closed, margin]);

  function fitsInside(x,y,w,h) {
    if (!innerPoly) return false;
    const rect = turf.polygon([[
      [x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]
    ]]);
    return turf.booleanContains(innerPoly, rect);
  }

  function applySnap(idx,x,y,w,h) {
    placements.forEach((t,j)=>{
      if (j===idx) return;
      [[t.x],[t.x+t.width]].forEach(([sx])=>{
        if (Math.abs(x-sx)<snapTol) x=sx;
        if (Math.abs(x+w-sx)<snapTol) x=sx-w;
      });
      [[t.y],[t.y+t.height]].forEach(([sy])=>{
        if (Math.abs(y-sy)<snapTol) y=sy;
        if (Math.abs(y+h-sy)<snapTol) y=sy-h;
      });
    });
    return { x,y };
  }

  useEffect(()=>{
    const c = canvasRef.current;
    function toTile(e) {
      const r = c.getBoundingClientRect();
      return { mx:(e.clientX-r.left)/scale, my:(e.clientY-r.top)/scale };
    }
    function down(e){
      const {mx,my}=toTile(e);
      for (let i=placements.length-1;i>=0;i--){
        const t=placements[i];
        if (mx>=t.x&&mx<=t.x+t.width&&my>=t.y&&my<=t.y+t.height){
          if (e.detail===2){ removeTile(i); return; }
          setDragging({ idx:i, offsetX:mx-t.x, offsetY:my-t.y });
          return;
        }
      }
    }
    function move(e){
      if (!dragging) return;
      const {mx,my}=toTile(e);
      const {idx,offsetX,offsetY}=dragging;
      const t=placements[idx];
      let nx=mx-offsetX, ny=my-offsetY;
      ({x:nx,y:ny} = applySnap(idx,nx,ny,t.width,t.height));
      if (fitsInside(nx,ny,t.width,t.height)){
        const np=[...placements];
        np[idx]={...t,x:nx,y:ny};
        setPlacements(np);
      }
    }
    function up(){ if (dragging) setDragging(null); }

    c.addEventListener('mousedown',down);
    window.addEventListener('mousemove',move);
    window.addEventListener('mouseup',up);
    return ()=>{
      c.removeEventListener('mousedown',down);
      window.removeEventListener('mousemove',move);
      window.removeEventListener('mouseup',up);
    };
  },[dragging,placements,innerPoly]);

  useEffect(()=>{
    const c=canvasRef.current, ctx=c.getContext('2d');
    c.width=zoneW*scale; c.height=zoneH*scale;
    ctx.clearRect(0,0,c.width,c.height);

    // Draw polygon
    if (polygonPoints.length){
      ctx.strokeStyle='#0066CC';ctx.lineWidth=2;
      ctx.beginPath();
      polygonPoints.forEach((p,i)=>{
        const X=p.x*scale, Y=p.y*scale;
        i===0?ctx.moveTo(X,Y):ctx.lineTo(X,Y);
      });
      if(closed)ctx.closePath();
      ctx.stroke();
      ctx.fillStyle='#0066CC';
      polygonPoints.forEach(p=>{
        ctx.beginPath();
        ctx.arc(p.x*scale,p.y*scale,4,0,2*Math.PI);
        ctx.fill();
      });
    }

    // Draw tiles
    placements.forEach(t=>{
      const x=t.x*scale,y=t.y*scale;
      const w=t.width*scale,h=t.height*scale;
      ctx.fillStyle='#DDD';ctx.strokeStyle='#333';ctx.lineWidth=1;
      ctx.fillRect(x,y,w,h);
      ctx.strokeRect(x,y,w,h);
    });

    if (!closed||placements.length===0) return;

    // Build union
    let unionPoly=null;
    placements.forEach(t=>{
      const poly=turf.polygon([[
        [t.x,t.y],
        [t.x+t.width,t.y],
        [t.x+t.width,t.y+t.height],
        [t.x,t.y+t.height],
        [t.x,t.y]
      ]]);
      unionPoly = unionPoly?turf.union(unionPoly,poly):poly;
    });

    // Micro-buffer
    try {
      unionPoly = turf.buffer(unionPoly,1e-6,{units:'meters'});
      unionPoly = turf.buffer(unionPoly,-1e-6,{units:'meters'});
    } catch {
      // skip
    }

    // Outward buffer with guard
    let redBuf;
    try {
      redBuf = turf.buffer(unionPoly, margin, {
        units:'meters', steps:1
      });
    } catch {
      redBuf = unionPoly;
    }

    // Draw red outline
    const geom = redBuf.geometry;
    const rings = geom.type==='Polygon'
      ? [geom.coordinates[0]]
      : geom.coordinates.map(r=>r[0]);
    ctx.strokeStyle='red';ctx.setLineDash([6,4]);ctx.lineWidth=2;
    rings.forEach(ring=>{
      ctx.beginPath();
      ring.forEach(([px,py],i)=>{
        const X=px*scale, Y=py*scale;
        i===0?ctx.moveTo(X,Y):ctx.lineTo(X,Y);
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Draw green inward offset
    ctx.strokeStyle='green';ctx.setLineDash([4,2]);ctx.lineWidth=2;
    let area2=0;
    polygonPoints.forEach((p,i)=>{
      const q=polygonPoints[(i+1)%polygonPoints.length];
      area2 += p.x*q.y - q.x*p.y;
    });
    const ccw = area2>0;
    polygonPoints.forEach((p,i)=>{
      const q=polygonPoints[(i+1)%polygonPoints.length];
      const dx=q.x-p.x, dy=q.y-p.y, len=Math.hypot(dx,dy);
      const nx=ccw?-dy/len:dy/len, ny=ccw?dx/len:-dx/len;
      const px=(p.x+nx*margin)*scale, py=(p.y+ny*margin)*scale;
      const qx=(q.x+nx*margin)*scale, qy=(q.y+ny*margin)*scale;
      ctx.beginPath();
      ctx.moveTo(px,py);
      ctx.lineTo(qx,qy);
      ctx.stroke();
    });
    ctx.setLineDash([]);

  },[zoneW,zoneH,polygonPoints,closed,placements,margin]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        border:'1px solid #333',
        cursor: dragging?'grabbing':'grab',
        marginTop:20
      }}
    />
  );
}

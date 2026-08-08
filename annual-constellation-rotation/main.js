// 별자리의 연주 회전 (Annual rotation of a constellation)
// 순수 캔버스 + 구면천문. 외부 라이브러리 없음.
// LST = 태양 적경 + (관측시각-12)*15  →  연주(공전)와 일주(자전)를 일관되게 표현.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const scale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

function eqVec(raHours, decDeg) {
  const a = raHours * 15 * D2R, d = decDeg * D2R;
  return [Math.cos(d)*Math.cos(a), Math.cos(d)*Math.sin(a), Math.sin(d)];
}
function localVec(alt, az) {
  const al = alt * D2R, a = az * D2R;
  return [Math.cos(al)*Math.sin(a), Math.cos(al)*Math.cos(a), Math.sin(al)];
}

// ---------- 천체 ----------
// 북두칠성 (실제 적경h·적위°)
const CONSTELLATION = {
  name: '북두칠성',
  stars: [
    { key: 'dubhe',  raH: 11.062, dec: 61.75, size: 2.3 },
    { key: 'merak',  raH: 11.031, dec: 56.38, size: 2.1 },
    { key: 'phecda', raH: 11.897, dec: 53.69, size: 2.0 },
    { key: 'megrez', raH: 12.257, dec: 57.03, size: 1.6 },
    { key: 'alioth', raH: 12.900, dec: 55.96, size: 2.4 },
    { key: 'mizar',  raH: 13.399, dec: 54.93, size: 2.2 },
    { key: 'alkaid', raH: 13.792, dec: 49.31, size: 2.3 },
  ],
  lines: [
    ['dubhe','merak'], ['merak','phecda'], ['phecda','megrez'], ['megrez','dubhe'],
    ['megrez','alioth'], ['alioth','mizar'], ['mizar','alkaid'],
  ],
};
const POLARIS = { raH: 2.530, dec: 89.26 };

// ---------- 상태 ----------
const state = {
  latitude: 37.5,
  dayOfYear: 0,   // 0 = 1월 1일
  hour: 21,       // 관측 시각(매일 같은 시각)
  playing: false,
  speedMul: 1,
  facingAz: 0,    // 북
  dailyOn: false, // 하루 운동 함께 보기
};
const effLat = () => clamp(state.latitude, -89.5, 89.5);

// 태양의 적경·적위 (황도 기준). d=79(≈3/20)에서 춘분(황경 0).
function sunEq() {
  const lam = (((state.dayOfYear - 79) * (360/365.2422)) % 360 + 360) % 360 * D2R;
  const eps = 23.44 * D2R;
  const raDeg = (Math.atan2(Math.cos(eps)*Math.sin(lam), Math.cos(lam)) * R2D + 360) % 360;
  const dec = Math.asin(Math.sin(eps)*Math.sin(lam)) * R2D;
  return { raH: raDeg / 15, dec };
}
// 지방 항성시(도): 정오에 태양이 남중(LST=태양적경)하도록 정의
const LSTdeg = () => ((sunEq().raH * 15 + (state.hour - 12) * 15) % 360 + 360) % 360;

function altAz(raHours, decDeg) {
  const phi = effLat() * D2R, d = decDeg * D2R;
  const H = (LSTdeg() - raHours * 15) * D2R;
  const sinAlt = Math.sin(phi)*Math.sin(d) + Math.cos(phi)*Math.cos(d)*Math.cos(H);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  const cosAlt = Math.cos(alt);
  let az = 0;
  if (cosAlt >= 1e-7) {
    const sinA = -Math.cos(d)*Math.sin(H)/cosAlt;
    const cosA = (Math.sin(d) - Math.sin(phi)*sinAlt)/(Math.cos(phi)*cosAlt);
    az = (Math.atan2(sinA, cosA)*R2D + 360) % 360;
  }
  return { alt: alt*R2D, az };
}
function zenithVec() {
  const phi = effLat() * D2R, lonR = LSTdeg() * D2R;
  return [Math.cos(phi)*Math.cos(lonR), Math.cos(phi)*Math.sin(lonR), Math.sin(phi)];
}

function starList() {
  return CONSTELLATION.stars.map(st => ({ ...st, aa: altAz(st.raH, st.dec) }));
}

// ---------- 공용: 별자리 그리기 ----------
function drawConstellation(ctx, project, opts = {}) {
  const stars = starList();
  const pts = {};
  for (const s of stars) { const pr = project(s.raH, s.dec, s.aa); if (pr) pts[s.key] = { ...pr, s }; }
  ctx.save();
  for (const [a, b] of CONSTELLATION.lines) {
    const pa = pts[a], pb = pts[b];
    if (!pa || !pb || !pa.visible || !pb.visible) continue;
    const bothAbove = pa.above && pb.above;
    ctx.strokeStyle = bothAbove ? 'rgba(150,190,255,0.7)' : 'rgba(150,190,255,0.18)';
    ctx.lineWidth = bothAbove ? 1.8 : 1.2;
    ctx.setLineDash(bothAbove ? [] : [4,4]);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const key in pts) {
    const p = pts[key]; if (!p.visible) continue;
    const r = (opts.rScale || 1) * (1.6 + p.s.size);
    ctx.globalAlpha = p.above ? 1 : 0.35;
    ctx.fillStyle = '#eaf1ff'; ctx.shadowColor = '#cfe0ff'; ctx.shadowBlur = p.above ? 8 : 0;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
// 북극성(회전 중심) 참고 표시
function drawPolaris(ctx, project) {
  const aa = altAz(POLARIS.raH, POLARIS.dec);
  const pr = project(POLARIS.raH, POLARIS.dec, aa);
  if (!pr || !pr.visible) return;
  ctx.save();
  ctx.fillStyle = aa.alt >= 0 ? '#ffe08a' : 'rgba(255,224,138,0.4)';
  ctx.shadowColor = '#ffe08a'; ctx.shadowBlur = aa.alt >= 0 ? 9 : 0;
  ctx.beginPath(); ctx.arc(pr.x, pr.y, 4.2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  // 십자
  ctx.strokeStyle = 'rgba(255,224,138,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pr.x-7, pr.y); ctx.lineTo(pr.x+7, pr.y); ctx.moveTo(pr.x, pr.y-7); ctx.lineTo(pr.x, pr.y+7); ctx.stroke();
  if (aa.alt >= 0) label(ctx, pr.x + 8, pr.y + 4, '북극성', 'rgba(255,235,180,0.95)', 'left', 11);
  ctx.restore();
}

// =====================================================================
//  뷰 A — 천구(바깥에서 본 모습)
// =====================================================================
const spaceCanvas = document.getElementById('spaceView');
const sctx = spaceCanvas.getContext('2d');
let camA = { az: -62, el: 32 };

function camBasis(cam) {
  const azC = cam.az * D2R, elC = cam.el * D2R;
  const camDir = [Math.cos(elC)*Math.cos(azC), Math.cos(elC)*Math.sin(azC), Math.sin(elC)];
  const right  = [-Math.sin(azC), Math.cos(azC), 0];
  const up     = [-Math.sin(elC)*Math.cos(azC), -Math.sin(elC)*Math.sin(azC), Math.cos(elC)];
  return { camDir, right, up };
}
function drawSpaceView() {
  const dpr = window.devicePixelRatio || 1;
  const w = spaceCanvas.clientWidth, h = spaceCanvas.clientHeight;
  if (spaceCanvas.width !== w*dpr || spaceCanvas.height !== h*dpr) { spaceCanvas.width = w*dpr; spaceCanvas.height = h*dpr; }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, w, h);
  const cx = w/2, cy = h/2, R = 1, rE = 0.16, S = Math.min(w, h) * 0.44;
  const B = camBasis(camA), zen = zenithVec();
  const proj = (P) => ({ x: cx + dot(P, B.right)*S, y: cy - dot(P, B.up)*S, depth: dot(P, B.camDir) });

  sctx.strokeStyle = 'rgba(122,162,255,0.18)'; sctx.lineWidth = 1;
  sctx.beginPath(); sctx.arc(cx, cy, S*R, 0, 7); sctx.stroke();

  // 적도
  (function(){ const pts=[]; for(let a=0;a<=360;a+=4) pts.push(proj(scale(eqVec(a/15,0),R)));
    sctx.save(); for(let seg=0;seg<2;seg++){ sctx.beginPath(); let st=false; for(const p of pts){const f=p.depth>=0; if((seg===0)===f){if(!st){sctx.moveTo(p.x,p.y);st=true;}else sctx.lineTo(p.x,p.y);}else st=false;} sctx.strokeStyle=seg===0?'rgba(120,200,255,0.6)':'rgba(120,200,255,0.16)'; sctx.lineWidth=seg===0?1.3:1; sctx.stroke();} sctx.restore(); })();

  // 관측자 지평선 대원
  (function(){ let u=cross(zen,[0,0,1]); if(Math.hypot(u[0],u[1],u[2])<1e-4)u=[1,0,0]; u=norm(u); const v=norm(cross(zen,u)); const pts=[];
    for(let a=0;a<=360;a+=4){const c=Math.cos(a*D2R),s=Math.sin(a*D2R); pts.push(proj(scale([u[0]*c+v[0]*s,u[1]*c+v[1]*s,u[2]*c+v[2]*s],R)));}
    sctx.save(); for(let seg=0;seg<2;seg++){ sctx.beginPath(); let st=false; for(const p of pts){const f=p.depth>=0; if((seg===0)===f){if(!st){sctx.moveTo(p.x,p.y);st=true;}else sctx.lineTo(p.x,p.y);}else st=false;} sctx.strokeStyle=seg===0?'rgba(255,255,255,0.78)':'rgba(255,255,255,0.2)'; sctx.lineWidth=seg===0?1.6:1; sctx.stroke();} sctx.restore(); })();

  // 자전축
  const axN = proj(scale([0,0,1], R*1.12)), axS = proj(scale([0,0,-1], R*1.12));
  sctx.strokeStyle = 'rgba(255,255,255,0.32)'; sctx.lineWidth = 1.3; sctx.setLineDash([2,3]);
  sctx.beginPath(); sctx.moveTo(axS.x, axS.y); sctx.lineTo(axN.x, axN.y); sctx.stroke(); sctx.setLineDash([]);

  // 지구
  const ec = proj([0,0,0]);
  const eg = sctx.createRadialGradient(ec.x - rE*S*0.4, ec.y - rE*S*0.4, rE*S*0.15, ec.x, ec.y, rE*S);
  eg.addColorStop(0, '#3d78c8'); eg.addColorStop(1, '#0e2a52');
  sctx.fillStyle = eg; sctx.beginPath(); sctx.arc(ec.x, ec.y, rE*S, 0, 7); sctx.fill();
  sctx.strokeStyle = 'rgba(160,200,255,0.5)'; sctx.lineWidth = 1; sctx.beginPath(); sctx.arc(ec.x, ec.y, rE*S, 0, 7); sctx.stroke();

  const obs = proj(scale(zen, rE)), zTip = proj(scale(zen, rE + 0.13));
  sctx.strokeStyle = '#ffd24d'; sctx.lineWidth = 2; sctx.beginPath(); sctx.moveTo(obs.x, obs.y); sctx.lineTo(zTip.x, zTip.y); sctx.stroke();
  sctx.fillStyle = '#ffd24d'; sctx.beginPath(); sctx.arc(obs.x, obs.y, 4, 0, 7); sctx.fill();
  label(sctx, axN.x, axN.y - 8, '천구 북극', 'rgba(210,225,255,0.85)', 'center');

  const proj3 = (raH, dec) => { const V = scale(eqVec(raH, dec), R); const p = proj(V); return { x: p.x, y: p.y, visible: true, above: dot(norm(V), zen) > 0 }; };
  drawPolaris(sctx, (raH, dec) => proj3(raH, dec));
  drawConstellation(sctx, (raH, dec) => proj3(raH, dec), { rScale: 0.62 });
}

// =====================================================================
//  뷰 B — 반구(하늘 돔), 사람이 가운데
// =====================================================================
const domeCanvas = document.getElementById('domeView');
const dctx = domeCanvas.getContext('2d');
let camB = { az: 250, el: 20 };

function drawDomeView() {
  const dpr = window.devicePixelRatio || 1;
  const w = domeCanvas.clientWidth, h = domeCanvas.clientHeight;
  if (domeCanvas.width !== w*dpr || domeCanvas.height !== h*dpr) { domeCanvas.width = w*dpr; domeCanvas.height = h*dpr; }
  dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dctx.clearRect(0, 0, w, h);
  const azC = camB.az * D2R, elC = camB.el * D2R;
  const camDir = [Math.cos(elC)*Math.sin(azC), Math.cos(elC)*Math.cos(azC), Math.sin(elC)];
  const right = [-Math.cos(azC), Math.sin(azC), 0];
  const up = [-Math.sin(elC)*Math.sin(azC), -Math.sin(elC)*Math.cos(azC), Math.cos(elC)];
  const S = Math.min((h - 46) / 1.28, (w - 60) / 2.05);
  const cx = w/2, cy = h/2 + (Math.cos(elC) - Math.sin(elC)) * S / 2;
  const domeR = 1;
  const proj = (Pv) => ({ x: cx + dot(Pv, right)*S, y: cy - dot(Pv, up)*S, depth: dot(Pv, camDir) });
  const P = (alt, az) => proj(scale(localVec(alt, az), domeR));
  const o0 = proj([0,0,0]);

  dctx.strokeStyle = 'rgba(130,170,255,0.13)'; dctx.lineWidth = 1;
  dctx.beginPath(); dctx.arc(o0.x, o0.y, domeR*S, 0, 7); dctx.stroke();

  const strokePts = (pts, st, lw) => { dctx.strokeStyle = st; dctx.lineWidth = lw; dctx.beginPath(); pts.forEach((p,i)=>i?dctx.lineTo(p.x,p.y):dctx.moveTo(p.x,p.y)); dctx.stroke(); };
  const parallel = (alt) => { const a=[]; for (let az=0; az<=360; az+=5) a.push(P(alt,az)); return a; };
  const meridian = (az,a0,a1) => { const a=[]; for (let alt=a0; alt<=a1; alt+=5) a.push(P(alt,az)); return a; };

  for (const alt of [-60,-30]) strokePts(parallel(alt), 'rgba(120,150,220,0.08)', 1);
  for (let az=0; az<360; az+=45) strokePts(meridian(az,-90,0), 'rgba(120,150,220,0.08)', 1);
  drawConstellation(dctx, (raH,dec,aa) => { if (aa.alt >= 0) return null; const p=P(aa.alt,aa.az); return {x:p.x,y:p.y,visible:true,above:false}; }, { rScale: 0.9 });

  const rim = []; for (let a=0; a<=360; a+=4) rim.push(P(0,a));
  dctx.beginPath(); rim.forEach((p,i)=>i?dctx.lineTo(p.x,p.y):dctx.moveTo(p.x,p.y)); dctx.closePath();
  const gg = dctx.createLinearGradient(cx, o0.y - S, cx, o0.y + S*0.45);
  gg.addColorStop(0, 'rgba(40,70,130,0.22)'); gg.addColorStop(1, 'rgba(12,22,48,0.5)');
  dctx.fillStyle = gg; dctx.fill();
  dctx.strokeStyle = 'rgba(150,190,255,0.6)'; dctx.lineWidth = 2; dctx.stroke();

  const cards = [['북',0,'#a7f3d0'],['동',90,'#cbd5f5'],['남',180,'#cbd5f5'],['서',270,'#cbd5f5']];
  for (const [t,az,col] of cards) {
    const p = P(0,az), inn = proj(scale(localVec(0,az),0.9));
    dctx.strokeStyle = 'rgba(180,205,255,0.5)'; dctx.lineWidth = 1.5;
    dctx.beginPath(); dctx.moveTo(inn.x,inn.y); dctx.lineTo(p.x,p.y); dctx.stroke();
    const ox=(p.x-o0.x)*0.10, oy=(p.y-o0.y)*0.10;
    label(dctx, p.x+ox, p.y+oy+4, t, col, 'center', 13);
  }

  for (const alt of [30,60]) strokePts(parallel(alt), 'rgba(130,170,255,0.16)', 1);
  for (let az=0; az<360; az+=45) strokePts(meridian(az,0,90), 'rgba(130,170,255,0.16)', 1);

  drawObserverDome(dctx, proj, P, S, domeR);
  drawPolaris(dctx, (raH,dec,aa) => { if (aa.alt < 0) return null; const p=P(aa.alt,aa.az); return {x:p.x,y:p.y,visible:true,above:true}; });
  drawConstellation(dctx, (raH,dec,aa) => { if (aa.alt < 0) return null; const p=P(aa.alt,aa.az); return {x:p.x,y:p.y,visible:true,above:true}; }, { rScale: 0.95 });
}
function drawObserverDome(ctx, proj, P, S, domeR) {
  const o = proj([0,0,0]), zTip = proj([0,0,domeR]);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,210,77,0.45)'; ctx.lineWidth = 1.1; ctx.setLineDash([4,5]);
  ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(zTip.x,zTip.y); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, zTip.x, zTip.y-8, '천정', 'rgba(255,210,77,0.85)', 'center', 10.5);
  const tip = proj(scale(localVec(0, state.facingAz), 0.42)), tail = proj([0,0,0]);
  ctx.strokeStyle = '#7dd3fc'; ctx.fillStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  const ang = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - 9*Math.cos(ang - 0.4), tip.y - 9*Math.sin(ang - 0.4));
  ctx.lineTo(tip.x - 9*Math.cos(ang + 0.4), tip.y - 9*Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
  const ph = Math.max(18, S * 0.12);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(o.x, o.y+1.5, ph*0.34, ph*0.12, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#ffd24d'; ctx.fillStyle = '#ffd24d'; ctx.lineWidth = Math.max(2, ph*0.09); ctx.lineCap = 'round';
  const hip = o.y - ph*0.42, sh = o.y - ph*0.70, hd = o.y - ph*0.86;
  ctx.beginPath(); ctx.moveTo(o.x, hip); ctx.lineTo(o.x, sh); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(o.x, hip); ctx.lineTo(o.x - ph*0.14, o.y); ctx.moveTo(o.x, hip); ctx.lineTo(o.x + ph*0.14, o.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(o.x, sh); ctx.lineTo(o.x - ph*0.18, sh - ph*0.14); ctx.moveTo(o.x, sh); ctx.lineTo(o.x + ph*0.18, sh - ph*0.14); ctx.stroke();
  ctx.beginPath(); ctx.arc(o.x, hd, ph*0.15, 0, 7); ctx.fill();
  ctx.restore();
}

// =====================================================================
//  뷰 C — 하늘 평면(바라보는 방향), 그노몬 투영
// =====================================================================
const skyCanvas = document.getElementById('skyView');
const kctx = skyCanvas.getContext('2d');

function drawSkyView() {
  const dpr = window.devicePixelRatio || 1;
  const w = skyCanvas.clientWidth, h = skyCanvas.clientHeight;
  if (skyCanvas.width !== w*dpr || skyCanvas.height !== h*dpr) { skyCanvas.width = w*dpr; skyCanvas.height = h*dpr; }
  kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  kctx.clearRect(0, 0, w, h);

  // 북쪽을 볼 때 북극성 고도(≈위도)에 맞춰 시선 고도 조절
  const viewAltDeg = clamp(state.facingAz === 0 ? Math.max(20, Math.abs(effLat())) : 32, 12, 70);
  const f = localVec(viewAltDeg, state.facingAz);
  const right = norm(cross(f, [0,0,1]));
  const up = cross(right, f);
  const cx = w/2, cy = h*0.5;
  const HFOV = 60 * D2R;
  const S = (w * 0.46) / Math.tan(HFOV);
  const project = (s3) => { const d = dot(s3, f); if (d <= 0.12) return null; return { x: cx + dot(s3, right)/d*S, y: cy - dot(s3, up)/d*S, d }; };

  const bg = kctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0a1330'); bg.addColorStop(1, '#0b1024');
  kctx.fillStyle = bg; kctx.fillRect(0, 0, w, h);

  const horiz = [];
  for (let daz = -90; daz <= 90; daz += 2) { const p = project(localVec(0, state.facingAz + daz)); if (p) horiz.push(p); }
  if (horiz.length > 1) {
    kctx.save(); kctx.beginPath(); horiz.forEach((p,i)=>i?kctx.lineTo(p.x,p.y):kctx.moveTo(p.x,p.y));
    kctx.lineTo(horiz[horiz.length-1].x, h); kctx.lineTo(horiz[0].x, h); kctx.closePath();
    kctx.fillStyle = 'rgba(10,16,34,0.85)'; kctx.fill(); kctx.restore();
    kctx.beginPath(); horiz.forEach((p,i)=>i?kctx.lineTo(p.x,p.y):kctx.moveTo(p.x,p.y));
    kctx.strokeStyle = 'rgba(150,190,255,0.55)'; kctx.lineWidth = 2; kctx.stroke();
  }
  kctx.strokeStyle = 'rgba(255,255,255,0.06)'; kctx.lineWidth = 1;
  for (const alt of [30, 60]) { kctx.beginPath(); let pen=false; for (let daz=-90; daz<=90; daz+=3){ const p=project(localVec(alt, state.facingAz+daz)); if(!p){pen=false;continue;} if(!pen){kctx.moveTo(p.x,p.y);pen=true;}else kctx.lineTo(p.x,p.y);} kctx.stroke(); }

  const dirName = (az) => ({0:'북',45:'북동',90:'동',135:'남동',180:'남',225:'남서',270:'서',315:'북서'}[((az%360)+360)%360] || `${Math.round(az)}°`);
  const labelDir = (daz) => { const p = project(localVec(0, state.facingAz + daz)); if (p) label(kctx, p.x, p.y + 18, dirName(state.facingAz + daz), 'rgba(200,215,255,0.8)', 'center', 12); };
  labelDir(0); labelDir(-45); labelDir(45);

  drawPolaris(kctx, (raH,dec,aa) => { if (aa.alt < -2) return null; const p=project(localVec(aa.alt,aa.az)); if(!p) return null; return {x:p.x,y:p.y,visible:true,above:aa.alt>=0}; });
  drawConstellation(kctx, (raH,dec,aa) => { if (aa.alt < -2) return null; const p=project(localVec(aa.alt,aa.az)); if(!p) return null; return {x:p.x,y:p.y,visible:true,above:aa.alt>=0}; }, { rScale: 1.1 });
  label(kctx, 12, 20, `${dirName(state.facingAz)}쪽 하늘`, 'rgba(180,200,255,0.7)', 'left', 12);
}

// ---------- 헬퍼 ----------
function label(ctx, x, y, text, color, align = 'left', size = 12) {
  ctx.save();
  ctx.font = `${size}px -apple-system, "Noto Sans KR", sans-serif`;
  ctx.textAlign = align; ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
  ctx.fillText(text, x, y); ctx.restore();
}

// =====================================================================
//  UI
// =====================================================================
const el = (id) => document.getElementById(id);
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
function dateLabel(d) {
  let day = Math.floor(((d % 365) + 365) % 365), m = 0;
  while (m < 12 && day >= MONTH_DAYS[m]) { day -= MONTH_DAYS[m]; m++; }
  return `${m+1}월 ${day+1}일`;
}
function fmtHM(th) {
  const t = ((th % 24) + 24) % 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function updateReadouts() {
  el('latOut').textContent = `${state.latitude >= 0 ? '+' : ''}${state.latitude.toFixed(1)}°`;
  el('timeOut').textContent = fmtHM(state.hour);
  el('dateOut').textContent = dateLabel(state.dayOfYear);
  el('date').value = Math.floor(((state.dayOfYear % 365) + 365) % 365);
  el('speedOut').textContent = `${state.speedMul.toFixed(2)}×`;
  const monthDeg = 360 / 12;
  el('infoHint').textContent = `같은 시각(${fmtHM(state.hour)})에 관측하면 북두칠성이 북극성을 중심으로 한 달 약 ${monthDeg.toFixed(0)}°씩 반시계로 회전합니다. 현재 날짜: ${dateLabel(state.dayOfYear)}.`;
}

el('lat').addEventListener('input', e => { state.latitude = +e.target.value; updateReadouts(); });
el('time').addEventListener('input', e => { state.hour = +e.target.value; updateReadouts(); });
el('date').addEventListener('input', e => { state.dayOfYear = +e.target.value; updateReadouts(); });
el('speed').addEventListener('input', e => { state.speedMul = +e.target.value; updateReadouts(); });
el('daily').addEventListener('change', e => { state.dailyOn = e.target.checked; });

el('facing').querySelectorAll('.dir-btn').forEach(btn => btn.addEventListener('click', () => {
  state.facingAz = +btn.dataset.az;
  el('facing').querySelectorAll('.dir-btn').forEach(b => b.classList.toggle('active', b === btn));
}));

function setPlaying(p) { state.playing = p; el('play').classList.toggle('active', p); }
el('play').addEventListener('click', () => setPlaying(true));
el('pause').addEventListener('click', () => setPlaying(false));
el('stop').addEventListener('click', () => { setPlaying(false); state.dayOfYear = 0; updateReadouts(); });

function attachDrag(canvas, cam, elFactor = 0.4) {
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; cam.az -= (e.clientX - lx) * 0.4; cam.el = clamp(cam.el + (e.clientY - ly) * elFactor, -85, 85); lx = e.clientX; ly = e.clientY; });
  canvas.addEventListener('pointerup', () => dragging = false);
  canvas.addEventListener('pointercancel', () => dragging = false);
}
attachDrag(spaceCanvas, camA);
attachDrag(domeCanvas, camB, 0.3);

// 숫자 직접 입력
function attachEditable(output, spec) {
  if (!output) return;
  output.classList.add('editable'); output.title = '클릭하여 직접 입력';
  output.addEventListener('click', () => {
    if (output.style.display === 'none') return;
    const cell = output.closest('.edit-cell') || output.parentElement;
    const input = document.createElement('input');
    input.className = 'num-input'; input.type = spec.type || 'number';
    if (input.type === 'number') { input.inputMode = 'decimal'; if (spec.min!=null) input.min = spec.min; if (spec.max!=null) input.max = spec.max; if (spec.step!=null) input.step = spec.step; }
    input.value = spec.raw();
    output.style.display = 'none'; cell.appendChild(input); input.focus(); input.select();
    let done = false;
    const finish = (commit) => { if (done) return; done = true; if (commit) { const v = spec.parse ? spec.parse(input.value) : parseFloat(input.value); if (v != null && isFinite(v)) spec.set(clamp(v, spec.min, spec.max)); } input.remove(); output.style.display = ''; spec.refresh(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  });
}
function parseTime(text) { text = String(text).trim(); if (text.includes(':')) { const [h,m]=text.split(':'); const hh=parseInt(h,10); if(isNaN(hh))return null; const mm=parseInt(m,10); return hh+(isNaN(mm)?0:mm)/60; } const v=parseFloat(text); return isFinite(v)?v:null; }
attachEditable(el('latOut'),   { raw: () => state.latitude, min: -90, max: 90, step: 0.5, refresh: updateReadouts, set: v => { state.latitude = v; el('lat').value = v; } });
attachEditable(el('timeOut'),  { type: 'text', raw: () => el('timeOut').textContent, parse: parseTime, min: 0, max: 24, refresh: updateReadouts, set: v => { state.hour = v; el('time').value = v; } });
attachEditable(el('speedOut'), { raw: () => state.speedMul, min: 0.25, max: 8, step: 0.25, refresh: updateReadouts, set: v => { state.speedMul = v; el('speed').value = v; } });

// 애니메이션: 연주(날짜) 항상, 일주(시각)는 체크 시
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (state.playing) {
    if (state.dailyOn) {
      // 하루(밤낮)가 지나는 동안 날짜는 고정, 하루가 끝나면 날짜 +1
      state.hour += dt * 4 * state.speedMul;                 // 하루 ≈ 6초(1x)
      if (state.hour >= 24) { const d = Math.floor(state.hour / 24); state.hour -= d * 24; state.dayOfYear = (state.dayOfYear + d) % 365; }
    } else {
      state.dayOfYear = (state.dayOfYear + dt * 16 * state.speedMul) % 365;  // 1년 ≈ 23초(1x)
    }
    updateReadouts();
  }
  drawSpaceView(); drawDomeView(); drawSkyView();
  requestAnimationFrame(loop);
}

updateReadouts();
requestAnimationFrame(loop);

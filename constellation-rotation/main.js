// 별자리의 일주 회전 (Diurnal rotation of a constellation)
// 순수 캔버스 + 구면천문. 외부 라이브러리 없음.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const scale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

// 적경(시간)·적위(도) → 적도좌표계 단위벡터 (z = 천구 북극)
function eqVec(raHours, decDeg) {
  const a = raHours * 15 * D2R, d = decDeg * D2R;
  return [Math.cos(d)*Math.cos(a), Math.cos(d)*Math.sin(a), Math.sin(d)];
}
// 지평좌표(고도·방위) → 국소 단위벡터 [동, 북, 위]
function localVec(alt, az) {
  const al = alt * D2R, a = az * D2R;
  return [Math.cos(al)*Math.sin(a), Math.cos(al)*Math.cos(a), Math.sin(al)];
}

// ---------- 별자리 (오리온자리, 중심=벨트 가운데) ----------
// da: 적경 오프셋(도), dd: 적위 오프셋(도), size: 밝기(반지름 배율)
const RA0 = 180; // 중심 적경(도) → 경과 시각 12시에 남중, 6시에 출, 18시에 몰(δ=0)
const CONSTELLATION = {
  name: '오리온자리',
  stars: [
    { key: 'betelgeuse', name: '', da: -6.5, dd: 8.5,  size: 2.7 },
    { key: 'bellatrix',  name: '', da: 5.5,  dd: 9.0,  size: 2.0 },
    { key: 'mintaka',    name: '', da: 2.0,  dd: 0.7,  size: 1.8 },
    { key: 'alnilam',    name: '', da: 0.0,  dd: 0.0,  size: 1.9 },
    { key: 'alnitak',    name: '', da: -2.0, dd: -0.7, size: 1.8 },
    { key: 'saiph',      name: '', da: -5.0, dd: -10.0, size: 2.0 },
    { key: 'rigel',      name: '', da: 6.0,  dd: -10.5, size: 2.7 },
  ],
  lines: [
    ['betelgeuse', 'bellatrix'],
    ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'],
    ['alnitak', 'alnilam'], ['alnilam', 'mintaka'],
    ['saiph', 'alnitak'], ['rigel', 'mintaka'],
    ['saiph', 'rigel'],
  ],
  color: '#bcd3ff',
};

// ---------- 상태 ----------
const state = {
  latitude: 37.5,
  centerDec: 0,
  timeHours: 6,
  playing: false,
  speedMul: 1,
  facingAz: 90, // 동
};
const effLat = () => clamp(state.latitude, -89.5, 89.5);
const LSTdeg = () => state.timeHours * 15;

// 별의 (적경h, 적위) — 중심 적위를 반영
function starEq(st) {
  return { raH: (RA0 + st.da) / 15, dec: state.centerDec + st.dd };
}

// 지평좌표(고도·방위)
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

// 관측자 천정(적도좌표계) — 우주 뷰의 지평선 계산용
function zenithVec() {
  const phi = effLat() * D2R, lonR = LSTdeg() * D2R;
  return [Math.cos(phi)*Math.cos(lonR), Math.cos(phi)*Math.sin(lonR), Math.sin(phi)];
}

// 중심 별자리의 출몰 정보
function riseInfo() {
  const phi = effLat(), dec = state.centerDec;
  const altMax = 90 - Math.abs(phi - dec);
  const altMin = Math.asin(clamp(Math.sin(phi*D2R)*Math.sin(dec*D2R) - Math.cos(phi*D2R)*Math.cos(dec*D2R), -1, 1)) * R2D;
  if (altMin > 0) return { kind: 'circumpolar' };
  if (altMax < 0) return { kind: 'never' };
  const cosA = Math.sin(dec*D2R) / Math.cos(phi*D2R);
  const A = Math.acos(clamp(cosA, -1, 1)) * R2D; // 뜨는 방위(북=0 기준)
  return { kind: 'riseset', riseAz: A, setAz: 360 - A };
}

// ---------- 별 목록(현재 프레임) ----------
function starList() {
  return CONSTELLATION.stars.map(st => {
    const eq = starEq(st);
    const aa = altAz(eq.raH, eq.dec);
    return { ...st, ...eq, aa };
  });
}

// =====================================================================
//  공용: 별자리 그리기 (프로젝터·가시성 함수 주입)
// =====================================================================
function drawConstellation(ctx, project, opts = {}) {
  const stars = starList();
  const pts = {};
  for (const s of stars) {
    const pr = project(s);           // { x, y, visible, above }  또는 null
    if (pr) pts[s.key] = { ...pr, s };
  }
  // 선
  ctx.save();
  for (const [a, b] of CONSTELLATION.lines) {
    const pa = pts[a], pb = pts[b];
    if (!pa || !pb || !pa.visible || !pb.visible) continue;
    const bothAbove = pa.above && pb.above;
    ctx.strokeStyle = bothAbove ? 'rgba(150,190,255,0.7)' : 'rgba(150,190,255,0.18)';
    ctx.lineWidth = bothAbove ? 1.8 : 1.2;
    if (!bothAbove) ctx.setLineDash([4, 4]); else ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // 별
  for (const key in pts) {
    const p = pts[key]; const s = p.s;
    if (!p.visible) continue;
    const r = (opts.rScale || 1) * (1.6 + s.size);
    ctx.globalAlpha = p.above ? 1 : 0.35;
    ctx.fillStyle = s.key === 'betelgeuse' ? '#ff9d6b' : (s.key === 'rigel' ? '#bcd6ff' : '#eaf1ff');
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = p.above ? 8 : 0;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    if (s.name && p.above && opts.labels !== false) {
      label(ctx, p.x + r + 3, p.y + 4, s.name, 'rgba(220,230,255,0.9)', 'left', 10.5);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// =====================================================================
//  뷰 A — 천구(바깥에서 본 모습)
// =====================================================================
const spaceCanvas = document.getElementById('spaceView');
const sctx = spaceCanvas.getContext('2d');
let camA = { az: -62, el: 20 };

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
  const B = camBasis(camA);
  const zen = zenithVec();
  const proj = (P) => ({ x: cx + dot(P, B.right)*S, y: cy - dot(P, B.up)*S, depth: dot(P, B.camDir) });

  // 천구 외곽
  sctx.strokeStyle = 'rgba(122,162,255,0.18)'; sctx.lineWidth = 1;
  sctx.beginPath(); sctx.arc(cx, cy, S*R, 0, 7); sctx.stroke();

  const drawGreatOrSmall = (decDeg, front, back, dash) => {
    const pts = [];
    for (let a = 0; a <= 360; a += 4) pts.push(proj(scale(eqVec(a/15, decDeg), R)));
    sctx.save(); if (dash) sctx.setLineDash(dash);
    for (let seg = 0; seg < 2; seg++) {
      sctx.beginPath(); let started = false;
      for (const p of pts) {
        const isFront = p.depth >= 0;
        if ((seg === 0) === isFront) { if (!started) { sctx.moveTo(p.x, p.y); started = true; } else sctx.lineTo(p.x, p.y); }
        else started = false;
      }
      sctx.strokeStyle = seg === 0 ? front : back; sctx.lineWidth = seg === 0 ? 1.5 : 1; sctx.stroke();
    }
    sctx.restore();
  };
  // 천구 적도(강조)
  drawGreatOrSmall(0, 'rgba(120,200,255,0.85)', 'rgba(120,200,255,0.22)');

  // 관측자 지평선 대원
  {
    let u = cross(zen, [0,0,1]); if (Math.hypot(u[0],u[1],u[2]) < 1e-4) u = [1,0,0]; u = norm(u);
    const v = norm(cross(zen, u)); const pts = [];
    for (let a = 0; a <= 360; a += 4) {
      const c = Math.cos(a*D2R), s = Math.sin(a*D2R);
      pts.push(proj(scale([u[0]*c+v[0]*s, u[1]*c+v[1]*s, u[2]*c+v[2]*s], R)));
    }
    sctx.save();
    for (let seg = 0; seg < 2; seg++) {
      sctx.beginPath(); let started = false;
      for (const p of pts) { const f = p.depth >= 0; if ((seg===0)===f) { if(!started){sctx.moveTo(p.x,p.y);started=true;} else sctx.lineTo(p.x,p.y);} else started=false; }
      sctx.strokeStyle = seg===0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.2)'; sctx.lineWidth = seg===0?1.6:1; sctx.stroke();
    }
    sctx.restore();
  }

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

  // 관측자 + 천정
  const obs = proj(scale(zen, rE)), zTip = proj(scale(zen, rE + 0.13));
  sctx.strokeStyle = '#ffd24d'; sctx.lineWidth = 2; sctx.beginPath(); sctx.moveTo(obs.x, obs.y); sctx.lineTo(zTip.x, zTip.y); sctx.stroke();
  sctx.fillStyle = '#ffd24d'; sctx.beginPath(); sctx.arc(obs.x, obs.y, 4, 0, 7); sctx.fill();

  label(sctx, axN.x, axN.y - 8, '천구 북극', 'rgba(210,225,255,0.85)', 'center');
  // 적도 라벨
  const eqLab = proj(scale(eqVec(6, 0), R));
  if (eqLab.depth >= 0) label(sctx, eqLab.x, eqLab.y - 6, '천구 적도', 'rgba(120,200,255,0.8)', 'center', 10.5);

  // 별자리 (천구에 고정)
  drawConstellation(sctx, (s) => {
    const V = scale(eqVec(s.raH, s.dec), R);
    const p = proj(V);
    const above = dot(norm(V), zen) > 0;
    return { x: p.x, y: p.y, visible: true, above };
  }, { rScale: 0.62, labels: false });
}

// =====================================================================
//  뷰 B — 반구(하늘 돔), 사람이 가운데
// =====================================================================
const domeCanvas = document.getElementById('domeView');
const dctx = domeCanvas.getContext('2d');
let camB = { az: 250, el: 18 };

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

  // 구 둘레
  dctx.strokeStyle = 'rgba(130,170,255,0.13)'; dctx.lineWidth = 1;
  dctx.beginPath(); dctx.arc(o0.x, o0.y, domeR*S, 0, 7); dctx.stroke();

  const strokePts = (pts, st, lw) => { dctx.strokeStyle = st; dctx.lineWidth = lw; dctx.beginPath(); pts.forEach((p,i)=>i?dctx.lineTo(p.x,p.y):dctx.moveTo(p.x,p.y)); dctx.stroke(); };
  const parallel = (alt) => { const a=[]; for (let az=0; az<=360; az+=5) a.push(P(alt,az)); return a; };
  const meridian = (az,a0,a1) => { const a=[]; for (let alt=a0; alt<=a1; alt+=5) a.push(P(alt,az)); return a; };

  // 아래 반구
  for (const alt of [-60,-30]) strokePts(parallel(alt), 'rgba(120,150,220,0.08)', 1);
  for (let az=0; az<360; az+=45) strokePts(meridian(az,-90,0), 'rgba(120,150,220,0.08)', 1);
  // 천구 적도(하늘에서의 자취): 지평좌표로 그린 소원 — 아래쪽
  drawEquatorArc(P, false);
  // 별자리 아래(지평선 아래) 부분
  drawConstellation(dctx, (s) => {
    if (s.aa.alt >= 0) return null;
    const p = P(s.aa.alt, s.aa.az); return { x: p.x, y: p.y, visible: true, above: false };
  }, { rScale: 0.9, labels: false });

  // 지평면(반투명)
  const rim = []; for (let a=0; a<=360; a+=4) rim.push(P(0,a));
  dctx.beginPath(); rim.forEach((p,i)=>i?dctx.lineTo(p.x,p.y):dctx.moveTo(p.x,p.y)); dctx.closePath();
  const gg = dctx.createLinearGradient(cx, o0.y - S, cx, o0.y + S*0.45);
  gg.addColorStop(0, 'rgba(40,70,130,0.22)'); gg.addColorStop(1, 'rgba(12,22,48,0.5)');
  dctx.fillStyle = gg; dctx.fill();
  dctx.strokeStyle = 'rgba(150,190,255,0.6)'; dctx.lineWidth = 2; dctx.stroke();

  // 방위 라벨
  const cards = [['북',0,'#9ec1ff'],['동',90,'#a7f3d0'],['남',180,'#cbd5f5'],['서',270,'#fca5a5']];
  for (const [t,az,col] of cards) {
    const p = P(0,az), inn = proj(scale(localVec(0,az),0.9));
    dctx.strokeStyle = 'rgba(180,205,255,0.5)'; dctx.lineWidth = 1.5;
    dctx.beginPath(); dctx.moveTo(inn.x,inn.y); dctx.lineTo(p.x,p.y); dctx.stroke();
    const ox=(p.x-o0.x)*0.10, oy=(p.y-o0.y)*0.10;
    label(dctx, p.x+ox, p.y+oy+4, t, col, 'center', 13);
  }

  // 위 반구
  for (const alt of [30,60]) strokePts(parallel(alt), 'rgba(130,170,255,0.16)', 1);
  for (let az=0; az<360; az+=45) strokePts(meridian(az,0,90), 'rgba(130,170,255,0.16)', 1);
  drawEquatorArc(P, true);

  // 관측자 + 바라보는 방향 화살표
  drawObserverDome(dctx, proj, P, S, domeR);

  // 별자리 위(지평선 위)
  drawConstellation(dctx, (s) => {
    if (s.aa.alt < 0) return null;
    const p = P(s.aa.alt, s.aa.az); return { x: p.x, y: p.y, visible: true, above: true };
  }, { rScale: 0.95 });

  // 천구 적도 자취를 지평좌표로 그리기
  function drawEquatorArc(Pfn, wantAbove) {
    const phi = effLat()*D2R;
    dctx.save(); dctx.strokeStyle = wantAbove ? 'rgba(120,200,255,0.5)' : 'rgba(120,200,255,0.14)';
    dctx.lineWidth = wantAbove ? 1.3 : 1; if (!wantAbove) dctx.setLineDash([3,4]);
    dctx.beginPath(); let pen = false;
    for (let Hd = 0; Hd <= 360; Hd += 3) {
      const H = Hd*D2R;
      const sinAlt = Math.cos(phi)*Math.cos(H); // δ=0
      const alt = Math.asin(clamp(sinAlt,-1,1))*R2D;
      if ((alt >= 0) !== wantAbove) { pen = false; continue; }
      const cosAlt = Math.cos(alt*D2R);
      const sinA = -Math.sin(H)/cosAlt;
      const cosA = (-Math.sin(phi)*Math.sin(alt*D2R))/(Math.cos(phi)*cosAlt);
      const az = (Math.atan2(sinA,cosA)*R2D+360)%360;
      const p = Pfn(alt, az);
      if (!pen) { dctx.moveTo(p.x,p.y); pen=true; } else dctx.lineTo(p.x,p.y);
    }
    dctx.stroke(); dctx.restore();
  }
}

function drawObserverDome(ctx, proj, P, S, domeR) {
  const o = proj([0,0,0]);
  const zTip = proj([0,0,domeR]);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,210,77,0.45)'; ctx.lineWidth = 1.1; ctx.setLineDash([4,5]);
  ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(zTip.x,zTip.y); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, zTip.x, zTip.y-8, '천정', 'rgba(255,210,77,0.85)', 'center', 10.5);

  // 바라보는 방향 화살표 (지평면 위)
  const tip = proj(scale(localVec(0, state.facingAz), 0.42));
  const tail = proj([0,0,0]);
  ctx.strokeStyle = '#7dd3fc'; ctx.fillStyle = '#7dd3fc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
  const ang = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - 9*Math.cos(ang - 0.4), tip.y - 9*Math.sin(ang - 0.4));
  ctx.lineTo(tip.x - 9*Math.cos(ang + 0.4), tip.y - 9*Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();

  // 발밑 그림자 + 사람
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

  const viewAltDeg = 32;
  const f = localVec(viewAltDeg, state.facingAz);
  const right = norm(cross(f, [0,0,1]));
  const up = cross(right, f);
  const cx = w/2, cy = h*0.52;
  const HFOV = 58 * D2R;
  const S = (w * 0.46) / Math.tan(HFOV);

  const project = (s3) => {
    const d = dot(s3, f);
    if (d <= 0.12) return null;
    return { x: cx + dot(s3, right)/d * S, y: cy - dot(s3, up)/d * S, d };
  };

  // 배경(하늘 그라데이션)
  const bg = kctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0a1330'); bg.addColorStop(1, '#0b1024');
  kctx.fillStyle = bg; kctx.fillRect(0, 0, w, h);

  // 지평선 곡선 + 지면
  const horiz = [];
  for (let daz = -90; daz <= 90; daz += 2) {
    const p = project(localVec(0, state.facingAz + daz));
    if (p) horiz.push(p);
  }
  if (horiz.length > 1) {
    kctx.beginPath(); horiz.forEach((p,i)=>i?kctx.lineTo(p.x,p.y):kctx.moveTo(p.x,p.y));
    // 지면 채우기
    kctx.save();
    kctx.lineTo(horiz[horiz.length-1].x, h); kctx.lineTo(horiz[0].x, h); kctx.closePath();
    kctx.fillStyle = 'rgba(10,16,34,0.85)'; kctx.fill(); kctx.restore();
    kctx.beginPath(); horiz.forEach((p,i)=>i?kctx.lineTo(p.x,p.y):kctx.moveTo(p.x,p.y));
    kctx.strokeStyle = 'rgba(150,190,255,0.55)'; kctx.lineWidth = 2; kctx.stroke();
  }

  // 고도 눈금선(30/60°) — 바라보는 방위 기준 소원
  kctx.strokeStyle = 'rgba(255,255,255,0.06)'; kctx.lineWidth = 1;
  for (const alt of [30, 60]) {
    kctx.beginPath(); let pen = false;
    for (let daz = -90; daz <= 90; daz += 3) {
      const p = project(localVec(alt, state.facingAz + daz));
      if (!p) { pen = false; continue; }
      if (!pen) { kctx.moveTo(p.x,p.y); pen = true; } else kctx.lineTo(p.x,p.y);
    }
    kctx.stroke();
  }
  // 수직 기준선 (바라보는 방위의 수직권)
  kctx.strokeStyle = 'rgba(255,255,255,0.08)'; kctx.setLineDash([4,5]);
  kctx.beginPath(); let vpen = false;
  for (let alt = 0; alt <= 88; alt += 3) {
    const p = project(localVec(alt, state.facingAz));
    if (!p) { vpen = false; continue; }
    if (!vpen) { kctx.moveTo(p.x,p.y); vpen = true; } else kctx.lineTo(p.x,p.y);
  }
  kctx.stroke(); kctx.setLineDash([]);

  // 방위 라벨(정면 + 좌우)
  const dirName = (az) => ({0:'북',45:'북동',90:'동',135:'남동',180:'남',225:'남서',270:'서',315:'북서'}[((az%360)+360)%360] || `${Math.round(az)}°`);
  const labelDir = (daz) => {
    const p = project(localVec(0, state.facingAz + daz));
    if (p) label(kctx, p.x, p.y + 18, dirName(state.facingAz + daz), 'rgba(200,215,255,0.8)', 'center', 12);
  };
  labelDir(0); labelDir(-45); labelDir(45);

  // 별자리
  drawConstellation(kctx, (s) => {
    if (s.aa.alt < -2) return null;
    const p = project(localVec(s.aa.alt, s.aa.az));
    if (!p) return null;
    return { x: p.x, y: p.y, visible: true, above: s.aa.alt >= 0 };
  }, { rScale: 1.15 });

  // 안내
  label(kctx, 12, 20, `${dirName(state.facingAz)}쪽 하늘`, 'rgba(180,200,255,0.7)', 'left', 12);
}

// ---------- 공용 헬퍼 ----------
function label(ctx, x, y, text, color, align = 'left', size = 12) {
  ctx.save();
  ctx.font = `${size}px -apple-system, "Noto Sans KR", sans-serif`;
  ctx.textAlign = align; ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// =====================================================================
//  UI 배선
// =====================================================================
const el = (id) => document.getElementById(id);

function updateReadouts() {
  el('latOut').textContent = `${state.latitude >= 0 ? '+' : ''}${state.latitude.toFixed(1)}°`;
  el('decOut').textContent = `${state.centerDec >= 0 ? '+' : ''}${state.centerDec}°`;
  const th = ((state.timeHours % 24) + 24) % 24;
  const hh = Math.floor(th), mm = Math.floor((th - hh) * 60);
  el('timeOut').textContent = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  el('time').value = th;
  el('speedOut').textContent = `${state.speedMul.toFixed(2)}×`;

  // 출몰 안내
  const info = riseInfo();
  let msg;
  if (info.kind === 'circumpolar') msg = `이 위도에서 별자리(중심 적위 ${state.centerDec}°)는 지평선 아래로 지지 않는 주극 별자리입니다.`;
  else if (info.kind === 'never') msg = `이 위도에서 별자리(중심 적위 ${state.centerDec}°)는 지평선 위로 뜨지 않습니다.`;
  else if (Math.abs(state.centerDec) < 0.5) msg = `적위 0°: 정동(방위 90°)에서 떠서 정서(270°)로 집니다. 위도에 따라 하늘에서의 기울기·회전이 달라집니다.`;
  else {
    const d = (state.centerDec > 0 ? '북' : '남');
    msg = `적위 ${state.centerDec}°: 정동보다 ${d}쪽인 방위 ${info.riseAz.toFixed(0)}°에서 떠서 방위 ${info.setAz.toFixed(0)}°로 집니다.`;
  }
  el('riseHint').textContent = msg;
}

function updateFacingHint() {
  const map = { 0: '북', 90: '동', 180: '남', 270: '서' };
  const n = map[state.facingAz] || `${state.facingAz}°`;
  const extra = state.facingAz === 90 ? '별자리가 지평선에서 떠오르는 모습' :
                state.facingAz === 270 ? '별자리가 지평선으로 지는 모습' :
                state.facingAz === 180 ? '별자리가 가장 높이 남중하는 모습(북반구)' :
                '별자리가 잘 보이지 않을 수 있음(북반구)';
  el('facingHint').textContent = `${n}쪽을 바라봅니다 — ${extra}.`;
}

// 슬라이더
el('lat').addEventListener('input', e => { state.latitude = +e.target.value; updateReadouts(); });
el('dec').addEventListener('input', e => { state.centerDec = +e.target.value; updateReadouts(); });
el('time').addEventListener('input', e => { state.timeHours = +e.target.value; updateReadouts(); });
el('speed').addEventListener('input', e => { state.speedMul = +e.target.value; updateReadouts(); });

// 방위 버튼
el('facing').querySelectorAll('.dir-btn').forEach(btn => btn.addEventListener('click', () => {
  state.facingAz = +btn.dataset.az;
  el('facing').querySelectorAll('.dir-btn').forEach(b => b.classList.toggle('active', b === btn));
  updateFacingHint();
}));

// 재생 컨트롤
function setPlaying(p) { state.playing = p; el('play').classList.toggle('active', p); }
el('play').addEventListener('click', () => setPlaying(true));
el('pause').addEventListener('click', () => setPlaying(false));
el('stop').addEventListener('click', () => { setPlaying(false); state.timeHours = 6; updateReadouts(); });

// 카메라 드래그 (뷰 A, 뷰 B)
function attachDrag(canvas, cam, elFactor = 0.4) {
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    cam.az -= (e.clientX - lx) * 0.4;
    cam.el = clamp(cam.el + (e.clientY - ly) * elFactor, -85, 85);
    lx = e.clientX; ly = e.clientY;
  });
  canvas.addEventListener('pointerup', () => dragging = false);
  canvas.addEventListener('pointercancel', () => dragging = false);
}
attachDrag(spaceCanvas, camA);
attachDrag(domeCanvas, camB, 0.3);

// ---------- 숫자 클릭 → 직접 입력 ----------
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
    const finish = (commit) => {
      if (done) return; done = true;
      if (commit) { const v = spec.parse ? spec.parse(input.value) : parseFloat(input.value); if (v != null && isFinite(v)) spec.set(clamp(v, spec.min, spec.max)); }
      input.remove(); output.style.display = ''; spec.refresh();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  });
}
function parseTime(text) {
  text = String(text).trim();
  if (text.includes(':')) { const [h,m] = text.split(':'); const hh = parseInt(h,10); if (isNaN(hh)) return null; const mm = parseInt(m,10); return hh + (isNaN(mm)?0:mm)/60; }
  const v = parseFloat(text); return isFinite(v) ? v : null;
}
attachEditable(el('latOut'),   { raw: () => state.latitude,  min: -90,  max: 90,  step: 0.5, refresh: updateReadouts, set: v => { state.latitude = v; el('lat').value = v; } });
attachEditable(el('decOut'),   { raw: () => state.centerDec, min: -80,  max: 80,  step: 1,   refresh: updateReadouts, set: v => { state.centerDec = v; el('dec').value = v; } });
attachEditable(el('timeOut'),  { type: 'text', raw: () => el('timeOut').textContent, parse: parseTime, min: 0, max: 24, refresh: updateReadouts, set: v => { state.timeHours = v; el('time').value = v; } });
attachEditable(el('speedOut'), { raw: () => state.speedMul, min: 0.25, max: 8, step: 0.25, refresh: updateReadouts, set: v => { state.speedMul = v; el('speed').value = v; } });

// ---------- 애니메이션 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (state.playing) { state.timeHours = (state.timeHours + dt * 2 * state.speedMul) % 24; updateReadouts(); }
  drawSpaceView(); drawDomeView(); drawSkyView();
  requestAnimationFrame(loop);
}

// ---------- 초기화 ----------
updateReadouts();
updateFacingHint();
requestAnimationFrame(loop);

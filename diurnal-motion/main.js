// 별들의 일주운동 (Diurnal motion of stars)
// 순수 캔버스 + 구면천문 계산. 외부 라이브러리 없음.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- 벡터 유틸 ----------
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const scale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

// 적경(시간)·적위(도) → 적도좌표계 단위벡터 (z축 = 천구 북극)
function eqVec(raHours, decDeg) {
  const a = raHours * 15 * D2R, d = decDeg * D2R;
  return [Math.cos(d)*Math.cos(a), Math.cos(d)*Math.sin(a), Math.sin(d)];
}

// ---------- 별 팩토리 (추가/삭제 지원) ----------
const STAR_PALETTE = ['#ff6b6b', '#4dd2ff', '#ffd24d', '#4ade80', '#c084fc', '#fb923c', '#f472b6', '#a3e635'];
const DEC_CYCLE = [50, 30, -30, 0, 75, -50, 15, -20];
const MAX_STARS = 8;
let starCounter = 0;
function makeStar(ra, dec) {
  const idx = starCounter++;
  const letter = idx < 26 ? String.fromCharCode(65 + idx) : String(idx + 1);
  return {
    id: 'star' + idx,
    name: '별 ' + letter,
    ra: ra != null ? ra : (idx * 4) % 24,
    dec: dec != null ? dec : DEC_CYCLE[idx % DEC_CYCLE.length],
    color: STAR_PALETTE[idx % STAR_PALETTE.length],
  };
}

// ---------- 상태 ----------
const state = {
  latitude: 37.5,
  longitude: 127,
  timeHours: 0,      // 0..24
  playing: false,
  speedMul: 1,       // 재생 속도 배율
  stars: [makeStar(3, 70), makeStar(9, 10), makeStar(15, -60)],
  // 참고 천체 (편집 불가)
  refs: [
    { name: '북극성', ra: 2.53,  dec: 89.26, color: '#ffffff' },
    { name: '남십자성', ra: 12.45, dec: -60,   color: '#c4b5fd' },
  ],
};

// 위도는 극점 특이점을 피하려 살짝 제한
const effLat = () => clamp(state.latitude, -89.5, 89.5);

// ---------- 구면천문 ----------
// 지방시(도): 시간과 경도로 결정
const localSiderealDeg = () => state.timeHours * 15 + state.longitude;

// 관측자 천정 방향(적도좌표계 단위벡터)
function zenithVec() {
  const phi = effLat() * D2R;
  const lonR = localSiderealDeg() * D2R;
  return [Math.cos(phi)*Math.cos(lonR), Math.cos(phi)*Math.sin(lonR), Math.sin(phi)];
}

// 별의 지평좌표(고도·방위) 계산
function altAz(raHours, decDeg) {
  const phi = effLat() * D2R, d = decDeg * D2R;
  const H = (localSiderealDeg() - raHours * 15) * D2R;   // 시간각
  const sinAlt = Math.sin(phi)*Math.sin(d) + Math.cos(phi)*Math.cos(d)*Math.cos(H);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  const cosAlt = Math.cos(alt);
  let az;
  if (cosAlt < 1e-7) { az = 0; }
  else {
    const sinA = -Math.cos(d) * Math.sin(H) / cosAlt;
    const cosA = (Math.sin(d) - Math.sin(phi) * sinAlt) / (Math.cos(phi) * cosAlt);
    az = (Math.atan2(sinA, cosA) * R2D + 360) % 360; // 북=0, 동=90
  }
  return { alt: alt * R2D, az };
}

// 분류: 주극성 / 출몰성 / 전몰성 (시간과 무관, 위도·적위로 결정)
function classify(decDeg) {
  const phi = effLat() * D2R, d = decDeg * D2R;
  const altMax = 90 - Math.abs(effLat() - decDeg);
  const altMin = Math.asin(clamp(Math.sin(phi)*Math.sin(d) - Math.cos(phi)*Math.cos(d), -1, 1)) * R2D;
  if (altMin > 1e-6) return { key: 'circumpolar', label: '주극성' };
  if (altMax < -1e-6) return { key: 'neverrise', label: '전몰성' };
  return { key: 'risesets', label: '출몰성' };
}

// =====================================================================
//  뷰 A — 우주에서 본 천구·지구 (직교 투영 미니 3D)
// =====================================================================
const spaceCanvas = document.getElementById('spaceView');
const sctx = spaceCanvas.getContext('2d');
let cam = { az: -62, el: 20 };   // 카메라 방위·고도(도)

function camBasis() {
  const azC = cam.az * D2R, elC = cam.el * D2R;
  const camDir = [Math.cos(elC)*Math.cos(azC), Math.cos(elC)*Math.sin(azC), Math.sin(elC)];
  const right  = [-Math.sin(azC), Math.cos(azC), 0];
  const up     = [-Math.sin(elC)*Math.cos(azC), -Math.sin(elC)*Math.sin(azC), Math.cos(elC)];
  return { camDir, right, up };
}

function drawSpaceView() {
  const dpr = window.devicePixelRatio || 1;
  const w = spaceCanvas.clientWidth, h = spaceCanvas.clientHeight;
  if (spaceCanvas.width !== w*dpr || spaceCanvas.height !== h*dpr) {
    spaceCanvas.width = w*dpr; spaceCanvas.height = h*dpr;
  }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, w, h);

  const cx = w/2, cy = h/2;
  const R = 1;                       // 천구 반지름(월드 단위)
  const rE = 0.16;                   // 지구 반지름
  const S = Math.min(w, h) * 0.44;   // 화면 스케일
  const B = camBasis();
  const zen = zenithVec();

  const proj = (P) => ({
    x: cx + dot(P, B.right) * S,
    y: cy - dot(P, B.up) * S,
    depth: dot(P, B.camDir),
  });

  // --- 배경 별먼지 ---
  sctx.save();
  for (let i = 0; i < 120; i++) {
    const a = (i * 2.399963) % (2*Math.PI);
    const rr = (S*0.98) * Math.sqrt(((i*0.618)%1));
    sctx.fillStyle = `rgba(255,255,255,${0.05 + (i%5)*0.02})`;
    sctx.beginPath();
    sctx.arc(cx + Math.cos(a)*rr, cy + Math.sin(a)*rr*0.66, (i%3)?0.6:1.0, 0, 7);
    sctx.fill();
  }
  sctx.restore();

  // --- 천구 외곽 원 ---
  sctx.strokeStyle = 'rgba(122,162,255,0.20)';
  sctx.lineWidth = 1;
  sctx.beginPath(); sctx.arc(cx, cy, S*R, 0, 7); sctx.stroke();

  // 소원(작은 원: 적위 일정) 그리기 헬퍼 — 앞/뒤 반으로 나눠 원근 표현
  function drawParallel(decDeg, front, back, dash) {
    const pts = [];
    for (let a = 0; a <= 360; a += 4) pts.push(proj(scale(eqVec(a/15, decDeg), R)));
    sctx.save();
    if (dash) sctx.setLineDash(dash);
    for (let seg = 0; seg < 2; seg++) {
      sctx.beginPath();
      let started = false;
      for (const p of pts) {
        const isFront = p.depth >= 0;
        if ((seg === 0) === isFront) {
          if (!started) { sctx.moveTo(p.x, p.y); started = true; }
          else sctx.lineTo(p.x, p.y);
        } else { started = false; }
      }
      sctx.strokeStyle = seg === 0 ? front : back;
      sctx.lineWidth = seg === 0 ? 1.4 : 1;
      sctx.stroke();
    }
    sctx.restore();
  }

  // 적도
  drawParallel(0, 'rgba(120,200,255,0.75)', 'rgba(120,200,255,0.20)');
  // 주극성/전몰성 경계 (해당 반구 쪽만 의미)
  const lat = effLat();
  if (Math.abs(lat) < 89) {
    const cpDec = 90 - Math.abs(lat);      // 주극 경계
    const nrDec = -(90 - Math.abs(lat));   // 전몰 경계
    drawParallel(lat >= 0 ? cpDec : -cpDec, 'rgba(74,222,128,0.55)', 'rgba(74,222,128,0.15)', [5,4]);
    drawParallel(lat >= 0 ? nrDec : -nrDec, 'rgba(248,113,113,0.5)', 'rgba(248,113,113,0.13)', [5,4]);
  }

  // --- 관측자 지평선 대원 (천정에 수직인 평면) ---
  {
    let u = cross(zen, [0,0,1]);
    if (Math.hypot(u[0],u[1],u[2]) < 1e-4) u = [1,0,0];
    u = norm(u);
    const v = norm(cross(zen, u));
    const pts = [];
    for (let a = 0; a <= 360; a += 4) {
      const P = scale([u[0]*Math.cos(a*D2R)+v[0]*Math.sin(a*D2R),
                       u[1]*Math.cos(a*D2R)+v[1]*Math.sin(a*D2R),
                       u[2]*Math.cos(a*D2R)+v[2]*Math.sin(a*D2R)], R);
      pts.push(proj(P));
    }
    sctx.save();
    for (let seg = 0; seg < 2; seg++) {
      sctx.beginPath(); let started = false;
      for (const p of pts) {
        const isFront = p.depth >= 0;
        if ((seg===0)===isFront) { if(!started){sctx.moveTo(p.x,p.y);started=true;} else sctx.lineTo(p.x,p.y); }
        else started = false;
      }
      sctx.strokeStyle = seg===0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.22)';
      sctx.lineWidth = seg===0 ? 1.8 : 1;
      sctx.stroke();
    }
    sctx.restore();
  }

  // --- 자전축 ---
  const axN = proj(scale([0,0,1], R*1.12)), axS = proj(scale([0,0,-1], R*1.12));
  sctx.strokeStyle = 'rgba(255,255,255,0.35)'; sctx.lineWidth = 1.4;
  sctx.setLineDash([2,3]);
  sctx.beginPath(); sctx.moveTo(axS.x, axS.y); sctx.lineTo(axN.x, axN.y); sctx.stroke();
  sctx.setLineDash([]);

  // --- 지구 ---
  const earthC = proj([0,0,0]);
  const eg = sctx.createRadialGradient(earthC.x - rE*S*0.4, earthC.y - rE*S*0.4, rE*S*0.15, earthC.x, earthC.y, rE*S);
  eg.addColorStop(0, '#3d78c8'); eg.addColorStop(1, '#0e2a52');
  sctx.fillStyle = eg;
  sctx.beginPath(); sctx.arc(earthC.x, earthC.y, rE*S, 0, 7); sctx.fill();
  sctx.strokeStyle = 'rgba(160,200,255,0.5)'; sctx.lineWidth = 1;
  sctx.beginPath(); sctx.arc(earthC.x, earthC.y, rE*S, 0, 7); sctx.stroke();

  // 관측자 점 + 천정 방향
  const obs = proj(scale(zen, rE));
  const zTip = proj(scale(zen, rE + 0.13));
  sctx.strokeStyle = '#ffd24d'; sctx.lineWidth = 2;
  sctx.beginPath(); sctx.moveTo(obs.x, obs.y); sctx.lineTo(zTip.x, zTip.y); sctx.stroke();
  sctx.fillStyle = '#ffd24d';
  sctx.beginPath(); sctx.arc(obs.x, obs.y, 4, 0, 7); sctx.fill();
  label(sctx, zTip.x, zTip.y - 8, '천정', '#ffd24d', 'center');

  // --- 극 라벨 ---
  label(sctx, axN.x, axN.y - 8, '천구 북극', 'rgba(210,225,255,0.9)', 'center');
  label(sctx, axS.x, axS.y + 14, '천구 남극', 'rgba(210,225,255,0.7)', 'center');

  // --- 별 그리기 (참고 + 편집) : 천구에 고정 ---
  const drawStar = (raHours, decDeg, color, name, big) => {
    const V = scale(eqVec(raHours, decDeg), R);
    const p = proj(V);
    const above = dot(norm(V), zen) > 0;      // 관측자 지평선 위인가
    const r = (big ? 5 : 3.6) * (0.8 + 0.2*(p.depth+1));
    sctx.globalAlpha = above ? 1 : 0.28;
    sctx.fillStyle = color;
    sctx.shadowColor = color; sctx.shadowBlur = above ? 8 : 0;
    sctx.beginPath(); sctx.arc(p.x, p.y, r, 0, 7); sctx.fill();
    sctx.shadowBlur = 0;
    if (name) label(sctx, p.x + 7, p.y + 4, name, above ? '#fff' : 'rgba(200,210,240,0.5)', 'left');
    sctx.globalAlpha = 1;
  };

  // 편집 별의 일주 경로(적위 소원)를 색으로 표시
  for (const s of state.stars) {
    drawParallel(s.dec, hexA(s.color, 0.4), hexA(s.color, 0.12));
  }
  for (const s of state.refs) drawStar(s.ra, s.dec, s.color, s.name, false);
  for (const s of state.stars) drawStar(s.ra, s.dec, s.color, s.name, true);
}

// =====================================================================
//  뷰 B — 관측자의 하늘(반구, 평면천체도)
// =====================================================================
const skyCanvas = document.getElementById('skyView');
const kctx = skyCanvas.getContext('2d');

function drawSkyView() {
  const dpr = window.devicePixelRatio || 1;
  const w = skyCanvas.clientWidth, h = skyCanvas.clientHeight;
  if (skyCanvas.width !== w*dpr || skyCanvas.height !== h*dpr) {
    skyCanvas.width = w*dpr; skyCanvas.height = h*dpr;
  }
  kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  kctx.clearRect(0, 0, w, h);

  const cx = w/2, cy = h/2;
  const R = Math.min(w, h) * 0.44;

  // 고도 alt(도) → 반지름 (지평선=R, 천정=0)
  const rOf = (alt) => R * (90 - alt) / 90;
  // 방위 az(도) → 화면 좌표 (북=위, 동=왼쪽, 남=아래, 서=오른쪽)
  const posOf = (alt, az) => {
    const r = rOf(alt), a = az * D2R;
    return { x: cx - r*Math.sin(a), y: cy - r*Math.cos(a) };
  };

  // 하늘 배경
  const bg = kctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, '#0d1a3a'); bg.addColorStop(1, '#060a18');
  kctx.fillStyle = bg;
  kctx.beginPath(); kctx.arc(cx, cy, R, 0, 7); kctx.fill();

  // 고도 원 (30°, 60°)
  kctx.strokeStyle = 'rgba(255,255,255,0.10)'; kctx.lineWidth = 1;
  for (const alt of [30, 60]) { kctx.beginPath(); kctx.arc(cx, cy, rOf(alt), 0, 7); kctx.stroke(); }
  // 방위선
  kctx.strokeStyle = 'rgba(255,255,255,0.07)';
  for (let a = 0; a < 360; a += 45) {
    const p = posOf(0, a);
    kctx.beginPath(); kctx.moveTo(cx, cy); kctx.lineTo(p.x, p.y); kctx.stroke();
  }
  // 지평선
  kctx.strokeStyle = 'rgba(255,255,255,0.55)'; kctx.lineWidth = 2;
  kctx.beginPath(); kctx.arc(cx, cy, R, 0, 7); kctx.stroke();

  // 방위 라벨
  const card = [['북', 0], ['동', 90], ['남', 180], ['서', 270]];
  for (const [t, a] of card) {
    const p = posOf(0, a);
    const ox = (p.x - cx) * 0.08, oy = (p.y - cy) * 0.08;
    label(kctx, p.x + ox, p.y + oy + 4, t, 'rgba(200,215,255,0.85)', 'center', 13);
  }
  label(kctx, cx, cy - 6, '천정', 'rgba(255,255,255,0.4)', 'center', 11);

  // 천구 극 위치 (일주운동 중심)
  const lat = effLat();
  const poleAlt = Math.abs(lat);
  if (poleAlt > 0.5) {
    const poleAz = lat >= 0 ? 0 : 180;   // 북반구=북쪽, 남반구=남쪽
    const p = posOf(poleAlt, poleAz);
    kctx.strokeStyle = 'rgba(255,255,255,0.35)'; kctx.lineWidth = 1;
    kctx.beginPath(); kctx.moveTo(p.x-6,p.y); kctx.lineTo(p.x+6,p.y);
    kctx.moveTo(p.x,p.y-6); kctx.lineTo(p.x,p.y+6); kctx.stroke();
    label(kctx, p.x + 8, p.y - 6, lat >= 0 ? '천구 북극' : '천구 남극', 'rgba(210,225,255,0.7)', 'left', 10);
  }

  // 하루 경로 그리기 헬퍼: 시간각 전체를 훑어 지평선 위 구간을 잇는다
  function drawTrail(raHours, decDeg, color) {
    const lstNow = localSiderealDeg();
    kctx.save(); kctx.strokeStyle = hexA(color, 0.45); kctx.lineWidth = 1.4;
    kctx.beginPath(); let started = false;
    for (let t = 0; t <= 360; t += 3) {
      // t를 지방시로 대입 (경로는 하루 전체 모양)
      const H = (t - raHours * 15) * D2R;
      const phi = lat * D2R, d = decDeg * D2R;
      const sinAlt = Math.sin(phi)*Math.sin(d) + Math.cos(phi)*Math.cos(d)*Math.cos(H);
      const alt = Math.asin(clamp(sinAlt,-1,1)) * R2D;
      if (alt < 0) { started = false; continue; }
      const cosAlt = Math.cos(alt*D2R);
      const sinA = -Math.cos(d)*Math.sin(H)/cosAlt;
      const cosA = (Math.sin(d) - Math.sin(phi)*sinAlt)/(Math.cos(phi)*cosAlt);
      const az = (Math.atan2(sinA, cosA)*R2D + 360) % 360;
      const p = posOf(alt, az);
      if (!started) { kctx.moveTo(p.x, p.y); started = true; } else kctx.lineTo(p.x, p.y);
    }
    kctx.stroke(); kctx.restore();
  }

  const drawSkyStar = (raHours, decDeg, color, name, big) => {
    const { alt, az } = altAz(raHours, decDeg);
    if (alt < 0) return;   // 지평선 아래는 숨김
    const p = posOf(alt, az);
    kctx.fillStyle = color; kctx.shadowColor = color; kctx.shadowBlur = 8;
    kctx.beginPath(); kctx.arc(p.x, p.y, big ? 5 : 3.5, 0, 7); kctx.fill();
    kctx.shadowBlur = 0;
    if (name) label(kctx, p.x + 7, p.y + 4, name, '#fff', 'left');
  };

  for (const s of state.stars) drawTrail(s.ra, s.dec, s.color);
  for (const s of state.refs) drawSkyStar(s.ra, s.dec, s.color, s.name, false);
  for (const s of state.stars) drawSkyStar(s.ra, s.dec, s.color, s.name, true);
}

// =====================================================================
//  뷰 C — 관측자와 지평면·반구 (바깥에서 비스듬히 본 모습)
// =====================================================================
const sceneCanvas = document.getElementById('sceneView');
const cctx = sceneCanvas.getContext('2d');
// 방위 250°: 북=왼쪽, 남=오른쪽, 동=뒤쪽 약간 오른쪽, 서=앞쪽 약간 왼쪽
let camScene = { az: 250, el: 18 };

// 지평좌표(고도·방위) → 국소 단위벡터 [동, 북, 위]
function localVec(alt, az) {
  const al = alt * D2R, a = az * D2R;
  return [Math.cos(al)*Math.sin(a), Math.cos(al)*Math.cos(a), Math.sin(al)];
}

function drawSceneView() {
  const dpr = window.devicePixelRatio || 1;
  const w = sceneCanvas.clientWidth, h = sceneCanvas.clientHeight;
  if (sceneCanvas.width !== w*dpr || sceneCanvas.height !== h*dpr) {
    sceneCanvas.width = w*dpr; sceneCanvas.height = h*dpr;
  }
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cctx.clearRect(0, 0, w, h);

  const azC = camScene.az * D2R, elC = camScene.el * D2R;
  const camDir = [Math.cos(elC)*Math.sin(azC), Math.cos(elC)*Math.cos(azC), Math.sin(elC)];
  const right  = [-Math.cos(azC), Math.sin(azC), 0];
  const up     = [-Math.sin(elC)*Math.sin(azC), -Math.sin(elC)*Math.cos(azC), Math.cos(elC)];

  const S = Math.min((h - 46) / 1.28, (w - 60) / 2.05);
  const cx = w/2;
  const cy = h/2 + (Math.cos(elC) - Math.sin(elC)) * S / 2;

  const proj = (P) => ({
    x: cx + dot(P, right) * S,
    y: cy - dot(P, up) * S,
    depth: dot(P, camDir),
  });

  const lat = effLat();
  const domeR = 1;

  // 국소 단위벡터(고도·방위)를 구 위 점으로 투영
  const P = (alt, az) => proj(scale(localVec(alt, az), domeR));

  // 시간각 H(도)로부터 고도·방위 (지평선 아래도 계산)
  const altAzH = (decDeg, Hdeg) => {
    const phi = lat*D2R, d = decDeg*D2R, H = Hdeg*D2R;
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
  };

  // --- 그리기 헬퍼 ---
  const strokePts = (pts, style, lw) => {
    cctx.strokeStyle = style; cctx.lineWidth = lw;
    cctx.beginPath();
    pts.forEach((p, i) => i ? cctx.lineTo(p.x, p.y) : cctx.moveTo(p.x, p.y));
    cctx.stroke();
  };
  const parallelPts = (alt) => { const a = []; for (let az = 0; az <= 360; az += 5) a.push(P(alt, az)); return a; };
  const meridianPts = (az, a0, a1) => { const a = []; for (let alt = a0; alt <= a1; alt += 5) a.push(P(alt, az)); return a; };

  // 별의 하루 경로(적위 소원): 지평선 위/아래로 나눠 그림 → 전체가 하나의 원(구)
  const drawDiurnal = (decDeg, color, wantAbove) => {
    cctx.save();
    cctx.strokeStyle = wantAbove ? hexA(color, 0.6) : hexA(color, 0.22);
    cctx.lineWidth = wantAbove ? 1.6 : 1.2;
    if (!wantAbove) cctx.setLineDash([4, 4]);
    cctx.beginPath(); let pen = false;
    for (let H = 0; H <= 360; H += 3) {
      const aa = altAzH(decDeg, H);
      if ((aa.alt >= 0) === wantAbove) {
        const p = P(aa.alt, aa.az);
        if (!pen) { cctx.moveTo(p.x, p.y); pen = true; } else cctx.lineTo(p.x, p.y);
      } else pen = false;
    }
    cctx.stroke(); cctx.restore();
  };

  // 천구 극(일주운동 중심)
  const poleAlt = Math.abs(lat);
  const poleAz = lat >= 0 ? 0 : 180;
  const polePt = P(poleAlt, poleAz);

  // 현재 별 위치(지평선 위/아래 모두) — 깊이 정렬
  const items = [];
  for (const s of state.refs)  { const aa = altAz(s.ra, s.dec); items.push({ ...s, aa, big: false, p: P(aa.alt, aa.az) }); }
  for (const s of state.stars) { const aa = altAz(s.ra, s.dec); items.push({ ...s, aa, big: true,  p: P(aa.alt, aa.az) }); }
  items.sort((a, b) => a.p.depth - b.p.depth);

  const drawStarItem = (it) => {
    const above = it.aa.alt >= 0;
    const r = (it.big ? 5 : 3.6) * (0.82 + 0.18 * (it.p.depth + 1));
    cctx.save();
    cctx.globalAlpha = above ? 1 : 0.4;
    cctx.fillStyle = it.color; cctx.shadowColor = it.color; cctx.shadowBlur = above ? 8 : 0;
    cctx.beginPath(); cctx.arc(it.p.x, it.p.y, above ? r : r*0.8, 0, 7); cctx.fill();
    cctx.shadowBlur = 0;
    label(cctx, it.p.x + 7, it.p.y + 4, it.name, above ? '#fff' : 'rgba(205,215,245,0.5)', 'left', 11.5);
    cctx.restore();
  };

  const o0 = proj([0, 0, 0]);

  // 1) 구의 둘레(실루엣)
  cctx.strokeStyle = 'rgba(130,170,255,0.13)'; cctx.lineWidth = 1;
  cctx.beginPath(); cctx.arc(o0.x, o0.y, domeR*S, 0, 7); cctx.stroke();

  // 2) 아래 반구(지평선 아래): 격자·경로·별을 어둡게, 지평면 앞에 그려 가려지게
  for (const alt of [-60, -30]) strokePts(parallelPts(alt), 'rgba(120,150,220,0.09)', 1);
  for (let az = 0; az < 360; az += 45) strokePts(meridianPts(az, -90, 0), 'rgba(120,150,220,0.09)', 1);
  for (const s of state.stars) drawDiurnal(s.dec, s.color, false);   // 전몰 구간 포함 아래쪽 경로
  for (const it of items) if (it.aa.alt < 0) drawStarItem(it);

  // 3) 지평면(반투명) — 아래 반구를 살짝 가림
  const rim = []; for (let a = 0; a <= 360; a += 4) rim.push(P(0, a));
  cctx.beginPath();
  rim.forEach((p, i) => i ? cctx.lineTo(p.x, p.y) : cctx.moveTo(p.x, p.y));
  cctx.closePath();
  const gg = cctx.createLinearGradient(cx, o0.y - S, cx, o0.y + S*0.45);
  gg.addColorStop(0, 'rgba(40,70,130,0.22)');
  gg.addColorStop(1, 'rgba(12,22,48,0.5)');
  cctx.fillStyle = gg; cctx.fill();
  cctx.strokeStyle = 'rgba(150,190,255,0.6)'; cctx.lineWidth = 2; cctx.stroke();

  // 방위 눈금·라벨
  const cards = [['북', 0, '#9ec1ff'], ['동', 90, '#cbd5f5'], ['남', 180, '#cbd5f5'], ['서', 270, '#cbd5f5']];
  for (const [t, az, col] of cards) {
    const p = P(0, az), inn = proj(scale(localVec(0, az), 0.9));
    cctx.strokeStyle = 'rgba(180,205,255,0.5)'; cctx.lineWidth = 1.5;
    cctx.beginPath(); cctx.moveTo(inn.x, inn.y); cctx.lineTo(p.x, p.y); cctx.stroke();
    const ox = (p.x - o0.x) * 0.10, oy = (p.y - o0.y) * 0.10;
    label(cctx, p.x + ox, p.y + oy + 4, t, col, 'center', 13);
  }

  // 4) 위 반구(지평선 위): 밝게
  for (const alt of [30, 60]) strokePts(parallelPts(alt), 'rgba(130,170,255,0.18)', 1);
  for (let az = 0; az < 360; az += 45) strokePts(meridianPts(az, 0, 90), 'rgba(130,170,255,0.18)', 1);
  for (const s of state.stars) drawDiurnal(s.dec, s.color, true);

  // 5) 관측자 + 천정선
  drawObserver();

  // 6) 천구 극 + 지평선 위 별
  if (poleAlt > 0.5) drawPole();
  for (const it of items) if (it.aa.alt >= 0) drawStarItem(it);

  function drawPole() {
    cctx.save();
    cctx.strokeStyle = 'rgba(255,255,255,0.5)'; cctx.lineWidth = 1.4;
    cctx.beginPath();
    cctx.moveTo(polePt.x-6, polePt.y); cctx.lineTo(polePt.x+6, polePt.y);
    cctx.moveTo(polePt.x, polePt.y-6); cctx.lineTo(polePt.x, polePt.y+6);
    cctx.stroke();
    label(cctx, polePt.x + 8, polePt.y - 6, lat >= 0 ? '천구 북극' : '천구 남극', 'rgba(210,225,255,0.8)', 'left', 10.5);
    cctx.restore();
  }

  function drawObserver() {
    const o = proj([0,0,0]);
    const zTip = proj([0,0,domeR]);
    // 천정 방향 선
    cctx.save();
    cctx.strokeStyle = 'rgba(255,210,77,0.5)'; cctx.lineWidth = 1.2; cctx.setLineDash([4,5]);
    cctx.beginPath(); cctx.moveTo(o.x, o.y); cctx.lineTo(zTip.x, zTip.y); cctx.stroke();
    cctx.setLineDash([]);
    label(cctx, zTip.x, zTip.y - 8, '천정', 'rgba(255,210,77,0.9)', 'center', 11);

    // 발밑 그림자
    const ph = Math.max(18, S * 0.12);
    cctx.fillStyle = 'rgba(0,0,0,0.35)';
    cctx.beginPath(); cctx.ellipse(o.x, o.y + 1.5, ph*0.34, ph*0.12, 0, 0, 7); cctx.fill();

    // 사람 형상
    cctx.strokeStyle = '#ffd24d'; cctx.fillStyle = '#ffd24d';
    cctx.lineWidth = Math.max(2, ph*0.09); cctx.lineCap = 'round';
    const hip = o.y - ph*0.42, sh = o.y - ph*0.70, hd = o.y - ph*0.86;
    cctx.beginPath(); cctx.moveTo(o.x, hip); cctx.lineTo(o.x, sh); cctx.stroke();         // 몸통
    cctx.beginPath(); cctx.moveTo(o.x, hip); cctx.lineTo(o.x - ph*0.14, o.y); cctx.moveTo(o.x, hip); cctx.lineTo(o.x + ph*0.14, o.y); cctx.stroke(); // 다리
    cctx.beginPath(); cctx.moveTo(o.x, sh); cctx.lineTo(o.x - ph*0.18, sh - ph*0.14); cctx.moveTo(o.x, sh); cctx.lineTo(o.x + ph*0.18, sh - ph*0.14); cctx.stroke(); // 팔(위)
    cctx.beginPath(); cctx.arc(o.x, hd, ph*0.15, 0, 7); cctx.fill();                       // 머리
    label(cctx, o.x + ph*0.28, o.y + 4, '관측자', 'rgba(255,225,150,0.95)', 'left', 11);
    cctx.restore();
  }
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
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// =====================================================================
//  UI 배선
// =====================================================================
const el = (id) => document.getElementById(id);

function buildStarEditors() {
  const wrap = el('starEditors');
  wrap.innerHTML = '';
  for (const s of state.stars) {
    const div = document.createElement('div');
    div.className = 'star-edit';
    div.innerHTML = `
      <div class="star-head">
        <span class="dot" style="background:${s.color};color:${s.color}"></span>
        <span class="star-name">${s.name}</span>
        <span class="badge" data-badge="${s.id}"></span>
        <button class="star-remove" data-remove="${s.id}" title="${s.name} 삭제" aria-label="${s.name} 삭제">×</button>
      </div>
      <div class="row">
        <label>적경 RA</label>
        <input type="range" data-ra="${s.id}" min="0" max="24" step="0.1" value="${s.ra}" />
        <span class="edit-cell"><output data-raout="${s.id}"></output></span>
      </div>
      <div class="row">
        <label>적위 Dec</label>
        <input type="range" data-dec="${s.id}" min="-90" max="90" step="1" value="${s.dec}" />
        <span class="edit-cell"><output data-decout="${s.id}"></output></span>
      </div>`;
    wrap.appendChild(div);
  }
  wrap.querySelectorAll('[data-ra]').forEach(inp => inp.addEventListener('input', e => {
    const s = state.stars.find(x => x.id === e.target.dataset.ra); s.ra = +e.target.value; refreshStars();
  }));
  wrap.querySelectorAll('[data-dec]').forEach(inp => inp.addEventListener('input', e => {
    const s = state.stars.find(x => x.id === e.target.dataset.dec); s.dec = +e.target.value; refreshStars();
  }));
  wrap.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', e => {
    removeStar(e.currentTarget.dataset.remove);
  }));
  // 숫자 클릭 → 직접 입력
  wrap.querySelectorAll('[data-raout]').forEach(o => {
    const s = state.stars.find(x => x.id === o.dataset.raout);
    attachEditable(o, { raw: () => s.ra, min: 0, max: 24, step: 0.1, refresh: refreshStars,
      set: v => { s.ra = v; const sl = wrap.querySelector(`[data-ra="${s.id}"]`); if (sl) sl.value = v; } });
  });
  wrap.querySelectorAll('[data-decout]').forEach(o => {
    const s = state.stars.find(x => x.id === o.dataset.decout);
    attachEditable(o, { raw: () => s.dec, min: -90, max: 90, step: 1, refresh: refreshStars,
      set: v => { s.dec = v; const sl = wrap.querySelector(`[data-dec="${s.id}"]`); if (sl) sl.value = v; } });
  });
}

function addStar() {
  if (state.stars.length >= MAX_STARS) return;
  state.stars.push(makeStar());
  buildStarEditors();
  refreshStars();
}

function removeStar(id) {
  state.stars = state.stars.filter(s => s.id !== id);
  buildStarEditors();
  refreshStars();
}

function fmtRA(h) {
  const hh = Math.floor(h); const mm = Math.round((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2,'0')}m`;
}

function refreshStars() {
  for (const s of state.stars) {
    const c = classify(s.dec);
    const badge = document.querySelector(`[data-badge="${s.id}"]`);
    badge.textContent = c.label; badge.className = `badge ${c.key}`;
    const rao = document.querySelector(`[data-raout="${s.id}"]`);
    const deco = document.querySelector(`[data-decout="${s.id}"]`);
    if (rao) rao.textContent = fmtRA(s.ra);
    if (deco) deco.textContent = `${s.dec > 0 ? '+' : ''}${s.dec}°`;
  }
  const count = el('starCount');
  if (count) count.textContent = `${state.stars.length} / ${MAX_STARS}개`;
  const add = el('addStar');
  if (add) add.disabled = state.stars.length >= MAX_STARS;
}

function updateReadouts() {
  el('latOut').textContent = `${state.latitude >= 0 ? '+' : ''}${state.latitude.toFixed(1)}°`;
  el('lonOut').textContent = `${state.longitude >= 0 ? '+' : ''}${state.longitude}°`;
  const th = ((state.timeHours % 24) + 24) % 24;
  const hh = Math.floor(th), mm = Math.floor((th - hh) * 60);
  el('timeOut').textContent = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  el('speedOut').textContent = `${state.speedMul.toFixed(2)}×`;
  el('time').value = th;

  // 위도에 따른 안내
  const lat = state.latitude;
  const abs = Math.abs(lat);
  let msg;
  if (abs >= 89.5) msg = `${lat > 0 ? '북극' : '남극'}: 천구의 극이 천정에 오고, 모든 별이 지평선과 나란히 돌아 뜨거나 지지 않습니다.`;
  else if (abs < 0.5) msg = '적도: 천구의 두 극이 모두 지평선에 걸려, 모든 별이 수직으로 떠서 집니다(주극성 없음).';
  else msg = `${lat > 0 ? '북' : '남'}반구 위도 ${abs.toFixed(1)}°: 천구의 ${lat>0?'북':'남'}극이 지평선 위 ${abs.toFixed(1)}°에 있고, 적위 ${(lat>0?'+':'−')}${(90-abs).toFixed(1)}°보다 극에 가까운 별은 주극성이 됩니다.`;
  el('poleHint').textContent = msg;
}

// 슬라이더 연결
el('lat').addEventListener('input', e => { state.latitude = +e.target.value; updateReadouts(); refreshStars(); });
el('lon').addEventListener('input', e => { state.longitude = +e.target.value; updateReadouts(); });
el('time').addEventListener('input', e => { state.timeHours = +e.target.value; updateReadouts(); });
el('speed').addEventListener('input', e => { state.speedMul = +e.target.value; updateReadouts(); });
el('addStar').addEventListener('click', addStar);

// ---------- 숫자 클릭 → 직접 입력 ----------
function parseTime(text) {
  text = String(text).trim();
  if (text.includes(':')) {
    const [h, m] = text.split(':');
    const hh = parseInt(h, 10);
    if (isNaN(hh)) return null;
    const mm = parseInt(m, 10);
    return hh + (isNaN(mm) ? 0 : mm) / 60;
  }
  const v = parseFloat(text);
  return isFinite(v) ? v : null;
}

function attachEditable(output, spec) {
  if (!output) return;
  output.classList.add('editable');
  output.title = '클릭하여 직접 입력';
  output.addEventListener('click', () => {
    if (output.style.display === 'none') return;   // 이미 편집 중
    const cell = output.closest('.edit-cell') || output.parentElement;
    const input = document.createElement('input');
    input.className = 'num-input';
    input.type = spec.type || 'number';
    if (input.type === 'number') {
      input.inputMode = 'decimal';
      if (spec.min != null) input.min = spec.min;
      if (spec.max != null) input.max = spec.max;
      if (spec.step != null) input.step = spec.step;
    }
    input.value = spec.raw();
    output.style.display = 'none';
    cell.appendChild(input);
    input.focus(); input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true;
      if (commit) {
        const v = spec.parse ? spec.parse(input.value) : parseFloat(input.value);
        if (v != null && isFinite(v)) spec.set(clamp(v, spec.min, spec.max));
      }
      input.remove();
      output.style.display = '';
      spec.refresh();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  });
}

// 전역 컨트롤 숫자 입력
attachEditable(el('latOut'),   { raw: () => state.latitude,  min: -90,  max: 90,  step: 0.5,  refresh: () => { updateReadouts(); refreshStars(); }, set: v => { state.latitude = v; el('lat').value = v; } });
attachEditable(el('lonOut'),   { raw: () => state.longitude, min: -180, max: 180, step: 1,    refresh: updateReadouts, set: v => { state.longitude = v; el('lon').value = v; } });
attachEditable(el('timeOut'),  { type: 'text', raw: () => el('timeOut').textContent, parse: parseTime, min: 0, max: 24, refresh: updateReadouts, set: v => { state.timeHours = v; el('time').value = v; } });
attachEditable(el('speedOut'), { raw: () => state.speedMul,  min: 0.25, max: 8,   step: 0.25, refresh: updateReadouts, set: v => { state.speedMul = v; el('speed').value = v; } });

// 재생 컨트롤
function setPlaying(p) {
  state.playing = p;
  el('play').classList.toggle('active', p);
}
el('play').addEventListener('click', () => setPlaying(true));
el('pause').addEventListener('click', () => setPlaying(false));
el('stop').addEventListener('click', () => { setPlaying(false); state.timeHours = 0; updateReadouts(); });

// 뷰 A 카메라 드래그
let dragging = false, lastX = 0, lastY = 0;
spaceCanvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; spaceCanvas.setPointerCapture(e.pointerId); });
spaceCanvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  cam.az -= (e.clientX - lastX) * 0.4;
  cam.el = clamp(cam.el + (e.clientY - lastY) * 0.4, -85, 85);
  lastX = e.clientX; lastY = e.clientY;
});
spaceCanvas.addEventListener('pointerup', () => dragging = false);
spaceCanvas.addEventListener('pointercancel', () => dragging = false);

// 뷰 C 카메라 드래그
let sDrag = false, sX = 0, sY = 0;
sceneCanvas.addEventListener('pointerdown', e => { sDrag = true; sX = e.clientX; sY = e.clientY; sceneCanvas.setPointerCapture(e.pointerId); });
sceneCanvas.addEventListener('pointermove', e => {
  if (!sDrag) return;
  camScene.az -= (e.clientX - sX) * 0.4;
  camScene.el = clamp(camScene.el + (e.clientY - sY) * 0.3, 6, 84);
  sX = e.clientX; sY = e.clientY;
});
sceneCanvas.addEventListener('pointerup', () => sDrag = false);
sceneCanvas.addEventListener('pointercancel', () => sDrag = false);

// ---------- 애니메이션 루프 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (state.playing) {
    // 기준: 1배속에서 하루(24h)가 실시간 12초
    state.timeHours = (state.timeHours + dt * 2 * state.speedMul) % 24;
    updateReadouts();
  }
  drawSpaceView();
  drawSkyView();
  drawSceneView();
  requestAnimationFrame(loop);
}

// ---------- 초기화 ----------
buildStarEditors();
refreshStars();
updateReadouts();
requestAnimationFrame(loop);

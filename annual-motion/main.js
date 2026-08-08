// 별들의 연주운동 (Annual motion of stars)
// 순수 캔버스 + 구면천문. 외부 라이브러리 없음.
// LST = 태양 적경 + (관측시각-12)*15  →  연주(공전)와 일주(자전)를 일관되게 표현.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const scale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
const eqVec = (raHours, decDeg) => { const a = raHours*15*D2R, d = decDeg*D2R; return [Math.cos(d)*Math.cos(a), Math.cos(d)*Math.sin(a), Math.sin(d)]; };
const localVec = (alt, az) => { const al = alt*D2R, a = az*D2R; return [Math.cos(al)*Math.sin(a), Math.cos(al)*Math.cos(a), Math.sin(al)]; };
const EPS = 23.44 * D2R;

// ---------- 황도 12궁 ----------
const ZODIAC = [
  { name: '양', lam: 0 }, { name: '황소', lam: 30 }, { name: '쌍둥이', lam: 60 }, { name: '게', lam: 90 },
  { name: '사자', lam: 120 }, { name: '처녀', lam: 150 }, { name: '천칭', lam: 180 }, { name: '전갈', lam: 210 },
  { name: '궁수', lam: 240 }, { name: '염소', lam: 270 }, { name: '물병', lam: 300 }, { name: '물고기', lam: 330 },
];
// 황경 λ(°) → 적경h·적위° (황위 0)
function ecToEq(lam) {
  const l = lam * D2R;
  const dec = Math.asin(clamp(Math.sin(EPS) * Math.sin(l), -1, 1)) * R2D;
  const ra = (Math.atan2(Math.cos(EPS) * Math.sin(l), Math.cos(l)) * R2D + 360) % 360;
  return { raH: ra / 15, dec };
}

// ---------- 상태 ----------
const state = {
  latitude: 37.5,
  dayOfYear: 0,   // 0 = 1월 1일
  hour: 0,        // 관측 시각(자정)
  playing: false,
  speedMul: 1,
  dailyOn: false,
};
const effLat = () => clamp(state.latitude, -89.5, 89.5);
const sunLon = () => (((state.dayOfYear - 79) * (360 / 365.2422)) % 360 + 360) % 360; // 춘분≈3/20
const sunEq = () => ecToEq(sunLon());
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
const zenithVec = () => { const phi = effLat()*D2R, lonR = LSTdeg()*D2R; return [Math.cos(phi)*Math.cos(lonR), Math.cos(phi)*Math.sin(lonR), Math.sin(phi)]; };
const sunAlt = () => altAz(sunEq().raH, sunEq().dec).alt;

// 자정 남중(태양 반대편) 별자리 = 황경 (태양+180)에 가장 가까운 궁
function midnightSignIndex() {
  const opp = (sunLon() + 180) % 360;
  let best = 0, bd = 999;
  for (let i = 0; i < 12; i++) { let diff = Math.abs(((ZODIAC[i].lam - opp + 540) % 360) - 180); if (diff < bd) { bd = diff; best = i; } }
  return best;
}
function sunSignIndex() {
  const s = sunLon();
  let best = 0, bd = 999;
  for (let i = 0; i < 12; i++) { let diff = Math.abs(((ZODIAC[i].lam - s + 540) % 360) - 180); if (diff < bd) { bd = diff; best = i; } }
  return best;
}

// =====================================================================
//  뷰 1 — 공전 궤도 (위에서 본 모습)
// =====================================================================
const orbitCanvas = document.getElementById('orbitView');
const octx = orbitCanvas.getContext('2d');
function drawOrbitView() {
  const dpr = window.devicePixelRatio || 1;
  const w = orbitCanvas.clientWidth, h = orbitCanvas.clientHeight;
  if (orbitCanvas.width !== w*dpr || orbitCanvas.height !== h*dpr) { orbitCanvas.width = w*dpr; orbitCanvas.height = h*dpr; }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  const cx = w/2, cy = h/2;
  const Rlab = Math.min(w, h) * 0.42;
  const Rorb = Rlab * 0.62;
  // 궤도 각: 황경을 화면각으로 (반시계, 위=+y). screen(a): x=cx+R cos a, y=cy - R sin a
  const scr = (R, aDeg) => ({ x: cx + R * Math.cos(aDeg*D2R), y: cy - R * Math.sin(aDeg*D2R) });

  // 별 배경
  octx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 60; i++) { const a = i*2.4, rr = Rlab*(1.05 + (i%4)*0.03); const p = scr(rr%1?rr:rr, a); octx.beginPath(); octx.arc(cx+Math.cos(a)*Rlab*1.02*((i%5)/5+0.6), cy+Math.sin(a*1.3)*Rlab*0.9*((i%3)/3+0.5), 0.7, 0, 7); octx.fill(); }

  // 궤도
  octx.strokeStyle = 'rgba(150,190,255,0.25)'; octx.lineWidth = 1.5;
  octx.beginPath(); octx.arc(cx, cy, Rorb, 0, 7); octx.stroke();

  const sLon = sunLon();
  const earthLon = (sLon + 180) % 360; // 지구 일심 황경
  const midIdx = midnightSignIndex(), sunIdx = sunSignIndex();

  // 12궁 라벨
  octx.textAlign = 'center';
  for (let i = 0; i < 12; i++) {
    const p = scr(Rlab, ZODIAC[i].lam);
    const isMid = i === midIdx, isSun = i === sunIdx;
    octx.font = `${isMid ? 13 : 11.5}px -apple-system, "Noto Sans KR", sans-serif`;
    octx.fillStyle = isMid ? '#ffe08a' : (isSun ? 'rgba(255,150,90,0.85)' : 'rgba(180,200,255,0.6)');
    octx.beginPath(); octx.arc(scr(Rlab*0.9, ZODIAC[i].lam).x, scr(Rlab*0.9, ZODIAC[i].lam).y, isMid?3.5:2, 0, 7); octx.fill();
    octx.fillText(ZODIAC[i].name, p.x, p.y + 4);
  }

  // 태양
  const sg = octx.createRadialGradient(cx, cy, 2, cx, cy, 16);
  sg.addColorStop(0, '#fff4c2'); sg.addColorStop(1, '#ffb84d');
  octx.fillStyle = sg; octx.beginPath(); octx.arc(cx, cy, 13, 0, 7); octx.fill();
  label(octx, cx, cy - 20, '태양', '#ffd27a', 'center', 11);

  // 태양 → 지구 → 자정 별자리 방향선
  const ep = scr(Rorb, earthLon);
  const far = scr(Rlab, earthLon);
  octx.strokeStyle = 'rgba(255,224,138,0.5)'; octx.lineWidth = 1.4; octx.setLineDash([5,5]);
  octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(far.x, far.y); octx.stroke(); octx.setLineDash([]);

  // 지구 (낮/밤)
  const rEarth = 11;
  const toSun = Math.atan2(cy - ep.y, cx - ep.x); // 지구→태양 화면각
  octx.save(); octx.translate(ep.x, ep.y);
  // 밤(바깥쪽) 반원
  octx.fillStyle = '#0e2140'; octx.beginPath(); octx.arc(0, 0, rEarth, toSun + Math.PI/2, toSun - Math.PI/2); octx.fill();
  // 낮(태양쪽) 반원
  octx.fillStyle = '#5aa0e6'; octx.beginPath(); octx.arc(0, 0, rEarth, toSun - Math.PI/2, toSun + Math.PI/2); octx.fill();
  octx.strokeStyle = 'rgba(200,225,255,0.7)'; octx.lineWidth = 1.2; octx.beginPath(); octx.arc(0,0,rEarth,0,7); octx.stroke();
  octx.restore();
  label(octx, ep.x, ep.y - rEarth - 6, '지구', '#bcd6ff', 'center', 11);

  // 밤 방향(자정) 표시: 지구에서 태양 반대쪽 화살표
  const nightDir = toSun + Math.PI;
  const na = { x: ep.x + Math.cos(nightDir)*(rEarth+16), y: ep.y + Math.sin(nightDir)*(rEarth+16) };
  octx.strokeStyle = '#7dd3fc'; octx.fillStyle = '#7dd3fc'; octx.lineWidth = 2;
  octx.beginPath(); octx.moveTo(ep.x + Math.cos(nightDir)*rEarth, ep.y + Math.sin(nightDir)*rEarth); octx.lineTo(na.x, na.y); octx.stroke();
  octx.beginPath(); octx.moveTo(na.x, na.y);
  octx.lineTo(na.x - 8*Math.cos(nightDir-0.4), na.y - 8*Math.sin(nightDir-0.4));
  octx.lineTo(na.x - 8*Math.cos(nightDir+0.4), na.y - 8*Math.sin(nightDir+0.4));
  octx.closePath(); octx.fill();

  label(octx, cx, h - 12, '한밤중에는 태양 반대쪽 별자리가 보입니다', 'rgba(180,200,255,0.65)', 'center', 11);
}

// =====================================================================
//  뷰 2 — 천구(바깥에서 본 모습)
// =====================================================================
const spaceCanvas = document.getElementById('spaceView');
const sctx = spaceCanvas.getContext('2d');
let camA = { az: -62, el: 22 };
function camBasis(cam) {
  const azC = cam.az*D2R, elC = cam.el*D2R;
  return { camDir: [Math.cos(elC)*Math.cos(azC), Math.cos(elC)*Math.sin(azC), Math.sin(elC)], right: [-Math.sin(azC), Math.cos(azC), 0], up: [-Math.sin(elC)*Math.cos(azC), -Math.sin(elC)*Math.sin(azC), Math.cos(elC)] };
}
function drawSpaceView() {
  const dpr = window.devicePixelRatio || 1;
  const w = spaceCanvas.clientWidth, h = spaceCanvas.clientHeight;
  if (spaceCanvas.width !== w*dpr || spaceCanvas.height !== h*dpr) { spaceCanvas.width = w*dpr; spaceCanvas.height = h*dpr; }
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, w, h);
  const cx = w/2, cy = h/2, R = 1, rE = 0.15, S = Math.min(w, h) * 0.44;
  const B = camBasis(camA), zen = zenithVec();
  const proj = (P) => ({ x: cx + dot(P, B.right)*S, y: cy - dot(P, B.up)*S, depth: dot(P, B.camDir) });

  sctx.strokeStyle = 'rgba(122,162,255,0.16)'; sctx.lineWidth = 1;
  sctx.beginPath(); sctx.arc(cx, cy, S*R, 0, 7); sctx.stroke();

  const drawRing = (vecFn, front, back, lw) => {
    const pts = []; for (let a = 0; a <= 360; a += 4) pts.push(proj(scale(vecFn(a), R)));
    sctx.save(); for (let seg = 0; seg < 2; seg++) { sctx.beginPath(); let st=false; for (const p of pts){const f=p.depth>=0; if((seg===0)===f){if(!st){sctx.moveTo(p.x,p.y);st=true;}else sctx.lineTo(p.x,p.y);}else st=false;} sctx.strokeStyle=seg===0?front:back; sctx.lineWidth=seg===0?lw:1; sctx.stroke(); } sctx.restore();
  };
  // 적도, 황도
  drawRing((a)=>eqVec(a/15,0), 'rgba(120,200,255,0.5)', 'rgba(120,200,255,0.14)', 1.2);
  drawRing((a)=>{ const e=ecToEq(a); return eqVec(e.raH,e.dec); }, 'rgba(255,210,120,0.7)', 'rgba(255,210,120,0.18)', 1.4);

  // 지평선 대원
  (function(){ let u=cross(zen,[0,0,1]); if(Math.hypot(u[0],u[1],u[2])<1e-4)u=[1,0,0]; u=norm(u); const v=norm(cross(zen,u)); const pts=[];
    for(let a=0;a<=360;a+=4){const c=Math.cos(a*D2R),s=Math.sin(a*D2R); pts.push(proj(scale([u[0]*c+v[0]*s,u[1]*c+v[1]*s,u[2]*c+v[2]*s],R)));}
    sctx.save(); for(let seg=0;seg<2;seg++){ sctx.beginPath(); let st=false; for(const p of pts){const f=p.depth>=0; if((seg===0)===f){if(!st){sctx.moveTo(p.x,p.y);st=true;}else sctx.lineTo(p.x,p.y);}else st=false;} sctx.strokeStyle=seg===0?'rgba(255,255,255,0.7)':'rgba(255,255,255,0.18)'; sctx.lineWidth=seg===0?1.5:1; sctx.stroke(); } sctx.restore(); })();

  // 지구 + 관측자
  const ec = proj([0,0,0]);
  const eg = sctx.createRadialGradient(ec.x-rE*S*0.4, ec.y-rE*S*0.4, rE*S*0.15, ec.x, ec.y, rE*S);
  eg.addColorStop(0,'#3d78c8'); eg.addColorStop(1,'#0e2a52');
  sctx.fillStyle = eg; sctx.beginPath(); sctx.arc(ec.x, ec.y, rE*S, 0, 7); sctx.fill();
  const obs = proj(scale(zen, rE)), zTip = proj(scale(zen, rE+0.12));
  sctx.strokeStyle='#ffd24d'; sctx.lineWidth=2; sctx.beginPath(); sctx.moveTo(obs.x,obs.y); sctx.lineTo(zTip.x,zTip.y); sctx.stroke();
  sctx.fillStyle='#ffd24d'; sctx.beginPath(); sctx.arc(obs.x,obs.y,3.5,0,7); sctx.fill();

  // 황도 12궁
  for (let i = 0; i < 12; i++) {
    const e = ecToEq(ZODIAC[i].lam); const V = scale(eqVec(e.raH, e.dec), R); const p = proj(V);
    const above = dot(norm(V), zen) > 0;
    sctx.globalAlpha = above ? 1 : 0.3;
    sctx.fillStyle = 'rgba(200,215,255,0.9)'; sctx.beginPath(); sctx.arc(p.x, p.y, 2.5, 0, 7); sctx.fill();
    if (p.depth >= 0) label(sctx, p.x, p.y - 6, ZODIAC[i].name, above ? 'rgba(210,225,255,0.9)' : 'rgba(160,175,215,0.5)', 'center', 9.5);
    sctx.globalAlpha = 1;
  }
  // 태양
  const se = sunEq(); const SV = scale(eqVec(se.raH, se.dec), R); const sp = proj(SV);
  const sg = sctx.createRadialGradient(sp.x, sp.y, 1, sp.x, sp.y, 9);
  sg.addColorStop(0,'#fff4c2'); sg.addColorStop(1,'#ffb84d');
  sctx.fillStyle = sg; sctx.beginPath(); sctx.arc(sp.x, sp.y, 7, 0, 7); sctx.fill();
  label(sctx, sp.x, sp.y - 12, '태양', '#ffd27a', 'center', 10.5);
}

// =====================================================================
//  뷰 3 — 남쪽 하늘(그노몬 투영, 남쪽 고정)
// =====================================================================
const skyCanvas = document.getElementById('skyView');
const kctx = skyCanvas.getContext('2d');
function drawSkyView() {
  const dpr = window.devicePixelRatio || 1;
  const w = skyCanvas.clientWidth, h = skyCanvas.clientHeight;
  if (skyCanvas.width !== w*dpr || skyCanvas.height !== h*dpr) { skyCanvas.width = w*dpr; skyCanvas.height = h*dpr; }
  kctx.setTransform(dpr, 0, 0, dpr, 0, 0); kctx.clearRect(0, 0, w, h);
  const facingAz = 180; // 남
  const viewAltDeg = 34;
  const f = localVec(viewAltDeg, facingAz), right = norm(cross(f, [0,0,1])), up = cross(right, f);
  const cx = w/2, cy = h*0.52, HFOV = 60*D2R, S = (w*0.46)/Math.tan(HFOV);
  const project = (s3) => { const d = dot(s3, f); if (d <= 0.12) return null; return { x: cx + dot(s3, right)/d*S, y: cy - dot(s3, up)/d*S }; };

  const day = sunAlt() > -6;
  const bg = kctx.createLinearGradient(0, 0, 0, h);
  if (day) { bg.addColorStop(0, '#2a4a86'); bg.addColorStop(1, '#3f6bb0'); }
  else { bg.addColorStop(0, '#0a1330'); bg.addColorStop(1, '#0b1024'); }
  kctx.fillStyle = bg; kctx.fillRect(0, 0, w, h);

  // 지평선 + 지면
  const horiz = []; for (let daz=-90; daz<=90; daz+=2){ const p=project(localVec(0, facingAz+daz)); if(p) horiz.push(p); }
  if (horiz.length > 1) {
    kctx.save(); kctx.beginPath(); horiz.forEach((p,i)=>i?kctx.lineTo(p.x,p.y):kctx.moveTo(p.x,p.y));
    kctx.lineTo(horiz[horiz.length-1].x, h); kctx.lineTo(horiz[0].x, h); kctx.closePath();
    kctx.fillStyle = day ? 'rgba(20,34,60,0.6)' : 'rgba(10,16,34,0.85)'; kctx.fill(); kctx.restore();
    kctx.beginPath(); horiz.forEach((p,i)=>i?kctx.lineTo(p.x,p.y):kctx.moveTo(p.x,p.y));
    kctx.strokeStyle = 'rgba(150,190,255,0.55)'; kctx.lineWidth = 2; kctx.stroke();
  }
  // 남쪽 자오선(수직 기준)
  kctx.strokeStyle = 'rgba(255,255,255,0.08)'; kctx.setLineDash([4,5]);
  kctx.beginPath(); let vp=false; for (let alt=0; alt<=88; alt+=3){ const p=project(localVec(alt, facingAz)); if(!p){vp=false;continue;} if(!vp){kctx.moveTo(p.x,p.y);vp=true;}else kctx.lineTo(p.x,p.y);} kctx.stroke(); kctx.setLineDash([]);
  // 방위 라벨
  const dn = (az)=>({135:'남동',180:'남',225:'남서'}[az]||'');
  for (const daz of [-45,0,45]) { const p = project(localVec(0, facingAz+daz)); if (p) label(kctx, p.x, p.y+18, dn(facingAz+daz), 'rgba(200,215,255,0.8)', 'center', 12); }

  // 황도 12궁 (지평선 위)
  for (let i = 0; i < 12; i++) {
    const e = ecToEq(ZODIAC[i].lam); const aa = altAz(e.raH, e.dec); if (aa.alt < 0) continue;
    const p = project(localVec(aa.alt, aa.az)); if (!p) continue;
    const isMid = i === midnightSignIndex();
    kctx.fillStyle = isMid ? '#ffe08a' : '#dbe6ff'; kctx.shadowColor = kctx.fillStyle; kctx.shadowBlur = day ? 0 : 7;
    kctx.beginPath(); kctx.arc(p.x, p.y, isMid ? 5 : 3.5, 0, 7); kctx.fill(); kctx.shadowBlur = 0;
    label(kctx, p.x + 6, p.y + 4, ZODIAC[i].name, isMid ? '#ffe9b8' : 'rgba(220,230,255,0.9)', 'left', isMid ? 12 : 10.5);
  }
  // 태양(떠 있으면)
  const se = sunEq(); const sa = altAz(se.raH, se.dec);
  if (sa.alt >= 0) { const p = project(localVec(sa.alt, sa.az)); if (p) { const sg = kctx.createRadialGradient(p.x,p.y,1,p.x,p.y,12); sg.addColorStop(0,'#fff4c2'); sg.addColorStop(1,'#ffb84d'); kctx.fillStyle=sg; kctx.beginPath(); kctx.arc(p.x,p.y,10,0,7); kctx.fill(); label(kctx, p.x, p.y-14, '태양', '#ffd27a', 'center', 11); } }

  label(kctx, 12, 20, day ? '낮 — 태양이 떠 있어 별이 보이지 않습니다' : '남쪽 하늘', day ? 'rgba(255,235,180,0.9)' : 'rgba(180,200,255,0.7)', 'left', 12);
}

// ---------- 헬퍼 ----------
function label(ctx, x, y, text, color, align='left', size=12) {
  ctx.save(); ctx.font = `${size}px -apple-system, "Noto Sans KR", sans-serif`;
  ctx.textAlign = align; ctx.fillStyle = color; ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3;
  ctx.fillText(text, x, y); ctx.restore();
}

// =====================================================================
//  UI
// =====================================================================
const el = (id) => document.getElementById(id);
const MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];
function dateLabel(d) { let day = Math.floor(((d%365)+365)%365), m=0; while (m<12 && day>=MONTH_DAYS[m]) { day-=MONTH_DAYS[m]; m++; } return `${m+1}월 ${day+1}일`; }
function fmtHM(th) { const t=((th%24)+24)%24, hh=Math.floor(t), mm=Math.floor((t-hh)*60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }

function updateReadouts() {
  el('latOut').textContent = `${state.latitude >= 0 ? '+' : ''}${state.latitude.toFixed(1)}°`;
  el('timeOut').textContent = fmtHM(state.hour);
  el('dateOut').textContent = dateLabel(state.dayOfYear);
  el('date').value = Math.floor(((state.dayOfYear%365)+365)%365);
  el('speedOut').textContent = `${state.speedMul.toFixed(2)}×`;
  const sun = ZODIAC[sunSignIndex()].name, mid = ZODIAC[midnightSignIndex()].name;
  const day = sunAlt() > -6;
  el('stateHint').textContent = `태양은 현재 ‘${sun}자리’ 방향에 있습니다(그 별자리는 태양과 같이 있어 볼 수 없음). 한밤중 남쪽 하늘에는 ‘${mid}자리’가 보입니다.`;
  el('stateHint2').textContent = `${dateLabel(state.dayOfYear)} ${fmtHM(state.hour)} — ${day ? '지금은 낮이라 별이 보이지 않습니다.' : '지금은 밤입니다.'} 같은 시각에 관측하면 별자리가 하루 약 1°씩 서쪽으로 이동합니다.`;
}

el('lat').addEventListener('input', e => { state.latitude = +e.target.value; updateReadouts(); });
el('time').addEventListener('input', e => { state.hour = +e.target.value; updateReadouts(); });
el('date').addEventListener('input', e => { state.dayOfYear = +e.target.value; updateReadouts(); });
el('speed').addEventListener('input', e => { state.speedMul = +e.target.value; updateReadouts(); });
el('daily').addEventListener('change', e => { state.dailyOn = e.target.checked; });

function setPlaying(p) { state.playing = p; el('play').classList.toggle('active', p); }
el('play').addEventListener('click', () => setPlaying(true));
el('pause').addEventListener('click', () => setPlaying(false));
el('stop').addEventListener('click', () => { setPlaying(false); state.dayOfYear = 0; updateReadouts(); });

// 뷰2 드래그
(function(){ let d=false,lx=0,ly=0; spaceCanvas.addEventListener('pointerdown',e=>{d=true;lx=e.clientX;ly=e.clientY;spaceCanvas.setPointerCapture(e.pointerId);}); spaceCanvas.addEventListener('pointermove',e=>{if(!d)return; camA.az-=(e.clientX-lx)*0.4; camA.el=clamp(camA.el+(e.clientY-ly)*0.4,-85,85); lx=e.clientX;ly=e.clientY;}); spaceCanvas.addEventListener('pointerup',()=>d=false); spaceCanvas.addEventListener('pointercancel',()=>d=false); })();

// 숫자 직접 입력
function attachEditable(output, spec) {
  if (!output) return;
  output.classList.add('editable'); output.title = '클릭하여 직접 입력';
  output.addEventListener('click', () => {
    if (output.style.display === 'none') return;
    const cell = output.closest('.edit-cell') || output.parentElement;
    const input = document.createElement('input'); input.className = 'num-input'; input.type = spec.type || 'number';
    if (input.type === 'number') { input.inputMode = 'decimal'; if (spec.min!=null) input.min=spec.min; if (spec.max!=null) input.max=spec.max; if (spec.step!=null) input.step=spec.step; }
    input.value = spec.raw(); output.style.display = 'none'; cell.appendChild(input); input.focus(); input.select();
    let done = false;
    const finish = (c) => { if (done) return; done = true; if (c) { const v = spec.parse ? spec.parse(input.value) : parseFloat(input.value); if (v != null && isFinite(v)) spec.set(clamp(v, spec.min, spec.max)); } input.remove(); output.style.display=''; spec.refresh(); };
    input.addEventListener('keydown', e => { if (e.key==='Enter'){e.preventDefault();finish(true);} else if (e.key==='Escape'){e.preventDefault();finish(false);} });
    input.addEventListener('blur', () => finish(true));
  });
}
function parseTime(t){ t=String(t).trim(); if(t.includes(':')){const [h,m]=t.split(':'); const hh=parseInt(h,10); if(isNaN(hh))return null; const mm=parseInt(m,10); return hh+(isNaN(mm)?0:mm)/60;} const v=parseFloat(t); return isFinite(v)?v:null; }
attachEditable(el('latOut'),   { raw: () => state.latitude, min: -90, max: 90, step: 0.5, refresh: updateReadouts, set: v => { state.latitude=v; el('lat').value=v; } });
attachEditable(el('timeOut'),  { type: 'text', raw: () => el('timeOut').textContent, parse: parseTime, min: 0, max: 24, refresh: updateReadouts, set: v => { state.hour=v; el('time').value=v; } });
attachEditable(el('speedOut'), { raw: () => state.speedMul, min: 0.25, max: 20, step: 0.25, refresh: updateReadouts, set: v => { state.speedMul=v; el('speed').value=v; } });

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  if (state.playing) {
    if (state.dailyOn) {
      // 하루(밤낮)가 지나는 동안 날짜는 고정, 하루가 끝나면 날짜 +1
      state.hour += dt * 4 * state.speedMul;
      if (state.hour >= 24) { const d = Math.floor(state.hour / 24); state.hour -= d * 24; state.dayOfYear = (state.dayOfYear + d) % 365; }
    } else {
      state.dayOfYear = (state.dayOfYear + dt * 16 * state.speedMul) % 365;
    }
    updateReadouts();
  }
  drawOrbitView(); drawSpaceView(); drawSkyView();
  requestAnimationFrame(loop);
}
updateReadouts();
requestAnimationFrame(loop);

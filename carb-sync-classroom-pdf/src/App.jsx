
// Simulateur — Version classe (Examen + Export CSV/PDF)
// Fichier: src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import jsPDF from 'jspdf'

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const kPa2inHg = (kPa) => kPa * 0.2953;

export default function App(){
  const [running, setRunning] = useState(false);
  const [numCarbs, setNumCarbs] = useState(4);
  const [units, setUnits] = useState('kPa');
  const [tolerance, setTolerance] = useState(1.5); // kPa
  const [idleRpm, setIdleRpm] = useState(1200);
  const [noiseLevel, setNoiseLevel] = useState(0.4);
  const [coupling, setCoupling] = useState(0.12);
  const [gain, setGain] = useState(1.35);
  const [baseVacuum, setBaseVacuum] = useState(38);

  const [faults, setFaults] = useState({ leakIndex: null, hoseLeakIndex: null, stuckScrewIndex: null });
  const [screws, setScrews] = useState([rand(-5,5), rand(-5,5), rand(-5,5), rand(-5,5)]);
  const [seed, setSeed] = useState(() => Math.floor(Math.random()*1e6));

  const [elapsed, setElapsed] = useState(0);
  const [adjustments, setAdjustments] = useState(0);
  const [blips, setBlips] = useState(0);
  const [stableSeconds, setStableSeconds] = useState(0);
  const [cleared, setCleared] = useState(false);

  const [examActive, setExamActive] = useState(false);
  const [timeLimitSec, setTimeLimitSec] = useState(600);
  const [studentId, setStudentId] = useState('');

  const blipRef = useRef(0);

  useEffect(()=>{
    setScrews(prev => {
      const next = Array.from({length: numCarbs}, (_,i)=> prev[i] ?? rand(-6,6));
      return next.map(v=> clamp(v,-10,10));
    })
  },[numCarbs])

  useEffect(()=>{
    let raf; let last = performance.now();
    const tick = now => {
      const dt = (now - last)/1000; last = now;
      if(running){
        setElapsed(t=> t + dt);
        if(blipRef.current>0) blipRef.current = Math.max(0, blipRef.current - dt*1.8);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  },[running])

  useEffect(()=>{
    const rng = mulberry32(seed);
    const idx = n=> Math.floor(rng()*n);
    setFaults({
      leakIndex: rng()<0.4 ? idx(numCarbs) : null,
      hoseLeakIndex: rng()<0.35 ? idx(numCarbs) : null,
      stuckScrewIndex: rng()<0.3 ? idx(numCarbs) : null,
    })
  },[seed, numCarbs])

  const vacuums = useMemo(()=>{
    const rpmFactor = 1 + (idleRpm - 1200)/10000;
    const blip = blipRef.current;
    return screws.map((s,i)=>{
      const stuck = faults.stuckScrewIndex===i ? 0.35 : 1.0;
      const screwEffect = gain * stuck * s;
      const left = screws[(i-1+screws.length)%screws.length];
      const right= screws[(i+1)%screws.length];
      const couplingEffect = coupling * (left + right - 2*s);
      const leak = faults.leakIndex===i ? -4.5 : 0;
      const blipEffect = blip>0 ? (rand(-1,1) + (0.8 - Math.abs(s)*0.03)) * blip * 2.2 : 0;
      const jitter = (faults.hoseLeakIndex===i ? noiseLevel*3.2 : noiseLevel) * (rand(-1,1));
      const v = baseVacuum*rpmFactor + screwEffect + couplingEffect + leak + blipEffect + jitter;
      return clamp(v, 20, 65);
    })
  },[screws,gain,coupling,baseVacuum,idleRpm,faults,noiseLevel])

  useEffect(()=>{
    if(!running) return;
    const spread = Math.max(...vacuums) - Math.min(...vacuums);
    const within = spread <= tolerance;
    let id;
    if(within){ id = setTimeout(()=> setStableSeconds(s=> s+1), 1000) } else { setStableSeconds(0) }
    if(within && stableSeconds>=4){ setCleared(true) }
    return ()=> clearTimeout(id)
  },[vacuums, running, tolerance, stableSeconds])

  const handleScrew = (i, val)=>{ setScrews(arr=> arr.map((v,k)=> k===i? val : v)); setAdjustments(c=> c+1) }
  const resetScenario = ()=>{
    setSeed(Math.floor(Math.random()*1e6));
    setScrews(Array.from({length:numCarbs}, ()=> rand(-6,6)));
    setElapsed(0); setAdjustments(0); setBlips(0); setStableSeconds(0); setCleared(false);
  }
  const blipThrottle = ()=>{ blipRef.current = 1.0; setBlips(b=> b+1) }

  const spreadKPa = useMemo(()=> round(Math.max(...vacuums)-Math.min(...vacuums),2),[vacuums])
  const pass = cleared && stableSeconds>=5;

  const startExam = ()=>{
    setNumCarbs(4); setUnits('kPa'); setTolerance(1.0); setIdleRpm(1200);
    setExamActive(true); setRunning(true);
    setElapsed(0); setAdjustments(0); setBlips(0); setStableSeconds(0); setCleared(false);
  }
  const stopExam = ()=>{ setExamActive(false); setRunning(false); }

  const exportCSV = ()=>{
    const headers = [
      'timestamp','studentId','seed','numCarbs','units','tolerance_kPa','idle_rpm','elapsed_s','adjustments','blips','final_spread_kPa','pass'
    ]
    const row = [ new Date().toISOString(), JSON.stringify(studentId||''), seed, numCarbs, units, tolerance, idleRpm, Math.round(elapsed), adjustments, blips, spreadKPa.toFixed(2), pass ]
    const csv = headers.join(',') + '
' + row.join(',');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `carb-sync-result-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const exportPDF = () => {
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const margin = 48; let y = margin;
    const line = (txt, size=11, bold=false) => { doc.setFont('helvetica', bold? 'bold':'normal'); doc.setFontSize(size); doc.text(txt, margin, y); y += 18; };
    const h1 = (txt) => { doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.text(txt, margin, y); y += 24; };

    h1('Rapport de synchronisation de carburateurs — Version classe');
    line(`Date: ${new Date().toLocaleString('fr-CA')}`);
    line(`Élève: ${studentId || '—'}`);
    line(`Seed: ${seed}`);
    line(`Paramètres: ${numCarbs} carbus · ${units} · tolérance ${tolerance} kPa · ${Math.round(idleRpm)} tr/min`);
    y += 4; line(`Temps écoulé: ${formatTime(elapsed)} · Ajustements: ${adjustments} · Coups de gaz: ${blips}`);
    line(`Écart final: ${spreadKPa.toFixed(2)} kPa (${(kPa2inHg(spreadKPa)).toFixed(2)} inHg)`);
    line(`Statut: ${pass ? 'RÉUSSI' : 'NON ATTEINT'}`, 12, true);
    y += 6; line('Lectures par carburateur:', 12, true);
    vacuums.forEach((v,i)=> { line(`• Carbu ${i+1}: ${round(v,1)} kPa (${round(kPa2inHg(v),2)} inHg)`); });

    doc.setDrawColor('#E5E7EB');
    doc.line(margin, margin-16, 595-margin, margin-16);
    doc.save(`carb-sync-rapport-${(studentId||'eleve').replace(/[^a-zA-Z0-9_-]/g,'_')}-${Date.now()}.pdf`);
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <h2 style={{margin:0}}>Simulateur de synchro carbus — Version classe</h2>
          <span style={{...styles.pill, background: running? '#D1FAE5':'#E5E7EB', color: running? '#065F46':'#374151'}}>{running? 'En marche':'À l'arrêt'}</span>
        </div>
        <div style={{display:'flex',gap:8, flexWrap:'wrap'}}>
          {!examActive && <button onClick={()=> setRunning(r=>!r)} style={styles.btnPrimary}>{running? 'Arrêter':'Démarrer'}</button>}
          <button onClick={resetScenario} style={styles.btn}>Réinitialiser</button>
        </div>
      </div>

      <section style={styles.card}>
        <h3 style={styles.cardTitle}>Mode classe / examen</h3>
        <div style={{display:'grid', gap:8}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div>
              <div style={styles.label}>Identifiant élève</div>
              <input value={studentId} onChange={e=> setStudentId(e.target.value)} placeholder="ex: 2025-03-EP" style={styles.input} disabled={examActive} />
            </div>
            <div>
              <div style={styles.label}>Durée maximale (s)</div>
              <input type="number" min={60} max={3600} step={30} value={timeLimitSec} onChange={e=> setTimeLimitSec(parseInt(e.target.value||'600'))} style={styles.input} disabled={examActive} />
            </div>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
            {!examActive ? (
              <button onClick={startExam} style={styles.btnPrimary}>Démarrer l'examen</button>
            ) : (
              <>
                <button onClick={()=>{ stopExam(); exportCSV(); exportPDF(); }} style={styles.btn}>Terminer & Exporter (CSV + PDF)</button>
                <button onClick={exportCSV} style={styles.btn}>Exporter CSV</button>
                <button onClick={exportPDF} style={styles.btn}>Exporter PDF</button>
              </>
            )}
          </div>
          <div style={styles.hint}>En mode examen, les paramètres sont verrouillés (4 carbus, kPa, tolérance 1.0 kPa, 1200 tr/min).</div>
        </div>
      </section>

      <section style={styles.card}>
        <h3 style={styles.cardTitle}>Manomètres</h3>
        <div style={{display:'grid',gridTemplateColumns:'repeat( auto-fit, minmax(180px,1fr))', gap:12}}>
          {vacuums.map((v, i) => (
            <GaugeColumn key={i} index={i} value={v} units={units} highlight={(Math.max(...vacuums) - Math.min(...vacuums)) <= tolerance} />
          ))}
        </div>
        <div style={styles.rowInfo}>
          <div>Écart actuel: <b>{units==='kPa'? `${spreadKPa.toFixed(2)} kPa` : `${round(kPa2inHg(spreadKPa),2)} inHg`}</b> · Tolérance: <b>{units==='kPa'? `${tolerance.toFixed(2)} kPa` : `${round(kPa2inHg(tolerance),2)} inHg`}</b></div>
          <div>Régime: <b>{Math.round(idleRpm)} tr/min</b></div>
        </div>
      </section>

      <section style={styles.card}>
        <h3 style={styles.cardTitle}>Réglage des vis de synchro</h3>
        <div style={{display:'grid', gap:12}}>
          {screws.map((s,i)=> (
            <div key={i} style={{display:'grid', gridTemplateColumns:'120px 1fr 60px', alignItems:'center', gap:8}}>
              <label>Carbu {i+1}</label>
              <input type="range" min={-10} max={10} step={0.1} value={s} onChange={(e)=>handleScrew(i, parseFloat(e.target.value))} />
              <div style={{textAlign:'right', fontSize:12}}>{s.toFixed(1)}°</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex', gap:8, marginTop:8}}>
          <button onClick={blipThrottle} style={styles.btn}>Coup de gaz</button>
          <button onClick={()=>setScrews(arr=>arr.map(v=> round(v + rand(-0.5,0.5),1)))} style={styles.btn}>Micro-variation</button>
        </div>
      </section>

      <section style={styles.card}>
        <h3 style={styles.cardTitle}>Paramètres</h3>
        <div style={{display:'grid', gap:10, opacity: examActive? 0.6:1}}>
          <Row label="Nombre de carburateurs">
            <div style={{display:'flex', gap:8}}>
              <button onClick={()=>setNumCarbs(2)} style={numCarbs===2? styles.btnPrimary:styles.btn} disabled={examActive}>2</button>
              <button onClick={()=>setNumCarbs(4)} style={numCarbs===4? styles.btnPrimary:styles.btn} disabled={examActive}>4</button>
            </div>
          </Row>
          <Row label="Unités">
            <label style={{display:'inline-flex', alignItems:'center', gap:8}}>
              <input type="checkbox" checked={units==='inHg'} onChange={(e)=>setUnits(e.target.checked? 'inHg':'kPa')} disabled={examActive} />
              <span style={{fontSize:12, color:'#6B7280'}}>{units==='kPa'? 'kPa (dépression)': 'inHg (dépression)'}</span>
            </label>
          </Row>
          <Row label="Tolérance (kPa)">
            <input type="range" min={0.3} max={4} step={0.1} value={tolerance} onChange={(e)=>setTolerance(parseFloat(e.target.value))} disabled={examActive} />
            <div style={styles.hint}>≈ {round(kPa2inHg(tolerance),2)} inHg</div>
          </Row>
          <Row label="Régime d'essai (tr/min)">
            <input type="range" min={800} max={2000} step={10} value={idleRpm} onChange={(e)=>setIdleRpm(parseFloat(e.target.value))} disabled={examActive} />
          </Row>
          <Row label="Bruit de lecture">
            <input type="range" min={0} max={1.2} step={0.05} value={noiseLevel} onChange={(e)=>setNoiseLevel(parseFloat(e.target.value))} disabled={examActive} />
          </Row>
          <Row label="Couplage mécanique">
            <input type="range" min={0} max={0.25} step={0.005} value={coupling} onChange={(e)=>setCoupling(parseFloat(e.target.value))} disabled={examActive} />
          </Row>
          <Row label="Sensibilité des vis">
            <input type="range" min={0.6} max={2.2} step={0.05} value={gain} onChange={(e)=>setGain(parseFloat(e.target.value))} disabled={examActive} />
          </Row>
          <Row label="Vacuum de base (kPa)">
            <input type="range" min={28} max={55} step={0.5} value={baseVacuum} onChange={(e)=>setBaseVacuum(parseFloat(e.target.value))} disabled={examActive} />
          </Row>
          <Row label="Seed">
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <code style={styles.code}>{seed}</code>
              <button onClick={()=>setSeed(Math.floor(Math.random()*1e6))} style={styles.btn} disabled={examActive}>Random</button>
            </div>
          </Row>
        </div>
      </section>

      <section style={styles.card}>
        <h3 style={styles.cardTitle}>Score & Objectifs</h3>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:14}}>
          <div style={styles.muted}>Temps écoulé</div><div style={{textAlign:'right', fontWeight:600}}>{formatTime(elapsed)}</div>
          <div style={styles.muted}>Ajustements</div><div style={{textAlign:'right', fontWeight:600}}>{adjustments}</div>
          <div style={styles.muted}>Coups de gaz</div><div style={{textAlign:'right', fontWeight:600}}>{blips}</div>
          <div style={styles.muted}>Stabilité</div><div style={{textAlign:'right', fontWeight:600}}>{stableSeconds}s / 5s</div>
        </div>
        {pass ? (
          <div style={{...styles.notice, background:'#ECFDF5', color:'#065F46'}}>Synchronisation réussie! Écart ≤ tolérance pendant 5s.</div>
        ) : (
          <div style={{...styles.notice, background:'#FFFBEB', color:'#92400E'}}>Objectif: égaliser les dépressions. Stabilisez-les dans la tolérance.</div>
        )}
      </section>
    </div>
  )
}

function Row({label, children}){
  return (
    <div>
      <div style={{fontSize:14, fontWeight:600, marginBottom:4}}>{label}</div>
      {children}
    </div>
  )
}

function GaugeColumn({ index, value, units, min=20, max=70, highlight }){
  const pct = ((value - min) / (max - min)) * 100;
  const showVal = units === 'kPa' ? `${round(value,1)} kPa` : `${round(kPa2inHg(value),2)} inHg`;
  return (
    <div style={{display:'flex', flexDirection:'column'}}>
      <div style={{height:180, position:'relative', background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden'}}>
        <div style={{position:'absolute', left:0, right:0, bottom:0, height:`${clamp(pct,0,100)}%`, background: highlight? 'rgba(16,185,129,0.7)':'rgba(56,189,248,0.7)'}} />
      </div>
      <div style={{marginTop:6, textAlign:'center', fontSize:14}}>
        <div style={{fontWeight:600}}>Carbu {index+1}</div>
        <div style={{color:'#6B7280'}}>{showVal}</div>
      </div>
    </div>
  )
}

function formatTime(t){ const m=Math.floor(t/60), s=Math.floor(t%60); return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` }
function mulberry32(a){ return function(){ let t=(a+=0x6D2B79F5); t=Math.imul(t^(t>>>15), t|1); t^= t + Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; } }

const styles = {
  root: { padding:16, maxWidth:1200, margin:'0 auto', fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color:'#111827' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, gap:8, flexWrap:'wrap' },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:12 },
  card: { background:'#FFFFFF', border:'1px solid #E5E7EB', borderRadius:12, padding:12, boxShadow:'0 1px 2px rgba(0,0,0,0.04)' },
  cardTitle: { margin:'0 0 8px 0', fontSize:16 },
  rowInfo: { marginTop:8, display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:14, color:'#6B7280' },
  btn: { padding:'6px 10px', border:'1px solid #D1D5DB', background:'#F9FAFB', borderRadius:8, cursor:'pointer' },
  btnPrimary: { padding:'6px 10px', border:'1px solid #10B981', background:'#10B981', color:'#fff', borderRadius:8, cursor:'pointer' },
  pill: { padding:'2px 8px', borderRadius:999, fontSize:12 },
  hint: { fontSize:12, color:'#6B7280' },
  notice: { marginTop:8, padding:8, borderRadius:8, fontSize:14 },
  code: { padding:'2px 6px', background:'#F3F4F6', borderRadius:6, fontSize:12 },
  label: { fontSize:12, color:'#374151', marginBottom:4 },
  input: { width:'100%', padding:'6px 8px', border:'1px solid #D1D5DB', borderRadius:6 }
}

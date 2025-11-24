(function(window){
  'use strict';

  // --- Size Manager ---
  const metricRanges = {
    shoulders: { cm: [44.00, 55.00] },
    chest:     { cm: [86.00, 120.00] },
    waist:     { cm: [66.00, 100.00] },
    arms:      { cm: [25.00, 35.00] },
    torso:     { cm: [55.00, 70.00] }
  };

  let sizeChart = null;
  let currentSize = null;
  let _ready = false;
  const _readyListeners = [];

  function clamp01(v){ return Math.max(0, Math.min(1, v)); }

  function normalize(value, min, max){
    const v = parseFloat(value), mi=parseFloat(min), ma=parseFloat(max);
    if(!isFinite(v)||!isFinite(mi)||!isFinite(ma)||ma===mi) return 0;
    return clamp01((v-mi)/(ma-mi));
  }

  function normalizeMeasurement(key, valueCm){
    if(!metricRanges[key]) throw new Error('Unknown measurement key: '+key);
    const [min,max]=metricRanges[key].cm;
    if(key==='waist') return 1-normalize(valueCm,min,max); // invert waist
    return normalize(valueCm,min,max);
  }

  // Recommend size (AI style)
  function recommendSize(user, chart){
    if(!chart) chart = sizeChart;
    if(!chart) throw new Error('Size chart not loaded');

    const keys=['shoulders','chest','waist','arms','torso'];
    const u = {};
    keys.forEach(k=>{ u[k] = (user && typeof user[k]==='number')? user[k]:0; });

    let best = null, bestDist = Infinity;
    Object.keys(chart).forEach(sizeName=>{
      const s = chart[sizeName]; if(!s) return;
      let sum=0;
      keys.forEach(k=>{
        const diff=u[k]-(s[k]||0);
        sum+=diff*diff;
      });
      const dist=Math.sqrt(sum);
      if(dist<bestDist){ bestDist=dist; best=sizeName; }
    });

    // Generate normalized morph scales for shirt
    const morphScales = {};
    keys.forEach(k=>{ morphScales[k]=normalizeMeasurement(k,u[k]); });

    return { size: best, distance: bestDist, morphScales };
  }

  function selectSize(sizeName){ currentSize=sizeName; window.currentSize=currentSize; return currentSize; }

  async function init(opts){
    if(_ready) return { chart: sizeChart };
    opts=opts||{};
    const url = opts.url || 'assets/js/sizes.json';
    try{
      const resp = await fetch(url,{cache:'no-store'});
      if(!resp.ok) throw new Error('Failed to load sizes.json: '+resp.status);
      sizeChart = await resp.json();
      _ready=true;
      _readyListeners.splice(0).forEach(cb=>{ try{ cb(sizeChart); } catch(e){} });
      return { chart:sizeChart };
    }catch(e){ console.error('SizeManager.init error',e); throw e; }
  }

  function onReady(cb){ if(_ready){ try{ cb(sizeChart); } catch(e){} } else _readyListeners.push(cb); }

  function getSizeChart(){ return sizeChart; }
  function getCurrentSize(){ return currentSize; }

  // Attach to UI + automatic morphing
  function attachBasicUI({ measurementInputs, resultEl, buttonsContainer, shirtMesh }){
    onReady(()=>{
      const keys=['shoulders','chest','waist','arms','torso'];

      function readUser(){
        const user={};
        keys.forEach(k=>{
          const sel=measurementInputs && measurementInputs[k];
          let el=null;
          if(typeof sel==='string') el=document.getElementById(sel);
          else if(sel && sel.nodeType) el=sel;
          if(!el){ user[k]=0; return; }
          const v=parseFloat(el.value); user[k]=isNaN(v)?0:v;
        });
        return user;
      }

      function updateShirt(user){
        const rec = recommendSize(user,sizeChart);
        if(shirtMesh){
          keys.forEach(k=>{
            const idx = shirtMesh.morphTargetDictionary[k];
            if(idx!==undefined) shirtMesh.morphTargetInfluences[idx]=rec.morphScales[k];
          });
        }
        const outEl=resultEl && (typeof resultEl==='string'?document.getElementById(resultEl):resultEl);
        if(outEl) outEl.textContent = rec.size || '—';
        return rec;
      }

      keys.forEach(k=>{
        const sel=measurementInputs && measurementInputs[k];
        let el=null;
        if(typeof sel==='string') el=document.getElementById(sel);
        else if(sel && sel.nodeType) el=sel;
        if(!el) return;
        el.addEventListener('input',()=>{ updateShirt(readUser()); });
        el.addEventListener('change',()=>{ updateShirt(readUser()); });
      });

      if(buttonsContainer){
        const container=(typeof buttonsContainer==='string')?document.getElementById(buttonsContainer):buttonsContainer;
        if(container){
          container.addEventListener('click',(ev)=>{
            const btn=ev.target.closest('[data-size]');
            if(!btn) return;
            const size=btn.getAttribute('data-size'); if(!size) return;
            selectSize(size);
            updateShirt(sizeChart[size]);
            container.querySelectorAll('[data-size]').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
          });
        }
      }

      updateShirt(readUser());
    });
  }

  window.SizeManager={
    init,
    onReady,
    getSizeChart,
    recommendSize,
    normalize,
    normalizeMeasurement,
    selectSize,
    getCurrentSize,
    attachBasicUI,
    metricRanges
  };

})(window);

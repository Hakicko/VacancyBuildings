'use strict';
const CATS={
  vacant:{l:'Vacant (strong signs)',c:'#b3261e'},
  probable:{l:'Probably vacant',c:'#e08a1e'},
  occupied:{l:'Occupied',c:'#3a7d44'},
  unsure:{l:'Unsure',c:'#7a7a7a'}};
const SIGNS=['To-let / for-sale sign (te huur / te koop)','Shutters always closed','Mailbox full or sealed','No lights at night','Paper covering windows','Fencing / construction hoarding','Ground floor closed, upper floors empty','Anti-squat / temporary guardians','Broken or boarded windows','Overgrown vegetation'];
const TYPES=['Residential','Commercial','Industrial','Office','Other'];
const CONDS=['—','Good','Neglected','Dilapidated'];
const KEY='eindhoven-vacancy-v2',PKEY='eindhoven-vacancy-paths-v1',DKEY='eindhoven-vacancy-draft-v1';
const $=id=>document.getElementById(id);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const today=()=>new Date().toISOString().slice(0,10);

// DOM helper: never uses innerHTML, so user data can't become markup.
function el(tag,props,...kids){
  const e=document.createElement(tag);
  for(const[k,v]of Object.entries(props||{})){
    if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k in e)e[k]=v;else e.setAttribute(k,v);
  }
  kids.flat().forEach(c=>e.append(c));return e;
}
// Validate every record (from storage or imported files) against an allowlist.
const num=(v,lo,hi)=>(typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi)?v:null;
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const idOf=v=>str(v,40).replace(/[^\w-]/g,'')||uid();
const dateOf=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';
function clean(r){
  if(!r||typeof r!=='object')return null;
  const lat=num(r.lat,-90,90),lng=num(r.lng,-180,180);
  if(lat===null||lng===null)return null;
  return{id:idOf(r.id),lat,lng,
    cat:Object.hasOwn(CATS,r.cat)?r.cat:'unsure',
    type:TYPES.includes(r.type)?r.type:'Other',
    cond:CONDS.includes(r.cond)?r.cond:'—',
    signs:Array.isArray(r.signs)?r.signs.filter(s=>SIGNS.includes(s)):[],
    addr:str(r.addr,200),note:str(r.note,2000),date:dateOf(r.date)};
}
function cleanPath(r){
  if(!r||typeof r!=='object'||!Array.isArray(r.pts))return null;
  const pts=[];
  for(const q of r.pts.slice(0,20000)){
    if(!Array.isArray(q))continue;
    const a=num(q[0],-90,90),b=num(q[1],-180,180);
    if(a!==null&&b!==null)pts.push([a,b]);
  }
  return pts.length<2?null:{id:idOf(r.id),pts,name:str(r.name,100),date:dateOf(r.date)};
}
const load=(k,fn)=>{try{const r=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(r)?r.map(fn).filter(Boolean):[]}catch(e){return[]}};
let pins=load(KEY,clean),paths=load(PKEY,cleanPath);
let fileHandle=null,dirty=false,lastSaved='';
function showStatus(){
  $('status').textContent=fileHandle
    ?(dirty?'Not yet saved to '+fileHandle.name+' (Ctrl+S)':'Saved to '+fileHandle.name+lastSaved)
    :'Autosaved in this browser · Ctrl+S saves a file';
}
// Every change is autosaved in this browser (localStorage); Ctrl+S additionally writes a file.
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(pins));localStorage.setItem(PKEY,JSON.stringify(paths))}catch(e){}dirty=true;showStatus()};
// Recover a GPS recording that was interrupted (tab closed, phone locked...).
{const d=cleanPath({pts:load(DKEY,q=>q),name:'Recovered recording',date:today()});
 if(d){paths.push(d);save()}
 try{localStorage.removeItem(DKEY)}catch(e){}}

const visible={...Object.fromEntries(Object.keys(CATS).map(k=>[k,true])),paths:true};
const layers={};
const hiddenPaths=new Set();let pathsOpen=false;
let selected=null,adding=false,drawing=false,recording=false,draft=[],draftLine=null,watchId=null;
const map=L.map('map',{zoomControl:false}).setView([51.4416,5.4697],14);
L.control.zoom({position:'topright'}).addTo(map);
const base={
  'Map (PDOK, Kadaster)':L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',{maxZoom:19,attribution:'Kaartgegevens © Kadaster (PDOK)'}),
  'Aerial (PDOK)':L.tileLayer('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',{maxZoom:19,attribution:'Luchtfoto © Beeldmateriaal Nederland (PDOK)'}),
  'OpenStreetMap':L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'})};
base['Map (PDOK, Kadaster)'].addTo(map);
L.control.layers(base,null,{position:'topright'}).addTo(map);

// ---- undo / redo (snapshots of pins + paths) ----
const undoS=[],redoS=[];
const snap=()=>JSON.stringify({pins,paths});
function checkpoint(){undoS.push(snap());if(undoS.length>100)undoS.shift();redoS.length=0}
function restore(s){
  const o=JSON.parse(s);
  pins=o.pins.map(clean).filter(Boolean);paths=o.paths.map(cleanPath).filter(Boolean);
  selected=null;map.closePopup();save();render();
}
function doUndo(){
  if(drawing){if(!recording&&draft.length){draft.pop();drawDraft()}return}
  if(!undoS.length)return;redoS.push(snap());restore(undoS.pop());
}
function doRedo(){if(drawing||!redoS.length)return;undoS.push(snap());restore(redoS.pop())}

// ---- selection / delete ----
const isSel=(kind,id)=>!!selected&&selected.kind===kind&&selected.id===id;
function setSelected(kind,id){
  selected=id?{kind,id}:null;
  for(const k in layers){
    const l=layers[k],kd=k[0]==='p'?'pin':'path',id2=k.slice(1);
    if(kd==='pin'){const d=l.getElement()&&l.getElement().firstChild;if(d)d.classList.toggle('sel',isSel('pin',id2))}
    else l.setStyle({weight:isSel('path',id2)?7:4});
  }
}
function del(kind,id){
  checkpoint();
  if(kind==='pin')pins=pins.filter(p=>p.id!==id);else paths=paths.filter(p=>p.id!==id);
  selected=null;map.closePopup();save();render();
}

// ---- render ----
const icon=()=>L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[20,20],iconAnchor:[10,10],popupAnchor:[0,-10]});
const km=pts=>pts.reduce((s,q,i)=>i?s+map.distance(pts[i-1],q):0,0)/1000;
function render(){
  for(const k in layers){map.removeLayer(layers[k]);delete layers[k]}
  pins.forEach(p=>{
    if(!visible[p.cat])return;
    const m=L.marker([p.lat,p.lng],{icon:icon(),draggable:true}).addTo(map);
    const d=m.getElement().firstChild;d.style.background=CATS[p.cat].c;d.classList.toggle('sel',isSel('pin',p.id));
    m.on('click',()=>{setSelected('pin',p.id);openForm(p,m)});
    m.on('dragstart',checkpoint);
    m.on('dragend',()=>{const ll=m.getLatLng();p.lat=ll.lat;p.lng=ll.lng;save()});
    layers['p'+p.id]=m;
  });
  if(visible.paths)paths.forEach(pa=>{
    if(hiddenPaths.has(pa.id))return;
    const l=L.polyline(pa.pts,{color:'#1f6fb5',weight:isSel('path',pa.id)?7:4,opacity:.85,bubblingMouseEvents:false}).addTo(map);
    l.on('click',e=>{if(drawing){if(!recording)addVertex(e.latlng);return}setSelected('path',pa.id);openPathForm(pa,e.latlng)});
    layers['l'+pa.id]=l;
  });
  const rows=Object.entries(CATS).map(([k,v])=>{
    const cb=el('input',{type:'checkbox',checked:visible[k],onchange:()=>{visible[k]=cb.checked;render()}});
    const dot=el('span',{class:'dot'});dot.style.background=v.c;
    return el('label',{},cb,dot,v.l,el('span',{class:'n',text:String(pins.filter(p=>p.cat===k).length)}));
  });
  const pcb=el('input',{type:'checkbox',checked:visible.paths,onchange:()=>{visible.paths=pcb.checked;render()}});
  const total=paths.reduce((s,p)=>s+km(p.pts),0);
  rows.push(el('label',{},pcb,el('span',{class:'line'}),'Paths',el('span',{class:'n',text:paths.length+' · '+total.toFixed(1)+' km'})));
  // One legend row per finished path; with more than 5 they are grouped in a collapsible list.
  const MAX_LISTED=5;
  const items=paths.map((pa,i)=>{
    const cb=el('input',{type:'checkbox',checked:!hiddenPaths.has(pa.id),onchange:()=>{if(cb.checked)hiddenPaths.delete(pa.id);else hiddenPaths.add(pa.id);render()}});
    const name=el('button',{class:'lnk',text:pa.name||'Path '+(i+1),title:'Zoom to this path',onclick:()=>{
      hiddenPaths.delete(pa.id);visible.paths=true;render();setSelected('path',pa.id);
      map.fitBounds(L.latLngBounds(pa.pts),{padding:[40,40]});}});
    return el('div',{class:'prow'},cb,el('span',{class:'line'}),name,el('span',{class:'n',text:km(pa.pts).toFixed(1)+' km'}));
  });
  if(items.length>MAX_LISTED){
    rows.push(el('button',{class:'lnk grp',text:(pathsOpen?'▾ Hide ':'▸ Show ')+'all '+items.length+' paths',onclick:()=>{pathsOpen=!pathsOpen;render()}}));
    if(pathsOpen)rows.push(el('div',{class:'plist'},items));
  }else rows.push(...items);
  $('cats').replaceChildren(...rows);
  $('tot').textContent=pins.length;
}

// ---- forms ----
const mk=(items,sel)=>el('select',{},items.map(o=>el('option',{value:o,text:o,selected:o===sel})));
const field=(label,node)=>el('div',{},el('small',{text:label}),node);
function openForm(p,m){
  const cat=el('select',{},Object.entries(CATS).map(([k,v])=>el('option',{value:k,text:v.l,selected:k===p.cat})));
  const addr=el('input',{type:'text',value:p.addr,maxLength:200});
  const type=mk(TYPES,p.type),cond=mk(CONDS,p.cond);
  const boxes=SIGNS.map(s=>el('input',{type:'checkbox',value:s,checked:p.signs.includes(s)}));
  const signs=el('div',{class:'chk'},boxes.map((b,i)=>el('label',{},b,SIGNS[i])));
  const note=el('textarea',{rows:2,value:p.note,maxLength:2000});
  const form=el('div',{class:'form'},
    field('Occupancy',cat),field('Address (optional)',addr),
    el('div',{class:'row'},field('Type',type),field('Visible condition',cond)),
    field('Signs observed',signs),field('Notes',note),
    el('div',{class:'meta',text:'Surveyed: '+p.date}),
    el('div',{class:'row'},
      el('button',{class:'pri',text:'Save',onclick:()=>{
        checkpoint();
        Object.assign(p,clean({...p,cat:cat.value,addr:addr.value,type:type.value,cond:cond.value,signs:boxes.filter(b=>b.checked).map(b=>b.value),note:note.value}));
        save();map.closePopup();render();}}),
      el('button',{text:'Delete',onclick:()=>del('pin',p.id)})));
  m.bindPopup(form,{minWidth:250,maxHeight:380}).openPopup();
}
function openPathForm(pa,latlng){
  const name=el('input',{type:'text',value:pa.name,maxLength:100,placeholder:'e.g. Strijp-S loop'});
  const form=el('div',{class:'form'},
    field('Route name',name),
    el('div',{class:'meta',text:km(pa.pts).toFixed(2)+' km · '+pa.pts.length+' points · '+pa.date}),
    el('div',{class:'row'},
      el('button',{class:'pri',text:'Save',onclick:()=>{checkpoint();pa.name=str(name.value,100);save();map.closePopup();render()}}),
      el('button',{text:'Delete',onclick:()=>del('path',pa.id)})));
  L.popup({minWidth:230}).setLatLng(latlng).setContent(form).openOn(map);
}

// ---- points ----
function newPin(lat,lng){
  checkpoint();
  const p=clean({lat,lng,cat:'unsure',type:'Residential',cond:'—',signs:[],addr:'',note:'',date:today()});
  pins.push(p);save();render();setSelected('pin',p.id);openForm(p,layers['p'+p.id]);
}

// ---- paths (manual drawing or GPS recording) ----
function drawDraft(){
  if(draftLine){map.removeLayer(draftLine);draftLine=null}
  if(draft.length)draftLine=L.polyline(draft,{color:'#1f6fb5',weight:4,dashArray:'6 8',interactive:false}).addTo(map);
}
function addVertex(ll){draft.push([ll.lat,ll.lng]);drawDraft()}
function stopWatch(){if(watchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(watchId)}watchId=null}
function endDraw(){
  stopWatch();drawing=false;recording=false;draft=[];drawDraft();
  try{localStorage.removeItem(DKEY)}catch(e){}
  setMode();
}
function finishPath(){
  const pa=cleanPath({pts:draft,id:'',name:'',date:today()});
  if(pa){checkpoint();paths.push(pa);save()}
  endDraw();render();
}
function startPath(rec){
  adding=false;drawing=true;recording=rec;draft=[];setMode();
  if(!rec)return;
  if(!navigator.geolocation){alert('Geolocation not available');endDraw();return}
  watchId=navigator.geolocation.watchPosition(pos=>{
    if(pos.coords.accuracy>40)return;
    const ll=[pos.coords.latitude,pos.coords.longitude],last=draft[draft.length-1];
    if(last&&map.distance(last,ll)<8)return;
    draft.push(ll);drawDraft();
    if(!map.getBounds().contains(ll))map.panTo(ll);
    try{localStorage.setItem(DKEY,JSON.stringify(draft))}catch(e){}
  },err=>{if(err.code===3)return;alert('Location unavailable: check the browser permissions');endDraw()},
  {enableHighAccuracy:true,maximumAge:2000,timeout:20000});
}

// ---- modes / buttons ----
function setMode(){
  $('add').classList.toggle('on',adding);
  $('pbtn').textContent=drawing&&!recording?'Finish':'Path';
  $('rec').textContent=drawing&&recording?'Stop':'Rec';
  $('pbtn').disabled=drawing&&recording;$('rec').disabled=drawing&&!recording;
  const msg=adding?'Tap the map to place the point':drawing?(recording?'Recording your route… tap Stop to save':'Tap to add path vertices · Enter = finish · Esc = cancel'):'';
  $('hint').textContent=msg;$('hint').style.display=msg?'block':'none';
  map.getContainer().style.cursor=(adding||(drawing&&!recording))?'crosshair':'';
}
$('add').onclick=()=>{if(drawing)endDraw();adding=!adding;setMode()};
$('pbtn').onclick=()=>drawing?finishPath():startPath(false);
$('rec').onclick=()=>drawing?finishPath():startPath(true);
$('undo').onclick=doUndo;$('redo').onclick=doRedo;
map.on('click',e=>{
  if(adding){adding=false;setMode();newPin(e.latlng.lat,e.latlng.lng)}
  else if(drawing){if(!recording)addVertex(e.latlng)}
  else setSelected(null,null);
});
$('gps').onclick=()=>{
  if(!navigator.geolocation){alert('Geolocation not available');return}
  navigator.geolocation.getCurrentPosition(pos=>{
    map.setView([pos.coords.latitude,pos.coords.longitude],18);
    newPin(pos.coords.latitude,pos.coords.longitude);
  },()=>alert('Location unavailable: check the browser permissions'),{enableHighAccuracy:true,timeout:15000});
};

// ---- keyboard ----
document.addEventListener('keydown',e=>{
  const t=e.target;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveFile(e.shiftKey);return}
  if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))return; // keep native text editing
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='z'&&!e.shiftKey){e.preventDefault();doUndo()}
  else if(mod&&(k==='y'||(k==='z'&&e.shiftKey))){e.preventDefault();doRedo()}
  else if((e.key==='Delete'||e.key==='Backspace')&&selected&&!drawing){e.preventDefault();del(selected.kind,selected.id)}
  else if(e.key==='Enter'&&drawing&&!recording&&!(t&&t.tagName==='BUTTON'))finishPath();
  else if(e.key==='Escape'){if(drawing)endDraw();else if(adding){adding=false;setMode()}else map.closePopup()}
});

// ---- export / import (GeoJSON) ----
const geojson=()=>({type:'FeatureCollection',features:[
  ...pins.map(p=>{const{lat,lng,...pr}=p;return{type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{kind:'point',...pr}}}),
  ...paths.map(p=>({type:'Feature',geometry:{type:'LineString',coordinates:p.pts.map(([a,b])=>[b,a])},properties:{kind:'path',id:p.id,name:p.name,date:p.date}}))]});
function download(text){
  const a=el('a',{href:URL.createObjectURL(new Blob([text],{type:'application/geo+json'})),download:'eindhoven-vacancy.geojson'});
  a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
// Remember the chosen file between visits (a file handle can be stored in IndexedDB).
const idb=()=>new Promise((res,rej)=>{const r=indexedDB.open('vacancy-map',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const kvGet=async k=>{const db=await idb();return new Promise((res,rej)=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})};
const kvSet=async(k,v)=>{const db=await idb();return new Promise((res,rej)=>{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)})};
async function saveFile(asNew){
  const text=JSON.stringify(geojson(),null,1);
  if(!window.showSaveFilePicker){
    download(text);dirty=false;$('status').textContent='Downloaded a copy · still autosaved in this browser';return;
  }
  try{
    if(asNew||!fileHandle){
      fileHandle=await window.showSaveFilePicker({suggestedName:'eindhoven-vacancy.geojson',types:[{description:'GeoJSON',accept:{'application/geo+json':['.geojson']}}]});
      kvSet('file',fileHandle).catch(()=>{});
    }else if(await fileHandle.queryPermission({mode:'readwrite'})!=='granted'&&await fileHandle.requestPermission({mode:'readwrite'})!=='granted'){
      throw new Error('permission denied');
    }
    const w=await fileHandle.createWritable();await w.write(text);await w.close();
    dirty=false;lastSaved=' · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});showStatus();
  }catch(e){
    if(e&&e.name==='AbortError')return;
    $('status').textContent='Could not save the file: '+(e&&e.message||'error');
  }
}
$('sv').onclick=()=>saveFile(false);
$('exp').onclick=()=>saveFile(true);
window.addEventListener('beforeunload',e=>{if(fileHandle&&dirty){e.preventDefault();e.returnValue=''}});
if(window.indexedDB)kvGet('file').then(h=>{if(h&&h.createWritable){fileHandle=h;showStatus()}}).catch(()=>{});
$('imp').onclick=()=>$('file').click();
$('file').onchange=async()=>{
  const f=$('file').files[0];$('file').value='';
  if(!f)return;
  if(f.size>5e6){alert('File too large (max 5 MB)');return}
  try{
    const gj=JSON.parse(await f.text());
    const feats=Array.isArray(gj.features)?gj.features.slice(0,5000):[];
    const np=[],nl=[];
    feats.forEach(ft=>{
      const g=ft&&ft.geometry,pr=(ft&&ft.properties)||{};
      if(!g||!Array.isArray(g.coordinates))return;
      if(g.type==='Point'){
        const p=clean({...pr,lat:g.coordinates[1],lng:g.coordinates[0]});
        if(p&&!pins.some(x=>x.id===p.id)&&!np.some(x=>x.id===p.id))np.push(p);
      }else if(g.type==='LineString'){
        const l=cleanPath({id:pr.id,name:pr.name,date:pr.date,pts:g.coordinates.map(c=>Array.isArray(c)?[c[1],c[0]]:null)});
        if(l&&!paths.some(x=>x.id===l.id)&&!nl.some(x=>x.id===l.id))nl.push(l);
      }
    });
    if(np.length||nl.length){checkpoint();pins.push(...np);paths.push(...nl);save();render()}
    alert(np.length+' points and '+nl.length+' paths imported');
  }catch(e){alert('Invalid file')}
};
setMode();render();showStatus();dirty=false;

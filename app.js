'use strict';
const CATS={
  vacant:{l:'Vacant (strong signs)',c:'#b3261e'},
  probable:{l:'Probably vacant',c:'#e08a1e'},
  occupied:{l:'Occupied',c:'#3a7d44'},
  unsure:{l:'Unsure',c:'#7a7a7a'}};
const SIGNS=['To-let / for-sale sign (te huur / te koop)','Shutters always closed','Mailbox full or sealed','No lights at night','Paper covering windows','Fencing / construction hoarding','Ground floor closed, upper floors empty','Anti-squat / temporary guardians','Broken or boarded windows','Overgrown vegetation'];
const TYPES=['Residential','Commercial','Industrial','Office','Other'];
const CONDS=['—','Good','Neglected','Dilapidated'];
const KEY='eindhoven-vacancy-v2';
const $=id=>document.getElementById(id);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

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
function clean(r){
  if(!r||typeof r!=='object')return null;
  const lat=num(r.lat,-90,90),lng=num(r.lng,-180,180);
  if(lat===null||lng===null)return null;
  return{
    id:str(r.id,40).replace(/[^\w-]/g,'')||uid(),lat,lng,
    cat:Object.hasOwn(CATS,r.cat)?r.cat:'unsure',
    type:TYPES.includes(r.type)?r.type:'Other',
    cond:CONDS.includes(r.cond)?r.cond:'—',
    signs:Array.isArray(r.signs)?r.signs.filter(s=>SIGNS.includes(s)):[],
    addr:str(r.addr,200),note:str(r.note,2000),
    date:/^\d{4}-\d{2}-\d{2}$/.test(r.date)?r.date:''};
}
let pins=[];
try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(raw))pins=raw.map(clean).filter(Boolean)}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(pins))}catch(e){}};

const visible=Object.fromEntries(Object.keys(CATS).map(k=>[k,true]));
const markers={};
const map=L.map('map',{zoomControl:false}).setView([51.4416,5.4697],14);
L.control.zoom({position:'topright'}).addTo(map);
const base={
  'Map (PDOK, Kadaster)':L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png',{maxZoom:19,attribution:'Kaartgegevens © Kadaster (PDOK)'}),
  'Aerial (PDOK)':L.tileLayer('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',{maxZoom:19,attribution:'Luchtfoto © Beeldmateriaal Nederland (PDOK)'}),
  'OpenStreetMap':L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'})};
base['Map (PDOK, Kadaster)'].addTo(map);
L.control.layers(base,null,{position:'topright'}).addTo(map);

const icon=c=>L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[20,20],iconAnchor:[10,10],popupAnchor:[0,-10]});
function render(){
  for(const id in markers){map.removeLayer(markers[id]);delete markers[id]}
  pins.forEach(p=>{
    if(!visible[p.cat])return;
    const m=L.marker([p.lat,p.lng],{icon:icon(),draggable:true}).addTo(map);
    m.getElement().firstChild.style.background=CATS[p.cat].c;
    m.on('click',()=>openForm(p,m));
    m.on('dragend',()=>{const ll=m.getLatLng();p.lat=ll.lat;p.lng=ll.lng;save()});
    markers[p.id]=m;
  });
  $('cats').replaceChildren(...Object.entries(CATS).map(([k,v])=>{
    const cb=el('input',{type:'checkbox',checked:visible[k],onchange:()=>{visible[k]=cb.checked;render()}});
    const dot=el('span',{class:'dot'});dot.style.background=v.c;
    return el('label',{},cb,dot,v.l,el('span',{class:'n',text:String(pins.filter(p=>p.cat===k).length)}));
  }));
  $('tot').textContent=pins.length;
}

const select=(id,items,sel)=>el('select',{id},items.map(o=>el('option',{value:o,text:o,selected:o===sel})));
const field=(label,node)=>el('div',{},el('small',{text:label}),node);
function openForm(p,m){
  const cat=el('select',{},Object.entries(CATS).map(([k,v])=>el('option',{value:k,text:v.l,selected:k===p.cat})));
  const addr=el('input',{type:'text',value:p.addr,maxLength:200});
  const type=select('',TYPES,p.type),cond=select('',CONDS,p.cond);
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
        p.cat=cat.value;p.addr=addr.value;p.type=type.value;p.cond=cond.value;
        p.signs=boxes.filter(b=>b.checked).map(b=>b.value);p.note=note.value;
        const c=clean(p);Object.assign(p,c);save();map.closePopup();render();}}),
      el('button',{text:'Delete',onclick:()=>{if(confirm('Delete this point?')){pins=pins.filter(x=>x!==p);save();map.closePopup();render()}}})));
  m.bindPopup(form,{minWidth:250,maxHeight:380}).openPopup();
}
function newPin(lat,lng){
  const p=clean({lat,lng,cat:'unsure',type:'Residential',cond:'—',signs:[],addr:'',note:'',date:new Date().toISOString().slice(0,10)});
  pins.push(p);save();render();openForm(p,markers[p.id]);
}

let adding=false;
function setAdding(v){adding=v;$('add').classList.toggle('on',v);$('hint').style.display=v?'block':'none';map.getContainer().style.cursor=v?'crosshair':''}
$('add').onclick=()=>setAdding(!adding);
map.on('click',e=>{if(adding){setAdding(false);newPin(e.latlng.lat,e.latlng.lng)}});
$('gps').onclick=()=>{
  if(!navigator.geolocation){alert('Geolocation not available');return}
  navigator.geolocation.getCurrentPosition(pos=>{
    map.setView([pos.coords.latitude,pos.coords.longitude],18);
    newPin(pos.coords.latitude,pos.coords.longitude);
  },()=>alert('Location unavailable: check the browser permissions'),{enableHighAccuracy:true,timeout:15000});
};

$('exp').onclick=()=>{
  const gj={type:'FeatureCollection',features:pins.map(p=>{const{lat,lng,...pr}=p;return{type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:pr}})};
  const a=el('a',{href:URL.createObjectURL(new Blob([JSON.stringify(gj,null,1)],{type:'application/geo+json'})),download:'eindhoven-vacancy.geojson'});
  a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$('imp').onclick=()=>$('file').click();
$('file').onchange=async()=>{
  const f=$('file').files[0];$('file').value='';
  if(!f)return;
  if(f.size>2e6){alert('File too large (max 2 MB)');return}
  try{
    const gj=JSON.parse(await f.text());
    const feats=Array.isArray(gj.features)?gj.features.slice(0,5000):[];
    let n=0;
    feats.forEach(ft=>{
      const co=ft&&ft.geometry&&ft.geometry.type==='Point'?ft.geometry.coordinates:null;
      if(!Array.isArray(co))return;
      const p=clean({...(ft.properties||{}),lat:co[1],lng:co[0]});
      if(p&&!pins.some(x=>x.id===p.id)){pins.push(p);n++}
    });
    save();render();alert(n+' points imported');
  }catch(e){alert('Invalid file')}
};
render();

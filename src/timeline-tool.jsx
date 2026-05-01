import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";

/* ======= STYLE HELPERS ======= */
const QF = "'Quicksand'";
const BDR = c => `1px solid ${c.bdr}`;
const stop = e => e.stopPropagation();

/* ======= ERROR BOUNDARY ======= */
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={hasError:false,error:null};}
  static getDerivedStateFromError(error){return {hasError:true,error};}
  render(){
    if(this.state.hasError) return (
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"'Quicksand',sans-serif",flexDirection:"column",gap:12,padding:40}}>
        <div style={{fontSize:32,opacity:0.3}}>{"\u26A0"}</div>
        <div style={{fontSize:14,fontWeight:600}}>Something went wrong in this tab</div>
        <div style={{fontSize:11,color:"#999",maxWidth:300,textAlign:"center"}}>{this.state.error?.message||"Unknown error"}</div>
        <button onClick={()=>this.setState({hasError:false,error:null})}
          style={{padding:"8px 20px",borderRadius:10,border:"1px solid #e0e0e0",background:"transparent",
            cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:QF}}>Reload tab</button>
      </div>
    );
    return this.props.children;
  }
}

/* ══════ HTML SANITIZER ══════ */
const SAFE_TAGS = new Set(["p","br","b","i","u","s","em","strong","span","div","h1","h2","h3","h4","h5","h6",
  "ul","ol","li","a","blockquote","pre","code","hr","sub","sup","font","table","tr","td","th","tbody","thead"]);
const SAFE_ATTRS = new Set(["style","href","target","color","size","face","class","align"]);
function sanitizeHTML(html) {
  if(!html) return "";
  const doc = new DOMParser().parseFromString(html,"text/html");
  const walk = node => {
    if(node.nodeType===3) return; /* text node, safe */
    if(node.nodeType===1){
      const tag = node.tagName.toLowerCase();
      if(!SAFE_TAGS.has(tag)){node.remove();return;}
      /* Remove dangerous attributes */
      [...node.attributes].forEach(a=>{
        const n=a.name.toLowerCase();
        if(n.startsWith("on")||n==="srcdoc"||n==="formaction") node.removeAttribute(a.name);
        else if(n==="href"&&a.value.trim().toLowerCase().startsWith("javascript:")) node.removeAttribute(a.name);
        else if(!SAFE_ATTRS.has(n)&&n!=="colspan"&&n!=="rowspan") node.removeAttribute(a.name);
      });
      /* Remove style expressions */
      if(node.style){
        const s=node.getAttribute("style")||"";
        if(s.match(/expression|javascript|url\s*\(/i)) node.removeAttribute("style");
      }
    }
    [...node.childNodes].forEach(walk);
  };
  walk(doc.body);
  return doc.body.innerHTML;
}


/* ══════ LINK PREVIEW FETCHER ══════ */
async function fetchLinkPreview(url) {
  try {
    const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    const resp = await fetch(proxyUrl, {signal: AbortSignal.timeout(8000)});
    if (!resp.ok) throw new Error("fetch failed");
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const getMeta = (name) => {
      const el = doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
      return el?.getAttribute("content") || "";
    };
    const title = getMeta("og:title") || doc.querySelector("title")?.textContent || "";
    const description = getMeta("og:description") || getMeta("description") || "";
    const image = getMeta("og:image") || "";
    const siteName = getMeta("og:site_name") || "";
    /* Try to find a date from various meta tags */
    let date = getMeta("article:published_time") || getMeta("datePublished")
      || getMeta("date") || getMeta("DC.date.issued") || getMeta("pubdate") || "";
    /* Also check for JSON-LD datePublished */
    if (!date) {
      const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
      for (const s of ldScripts) {
        try {
          const ld = JSON.parse(s.textContent);
          const d = ld.datePublished || ld.dateCreated || (Array.isArray(ld["@graph"]) && ld["@graph"].find(g=>g.datePublished)?.datePublished);
          if (d) { date = d; break; }
        } catch(e) {}
      }
    }
    /* Normalize date to YYYY-MM-DD if possible */
    if (date) {
      try {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString().split("T")[0];
        }
      } catch(e) {}
    }
    /* Make relative image URLs absolute */
    let absImage = image;
    if (image && !image.startsWith("http")) {
      try {
        absImage = new URL(image, url).href;
      } catch(e) {}
    }
    return { title: title.trim(), description: description.trim(), image: absImage, date, siteName: siteName.trim(), url };
  } catch(e) {
    return { title: "", description: "", image: "", date: "", siteName: "", url, error: e.message };
  }
}

/* ══════ FILE SIZE LIMIT ══════ */
const MAX_FILE_MB = 2;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
function validateFile(file) {
  if(!file) return "No file selected";
  if(file.size > MAX_FILE_BYTES) return `File too large (${(file.size/1024/1024).toFixed(1)}MB). Max ${MAX_FILE_MB}MB.`;
  return null;
}

/* ══════ BACKUP VALIDATION ══════ */
function validateBackup(d) {
  if(!d || typeof d !== "object") return "Invalid backup format";
  if(d.projects && !Array.isArray(d.projects)) return "Invalid projects data";
  if(d.scripts && !Array.isArray(d.scripts)) return "Invalid scripts data";
  if(d.sbP && !Array.isArray(d.sbP)) return "Invalid storyboard data";
  if(d.projects) for(const p of d.projects){
    if(!p.id||typeof p.id!=="string") return "Invalid project ID";
    if(p.nodes&&!Array.isArray(p.nodes)) return "Invalid nodes data";
    if(p.conns&&!Array.isArray(p.conns)) return "Invalid connections data";
  }
  if(d.scripts) for(const s of d.scripts){
    if(!s.id||typeof s.id!=="string") return "Invalid script ID";
  }
  /* Check total size isn't absurd (>50MB of JSON) */
  const str = JSON.stringify(d);
  if(str.length > 50*1024*1024) return "Backup file is too large";
  return null;
}

function useIsMobile() {
  const [m,sM]=useState(()=>typeof window!=="undefined"&&(window.innerWidth<768||"ontouchstart" in window));
  useEffect(()=>{
    const h=()=>sM(window.innerWidth<768||"ontouchstart" in window);
    window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);
  },[]);
  return m;
}

const FONT = "https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap";

const PA_L = [
  {l:"Default",v:null},{l:"Rose",v:"#fce4ec"},{l:"Peach",v:"#fff3e0"},
  {l:"Lemon",v:"#fffde7"},{l:"Mint",v:"#e8f5e9"},{l:"Sky",v:"#e3f2fd"},
  {l:"Lavender",v:"#f3e5f5"},{l:"Seafoam",v:"#e0f2f1"},{l:"Cream",v:"#fefce8"},
];
const PA_D = [
  {l:"Default",v:null},{l:"Rose",v:"#3d2028"},{l:"Peach",v:"#3d3020"},
  {l:"Lemon",v:"#3d3a1a"},{l:"Mint",v:"#1e3322"},{l:"Sky",v:"#1e2d3d"},
  {l:"Lavender",v:"#2d1e3d"},{l:"Seafoam",v:"#1e3330"},{l:"Cream",v:"#3a381e"},
];

const TH = {
  light: {
    bg:"#fff",surf:"#f8f8f8",surfH:"#f0f0f0",bdr:"#e0e0e0",
    txt:"#1a1a1a",txt2:"#666",txt3:"#767676",acc:"#1a1a1a",
    shd:"rgba(0,0,0,0.08)",ln:"#1a1a1a",
    ctx:"#fff",ctxB:"#e0e0e0",ctxH:"#f5f5f5",
    port:"#1a1a1a",ov:"rgba(0,0,0,0.3)",sb:"#fafafa",
    pl:"#d0d0d0",gr:"#f0f0f0",grM:"#e4e4e4",inf:"#f5f5f5",
    tBg:"#fafafa",tA:"#1a1a1a",tT:"#767676",
    sBg:"#f0f0f0",sPg:"#fff",sGt:"#f5f5f5",
    pu:"rgba(26,26,26,0.6)",
    cBg:"#fff",cH:"#f0f0f0",cS:"#1a1a1a",cT:"#4a6fa5",
    gBg:"rgba(0,0,0,0.07)",gD:"#767676",lH:"#eef1ff",
  },
  dark: {
    bg:"#1a1a1a",surf:"#252525",surfH:"#303030",bdr:"#383838",
    txt:"#f0f0f0",txt2:"#aaa",txt3:"#949494",acc:"#f0f0f0",
    shd:"rgba(0,0,0,0.3)",ln:"#f0f0f0",
    ctx:"#252525",ctxB:"#383838",ctxH:"#333",
    port:"#f0f0f0",ov:"rgba(0,0,0,0.6)",sb:"#202020",
    pl:"#383838",gr:"#222",grM:"#282828",inf:"#2a2a2a",
    tBg:"#202020",tA:"#f0f0f0",tT:"#8a8a8a",
    sBg:"#161616",sPg:"#1e1e1e",sGt:"#252525",
    pu:"rgba(240,240,240,0.6)",
    cBg:"#2a2a2a",cH:"#333",cS:"#f0f0f0",cT:"#7a9fd5",
    gBg:"rgba(255,255,255,0.07)",gD:"#8a8a8a",lH:"#2a2a30",
  },
};

let _id = 100;
const uid = () => `id_${++_id}_${Date.now()}`;

const NT = {STL:"stl",ETL:"etl",EVT:"evt",NOTE:"note",ASSET:"asset"};
const NTL = {stl:"Story Timeline",etl:"Event Timeline",evt:"Event",note:"Note",asset:"Asset",person:"Person",place:"Place",object:"Object"};
const isTL = t => t==="stl"||t==="etl";

const NCL = {stl:{bg:"#eef3fa",bd:"#4a6fa5"},etl:{bg:"#f5efe8",bd:"#8b5e3c"},evt:{bg:"#fff",bd:"#1a1a1a"},note:{bg:"#fffde6",bd:"#c4b84d"},asset:{bg:"#eef8ee",bd:"#4a8b4a"},person:{bg:"#fef0f5",bd:"#b85478"},place:{bg:"#eef9f7",bd:"#3a8b88"},object:{bg:"#f5f0e8",bd:"#9b7a3e"}};
const NCD = {stl:{bg:"#2a3545",bd:"#7a9fd5"},etl:{bg:"#3a2e22",bd:"#c49a6c"},evt:{bg:"#252525",bd:"#f0f0f0"},note:{bg:"#35331a",bd:"#d4c85d"},asset:{bg:"#1e301e",bd:"#6ab06a"},person:{bg:"#3a2530",bd:"#d57aa0"},place:{bg:"#1e3530",bd:"#5cc0bc"},object:{bg:"#3a3022",bd:"#c4a06c"}};

const mkP = () => ({id:uid(),name:"Untitled Project",nodes:[],conns:[]});
const mkS = () => ({id:uid(),title:"",writers:"",phase:"pick",mode:"",lines:[],docHtml:""});

const pPos = (n,p) => {
  const w=n.w||200, h=n.h||100;
  if(p.s==="top") return {x:n.x+p.p*w,y:n.y};
  if(p.s==="bottom") return {x:n.x+p.p*w,y:n.y+h};
  if(p.s==="left") return {x:n.x,y:n.y+p.p*h};
  return {x:n.x+w,y:n.y+p.p*h};
};

const nearE = (n,cx,cy) => {
  const w=n.w||200, h=n.h||100, rx=cx-n.x, ry=cy-n.y;
  const dT=Math.abs(ry), dB=Math.abs(h-ry), dL=Math.abs(rx), dR=Math.abs(w-rx);
  const m=Math.min(dT,dB,dL,dR), cl=v=>Math.max(0.05,Math.min(0.95,v));
  if(m===dT) return {s:"top",p:cl(rx/w)};
  if(m===dB) return {s:"bottom",p:cl(rx/w)};
  if(m===dL) return {s:"left",p:cl(ry/h)};
  return {s:"right",p:cl(ry/h)};
};

const d2 = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const fmtD = iso => {if(!iso)return"";const[y,m,d]=iso.split("-");return `${d}/${m}/${y}`;};
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function Calendar({c,val,onChange,onClose,onRemove,dateSide,onSideChange}) {
  const pr = val ? new Date(val+"T00:00:00") : new Date();
  const vd = isNaN(pr.getTime()) ? new Date() : pr;
  const [vy,sVy] = useState(vd.getFullYear());
  const [vm,sVm] = useState(vd.getMonth());
  const today = new Date();
  const fd = new Date(vy,vm,1).getDay();
  const dim = new Date(vy,vm+1,0).getDate();
  const days = [];
  for(let i=0;i<fd;i++) days.push(null);
  for(let i=1;i<=dim;i++) days.push(i);
  const sel = d => {
    onChange(`${vy}-${String(vm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    onClose();
  };
  const isS = d => val===`${vy}-${String(vm+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const isT = d => d===today.getDate()&&vm===today.getMonth()&&vy===today.getFullYear();
  const abtn = {background:c.surf,border:`1.5px solid ${c.bdr}`,borderRadius:8,width:32,height:32,
    display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,fontWeight:700,color:c.txt};

  return (
    <div style={{position:"absolute",zIndex:300,background:c.cBg,border:BDR(c),borderRadius:14,padding:12,boxShadow:`0 8px 24px ${c.shd}`,fontFamily:QF,width:240}}
      onMouseDown={stop} onClick={stop}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <button onClick={()=>{if(vm===0){sVm(11);sVy(vy-1);}else sVm(vm-1);}} style={abtn}>{"‹"}</button>
        <span style={{fontSize:12,fontWeight:700,color:c.txt}}>{MO[vm]} {vy}</span>
        <button onClick={()=>{if(vm===11){sVm(0);sVy(vy+1);}else sVm(vm+1);}} style={abtn}>{"›"}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:2}}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>(
          <div key={d} style={{fontSize:9,fontWeight:700,color:c.txt3,textAlign:"center",padding:2}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1}}>
        {days.map((d,i) => d===null ? <div key={"e"+i}/> : (
          <button key={d} onClick={()=>sel(d)}
            style={{width:28,height:28,borderRadius:8,border:"none",fontSize:11,fontWeight:600,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              background:isS(d)?c.cS:"transparent",
              color:isS(d)?c.cBg:isT(d)?c.cT:c.txt,
              outline:isT(d)&&!isS(d)?`1.5px solid ${c.cT}`:"none"}}>{d}</button>
        ))}
      </div>
      {onSideChange && (
        <div style={{marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:9,fontWeight:600,color:c.txt3}}>Position:</span>
          <div style={{display:"flex",background:c.surf,borderRadius:8,border:BDR(c),overflow:"hidden"}}>
            <button onClick={()=>onSideChange("top")}
              style={{padding:"4px 12px",border:"none",fontSize:9,fontWeight:700,cursor:"pointer",
                fontFamily:QF,
                background:(dateSide||"top")==="top"?c.acc:"transparent",
                color:(dateSide||"top")==="top"?c.bg:c.txt3}}>Top</button>
            <button onClick={()=>onSideChange("bottom")}
              style={{padding:"4px 12px",border:"none",fontSize:9,fontWeight:700,cursor:"pointer",
                fontFamily:QF,
                background:dateSide==="bottom"?c.acc:"transparent",
                color:dateSide==="bottom"?c.bg:c.txt3}}>Bottom</button>
          </div>
        </div>
      )}
      {onRemove && (
        <button onClick={()=>{onRemove();onClose();}}
          style={{marginTop:8,width:"100%",padding:6,background:"none",border:"1px solid #e57373",
            borderRadius:8,color:"#e57373",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:QF}}>
          Remove Date
        </button>
      )}

    </div>
  );
}

/* ══════ SCREENPLAY ══════ */
const SE = {SC:"sc",AC:"ac",CH:"ch",PA:"pa",DI:"di",TR:"tr"};
const SEL = {sc:"Scene",ac:"Action",ch:"Character",pa:"Paren",di:"Dialogue",tr:"Transition"};
const SEF = {sc:"Scene Heading",ac:"Action",ch:"Character",pa:"Parenthetical",di:"Dialogue",tr:"Transition"};
const SEN = {sc:"ac",ac:"ch",ch:"di",di:"ch",pa:"di",tr:"sc"};
const SEA = ["sc","ac","ch","pa","di","tr"];
const SPH = {sc:"INT./EXT. LOCATION - DAY/NIGHT",ac:"Describe what happens...",ch:"CHARACTER NAME",pa:"(how they say it)",di:"What the character says...",tr:"CUT TO:"};

function SLine({lineId,initText,type,active,c,dark,onText,onKey,onFocus,ph}) {
  const ref = useRef(null);

  useEffect(() => {
    if(ref.current) ref.current.textContent = initText||"";
  }, [lineId]);

  const st = useMemo(() => {
    const b = {
      outline:"none",minHeight:20,fontSize:13,lineHeight:"20px",color:c.txt,
      fontFamily:"'Courier Prime','Courier New',monospace",display:"block",
      whiteSpace:"pre-wrap",wordWrap:"break-word",padding:"1px 3px",borderRadius:2,
      background:active?c.lH:"transparent",caretColor:c.acc,marginLeft:0,marginRight:0,
    };
    switch(type) {
      case"sc": return {...b,textTransform:"uppercase",fontWeight:700};
      case"ch": return {...b,textTransform:"uppercase",marginLeft:192,marginRight:192};
      case"pa": return {...b,marginLeft:144,marginRight:216,fontStyle:"italic"};
      case"di": return {...b,marginLeft:96,marginRight:144};
      case"tr": return {...b,textTransform:"uppercase",textAlign:"right",marginLeft:336};
      default: return b;
    }
  }, [type,active,c]);

  return (
    <div ref={el => {
        ref.current = el;
        if(el) el._sf = () => {
          el.focus();
          try {
            const s=window.getSelection(), r=document.createRange();
            r.selectNodeContents(el); r.collapse(false);
            s.removeAllRanges(); s.addRange(r);
          } catch(e){}
        };
      }}
      contentEditable suppressContentEditableWarning
      onInput={() => { if(ref.current) onText(ref.current.textContent||""); }}
      onKeyDown={onKey}
      onFocus={onFocus}
      data-placeholder={ph}
      data-lid={lineId}
      style={st}
    />
  );
}

function ScriptingTab({c,dark,scripts,setScripts,asId,setAsId,mob}) {
  const script = scripts.find(s=>s.id===asId);
  const [sbO,sSb] = useState(!mob);

  const addS = () => { const s=mkS(); setScripts(p=>[...p,s]); setAsId(s.id); };
  const delS = sid => {
    if(scripts.length<=1) return;
    const rem=scripts.filter(s=>s.id!==sid);
    setScripts(rem);
    if(asId===sid) setAsId(rem[0].id);
  };

  return (
    <div style={{flex:1,display:"flex",overflow:"hidden"}}>
      <div style={{width:sbO?(mob?160:200):0,background:c.sb,borderRight:sbO?BDR(c):"none",
        overflow:"hidden",transition:"width 0.25s",flexShrink:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"14px 14px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:c.txt3}}>Scripts</div>
          <button onClick={addS} style={{background:"none",border:BDR(c),borderRadius:8,
            width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",color:c.txt,fontSize:14,fontWeight:700}}>+</button>
          <button onClick={()=>{
            const inp=document.createElement("input");inp.type="file";inp.accept=".fountain,.txt";
            inp.onchange=ev=>{
              const f=ev.target.files?.[0];if(!f)return;
              const r2=new FileReader();
              r2.onload=e2=>{
                const flines=parseFountain(e2.target.result);
                const ns={id:uid(),title:f.name.replace(/\.[^.]+$/,""),writers:"",phase:"edit",mode:"screenplay",lines:flines,docHtml:""};
                setScripts(p=>[...p,ns]);setAsId(ns.id);
              };
              r2.readAsText(f);
            };
            inp.click();
          }} title="Import .fountain"
            style={{background:"none",border:"1px solid "+c.bdr,borderRadius:8,
              width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",color:c.txt,fontSize:10,fontWeight:700,fontFamily:QF}}>{"\u2191"}</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"0 8px 14px"}}>
          {scripts.map(s => (
            <div key={s.id} onClick={()=>setAsId(s.id)}
              style={{display:"flex",alignItems:"center",gap:7,padding:"8px 10px",marginBottom:3,
                borderRadius:10,cursor:"pointer",background:s.id===asId?c.surfH:"transparent"}}>
              <div style={{width:7,height:7,borderRadius:s.mode==="doc"?2:"50%",background:s.id===asId?c.acc:c.txt3,flexShrink:0}}/>
              <div style={{flex:1,fontSize:12,fontWeight:s.id===asId?700:500,color:c.txt,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title||"Untitled"}</div>
              {scripts.length>1 && (
                <button onClick={e=>{e.stopPropagation();delS(s.id);}}
                  style={{background:"none",border:"none",color:c.txt3,cursor:"pointer",fontSize:13,fontWeight:700,opacity:0.4}}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column"}}>
        <div style={{height:38,borderBottom:BDR(c),display:"flex",alignItems:"center",
          padding:"0 12px",gap:8,flexShrink:0,background:c.sb}}>
          <button onClick={()=>sSb(!sbO)}
            style={{background:"none",border:BDR(c),borderRadius:8,width:26,height:26,
              display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:10}}>
            {sbO?"◀":"▶"}
          </button>
          <span style={{fontSize:13,fontWeight:700,color:c.txt,fontFamily:QF}}>{script?.title||"Untitled"}</span>
        </div>
        {!script||script.phase==="pick"
          ? <TemplatePicker c={c} dark={dark} script={script} setScripts={setScripts}/>
          : script.phase==="title"
          ? <ScreenplayTitle c={c} script={script} setScripts={setScripts}/>
          : script.mode==="doc"
          ? <DocEditor c={c} dark={dark} script={script} setScripts={setScripts}/>
          : <ScriptEditor c={c} dark={dark} script={script} setScripts={setScripts} allScripts={scripts}/>
        }
      </div>

    </div>
  );
}

/* ═══ TEMPLATE PICKER ═══ */
function TemplatePicker({c,dark,script,setScripts}) {
  if(!script) return null;
  const pick = mode => {
    if(mode==="screenplay") setScripts(p=>p.map(s=>s.id===script.id?{...s,mode:"screenplay",phase:"title"}:s));
    else setScripts(p=>p.map(s=>s.id===script.id?{...s,mode:"doc",phase:"write",title:s.title||"Untitled Document",docHtml:"<p><br></p>"}:s));
  };
  const cards=[
    {mode:"doc",icon:"📄",title:"Empty Document",desc:"Full-featured text editor with fonts, colors, lists, and formatting — like Google Docs.",
      preview:["Aa","¶","B I U"]},
    {mode:"screenplay",icon:"🎬",title:"Screenplay",desc:"Industry-standard screenplay format with scene headings, action, dialogue, and transitions.",
      preview:["INT.","ACTION","DIALOGUE"]},
  ];
  return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:c.sBg,fontFamily:QF}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:32}}>
        <div>
          <div style={{fontSize:26,fontWeight:700,color:c.txt,textAlign:"center"}}>Choose a Template</div>
          <div style={{fontSize:13,color:c.txt3,textAlign:"center",marginTop:6}}>What would you like to create?</div>
        </div>
        <div style={{display:"flex",gap:20}}>
          {cards.map(cd=>(
            <button key={cd.mode} onClick={()=>pick(cd.mode)}
              style={{width:220,padding:"28px 22px",borderRadius:16,border:`2px solid ${c.bdr}`,
                background:c.surf,cursor:"pointer",display:"flex",flexDirection:"column",
                alignItems:"center",gap:14,transition:"all 0.2s",textAlign:"center",fontFamily:QF}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=c.acc;e.currentTarget.style.transform="translateY(-3px)";
                e.currentTarget.style.boxShadow=`0 8px 24px ${c.shd}`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=c.bdr;e.currentTarget.style.transform="none";
                e.currentTarget.style.boxShadow="none";}}>
              <span style={{fontSize:38}}>{cd.icon}</span>
              <div style={{fontSize:16,fontWeight:700,color:c.txt}}>{cd.title}</div>
              <div style={{fontSize:11,color:c.txt3,lineHeight:1.5}}>{cd.desc}</div>
              <div style={{display:"flex",gap:6,marginTop:4}}>
                {cd.preview.map((t,i)=>(
                  <span key={i} style={{fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:6,
                    background:dark?c.bg:c.sBg,color:c.txt3,border:BDR(c)}}>{t}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ═══ SCREENPLAY TITLE PAGE ═══ */
function ScreenplayTitle({c,script,setScripts}) {
  const [title,sT] = useState(script?.title||"");
  const [writers,sW] = useState(script?.writers||"");
  const go = () => {
    if(!title.trim()) return;
    setScripts(p=>p.map(s=>s.id===script.id
      ? {...s,title,writers,mode:"screenplay",phase:"write",lines:s.lines?.length?s.lines:[{id:uid(),type:"sc",text:""}]}
      : s));
  };
  return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:c.sBg,fontFamily:QF}}>
      <div style={{width:440,display:"flex",flexDirection:"column",gap:20}}>
        <div style={{textAlign:"center"}}>
          <button onClick={()=>setScripts(p=>p.map(s=>s.id===script.id?{...s,phase:"pick",mode:""}:s))}
            style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 12px",
              fontSize:11,fontWeight:600,color:c.txt3,cursor:"pointer",fontFamily:QF,marginBottom:12}}>← Templates</button>
          <div style={{fontSize:28,fontWeight:700,color:c.txt}}>New Screenplay</div>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:c.txt3,marginBottom:4,display:"block"}}>Title</label>
          <input value={title} onChange={e=>sT(e.target.value)} placeholder="My Screenplay" autoFocus
            style={{width:"100%",padding:"12px 16px",border:`2px solid ${c.bdr}`,borderRadius:12,fontSize:15,
              fontFamily:QF,fontWeight:600,color:c.txt,background:c.surf,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:c.txt3,marginBottom:4,display:"block"}}>Written By</label>
          <input value={writers} onChange={e=>sW(e.target.value)} placeholder="Writer Name(s)"
            onKeyDown={e=>{if(e.key==="Enter")go();}}
            style={{width:"100%",padding:"12px 16px",border:`2px solid ${c.bdr}`,borderRadius:12,fontSize:15,
              fontFamily:QF,fontWeight:600,color:c.txt,background:c.surf,outline:"none",boxSizing:"border-box"}}/>
        </div>
        <button onClick={go} disabled={!title.trim()}
          style={{padding:"12px 24px",background:title.trim()?c.acc:c.bdr,color:title.trim()?c.bg:c.txt3,
            border:"none",borderRadius:12,fontSize:14,fontWeight:700,fontFamily:QF,
            cursor:title.trim()?"pointer":"default"}}>
          Start Writing →
        </button>
      </div>

    </div>
  );
}

/* ═══ DOC EDITOR (Google Docs-like) ═══ */
const DOC_FONTS = [
  "Arial","Georgia","Times New Roman","Courier New","Verdana","Trebuchet MS",
  "Palatino Linotype","Garamond","Comic Sans MS","Impact","Lucida Console"
];
const DOC_SIZES = [8,9,10,11,12,14,16,18,20,24,28,32,36,48,72];
const DOC_COLORS = [
  "#000000","#434343","#666666","#999999","#cccccc","#ffffff",
  "#e06666","#ea9999","#f4cccc","#cc0000","#990000","#660000",
  "#f6b26b","#f9cb9c","#fce5cd","#e69138","#b45f06","#783f04",
  "#ffd966","#ffe599","#fff2cc","#f1c232","#bf9000","#7f6000",
  "#93c47d","#b6d7a8","#d9ead3","#6aa84f","#38761d","#274e13",
  "#6fa8dc","#9fc5e8","#cfe2f3","#3d85c6","#0b5394","#073763",
  "#8e7cc3","#b4a7d6","#d9d2e9","#674ea7","#351c75","#20124d",
];

function DocEditor({c,dark,script,setScripts}) {
  const eRef = useRef(null);
  const [zoom,sZoom] = useState(100);
  const [font,sFont] = useState("Arial");
  const [fSize,sFSize] = useState("12");
  const [showFC,sSFC] = useState(false);
  const [showHL,sSHL] = useState(false);
  const [fColor,sFC] = useState("#000000");
  const [hlColor,sHLC] = useState("#ffff00");
  const [showFonts,sSFonts] = useState(false);
  const [linkPop,sLinkPop] = useState(false);
  const [linkUrl,sLinkUrl] = useState("");
  const [findBar,sFindBar] = useState(false);
  const [findTxt,sFindTxt] = useState("");
  const saveSel = useRef(null);
  const sc = zoom/100;

  /* Save content (debounced + sanitized) */
  const saveTimer = useRef(null);
  const onInput = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>{
      if(eRef.current) setScripts(p=>p.map(s=>s.id===script.id?{...s,docHtml:sanitizeHTML(eRef.current.innerHTML)}:s));
    },500);
  };

  /* Restore focus before exec */
  const focEd = () => { if(eRef.current) eRef.current.focus(); };

  const exec = (cmd,val) => { focEd(); document.execCommand(cmd,false,val||null); onInput(); };

  /* Query active state for toolbar highlights */
  const [tb,sTb] = useState({});
  const pollTb = () => {
    sTb({
      bold:document.queryCommandState("bold"),
      italic:document.queryCommandState("italic"),
      underline:document.queryCommandState("underline"),
      strikeThrough:document.queryCommandState("strikeThrough"),
      justifyLeft:document.queryCommandState("justifyLeft"),
      justifyCenter:document.queryCommandState("justifyCenter"),
      justifyRight:document.queryCommandState("justifyRight"),
      justifyFull:document.queryCommandState("justifyFull"),
      insertUnorderedList:document.queryCommandState("insertUnorderedList"),
      insertOrderedList:document.queryCommandState("insertOrderedList"),
      superscript:document.queryCommandState("superscript"),
      subscript:document.queryCommandState("subscript"),
    });
    const fn = document.queryCommandValue("fontName");
    const fs = document.queryCommandValue("fontSize");
    if(fn) sFont(fn.replace(/"/g,""));
    if(fs){const px={"1":"8","2":"10","3":"12","4":"14","5":"18","6":"24","7":"36"};sFSize(px[fs]||fs);}
  };

  /* Init content */
  useEffect(()=>{
    if(eRef.current && script.docHtml) eRef.current.innerHTML = sanitizeHTML(script.docHtml);
  },[script.id]);

  /* Save/restore selection for color pickers */
  const saveCaret = () => {
    const s=window.getSelection();
    if(s.rangeCount) saveSel.current=s.getRangeAt(0).cloneRange();
  };
  const restoreCaret = () => {
    if(saveSel.current){const s=window.getSelection();s.removeAllRanges();s.addRange(saveSel.current);}
  };

  const applyFC = col => { sFC(col); restoreCaret(); exec("foreColor",col); sSFC(false); };
  const applyHL = col => { sHLC(col); restoreCaret(); exec("hiliteColor",col); sSHL(false); };

  const insertLink = () => {
    if(!linkUrl.trim()) return;
    restoreCaret(); exec("createLink",linkUrl); sLinkPop(false); sLinkUrl("");
  };

  const doFind = () => {
    if(!findTxt||!eRef.current) return;
    window.getSelection().removeAllRanges();
    /* simple: use window.find */
    if(window.find) window.find(findTxt,false,false,true);
  };

  /* Font size via execCommand fontSize maps 1-7, so we insert span manually */
  const applyFontSize = sz => {
    sFSize(sz);
    focEd();
    exec("fontSize","7");
    /* Replace the size-7 font tags with actual pixel size */
    if(eRef.current){
      const bigs = eRef.current.querySelectorAll('font[size="7"],span[style*="xxx-large"]');
      bigs.forEach(el => { el.removeAttribute("size"); el.style.fontSize = sz+"px"; });
      onInput();
    }
  };

  const applyFont = f => { sFont(f); sSFonts(false); focEd(); exec("fontName",f); };

  const tbtn = (cmd,label,icon,isActive) => (
    <button key={cmd} title={label} onClick={()=>exec(cmd)}
      style={{width:28,height:28,borderRadius:6,border:"none",fontSize:13,cursor:"pointer",
        display:"flex",alignItems:"center",justifyContent:"center",fontWeight:isActive?800:400,
        background:isActive?(dark?"#445":"#dde"):"transparent",color:c.txt,
        fontFamily:cmd==="italic"?"Georgia":"inherit",transition:"background 0.1s"}}>
      {icon}
    </button>
  );

  const sep = () => <div style={{width:1,height:20,background:c.bdr,margin:"0 3px",flexShrink:0}}/>;

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:c.sBg,position:"relative"}}>
      {/* Top bar */}
      <div style={{borderBottom:BDR(c),display:"flex",alignItems:"center",
        padding:"4px 10px",gap:4,fontFamily:QF,flexShrink:0,background:c.surf,flexWrap:"wrap"}}>
        <button onClick={()=>setScripts(p=>p.map(s=>s.id===script.id?{...s,phase:"pick",mode:""}:s))}
          style={{background:"none",border:BDR(c),borderRadius:8,padding:"3px 8px",
            fontSize:10,fontWeight:600,color:c.txt3,cursor:"pointer",fontFamily:QF,marginRight:4}}>← Templates</button>
        <input value={script.title||""} onChange={e=>setScripts(p=>p.map(s=>s.id===script.id?{...s,title:e.target.value}:s))}
          style={{background:"transparent",border:"none",outline:"none",fontSize:14,fontWeight:700,
            fontFamily:QF,color:c.txt,width:160,padding:"2px 4px"}}/>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:3}}>
          <button onClick={()=>sZoom(z=>Math.max(50,z-10))}
            style={{background:"none",border:BDR(c),borderRadius:5,width:20,height:20,
              fontSize:12,cursor:"pointer",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <span style={{fontSize:10,fontWeight:600,minWidth:32,textAlign:"center",color:c.txt3}}>{zoom}%</span>
          <button onClick={()=>sZoom(z=>Math.min(200,z+10))}
            style={{background:"none",border:BDR(c),borderRadius:5,width:20,height:20,
              fontSize:12,cursor:"pointer",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{borderBottom:BDR(c),display:"flex",alignItems:"center",
        padding:"3px 10px",gap:2,background:c.surf,flexShrink:0,flexWrap:"wrap",minHeight:36}}
        onMouseDown={e=>e.preventDefault()}>

        {/* Undo / Redo */}
        {tbtn("undo","Undo","↩")}
        {tbtn("redo","Redo","↪")}
        {sep()}

        {/* Font Family */}
        <div style={{position:"relative"}}>
          <button onClick={()=>{saveCaret();sSFonts(!showFonts);}}
            style={{height:28,borderRadius:6,border:BDR(c),padding:"0 8px",fontSize:11,
              cursor:"pointer",background:"transparent",color:c.txt,fontFamily:font,minWidth:100,
              textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}}>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{font}</span>
            <span style={{fontSize:8}}>▼</span>
          </button>
          {showFonts && (
            <div style={{position:"absolute",top:30,left:0,zIndex:600,background:c.ctx,border:BDR(c),
              borderRadius:10,boxShadow:`0 6px 20px ${c.shd}`,maxHeight:260,overflow:"auto",width:180,padding:"4px 0"}}>
              {DOC_FONTS.map(f=>(
                <button key={f} onClick={()=>applyFont(f)}
                  style={{display:"block",width:"100%",padding:"6px 12px",border:"none",cursor:"pointer",
                    fontSize:13,fontFamily:f,textAlign:"left",color:c.txt,
                    background:font===f?(dark?"#445":"#dde"):"transparent"}}
                  onMouseEnter={e=>e.currentTarget.style.background=c.surfH}
                  onMouseLeave={e=>e.currentTarget.style.background=font===f?(dark?"#445":"#dde"):"transparent"}>
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Font Size */}
        <select value={fSize} onChange={e=>applyFontSize(e.target.value)}
          onMouseDown={saveCaret}
          style={{height:28,borderRadius:6,border:BDR(c),padding:"0 4px",fontSize:11,
            cursor:"pointer",background:"transparent",color:c.txt,fontFamily:QF,width:48,outline:"none"}}>
          {DOC_SIZES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        {sep()}

        {/* B I U S */}
        {tbtn("bold","Bold (Ctrl+B)",<b>B</b>,tb.bold)}
        {tbtn("italic","Italic (Ctrl+I)",<i>I</i>,tb.italic)}
        {tbtn("underline","Underline (Ctrl+U)",<span style={{textDecoration:"underline"}}>U</span>,tb.underline)}
        {tbtn("strikeThrough","Strikethrough",<span style={{textDecoration:"line-through"}}>S</span>,tb.strikeThrough)}
        {sep()}

        {/* Font Color */}
        <div style={{position:"relative"}}>
          <button title="Font Color" onClick={()=>{saveCaret();sSFC(!showFC);sSHL(false);}}
            style={{width:28,height:28,borderRadius:6,border:"none",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              background:"transparent",color:c.txt,fontSize:13,fontWeight:700,gap:1}}>
            <span>A</span>
            <div style={{width:16,height:3,borderRadius:1,background:fColor}}/>
          </button>
          {showFC && (
            <div style={{position:"absolute",top:30,left:-40,zIndex:600,background:c.ctx,border:BDR(c),
              borderRadius:10,boxShadow:`0 6px 20px ${c.shd}`,padding:8,width:168}}
              onMouseDown={e=>e.preventDefault()}>
              <div style={{fontSize:9,fontWeight:600,color:c.txt3,marginBottom:4,fontFamily:QF}}>Font Color</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:3}}>
                {DOC_COLORS.map(col=>(
                  <button key={col} onClick={()=>applyFC(col)}
                    style={{width:22,height:22,borderRadius:4,border:col==="#ffffff"?BDR(c):"1px solid transparent",
                      background:col,cursor:"pointer"}}/>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Highlight */}
        <div style={{position:"relative"}}>
          <button title="Highlight" onClick={()=>{saveCaret();sSHL(!showHL);sSFC(false);}}
            style={{width:28,height:28,borderRadius:6,border:"none",cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              background:"transparent",fontSize:12,fontWeight:700,gap:1}}>
            <span style={{color:c.txt,background:hlColor,padding:"0 3px",borderRadius:2,lineHeight:1.2}}>A</span>
          </button>
          {showHL && (
            <div style={{position:"absolute",top:30,left:-40,zIndex:600,background:c.ctx,border:BDR(c),
              borderRadius:10,boxShadow:`0 6px 20px ${c.shd}`,padding:8,width:168}}
              onMouseDown={e=>e.preventDefault()}>
              <div style={{fontSize:9,fontWeight:600,color:c.txt3,marginBottom:4,fontFamily:QF}}>Highlight</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:3}}>
                {["#ffff00","#00ff00","#00ffff","#ff69b4","#ffa500","#dda0dd",
                  "#ff6347","#90ee90","#add8e6","#f0e68c","#e6e6fa","transparent"].map(col=>(
                  <button key={col} onClick={()=>applyHL(col)}
                    style={{width:22,height:22,borderRadius:4,
                      border:`1px solid ${col==="transparent"?c.bdr:col}`,
                      background:col==="transparent"?"none":col,cursor:"pointer",
                      fontSize:col==="transparent"?9:0,color:c.txt3,fontFamily:QF}}>
                    {col==="transparent"?"✕":""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {sep()}

        {/* Alignment */}
        {tbtn("justifyLeft","Align Left","≡",tb.justifyLeft)}
        {tbtn("justifyCenter","Center","≡",tb.justifyCenter)}
        {tbtn("justifyRight","Align Right","≡",tb.justifyRight)}
        {tbtn("justifyFull","Justify","☰",tb.justifyFull)}
        {sep()}

        {/* Lists */}
        <button title="Bullet List" onClick={()=>exec("insertUnorderedList")}
          style={{width:28,height:28,borderRadius:6,border:"none",fontSize:14,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            background:tb.insertUnorderedList?(dark?"#445":"#dde"):"transparent",color:c.txt}}>•≡</button>
        <button title="Numbered List" onClick={()=>exec("insertOrderedList")}
          style={{width:28,height:28,borderRadius:6,border:"none",fontSize:12,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            background:tb.insertOrderedList?(dark?"#445":"#dde"):"transparent",color:c.txt}}>1.</button>
        {sep()}

        {/* Indent */}
        <button title="Decrease Indent" onClick={()=>exec("outdent")}
          style={{width:28,height:28,borderRadius:6,border:"none",fontSize:13,cursor:"pointer",
            background:"transparent",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>⇤</button>
        <button title="Increase Indent" onClick={()=>exec("indent")}
          style={{width:28,height:28,borderRadius:6,border:"none",fontSize:13,cursor:"pointer",
            background:"transparent",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>⇥</button>
        {sep()}

        {/* Headings */}
        <select onChange={e=>{focEd();exec("formatBlock",e.target.value);e.target.value="";}}
          onMouseDown={saveCaret} defaultValue=""
          style={{height:28,borderRadius:6,border:BDR(c),padding:"0 4px",fontSize:11,
            cursor:"pointer",background:"transparent",color:c.txt,fontFamily:QF,outline:"none"}}>
          <option value="" disabled>Style</option>
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="blockquote">Quote</option>
          <option value="pre">Code</option>
        </select>
        {sep()}

        {/* Super/Sub */}
        {tbtn("superscript","Superscript","x²",tb.superscript)}
        {tbtn("subscript","Subscript","x₂",tb.subscript)}
        {sep()}

        {/* Link */}
        <div style={{position:"relative"}}>
          <button title="Insert Link" onClick={()=>{saveCaret();sLinkPop(!linkPop);}}
            style={{width:28,height:28,borderRadius:6,border:"none",fontSize:13,cursor:"pointer",
              background:"transparent",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>🔗</button>
          {linkPop && (
            <div style={{position:"absolute",top:30,left:-60,zIndex:600,background:c.ctx,border:BDR(c),
              borderRadius:10,boxShadow:`0 6px 20px ${c.shd}`,padding:10,width:220}}
              onMouseDown={stop}>
              <input value={linkUrl} onChange={e=>sLinkUrl(e.target.value)} placeholder="https://..."
                onKeyDown={e=>{if(e.key==="Enter")insertLink();}}
                style={{width:"100%",padding:"6px 10px",border:BDR(c),borderRadius:6,fontSize:12,
                  color:c.txt,background:c.surf,outline:"none",boxSizing:"border-box",fontFamily:QF}}/>
              <div style={{display:"flex",gap:4,marginTop:6}}>
                <button onClick={insertLink}
                  style={{flex:1,padding:"4px 0",borderRadius:6,border:"none",background:c.acc,color:c.bg,
                    fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:QF}}>Insert</button>
                <button onClick={()=>{exec("unlink");sLinkPop(false);}}
                  style={{padding:"4px 8px",borderRadius:6,border:BDR(c),background:"transparent",
                    color:c.txt3,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:QF}}>Unlink</button>
              </div>
            </div>
          )}
        </div>

        {/* Horizontal Rule */}
        <button title="Horizontal Line" onClick={()=>exec("insertHorizontalRule")}
          style={{width:28,height:28,borderRadius:6,border:"none",fontSize:11,cursor:"pointer",
            background:"transparent",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>—</button>

        {/* Clear Formatting */}
        <button title="Clear Formatting" onClick={()=>exec("removeFormat")}
          style={{width:28,height:28,borderRadius:6,border:"none",fontSize:12,cursor:"pointer",
            background:"transparent",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>Tₓ</button>

        {/* Find */}
        <button title="Find" onClick={()=>sFindBar(!findBar)}
          style={{width:28,height:28,borderRadius:6,border:"none",fontSize:13,cursor:"pointer",
            background:findBar?(dark?"#445":"#dde"):"transparent",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>🔍</button>

        {/* Word count */}
        <span style={{fontSize:10,color:c.txt3,fontFamily:QF,fontWeight:500,whiteSpace:"nowrap"}}
          id="wc-display">{(eRef.current?.textContent||"").trim().split(/\s+/).filter(Boolean).length} words</span>
        {sep()}

        {/* Export dropdown */}
        <DocExportMenu c={c} dark={dark} script={script} eRef={eRef} font={font} fSize={fSize}/>
      </div>

      {/* Find Bar */}
      {findBar && (
        <div style={{borderBottom:BDR(c),display:"flex",alignItems:"center",
          padding:"4px 10px",gap:6,background:c.surf,flexShrink:0}}>
          <input value={findTxt} onChange={e=>sFindTxt(e.target.value)} placeholder="Find in document..."
            onKeyDown={e=>{if(e.key==="Enter")doFind();}}
            autoFocus
            style={{flex:1,maxWidth:280,padding:"4px 10px",border:BDR(c),borderRadius:6,fontSize:12,
              color:c.txt,background:c.bg,outline:"none",fontFamily:QF}}/>
          <button onClick={doFind}
            style={{padding:"4px 10px",borderRadius:6,border:BDR(c),background:"transparent",
              color:c.txt,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:QF}}>Find</button>
          <button onClick={()=>sFindBar(false)}
            style={{background:"none",border:"none",color:c.txt3,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
      )}

      {/* Editor area */}
      <div style={{flex:1,overflow:"auto",padding:"30px 0 60px",display:"flex",flexDirection:"column",
        alignItems:"center",background:c.sBg,minHeight:0}}
        onClick={()=>{sSFC(false);sSHL(false);sSFonts(false);sLinkPop(false);}}>
        <div style={{width:Math.round(816*sc),minHeight:Math.round(1056*sc),background:c.sPg,
          boxShadow:`0 1px 6px ${c.shd}`,borderRadius:2,position:"relative"}}>
          <style>{`
            .doc-editor { outline:none; min-height:900px; line-height:1.6; word-wrap:break-word; }
            .doc-editor p { margin:0 0 8px; }
            .doc-editor h1 { font-size:28px; font-weight:700; margin:16px 0 10px; }
            .doc-editor h2 { font-size:22px; font-weight:700; margin:14px 0 8px; }
            .doc-editor h3 { font-size:17px; font-weight:600; margin:12px 0 6px; }
            .doc-editor h4 { font-size:14px; font-weight:600; margin:10px 0 4px; }
            .doc-editor blockquote { border-left:4px solid ${c.bdr}; margin:8px 0; padding:4px 16px; color:${c.txt3}; }
            .doc-editor pre { background:${dark?"#1a1a2e":"#f5f5f5"}; padding:12px; border-radius:6px; font-family:'Courier New',monospace; font-size:13px; overflow-x:auto; }
            .doc-editor ul, .doc-editor ol { padding-left:24px; margin:4px 0; }
            .doc-editor li { margin:2px 0; }
            .doc-editor a { color:${c.acc}; text-decoration:underline; }
            .doc-editor hr { border:none; border-top:1px solid ${c.bdr}; margin:12px 0; }
            .doc-editor img { max-width:100%; border-radius:4px; }
            .doc-editor [data-placeholder]:empty:before { content:attr(data-placeholder); color:${c.txt3}; pointer-events:none; }
          `}</style>
          <div ref={eRef} className="doc-editor" contentEditable suppressContentEditableWarning
            data-placeholder="Start typing..."
            onInput={onInput}
            onKeyUp={pollTb} onMouseUp={pollTb} onFocus={pollTb}
            style={{padding:`${72*sc}px ${96*sc}px`,transform:`scale(${sc})`,transformOrigin:"top left",
              width:816,minHeight:1056,fontSize:13,fontFamily:font,color:c.txt,caretColor:c.acc}}/>
        </div>
      </div>

    </div>
  );
}


/* ══════ EXPORT MENUS ══════ */

function parseFountain(text) {
  const lines=text.split("\n"), result=[];
  let i=0;
  while(i<lines.length&&(lines[i].match(/^(Title|Credit|Author|Source|Draft date|Contact|Copyright):/i)||lines[i].trim()===""))i++;
  for(;i<lines.length;i++){
    const trimmed=lines[i].trim();
    if(!trimmed){result.push({id:uid(),type:"ac",text:""});continue;}
    if(trimmed.match(/^(INT\.?|EXT\.?|EST\.?|INT\.?\/EXT\.?|I\/E\.?)/i)||trimmed.startsWith(".")){result.push({id:uid(),type:"sc",text:trimmed.replace(/^\./,"")});continue;}
    if(trimmed.match(/^>/)||trimmed.match(/TO:$/)){result.push({id:uid(),type:"tr",text:trimmed.replace(/^>/,"").trim()});continue;}
    if(trimmed===trimmed.toUpperCase()&&trimmed.length>1&&!trimmed.startsWith("(")&&trimmed.match(/^[A-Z]/)){result.push({id:uid(),type:"ch",text:trimmed.replace(/^@/,"")});continue;}
    if(trimmed.startsWith("(")&&trimmed.endsWith(")")){result.push({id:uid(),type:"pa",text:trimmed});continue;}
    const prev=result[result.length-1];
    if(prev&&(prev.type==="ch"||prev.type==="pa")){result.push({id:uid(),type:"di",text:trimmed});continue;}
    result.push({id:uid(),type:"ac",text:trimmed});
  }
  return result.length?result:[{id:uid(),type:"ac",text:""}];
}

function ExportDropdown({c,dark,children,items}) {
  const [open,sOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    if(!open) return;
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))sOpen(false);};
    document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);
  },[open]);
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>sOpen(!open)}
        style={{background:"none",border:BDR(c),borderRadius:5,padding:"2px 8px",
          fontSize:9,fontWeight:600,cursor:"pointer",color:c.txt3,fontFamily:QF,
          display:"flex",alignItems:"center",gap:4}}>
        {children} <span style={{fontSize:7}}>▼</span>
      </button>
      {open && (
        <div style={{position:"absolute",top:"100%",right:0,marginTop:4,zIndex:600,
          background:c.ctx,border:BDR(c),borderRadius:10,
          boxShadow:`0 6px 20px ${c.shd}`,padding:"4px 0",minWidth:160,fontFamily:QF}}>
          {items.map((it,i)=>it.div
            ? <div key={i} style={{height:1,background:c.bdr,margin:"4px 8px"}}/>
            : <button key={i} onClick={()=>{it.action();sOpen(false);}}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 14px",
                  border:"none",background:"transparent",cursor:"pointer",fontSize:12,
                  fontFamily:QF,color:c.txt,fontWeight:500,textAlign:"left"}}
                onMouseEnter={e=>e.currentTarget.style.background=c.surfH}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:14,width:20,textAlign:"center"}}>{it.icon}</span>
                <div>
                  <div style={{fontWeight:600,fontSize:11}}>{it.label}</div>
                  <div style={{fontSize:9,color:c.txt3}}>{it.desc}</div>
                </div>
              </button>
          )}
        </div>
      )}

    </div>
  );
}

function buildScreenplayHTML(script,lines,forPrint) {
  const SEW={sc:"margin-left:0",ac:"margin-left:0",ch:"margin-left:2.5in;margin-right:2.5in",
    pa:"margin-left:1.9in;margin-right:2.8in;font-style:italic",
    di:"margin-left:1.25in;margin-right:1.5in",tr:"text-align:right;margin-left:4.4in"};
  const body=lines.map(l=>{
    const t=l.text||"";
    const upper=l.type==="sc"||l.type==="ch"||l.type==="tr";
    const bold=l.type==="sc";
    const margin=l.type==="sc"?"margin-top:16px":"";
    return `<p style="${SEW[l.type]||""};${margin};${bold?"font-weight:bold":""};">${upper?t.toUpperCase():t}</p>`;
  }).join("\n");
  const title=`<div style="text-align:center;margin-bottom:40px;"><h1 style="font-size:24px;">${script.title||""}</h1>${script.writers?`<p>Written by ${script.writers}</p>`:""}</div>`;
  const css=`body{font-family:'Courier New',Courier,monospace;font-size:12pt;line-height:1.5;max-width:8.5in;margin:0 auto;padding:1in 0;}p{margin:2px 0;}${forPrint?"@page{size:letter;margin:1in;}":""}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${script.title||"Screenplay"}</title><style>${css}</style></head><body>${title}${body}</body></html>`;
}

function ScriptExportMenu({c,dark,script,lines}) {
  const doExport=(fmt)=>{
    const html=buildScreenplayHTML(script,lines,fmt==="pdf");
    if(fmt==="pdf"){
      const w2=window.open("","","width=816,height=1056");
      w2.document.write(html);w2.document.close();
      setTimeout(()=>w2.print(),300);
      return;
    }
    if(fmt==="doc"){
      const blob=new Blob(["\ufeff"+html],{type:"application/msword"});
      const u=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=u;a.download=(script.title||"screenplay")+".doc";a.click();
      URL.revokeObjectURL(u);return;
    }
    if(fmt==="txt"){
      const SEW2={sc:0,ac:0,ch:24,pa:18,di:12,tr:42};
      const txt=lines.map(l=>{
        const pad=" ".repeat(SEW2[l.type]||0);const t=l.text||"";
        const upper=l.type==="sc"||l.type==="ch"||l.type==="tr";
        return (l.type==="sc"?"\n":"")+pad+(upper?t.toUpperCase():t);
      }).join("\n");
      const header=script.title.toUpperCase()+"\n"+(script.writers?"Written by "+script.writers+"\n":"")+"\n\n";
      const blob=new Blob([header+txt],{type:"text/plain"});
      const u=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=u;a.download=(script.title||"screenplay")+".txt";a.click();
      URL.revokeObjectURL(u);
    }
  };
  return (
    <ExportDropdown c={c} dark={dark} items={[
      {icon:"📄",label:"Export as PDF",desc:"Print-ready screenplay format",action:()=>doExport("pdf")},
      {icon:"📝",label:"Export as Word (.doc)",desc:"Editable in Microsoft Word",action:()=>doExport("doc")},
      {div:true},
      {icon:"📋",label:"Export as Plain Text",desc:"Simple text file",action:()=>doExport("txt")},
    ]}>Export</ExportDropdown>
  );
}

function DocExportMenu({c,dark,script,eRef,font,fSize}) {
  const getHTML=(forPrint)=>{
    const content=sanitizeHTML(eRef.current?.innerHTML||"");
    const css=`body{font-family:${font};font-size:${fSize}px;max-width:8.5in;margin:0 auto;padding:1in;line-height:1.6;}${forPrint?"@page{size:letter;margin:1in;}":""}`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${script.title||"Document"}</title><style>${css}</style></head><body>${content}</body></html>`;
  };
  const doExport=(fmt)=>{
    if(fmt==="pdf"){
      const w2=window.open("","","width=816,height=1056");
      w2.document.write(getHTML(true));w2.document.close();
      setTimeout(()=>w2.print(),300);return;
    }
    if(fmt==="doc"){
      const blob=new Blob(["\ufeff"+getHTML(false)],{type:"application/msword"});
      const u=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=u;a.download=(script.title||"document")+".doc";a.click();
      URL.revokeObjectURL(u);return;
    }
    if(fmt==="html"){
      const blob=new Blob([getHTML(false)],{type:"text/html"});
      const u=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=u;a.download=(script.title||"document")+".html";a.click();
      URL.revokeObjectURL(u);
    }
  };
  return (
    <ExportDropdown c={c} dark={dark} items={[
      {icon:"📄",label:"Export as PDF",desc:"Opens print dialog to save as PDF",action:()=>doExport("pdf")},
      {icon:"📝",label:"Export as Word (.doc)",desc:"Editable in Microsoft Word",action:()=>doExport("doc")},
      {div:true},
      {icon:"🌐",label:"Export as HTML",desc:"Web page format",action:()=>doExport("html")},
    ]}>Export</ExportDropdown>
  );
}

function ScriptEditor({c,dark,script,setScripts,allScripts}) {
  const [cur,sCur] = useState(0);
  const [curT,sCurT] = useState("sc");
  const [zoom,sZoom] = useState(100);
  const [acO,sAcO] = useState([]);
  const [acI,sAcI] = useState(-1);
  const lines = script.lines||[];
  const lRef = useRef(lines);
  lRef.current = lines;

  const known = useMemo(() => {
    const nm=new Set(), lc=new Set();
    allScripts.forEach(s=>(s.lines||[]).forEach(l=>{
      if(l.type==="ch"&&l.text?.trim()) nm.add(l.text.trim().toUpperCase());
      if(l.type==="sc"&&l.text?.trim()){
        const m=l.text.match(/(?:INT\.|EXT\.)\s*(.+?)(?:\s*-\s*\w+)?$/i);
        if(m) lc.add(m[1].trim().toUpperCase());
      }
    }));
    return {nm:[...nm],lc:[...lc]};
  }, [allScripts,lines]);

  const sL = useCallback(fn=>setScripts(p=>p.map(s=>s.id===script.id
    ? {...s,lines:typeof fn==="function"?fn(s.lines):fn} : s)),[script.id,setScripts]);

  const focL = idx => setTimeout(()=>{
    const all=document.querySelectorAll("[data-lid]");
    let ct=0;
    for(const el of all){if(ct===idx&&el._sf){el._sf();return;}ct++;}
  },40);

  const updAc = (txt,type) => {
    if(!txt||txt.length<2){sAcO([]);return;}
    const u=txt.toUpperCase();
    let opts=[];
    if(type==="ch") opts=known.nm.filter(n=>n.startsWith(u)&&n!==u);
    else if(type==="sc") opts=known.lc.filter(l=>l.includes(u));
    sAcO(opts.slice(0,5)); sAcI(-1);
  };

  const appAc = (val,idx) => {
    sL(prev=>{const u=[...prev];u[idx]={...u[idx],text:val};return u;});
    sAcO([]);
    setTimeout(()=>{
      const all=document.querySelectorAll("[data-lid]");
      let ct=0;
      for(const el of all){if(ct===idx){el.textContent=val;if(el._sf)el._sf();return;}ct++;}
    },20);
  };

  const onKey = useCallback((e,idx)=>{
    if(acO.length>0){
      if(e.key==="ArrowDown"){e.preventDefault();sAcI(p=>Math.min(p+1,acO.length-1));return;}
      if(e.key==="ArrowUp"){e.preventDefault();sAcI(p=>Math.max(p-1,0));return;}
      if(e.key==="Tab"||(e.key==="Enter")){
        e.preventDefault();
        const pick=acI>=0?acI:0;
        appAc(acO[pick],idx);
        return;
      }
      if(e.key==="Escape"){sAcO([]);return;}
    }
    const ls=lRef.current, line=ls[idx];
    if(!line) return;
    if(e.key==="Enter"&&!e.shiftKey){
      e.preventDefault();
      const next=SEN[line.type]||"ac";
      sL(prev=>{const u=[...prev];u.splice(idx+1,0,{id:uid(),type:next,text:""});return u;});
      sCur(idx+1); sCurT(next); focL(idx+1); sAcO([]);
    } else if(e.key==="Tab"){
      e.preventDefault();
      const ci=SEA.indexOf(line.type);
      const ni=e.shiftKey?(ci-1+SEA.length)%SEA.length:(ci+1)%SEA.length;
      sL(prev=>{const u=[...prev];u[idx]={...u[idx],type:SEA[ni]};return u;});
      sCurT(SEA[ni]);
    } else if(e.key==="Backspace"&&!line.text&&ls.length>1){
      e.preventDefault();
      sL(prev=>prev.filter((_,i)=>i!==idx));
      const ni=Math.max(0,idx-1); sCur(ni); focL(ni);
    } else if(e.key==="ArrowUp"&&idx>0){
      e.preventDefault();
      const ni=idx-1; sCur(ni); sCurT(ls[ni]?.type||"ac"); focL(ni);
    } else if(e.key==="ArrowDown"&&idx<ls.length-1){
      e.preventDefault();
      const ni=idx+1; sCur(ni); sCurT(ls[ni]?.type||"ac"); focL(ni);
    }
  },[acO,acI,sL]);

  const onTxt = useCallback((idx,txt)=>{
    sL(prev=>{const u=[...prev];if(u[idx])u[idx]={...u[idx],text:txt};return u;});
    const ls=lRef.current;
    if(ls[idx]) updAc(txt,ls[idx].type);
  },[sL,known]);

  const scrollRef = useRef(null);
  const goToPage = pg => {
    if(!scrollRef.current) return;
    const pages = scrollRef.current.querySelectorAll("[data-page]");
    if(pages[pg]) pages[pg].scrollIntoView({behavior:"smooth",block:"start"});
  };
  const LPP = 44;
  const tp = Math.max(1,Math.ceil(lines.length/LPP));
  const sc = zoom/100;

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:c.sBg,position:"relative"}}>
      <div style={{height:42,borderBottom:BDR(c),display:"flex",alignItems:"center",
        padding:"0 14px",gap:6,fontFamily:QF,flexShrink:0,background:c.surf}}>
        <button onClick={()=>setScripts(p=>p.map(s=>s.id===script.id?{...s,phase:"title"}:s))}
          style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 10px",
            fontSize:11,fontWeight:600,color:c.txt3,cursor:"pointer",fontFamily:QF}}>← Title</button>
        <div style={{flex:1,textAlign:"center"}}>
          <span style={{fontSize:13,fontWeight:700,color:c.txt}}>{script.title}</span>
          {script.writers && <span style={{fontSize:11,color:c.txt3,marginLeft:8}}>by {script.writers}</span>}
        </div>
        <div style={{display:"flex",gap:2,background:c.bg,borderRadius:10,padding:2,border:BDR(c)}}>
          {SEA.map(se=>(
            <button key={se}
              onClick={()=>{sL(prev=>{const u=[...prev];if(u[cur])u[cur]={...u[cur],type:se};return u;});sCurT(se);}}
              style={{padding:"3px 6px",borderRadius:7,border:"none",fontSize:8,fontWeight:600,
                fontFamily:QF,cursor:"pointer",textTransform:"uppercase",
                background:curT===se?c.acc:"transparent",color:curT===se?c.bg:c.txt3}}>
              {SEL[se]}
            </button>
          ))}
        </div>
      </div>
      <div style={{height:26,borderBottom:BDR(c),display:"flex",alignItems:"center",
        padding:"0 14px",fontSize:10,color:c.txt3,fontFamily:QF,background:c.sGt,gap:12,flexShrink:0}}>
        <span style={{fontWeight:600,color:c.txt2}}>{SEF[curT]}</span>
        <span>{"Enter → "+SEF[SEN[curT]]}</span>
        <span>Tab → Cycle</span>
        <span>{lines.reduce((a,l)=>a+(l.text?.trim()?l.text.trim().split(/\s+/).length:0),0)} words</span>
        <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>goToPage(Math.max(0,Math.floor(cur/LPP)-1))}
            style={{background:"none",border:BDR(c),borderRadius:4,width:16,height:16,fontSize:9,cursor:"pointer",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>{"▲"}</button>
          <select value={Math.floor(cur/LPP)} onChange={e=>goToPage(Number(e.target.value))}
            style={{background:c.surf,border:BDR(c),borderRadius:4,fontSize:9,fontWeight:600,color:c.txt,padding:"1px 2px",fontFamily:QF,cursor:"pointer",outline:"none"}}>
            {Array.from({length:tp},(_,i)=><option key={i} value={i}>Pg {i+1}/{tp}</option>)}
          </select>
          <button onClick={()=>goToPage(Math.min(tp-1,Math.floor(cur/LPP)+1))}
            style={{background:"none",border:BDR(c),borderRadius:4,width:16,height:16,fontSize:9,cursor:"pointer",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>{"▼"}</button>
        </span>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <button onClick={()=>sZoom(z=>Math.max(60,z-10))}
            style={{background:"none",border:BDR(c),borderRadius:5,width:18,height:18,
              fontSize:11,cursor:"pointer",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
          <span style={{fontSize:10,fontWeight:600,minWidth:30,textAlign:"center"}}>{zoom}%</span>
          <button onClick={()=>sZoom(z=>Math.min(200,z+10))}
            style={{background:"none",border:BDR(c),borderRadius:5,width:18,height:18,
              fontSize:11,cursor:"pointer",color:c.txt,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        </div>
        <ScriptExportMenu c={c} dark={dark} script={script} lines={lines}/>
      </div>
      <div ref={scrollRef} style={{flex:1,overflow:"auto",padding:"30px 0 60px",display:"flex",flexDirection:"column",alignItems:"center",background:c.sBg,minHeight:0}}>
        {Array.from({length:tp},(_,pi) => {
          const start=pi*LPP, end=Math.min(start+LPP,lines.length);
          return (
            <div key={pi} data-page={pi} style={{width:Math.round(816*sc),minHeight:Math.round(1056*sc),background:c.sPg,
              boxShadow:`0 1px 6px ${c.shd}`,marginBottom:20,position:"relative",borderRadius:2}}>
              <div style={{position:"absolute",top:48*sc,right:96*sc,fontSize:10*sc,color:c.txt3,
                fontFamily:"'Courier Prime',monospace"}}>{pi+1}.</div>
              <div style={{padding:`${96*sc}px ${96*sc}px ${72*sc}px ${144*sc}px`,transform:`scale(${sc})`,transformOrigin:"top left",width:816,minHeight:1056}}>
                {lines.slice(start,end).map((line,li) => {
                  const gi=start+li;
                  return (
                    <div key={line.id} style={{marginBottom:line.type==="sc"?12:line.type==="ac"?6:0}}>
                      <SLine lineId={line.id} initText={line.text} type={line.type} active={cur===gi}
                        c={c} dark={dark} onText={txt=>onTxt(gi,txt)} onKey={e=>onKey(e,gi)}
                        onFocus={()=>{sCur(gi);sCurT(lines[gi]?.type||"ac");sAcO([]);}} ph={SPH[line.type]}/>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {acO.length>0 && (
        <div style={{position:"fixed",left:"50%",bottom:80,transform:"translateX(-50%)",zIndex:500,
          background:c.ctx,border:BDR(c),borderRadius:10,padding:"3px 0",
          boxShadow:`0 4px 16px ${c.shd}`,fontFamily:QF,minWidth:160}}>
          {acO.map((o,i) => (
            <button key={o} onClick={()=>appAc(o,cur)}
              style={{display:"block",width:"100%",padding:"6px 12px",
                background:i===acI?c.surfH:"none",border:"none",color:c.txt,
                fontSize:12,fontWeight:600,cursor:"pointer",textAlign:"left",fontFamily:QF}}>
              {o}
            </button>
          ))}
        </div>
      )}
      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:#bbb;pointer-events:none;font-style:italic;}`}</style>

    </div>
  );
}

/* ══════ SVG LINES ══════ */
const CLine = React.memo(function CLine({cn,nodes,c}) {
  const fn=nodes.find(n=>n.id===cn.fN), tn=nodes.find(n=>n.id===cn.tN);
  if(!fn||!tn) return null;
  const fp=(fn.ports||[]).find(p=>p.id===cn.fP), tp=(tn.ports||[]).find(p=>p.id===cn.tP);
  if(!fp||!tp) return null;
  const a=pPos(fn,fp), b=pPos(tn,tp);
  const col=cn.color||c.ln, lbl=cn.label||"";
  const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
  const lblEl=lbl?<text x={mx} y={my-6} textAnchor="middle" fontSize={9} fontFamily="Quicksand" fontWeight={600} fill={col} style={{pointerEvents:"none"}}>{lbl}</text>:null;
  if(cn.str) return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={2}/>{lblEl}</g>;
  const dx=Math.abs(b.x-a.x)*0.45, dy=Math.abs(b.y-a.y)*0.45;
  const v1=fp.s==="top"||fp.s==="bottom", v2=tp.s==="top"||tp.s==="bottom";
  const cx1=v1?a.x:a.x+(fp.s==="right"?dx:-dx), cy1=v1?a.y+(fp.s==="bottom"?dy:-dy):a.y;
  const cx2=v2?b.x:b.x+(tp.s==="right"?dx:-dx), cy2=v2?b.y+(tp.s==="bottom"?dy:-dy):b.y;
  return <g><path d={`M${a.x},${a.y} C${cx1},${cy1} ${cx2},${cy2} ${b.x},${b.y}`} stroke={col} strokeWidth={2} fill="none"/>{lblEl}</g>;
});

const CHit = React.memo(function CHit({cn,nodes,onCtx}) {
  const fn=nodes.find(n=>n.id===cn.fN), tn=nodes.find(n=>n.id===cn.tN);
  if(!fn||!tn) return null;
  const fp=(fn.ports||[]).find(p=>p.id===cn.fP), tp=(tn.ports||[]).find(p=>p.id===cn.tP);
  if(!fp||!tp) return null;
  const a=pPos(fn,fp), b=pPos(tn,tp);
  const h = {stroke:"transparent",strokeWidth:14,fill:"none",
    style:{cursor:"pointer",pointerEvents:"stroke"},
    onContextMenu:e=>{e.preventDefault();e.stopPropagation();onCtx(cn,e);}};
  if(cn.str) return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...h}/>;
  const dx=Math.abs(b.x-a.x)*0.45, dy=Math.abs(b.y-a.y)*0.45;
  const v1=fp.s==="top"||fp.s==="bottom", v2=tp.s==="top"||tp.s==="bottom";
  const cx1=v1?a.x:a.x+(fp.s==="right"?dx:-dx), cy1=v1?a.y+(fp.s==="bottom"?dy:-dy):a.y;
  const cx2=v2?b.x:b.x+(tp.s==="right"?dx:-dx), cy2=v2?b.y+(tp.s==="bottom"?dy:-dy):b.y;
  return <path d={`M${a.x},${a.y} C${cx1},${cy1} ${cx2},${cy2} ${b.x},${b.y}`} {...h}/>;
});

function DLine({from,to,c}) {
  if(!from) return null;
  const dx=Math.abs(to.x-from.x)*0.4;
  return <path d={`M${from.x},${from.y} C${from.x+dx},${from.y} ${to.x-dx},${to.y} ${to.x},${to.y}`}
    stroke={c.ln} strokeWidth={2} fill="none" strokeDasharray="6 4" opacity={0.5}/>;
}

/* ══════ NODE ══════ */
const NBox = React.memo(function NBox({node,c,nc,dark,dispatch,dC,mC,sbFrames,isSelected,conns,nodes}) {
  const w=node.w||200, h=node.h||100;
  const [ed,sEd]=useState(false);
  const [lbl,sLbl]=useState(node.label);
  const [hov,sHov]=useState(false);
  const [inf,sInf]=useState(false);
  const [calI,sCalI]=useState(null);
  const [upMenu,sUpMenu]=useState(false);
  const [sbPick,sSbPick]=useState(false);
  const [plotArc,sPlotArc]=useState(!!node.plotArc);
  const [plotLinear,sPlotLinear]=useState(!!node.plotLinear);
  const [linkInput,sLinkInput]=useState(node.info?.linkUrl||"");
  const [linkLoading,sLinkLoading]=useState(false);
  const [linkPreview,sLinkPreview]=useState(node.info?.linkPreview||null);
  const fRef=useRef(null);
  const bRef=useRef(null);
  useEffect(()=>sLbl(node.label),[node.label]);
  /* Track actual rendered height - debounced to avoid loops */
  const hTimer=useRef(null);
  useEffect(()=>{
    if(!bRef.current)return;
    const ro=new ResizeObserver(()=>{
      if(!bRef.current)return;
      const oh=bRef.current.offsetHeight;
      if(oh>h+4){
        clearTimeout(hTimer.current);
        hTimer.current=setTimeout(()=>dispatch({t:"U",id:node.id,u:{h:oh}}),200);
      }
    });
    ro.observe(bRef.current);return()=>{ro.disconnect();clearTimeout(hTimer.current);};
  },[node.id,h]);

  const bg=node.cc||nc.bg, info=node.info||{}, pa=dark?PA_D:PA_L;
  const tld=node.tld||[], tl=isTL(node.type);

  const fUp=ev=>{const f=ev.target.files?.[0];if(!f)return;const err=validateFile(f);if(err){alert(err);return;}const r=new FileReader();r.onload=e=>dispatch({t:"U",id:node.id,u:{af:{id:uid(),name:f.name,type:f.type,url:e.target.result}}});r.readAsDataURL(f);sUpMenu(false);};

  /* Port dots - connected (with larger hit area for sliding) */
  const portEls=(node.ports||[]).filter(p=>p.c).map(port=>{
    let px,py;
    if(port.s==="top"){px=port.p*w;py=0;}else if(port.s==="bottom"){px=port.p*w;py=h;}
    else if(port.s==="left"){px=0;py=port.p*h;}else{px=w;py=port.p*h;}
    const isTB=port.s==="top"||port.s==="bottom";
    return (
      <div key={port.id}
        style={{position:"absolute",left:px-12,top:py-12,width:24,height:24,borderRadius:"50%",
          background:"transparent",zIndex:45,cursor:isTB?"ew-resize":"ns-resize",
          display:"flex",alignItems:"center",justifyContent:"center"}}
        onMouseEnter={e=>{const d=e.currentTarget.firstChild;if(d)d.style.transform="scale(1.3)";}}
        onMouseLeave={e=>{const d=e.currentTarget.firstChild;if(d)d.style.transform="scale(1)";}}
        onMouseDown={e=>{e.stopPropagation();dispatch({t:"PSLIDE",nid:node.id,pid:port.id,side:port.s});}}
        onMouseUp={e=>{e.stopPropagation();if(dC)dispatch({t:"CP",toN:node,toP:port});}}>
        <div style={{width:14,height:14,borderRadius:"50%",background:c.port,border:`2px solid ${bg}`,
          transition:"transform 0.15s",pointerEvents:"none"}}/>
      </div>
    );
  });
  /* Port dots - unconnected (being dragged) */
  const unconnEls=(node.ports||[]).filter(p=>!p.c).map(port=>{
    let px,py;
    if(port.s==="top"){px=port.p*w;py=0;}else if(port.s==="bottom"){px=port.p*w;py=h;}
    else if(port.s==="left"){px=0;py=port.p*h;}else{px=w;py=port.p*h;}
    return (
      <div key={port.id}
        style={{position:"absolute",left:px-5,top:py-5,width:10,height:10,borderRadius:"50%",
          background:c.port,opacity:0.6,zIndex:45,cursor:"crosshair",animation:"portSpawn 0.2s ease-out"}}
        onMouseDown={e=>{e.stopPropagation();dispatch({t:"PG",node,port});}}
        onMouseUp={e=>{e.stopPropagation();if(dC)dispatch({t:"CP",toN:node,toP:port});}}/>
    );
  });

  const csz=26;
  const isNear = dC && dC.nid!==node.id && mC;
  const nearDist = isNear ? (()=>{
    const cx=mC.x, cy=mC.y;
    const inX=cx>=node.x-35&&cx<=node.x+w+35;
    const inY=cy>=node.y-35&&cy<=node.y+h+35;
    if(!inX||!inY) return 999;
    const dx=Math.max(0,Math.max(node.x-cx,cx-(node.x+w)));
    const dy=Math.max(0,Math.max(node.y-cy,cy-(node.y+h)));
    return Math.hypot(dx,dy);
  })() : 999;
  const showRipple = nearDist < 35;

  return (
    <div ref={bRef}
      style={{position:"absolute",left:node.x,top:node.y,width:w,minHeight:h,background:bg,
        border:`${isSelected?3:2}px solid ${isSelected?c.acc:nc.bd}`,borderRadius:18,
        boxShadow:isSelected?`0 0 0 3px ${c.acc}33, 0 4px 16px ${c.shd}`:`0 4px 16px ${c.shd}`,
        cursor:"default",userSelect:"none",fontFamily:QF,display:"flex",flexDirection:"column",overflow:"visible"}}
      onMouseEnter={()=>sHov(true)} onMouseLeave={()=>sHov(false)}
      onDoubleClick={()=>{if(node.type==="evt"||tl)dispatch({t:"MOD",node});}}
      onContextMenu={e=>{e.preventDefault();e.stopPropagation();dispatch({t:"NCTX",node,e});}}>

      {/* Ripple indicator when dragging a connection nearby */}
      {showRipple && (
        <div style={{position:"absolute",inset:-6,borderRadius:22,border:`2px solid ${nc.bd}`,
          pointerEvents:"none",zIndex:1,animation:"nodeRipple 0.8s ease-out infinite"}}/>
      )}
      {showRipple && (
        <div style={{position:"absolute",inset:-4,borderRadius:20,border:`1.5px solid ${nc.bd}`,opacity:0.4,
          pointerEvents:"none",zIndex:1,animation:"nodeRipple 0.8s ease-out infinite 0.3s"}}/>
      )}

      {/* OVERLAY: corner resize + edge port creation - z75 above content */}
      <div style={{position:"absolute",inset:-4,pointerEvents:"none",zIndex:75}}>
        {/* 4 corners */}
        <div style={{position:"absolute",top:0,left:0,width:csz,height:csz,cursor:"nwse-resize",pointerEvents:"auto"}}
          onMouseDown={e=>{e.stopPropagation();dispatch({t:"CRN",nid:node.id,sx:e.clientX,sy:e.clientY,sw:w,sh:h,snx:node.x,sny:node.y,isR:false,isB:false});}}/>
        <div style={{position:"absolute",top:0,right:0,width:csz,height:csz,cursor:"nesw-resize",pointerEvents:"auto"}}
          onMouseDown={e=>{e.stopPropagation();dispatch({t:"CRN",nid:node.id,sx:e.clientX,sy:e.clientY,sw:w,sh:h,snx:node.x,sny:node.y,isR:true,isB:false});}}/>
        <div style={{position:"absolute",bottom:0,left:0,width:csz,height:csz,cursor:"nesw-resize",pointerEvents:"auto"}}
          onMouseDown={e=>{e.stopPropagation();dispatch({t:"CRN",nid:node.id,sx:e.clientX,sy:e.clientY,sw:w,sh:h,snx:node.x,sny:node.y,isR:false,isB:true});}}/>
        <div style={{position:"absolute",bottom:0,right:0,width:csz,height:csz,cursor:"nwse-resize",pointerEvents:"auto"}}
          onMouseDown={e=>{e.stopPropagation();dispatch({t:"CRN",nid:node.id,sx:e.clientX,sy:e.clientY,sw:w,sh:h,snx:node.x,sny:node.y,isR:true,isB:true});}}/>
      </div>

      {/* Always-on edge port creation zones — NOT conditional on hov to prevent flicker */}
      <div style={{position:"absolute",bottom:-10,left:csz,right:csz,height:14,
        cursor:"crosshair",pointerEvents:"auto",zIndex:80}}
        onMouseDown={e=>{e.stopPropagation();dispatch({t:"EDGF",node,e,edge:"bottom"});}}/>
      <div style={{position:"absolute",top:-10,left:csz,right:csz,height:14,
        cursor:"crosshair",pointerEvents:"auto",zIndex:80}}
        onMouseDown={e=>{e.stopPropagation();dispatch({t:"EDGF",node,e,edge:"top"});}}/>
      <div style={{position:"absolute",left:-10,top:csz,bottom:csz,width:14,
        cursor:"crosshair",pointerEvents:"auto",zIndex:80}}
        onMouseDown={e=>{e.stopPropagation();dispatch({t:"EDGF",node,e,edge:"left"});}}/>
      <div style={{position:"absolute",right:-10,top:csz,bottom:csz,width:14,
        cursor:"crosshair",pointerEvents:"auto",zIndex:80}}
        onMouseDown={e=>{e.stopPropagation();dispatch({t:"EDGF",node,e,edge:"right"});}}/>

      {tl && (
        <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:15}}>
          <div style={{position:"absolute",left:-6,top:0,width:12,height:"100%",cursor:"ew-resize",pointerEvents:"auto"}}
            onMouseDown={e=>{e.stopPropagation();dispatch({t:"TLR",nid:node.id,side:"left",sx:e.clientX,sw:w,snx:node.x});}}/>
          <div style={{position:"absolute",right:-6,top:0,width:12,height:"100%",cursor:"ew-resize",pointerEvents:"auto"}}
            onMouseDown={e=>{e.stopPropagation();dispatch({t:"TLR",nid:node.id,side:"right",sx:e.clientX,sw:w,snx:node.x});}}/>
        </div>
      )}

      {/* Person/Place/Object node content */}
      {(node.type==="person"||node.type==="place"||node.type==="object") && (
        <div style={{padding:"0 14px 8px",position:"relative",zIndex:65}} onMouseDown={stop}>
          <div onClick={stop}
            onDragOver={e=>{e.preventDefault();e.stopPropagation();}}
            onDrop={e=>{
              e.preventDefault();e.stopPropagation();
              const file=e.dataTransfer.files?.[0];
              if(!file||!file.type.startsWith("image/"))return;
              if(file.size>2*1024*1024){alert("Image must be under 2MB");return;}
              const r=new FileReader();
              r.onload=ev=>dispatch({t:"U",id:node.id,u:{info:{...info,image:ev.target.result}}});
              r.readAsDataURL(file);
            }}
            style={{width:"100%",height:90,borderRadius:10,border:`1.5px dashed ${nc.bd}50`,
              background:`${nc.bd}08`,display:"flex",alignItems:"center",justifyContent:"center",
              overflow:"hidden",position:"relative",marginBottom:8,cursor:"pointer"}}
            onClickCapture={e=>{
              if(info.image)return;
              const inp=document.createElement("input");
              inp.type="file";inp.accept="image/*";
              inp.onchange=ev=>{
                const file=ev.target.files?.[0];
                if(!file||file.size>2*1024*1024){if(file)alert("Image must be under 2MB");return;}
                const r=new FileReader();
                r.onload=ev2=>dispatch({t:"U",id:node.id,u:{info:{...info,image:ev2.target.result}}});
                r.readAsDataURL(file);
              };
              inp.click();
            }}>
            {info.image ? (
              <>
                <img src={info.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                <button onClick={e=>{e.stopPropagation();dispatch({t:"U",id:node.id,u:{info:{...info,image:null}}});}}
                  style={{position:"absolute",top:4,right:4,width:20,height:20,borderRadius:"50%",
                    background:"rgba(0,0,0,0.5)",border:"none",color:"#fff",fontSize:12,cursor:"pointer",
                    display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{"×"}</button>
              </>
            ) : (
              <div style={{textAlign:"center",color:nc.bd,opacity:0.6,fontSize:9,fontFamily:QF,fontWeight:600}}>
                <div style={{fontSize:18,marginBottom:2}}>
                  {node.type==="person"?String.fromCodePoint(0x1F464):node.type==="place"?String.fromCodePoint(0x1F3E0):String.fromCodePoint(0x1F9B4)}
                </div>
                Drop image or click
              </div>
            )}
          </div>
          <div style={{marginBottom:6}}>
            <div style={{fontSize:8,fontWeight:700,color:nc.bd,marginBottom:2,textTransform:"uppercase",letterSpacing:0.5}}>Name</div>
            <input value={info.name||""} onChange={e=>dispatch({t:"U",id:node.id,u:{info:{...info,name:e.target.value}}})}
              onMouseDown={stop} placeholder="(unnamed)"
              style={{width:"100%",background:"transparent",border:"none",borderBottom:`1px solid ${nc.bd}40`,
                outline:"none",fontFamily:QF,fontSize:11,color:c.txt,padding:"2px 0",fontWeight:600}}/>
          </div>
          {node.type==="person" && (
            <div style={{marginBottom:6}}>
              <div style={{fontSize:8,fontWeight:700,color:nc.bd,marginBottom:3,textTransform:"uppercase",letterSpacing:0.5}}>Gender</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {["Male","Female","Non-binary","Other"].map(g=>(
                  <button key={g} onClick={e=>{stop(e);dispatch({t:"U",id:node.id,u:{info:{...info,gender:g}}});}}
                    style={{padding:"3px 8px",borderRadius:8,border:BDR(c),fontSize:9,fontWeight:600,
                      cursor:"pointer",fontFamily:QF,
                      background:info.gender===g?nc.bd:"transparent",
                      color:info.gender===g?bg:c.txt2}}>{g}</button>
                ))}
              </div>
            </div>
          )}
          {node.type==="place" && (
            <div style={{marginBottom:6}}>
              <div style={{fontSize:8,fontWeight:700,color:nc.bd,marginBottom:2,textTransform:"uppercase",letterSpacing:0.5}}>Address</div>
              <input value={info.address||""} onChange={e=>dispatch({t:"U",id:node.id,u:{info:{...info,address:e.target.value}}})}
                onMouseDown={stop} placeholder="(no address)"
                style={{width:"100%",background:"transparent",border:"none",borderBottom:`1px solid ${nc.bd}40`,
                  outline:"none",fontFamily:QF,fontSize:10,color:c.txt,padding:"2px 0"}}/>
            </div>
          )}
          <div>
            <div style={{fontSize:8,fontWeight:700,color:nc.bd,marginBottom:2,textTransform:"uppercase",letterSpacing:0.5}}>Notes</div>
            <textarea value={info.notes||""} onChange={e=>dispatch({t:"U",id:node.id,u:{info:{...info,notes:e.target.value}}})}
              onMouseDown={stop} placeholder="Add notes..."
              style={{width:"100%",background:"transparent",border:`1px solid ${nc.bd}30`,borderRadius:6,
                outline:"none",fontFamily:QF,fontSize:10,color:c.txt,padding:"4px 6px",
                resize:"vertical",minHeight:40,boxSizing:"border-box"}}/>
          </div>
        </div>
      )}

      {!inf && portEls}
      {!inf && unconnEls}


      {/* Grab handle — always visible, subtle until hovered */}
      <div style={{position:"absolute",top:4,left:"50%",transform:"translateX(-50%)",width:44,height:14,
        borderRadius:7,background:hov?c.gBg:"transparent",display:"flex",alignItems:"center",justifyContent:"center",
        gap:3,cursor:"grab",zIndex:70,transition:"background 0.15s,opacity 0.15s",opacity:hov?1:0}}
        onMouseDown={e=>{e.stopPropagation();dispatch({t:"ND",node,e});}}
        onMouseEnter={()=>sHov(true)}
        onTouchStart={e=>{e.stopPropagation();const t=e.touches[0];dispatch({t:"ND",node,e:{clientX:t.clientX,clientY:t.clientY,stopPropagation:()=>{}}});}}>
        <div style={{width:3,height:3,borderRadius:"50%",background:c.gD}}/>
        <div style={{width:3,height:3,borderRadius:"50%",background:c.gD}}/>
        <div style={{width:3,height:3,borderRadius:"50%",background:c.gD}}/>
      </div>

      <div style={{padding:"16px 14px 4px",display:"flex",alignItems:"center",gap:7,position:"relative",zIndex:65}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:8,fontWeight:600,textTransform:"uppercase",letterSpacing:1.2,color:nc.bd,marginBottom:1}}>{NTL[node.type]}</div>
          {ed ? (
            <input autoFocus value={lbl} onChange={e=>sLbl(e.target.value)}
              onBlur={()=>{sEd(false);dispatch({t:"U",id:node.id,u:{label:lbl,info:{...info,label:lbl}}});}}
              onKeyDown={e=>{if(e.key==="Enter"){sEd(false);dispatch({t:"U",id:node.id,u:{label:lbl,info:{...info,label:lbl}}});}}}
              onMouseDown={stop}
              style={{background:"transparent",border:"none",borderBottom:`1px solid ${nc.bd}`,outline:"none",
                fontFamily:QF,fontSize:13,fontWeight:600,color:c.txt,width:"100%",padding:0}}/>
          ) : (
            <div style={{fontSize:13,fontWeight:600,color:c.txt,cursor:"text",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}
              onClick={e=>{e.stopPropagation();sEd(true);}}>{node.label}</div>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:nc.bd}}/>
          <button onClick={e=>{e.stopPropagation();dispatch({t:"CDEL",id:node.id,label:node.label});}}
            style={{background:"none",border:"none",color:c.txt3,cursor:"pointer",fontSize:14,fontWeight:700,
              padding:0,lineHeight:1,width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u00d7"}</button>
        </div>
      </div>

      {node.type==="stl" && (
        <div style={{padding:"2px 14px 0",display:"flex",flexDirection:"column",gap:3,position:"relative",zIndex:65}} onMouseDown={stop}>
          <div style={{display:"flex",alignItems:"center",height:16}}>
            <span style={{fontSize:8,fontWeight:600,color:nc.bd,fontFamily:QF,width:52}}>Plot Arc</span>
            <div onClick={e=>{e.stopPropagation();const nv=!plotArc;sPlotArc(nv);
              const basePts=node.plotPts?.length?node.plotPts:[
                  {id:uid(),x:0.0,y:0.85,label:"Beginning"},
                  {id:uid(),x:0.3,y:0.4,label:"Rising Action"},
                  {id:uid(),x:0.5,y:0.08,label:"Climax"},
                  {id:uid(),x:0.7,y:0.4,label:"Falling Action"},
                  {id:uid(),x:1.0,y:0.85,label:"Resolution"},
                ];
                /* When enabling plot arc, auto-add markers for already-connected top/bottom ports */
                let finalPts=basePts;
                if(nv){
                  const newMarkers=[];
                  const threshold=10/(w-38);
                  (node.ports||[]).filter(p=>p.c&&(p.s==="top"||p.s==="bottom")).forEach(port=>{
                    const sortedAll=[...basePts,...newMarkers].sort((a,b)=>a.x-b.x);
                    const exists=sortedAll.some(pt=>Math.abs(pt.x-port.p)<threshold);
                    if(!exists){
                      /* Find which node connects via this port to grab its label */
                      const incomingConn=conns.find(cc=>cc.tN===node.id&&cc.tP===port.id);
                      const srcN=incomingConn?nodes.find(n2=>n2.id===incomingConn.fN):null;
                      newMarkers.push({id:uid(),x:Math.max(0.05,Math.min(0.95,port.p)),y:0.5,label:srcN?.label||""});
                    }
                  });
                  finalPts=[...basePts,...newMarkers];
                }
                dispatch({t:"U",id:node.id,u:{plotArc:nv,h:nv?Math.max(h,280):150,plotPts:finalPts}});}}
              style={{width:28,height:14,borderRadius:7,background:plotArc?nc.bd:`${nc.bd}40`,
                cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:plotArc?14:2,width:10,height:10,borderRadius:5,
                background:bg,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
            </div>
          </div>
          {plotArc && (
            <div style={{display:"flex",alignItems:"center",height:16}}>
              <span style={{fontSize:8,fontWeight:600,color:nc.bd,fontFamily:QF,width:52}}>{plotLinear?"Linear":"Curved"}</span>
              <div onClick={e=>{e.stopPropagation();const nv=!plotLinear;sPlotLinear(nv);dispatch({t:"U",id:node.id,u:{plotLinear:nv}});}}
                style={{width:28,height:14,borderRadius:7,background:plotLinear?nc.bd:`${nc.bd}40`,
                  cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:plotLinear?14:2,width:10,height:10,borderRadius:5,
                  background:bg,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plot Arc Visualization */}
      {node.type==="stl" && plotArc && (()=>{
        const pts=node.plotPts||[];
        const padL=19, padR=19, plotH=120, areaW=w-padL-padR;
        const isLin=plotLinear;
        /* Clamp first/last to edges to align with Start/End */
        const clamped=pts.map((p,i,a)=>{
          const sorted2=[...a].sort((x,y)=>x.x-y.x);
          const isFirst=sorted2[0]?.id===p.id;
          const isLast=sorted2[sorted2.length-1]?.id===p.id;
          return {...p, _px: isFirst?0 : isLast?1 : p.x};
        });
        const sorted=[...clamped].sort((a,b)=>a._px-b._px);
        /* Build path - curved or linear */
        const svgPts=sorted.map(p=>({px:p._px*areaW, py:8+p.y*plotH, id:p.id}));
        let pathD="";
        if(svgPts.length>=2){
          pathD=`M${svgPts[0].px},${svgPts[0].py}`;
          for(let i=1;i<svgPts.length;i++){
            const prev=svgPts[i-1], cur=svgPts[i];
            if(isLin){
              pathD+=` L${cur.px},${cur.py}`;
            } else {
              const cpx=(prev.px+cur.px)/2;
              pathD+=` C${cpx},${prev.py} ${cpx},${cur.py} ${cur.px},${cur.py}`;
            }
          }
        } else if(svgPts.length===1){
          pathD=`M${svgPts[0].px},${svgPts[0].py}`;
        }
        /* Gradient fill under curve */
        const fillD=pathD && svgPts.length>=2
          ? pathD+` L${svgPts[svgPts.length-1].px},${plotH+8} L${svgPts[0].px},${plotH+8} Z`
          : "";

        return (
          <div style={{padding:'4px 19px 0 19px',position:"relative",zIndex:65,overflow:"visible"}} onMouseDown={stop}>
            <svg width={areaW} height={plotH+16} style={{overflow:"visible",display:"block"}}>
              {/* Faint horizontal guide lines */}
              {[0.25,0.5,0.75].map(y=>(
                <line key={y} x1={0} y1={8+y*plotH} x2={areaW} y2={8+y*plotH}
                  stroke={nc.bd} strokeWidth={0.3} opacity={0.2} strokeDasharray="4 4"/>
              ))}
              <defs>
                <linearGradient id={`paf-${node.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={nc.bd} stopOpacity="0.15"/>
                  <stop offset="100%" stopColor={nc.bd} stopOpacity="0.02"/>
                </linearGradient>
              </defs>
              {fillD && <path d={fillD} fill={`url(#paf-${node.id})`}/>}
              {/* The arc line */}
              {pathD && <path d={pathD} fill="none" stroke={nc.bd} strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round" opacity={0.7}/>}

              {/* Marker dots */}
              {clamped.map((pt,pi)=>{
                const px=(sorted.find(s=>s.id===pt.id)?._px??pt.x)*areaW;
                const py=8+pt.y*plotH;

                return (
                  <g key={pt.id||pi}>
                    {/* Vertical bridge line to timeline (shown for ALL points as subtle guide, stronger if connected) */}
                    <line x1={px} y1={py+10} x2={px} y2={plotH+16}
                      stroke={nc.bd} strokeWidth={0.8} opacity={0.25}
                      strokeDasharray="3 3"/>
                    {/* Draggable dot */}
                    <circle cx={px} cy={py} r={7} fill={bg} stroke={nc.bd} strokeWidth={2}
                      style={{cursor:"grab"}}
                      onMouseDown={e=>{e.stopPropagation();dispatch({t:"PPD",nid:node.id,pi});}}
                      onContextMenu={e=>{e.preventDefault();e.stopPropagation();
                        if(pts.length<=2) return; /* keep at least 2 points */
                        const np=(node.plotPts||[]).filter((_,i)=>i!==pi);
                        dispatch({t:"U",id:node.id,u:{plotPts:np}});}}/>
                    <circle cx={px} cy={py} r={3} fill={nc.bd} style={{pointerEvents:"none"}}/>

                  </g>
                );
              })}
            </svg>
            {/* Labels ALWAYS above the plot line */}
            {clamped.map((pt,pi)=>{
              const px=padL+(sorted.find(s=>s.id===pt.id)?._px??pt.x)*areaW;
              const py=8+pt.y*plotH;
              return (
                <div key={pt.id||pi} style={{position:"absolute",
                  left:px,top:py-22,transform:"translateX(-50%)",
                  display:"flex",flexDirection:"column",alignItems:"center",zIndex:15,pointerEvents:"auto"}}>
                  <input value={pt.label||""} onChange={ev=>{
                    const np=[...(node.plotPts||[])];np[pi]={...np[pi],label:ev.target.value};
                    dispatch({t:"U",id:node.id,u:{plotPts:np}});}}
                    onMouseDown={ev=>ev.stopPropagation()}
                    style={{width:72,textAlign:"center",background:bg,border:`1px solid ${nc.bd}30`,
                      borderRadius:4,fontSize:7,color:nc.bd,fontFamily:QF,outline:"none",
                      fontWeight:600,padding:"1px 3px"}}/>
                </div>
              );
            })}
            {/* Add point button */}
            <button onClick={e=>{e.stopPropagation();
              const np=[...(node.plotPts||[])];
              np.push({id:uid(),x:0.5,y:0.5,label:"Point"});
              dispatch({t:"U",id:node.id,u:{plotPts:np}});}}
              onMouseDown={stop}
              style={{position:"absolute",bottom:2,right:0,background:bg,border:`1px solid ${nc.bd}40`,
                borderRadius:"50%",width:16,height:16,fontSize:10,color:nc.bd,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,padding:0,
                lineHeight:1,opacity:0.5}}>+</button>
          </div>
        );
      })()}

      {tl && (
        <div style={{padding:plotArc&&node.type==="stl"?"6px 14px 14px":"10px 14px 14px",position:"relative",zIndex:65}} onMouseDown={stop}>
          {/* Start/End labels positioned absolutely at the edges, below the line */}
          <span style={{position:"absolute",left:19,bottom:2,fontSize:8,fontWeight:700,color:nc.bd,fontFamily:QF}}>Start</span>
          <span style={{position:"absolute",right:19,bottom:2,fontSize:8,fontWeight:700,color:nc.bd,fontFamily:QF}}>End</span>
          <div style={{position:"relative",height:2.5,borderRadius:2}}>
              <div style={{position:"absolute",top:0,bottom:0,left:5,right:5,background:nc.bd,borderRadius:2}}/>
              {tld.map((td,idx)=>{
                const side=td.tb||"top", isBottom=side==="bottom";
                return (
                  <div key={td.id} style={{position:"absolute",left:`${(td.pos||0.5)*100}%`,
                    ...(isBottom?{top:8}:{bottom:8}),transform:"translateX(-50%)",display:"flex",
                    flexDirection:isBottom?"column":"column-reverse",alignItems:"center",cursor:"ew-resize",zIndex:10}}
                    onMouseDown={e=>{e.stopPropagation();dispatch({t:"TLS",nid:node.id,di:idx});}}>
                    {!isBottom && <div style={{width:6,height:6,borderRadius:"50%",background:nc.bd}}/>}
                    <button onClick={e=>{e.stopPropagation();sCalI(calI===idx?null:idx);}}
                      onMouseDown={stop}
                      style={{background:td.d?`${nc.bd}20`:bg,border:`1px solid ${nc.bd}50`,borderRadius:6,
                        padding:"1px 5px",fontSize:8,fontWeight:600,color:nc.bd,cursor:"pointer",
                        fontFamily:QF,whiteSpace:"nowrap"}}>{td.d?fmtD(td.d):"Set date"}</button>
                    <input value={td.l||""} onChange={ev=>{const nd=[...tld];nd[idx]={...nd[idx],l:ev.target.value};dispatch({t:"U",id:node.id,u:{tld:nd}});}}
                      onMouseDown={ev=>ev.stopPropagation()}
                      style={{width:55,textAlign:"center",background:"none",border:"none",fontSize:7,color:nc.bd,fontFamily:QF,outline:"none",fontWeight:600,padding:0}}/>
                    {isBottom && <div style={{width:6,height:6,borderRadius:"50%",background:nc.bd,order:-1}}/>}
                    {calI===idx && (
                      <div style={{position:"absolute",...(isBottom?{top:64}:{bottom:64}),left:"50%",transform:"translateX(-50%)",zIndex:300}}>
                        <Calendar c={c} val={td.d} dateSide={td.tb||"top"}
                          onSideChange={s=>{const nd=[...tld];nd[idx]={...nd[idx],tb:s};dispatch({t:"U",id:node.id,u:{tld:nd}});}}
                          onChange={v=>{const nd=[...tld];nd[idx]={...nd[idx],d:v};dispatch({t:"U",id:node.id,u:{tld:nd}});}}
                          onClose={()=>sCalI(null)}
                          onRemove={()=>dispatch({t:"U",id:node.id,u:{tld:tld.filter((_,i)=>i!==idx)}})}/>
                      </div>
                    )}
                  </div>
                );
              })}
              {tld.length<8 && (
                <button onClick={e=>{e.stopPropagation();
                  const nd=[...tld];nd.push({id:uid(),d:"",l:"Event",pos:nd.length===0?0.5:Math.min(0.95,0.25+nd.length*0.2),tb:"top"});
                  dispatch({t:"U",id:node.id,u:{tld:nd}});}}
                  onMouseDown={stop}
                  style={{position:"absolute",bottom:-12,left:"50%",transform:"translateX(-50%)",background:bg,border:`1px solid ${nc.bd}40`,borderRadius:"50%",width:14,height:14,
                    fontSize:10,color:nc.bd,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,padding:0,lineHeight:1,opacity:0.5}}>+</button>
              )}
            </div>
        </div>
      )}

      <div style={{padding:"2px 14px 6px",position:"relative",zIndex:65}} onMouseDown={stop}>
        <button onClick={e=>{e.stopPropagation();sInf(!inf);}}
          style={{background:"none",border:"none",padding:"3px 0",fontSize:10,fontWeight:600,color:c.txt3,cursor:"pointer",fontFamily:QF,display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:7,transform:inf?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.15s",display:"inline-block"}}>{"\u25b6"}</span>Info</button>
        {inf && (
          <div style={{marginTop:6,display:"flex",flexDirection:"column",gap:4,background:bg,position:"relative",zIndex:31}}>
            <input value={node.label} placeholder="Label"
              onChange={e=>{const v=e.target.value;dispatch({t:"U",id:node.id,u:{label:v,info:{...info,label:v}}});sLbl(v);}}
              style={{width:"100%",background:c.inf,border:BDR(c),borderRadius:8,padding:"4px 8px",fontSize:11,color:c.txt,fontFamily:QF,outline:"none",boxSizing:"border-box"}}/>
            {[{k:"date",p:"Date"},{k:"desc",p:"Description"}].map(f=>(
              <input key={f.k} value={info[f.k]||""} placeholder={f.p}
                onChange={e=>dispatch({t:"U",id:node.id,u:{info:{...info,[f.k]:e.target.value}}})}
                style={{width:"100%",background:c.inf,border:BDR(c),borderRadius:8,padding:"4px 8px",fontSize:11,color:c.txt,fontFamily:QF,outline:"none",boxSizing:"border-box"}}/>
            ))}
            {/* Link input for Event nodes */}
            {node.type==="evt" && (
              <div style={{marginTop:4}}>
                <div style={{fontSize:9,fontWeight:600,color:c.txt3,marginBottom:3}}>Link</div>
                <div style={{display:"flex",gap:4}}>
                  <input value={linkInput} onChange={e=>sLinkInput(e.target.value)}
                    placeholder="Paste article URL..."
                    onMouseDown={stop}
                    style={{flex:1,background:c.inf,border:BDR(c),borderRadius:8,padding:"4px 8px",
                      fontSize:10,color:c.txt,fontFamily:QF,outline:"none",boxSizing:"border-box"}}/>
                  <button disabled={linkLoading||!linkInput.trim()} onClick={async(e)=>{
                    e.stopPropagation();
                    const rawUrl=linkInput.trim();
                    if(!rawUrl) return;
                    const url=rawUrl.startsWith("http")?rawUrl:"https://"+rawUrl;
                    sLinkInput(url);sLinkLoading(true);
                    const preview=await fetchLinkPreview(url);
                    sLinkPreview(preview);sLinkLoading(false);
                    dispatch({t:"U",id:node.id,u:{info:{...info,linkUrl:url,linkPreview:preview}}});
                  }}
                    style={{background:c.acc,color:c.bg,border:"none",borderRadius:8,padding:"4px 8px",
                      fontSize:9,fontWeight:700,cursor:linkLoading?"wait":"pointer",fontFamily:QF,
                      opacity:(linkLoading||!linkInput.trim())?0.5:1,whiteSpace:"nowrap"}}>
                    {linkLoading?"...":"Fetch"}
                  </button>
                </div>
                {/* Link preview card */}
                {linkPreview && !linkPreview.error && (
                  <div style={{marginTop:6,border:BDR(c),borderRadius:10,overflow:"hidden",
                    background:c.surf,fontSize:10}}>
                    {linkPreview.image && (
                      <img src={linkPreview.image} alt="" style={{width:"100%",height:80,objectFit:"cover",display:"block"}}
                        onError={e=>{e.target.style.display="none";}}/>
                    )}
                    <div style={{padding:"6px 8px"}}>
                      {linkPreview.siteName && (
                        <div style={{fontSize:8,fontWeight:600,color:c.acc,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>{linkPreview.siteName}</div>
                      )}
                      <div style={{fontSize:11,fontWeight:700,color:c.txt,lineHeight:1.3,marginBottom:2}}>{linkPreview.title}</div>
                      {linkPreview.description && (
                        <div style={{fontSize:9,color:c.txt3,lineHeight:1.4,
                          display:"-webkit-box",WebkitLineClamp:3,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{linkPreview.description}</div>
                      )}
                      {linkPreview.date && (
                        <div style={{fontSize:8,color:c.txt3,marginTop:3}}>Published: {fmtD(linkPreview.date)}</div>
                      )}
                      <div style={{display:"flex",gap:4,marginTop:6}}>
                        <button onClick={e=>{
                          e.stopPropagation();
                          const updates={info:{...info,linkUrl:linkPreview.url,linkPreview}};
                          if(linkPreview.title) {updates.label=linkPreview.title;sLbl(linkPreview.title);updates.info.label=linkPreview.title;}
                          if(linkPreview.description) updates.info={...updates.info,desc:linkPreview.description};
                          if(linkPreview.date) updates.info={...updates.info,date:linkPreview.date};
                          dispatch({t:"U",id:node.id,u:updates});
                        }}
                          style={{flex:1,padding:"4px 0",background:c.acc,color:c.bg,border:"none",borderRadius:6,
                            fontSize:9,fontWeight:700,cursor:"pointer",fontFamily:QF}}>Auto-fill from article</button>
                        <button onClick={e=>{
                          e.stopPropagation();
                          window.open(linkPreview.url,"_blank","noopener");
                        }}
                          style={{padding:"4px 8px",background:"none",border:BDR(c),borderRadius:6,
                            fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:QF,color:c.txt3}}>Open</button>
                      </div>
                    </div>
                  </div>
                )}
                {linkPreview && linkPreview.error && (
                  <div style={{marginTop:4,fontSize:9,color:"#e53935",fontFamily:QF}}>
                    Could not fetch preview. Check the URL.
                  </div>
                )}
                {info.linkUrl && !linkPreview && (
                  <button onClick={e=>{e.stopPropagation();window.open(info.linkUrl,"_blank","noopener");}}
                    style={{marginTop:4,fontSize:9,color:c.acc,background:"none",border:"none",cursor:"pointer",
                      fontFamily:QF,fontWeight:600,textDecoration:"underline",padding:0}}>
                    {info.linkUrl.length>40?info.linkUrl.slice(0,40)+"...":info.linkUrl}
                  </button>
                )}
              </div>
            )}
            <div style={{marginTop:2}}>
              <div style={{fontSize:9,fontWeight:600,color:c.txt3,marginBottom:3}}>Color</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {pa.map(pc=>(
                  <button key={pc.l} onClick={()=>dispatch({t:"U",id:node.id,u:{cc:pc.v}})}
                    style={{width:16,height:16,borderRadius:5,border:(node.cc===pc.v||(!node.cc&&!pc.v))?`2px solid ${c.acc}`:BDR(c),background:pc.v||nc.bg,cursor:"pointer"}} title={pc.l}/>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Link preview badge for events */}
      {node.type==="evt" && node.info?.linkPreview && !inf && (
        <div style={{padding:"0 14px 4px",position:"relative",zIndex:65}} onMouseDown={stop}>
          <div onClick={e=>{e.stopPropagation();window.open(node.info.linkUrl,"_blank","noopener");}}
            style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",
              background:c.surf,border:BDR(c),borderRadius:8,cursor:"pointer",
              transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background=c.surfH}
            onMouseLeave={e=>e.currentTarget.style.background=c.surf}>
            {node.info.linkPreview.image && (
              <img src={node.info.linkPreview.image} alt=""
                style={{width:28,height:28,borderRadius:4,objectFit:"cover",flexShrink:0}}
                onError={e=>{e.target.style.display="none";}}/>
            )}
            <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
              <div style={{fontSize:9,fontWeight:600,color:c.txt,whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>
                {node.info.linkPreview.siteName||"Link"}
              </div>
              <div style={{fontSize:8,color:c.txt3,whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>
                {node.info.linkPreview.title||node.info.linkUrl}
              </div>
            </div>
            <span style={{fontSize:10,color:c.txt3,flexShrink:0}}>↗</span>
          </div>
        </div>
      )}

      {node.type==="note" && (
        <div style={{padding:"0 14px 8px",position:"relative",zIndex:65}} onMouseDown={stop}>
          <textarea value={node.nt||""} onChange={e=>dispatch({t:"U",id:node.id,u:{nt:e.target.value}})} placeholder="Write note..."
            style={{width:"100%",minHeight:36,background:"transparent",border:BDR(c),borderRadius:10,padding:8,fontFamily:QF,fontSize:11,color:c.txt,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
        </div>
      )}

      {node.type==="asset" && (
        <div style={{padding:"0 14px 8px",position:"relative",zIndex:65}} onMouseDown={stop}>
          <input ref={fRef} type="file" accept="image/*,video/*,application/pdf" style={{display:"none"}} onChange={fUp}/>
          {node.af ? (
            <div style={{borderRadius:10,overflow:"hidden",border:BDR(c),cursor:"pointer",position:"relative"}}
              onDoubleClick={e=>{e.stopPropagation();dispatch({t:"AP",asset:node.af});}}>
              {node.af.type?.startsWith("video")
                ? <video src={node.af.url} style={{width:"100%",maxHeight:Math.max(40,h-80),objectFit:"contain",background:"#000"}}/>
                : <img src={node.af.url} alt="" style={{width:"100%",maxHeight:Math.max(40,h-80),objectFit:"contain"}}/>}
              <button onClick={e=>{e.stopPropagation();dispatch({t:"U",id:node.id,u:{af:null}});}} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,0.5)",color:"#fff",border:"none",borderRadius:6,width:16,height:16,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u00d7"}</button>
            </div>
          ) : (
            <div style={{position:"relative"}}>
              <button onClick={e=>{e.stopPropagation();sUpMenu(!upMenu);sSbPick(false);}}
                style={{width:"100%",padding:"10px",background:c.surf,border:`2px dashed ${c.bdr}`,borderRadius:10,color:c.txt3,fontSize:11,fontWeight:600,fontFamily:QF,cursor:"pointer",textAlign:"center"}}>+ Upload</button>
              {upMenu && (
                <div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:4,background:dark?"#2a2a2a":"#fff",border:BDR(c),borderRadius:10,overflow:"hidden",boxShadow:`0 4px 16px ${c.shd}`,zIndex:70}}>
                  <button onClick={e=>{e.stopPropagation();sSbPick(true);sUpMenu(false);}}
                    style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",background:"none",border:"none",borderBottom:BDR(c),color:c.txt,fontSize:11,fontWeight:600,fontFamily:QF,cursor:"pointer",textAlign:"left"}}
                    onMouseEnter={e=>e.currentTarget.style.background=c.surfH} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{fontSize:14}}>{"\u25a6"}</span> From Storyboard</button>
                  <button onClick={e=>{e.stopPropagation();fRef.current?.click();sUpMenu(false);}}
                    style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",background:"none",border:"none",color:c.txt,fontSize:11,fontWeight:600,fontFamily:QF,cursor:"pointer",textAlign:"left"}}
                    onMouseEnter={e=>e.currentTarget.style.background=c.surfH} onMouseLeave={e=>e.currentTarget.style.background="none"}>
                    <span style={{fontSize:14}}>{"\ud83d\udcc1"}</span> From Computer</button>
                </div>
              )}
              {sbPick && (
                <div style={{position:"absolute",top:"100%",left:-20,right:-20,marginTop:4,background:dark?"#2a2a2a":"#fff",border:BDR(c),borderRadius:12,boxShadow:`0 4px 20px ${c.shd}`,zIndex:70,maxHeight:220,overflow:"auto",padding:8}}>
                  <div style={{fontSize:9,fontWeight:700,color:c.txt3,textTransform:"uppercase",letterSpacing:1,padding:"4px 6px 8px"}}>Storyboard Frames</div>
                  {(!sbFrames||sbFrames.length===0) ? (
                    <div style={{padding:12,fontSize:10,color:c.txt3,textAlign:"center"}}>No storyboard frames yet</div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4}}>
                      {sbFrames.map((sf,i)=>(
                        <button key={sf.id||i} onClick={e=>{e.stopPropagation();dispatch({t:"U",id:node.id,u:{af:{id:uid(),name:`Frame ${i+1}`,type:"image/png",url:sf.data}}});sSbPick(false);}}
                          style={{padding:0,border:BDR(c),borderRadius:6,overflow:"hidden",cursor:"pointer",background:"#fff",aspectRatio:"16/9"}}>
                          <img src={sf.data} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={e=>{e.stopPropagation();sSbPick(false);}}
                    style={{marginTop:6,width:"100%",padding:"4px",background:"none",border:BDR(c),borderRadius:6,fontSize:9,fontWeight:600,color:c.txt3,cursor:"pointer",fontFamily:QF}}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {node.type==="evt" && (
        <div style={{padding:"0 14px 6px",fontSize:10,color:c.txt3,position:"relative",zIndex:65}}>Double-click to expand</div>
      )}
    </div>
  );
});

function CtxMenu({x,y,c,items,onClose}) {
  /* Context menu with ARIA */
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000}} onClick={onClose}>
      <div onClick={stop} style={{
        position:"absolute",left:Math.min(x,window.innerWidth-200),top:Math.min(y,window.innerHeight-200),
        background:c.ctx,border:BDR(c),borderRadius:12,padding:"4px 0",
        boxShadow:`0 6px 24px ${c.shd}`,minWidth:170,fontFamily:QF,zIndex:1001}}>
        {items.map((it,i) => it.colors ? (
          <div key={i} style={{padding:"6px 14px"}}>
            <div style={{fontSize:10,fontWeight:600,color:c.txt3,marginBottom:4}}>{it.label}</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {it.colors.map(clr=>(
                <div key={clr} onClick={()=>{it.onColor(clr);onClose();}}
                  style={{width:18,height:18,borderRadius:4,background:clr,cursor:"pointer",
                    border:clr===it.activeColor?`2px solid ${c.txt}`:`2px solid transparent`,
                    transition:"border-color 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.transform="scale(1.15)"}
                  onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/>
              ))}
            </div>
          </div>
        ) : (
          <button key={i} onClick={()=>{it.action();onClose();}}
            style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"7px 14px",
              border:"none",background:"transparent",cursor:"pointer",fontSize:12,
              fontFamily:QF,color:c.txt,fontWeight:500,textAlign:"left"}}
            onMouseEnter={e=>e.currentTarget.style.background=c.surfH}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{fontSize:14,width:20,textAlign:"center"}}>{it.icon}</span>
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Modal({node,c,onClose,onUpdate}) {
  /* Modal dialog with ARIA */
  const [tab,sTab] = useState("notes");
  const [notes,sNotes] = useState(node.notes||"");
  const [media,sMedia] = useState(node.media||[]);
  const [subs,sSubs] = useState(node.subEvents||[]);
  const [ns,sNs] = useState("");
  const fr = useRef(null);

  const save = () => { onUpdate(node.id,{notes,media,subEvents:subs}); onClose(); };
  const addM = e => Array.from(e.target.files).forEach(f => {
    const err=validateFile(f);if(err){alert(err);return;}
    const r=new FileReader();
    r.onload=ev=>sMedia(p=>[...p,{id:uid(),name:f.name,type:f.type,url:ev.target.result}]);
    r.readAsDataURL(f);
  });

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:c.ov,zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",fontFamily:QF}}>
      <div onClick={stop} style={{background:c.ctx,borderRadius:24,width:"90%",maxWidth:620,
        maxHeight:"80vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:`0 16px 64px ${c.shd}`}}>
        <div style={{padding:"20px 24px 14px",borderBottom:BDR(c),display:"flex",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:1.2,color:c.txt3,marginBottom:3}}>{NTL[node.type]}</div>
            <div style={{fontSize:18,fontWeight:700,color:c.txt}}>{node.label}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,color:c.txt3,cursor:"pointer",fontWeight:700}}>×</button>
        </div>
        <div style={{display:"flex",borderBottom:BDR(c),padding:"0 24px"}}>
          {["notes","media","sub"].map(tt => (
            <button key={tt} onClick={()=>sTab(tt)}
              style={{background:"none",border:"none",borderBottom:tab===tt?`2px solid ${c.acc}`:"2px solid transparent",
                color:tab===tt?c.txt:c.txt3,fontSize:12,fontWeight:600,fontFamily:QF,padding:"10px 14px",cursor:"pointer"}}>
              {tt==="sub"?"Sub-Timeline":tt.charAt(0).toUpperCase()+tt.slice(1)}
            </button>
          ))}
        </div>
        <div style={{flex:1,overflow:"auto",padding:"16px 24px"}}>
          {tab==="notes" && (
            <textarea value={notes} onChange={e=>sNotes(e.target.value)} placeholder="Notes..."
              style={{width:"100%",height:180,background:c.surf,border:BDR(c),borderRadius:12,
                padding:14,fontFamily:QF,fontSize:13,color:c.txt,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
          )}
          {tab==="media" && (
            <div>
              <input ref={fr} type="file" multiple accept="image/*,video/*" style={{display:"none"}} onChange={addM}/>
              <button onClick={()=>fr.current?.click()}
                style={{background:c.surf,border:`2px dashed ${c.bdr}`,borderRadius:12,padding:16,
                  width:"100%",color:c.txt2,fontSize:12,fontWeight:600,fontFamily:QF,cursor:"pointer",marginBottom:14}}>
                + Upload
              </button>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8}}>
                {media.map(m => (
                  <div key={m.id} style={{borderRadius:8,overflow:"hidden",border:BDR(c),position:"relative"}}>
                    {m.type?.startsWith("video")
                      ? <video src={m.url} style={{width:"100%",height:70,objectFit:"cover"}}/>
                      : <img src={m.url} alt="" style={{width:"100%",height:70,objectFit:"cover"}}/>}
                    <button onClick={()=>sMedia(p=>p.filter(x=>x.id!==m.id))}
                      style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,0.5)",color:"#fff",
                        border:"none",borderRadius:5,width:16,height:16,fontSize:10,cursor:"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab==="sub" && (
            <div>
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <input value={ns} onChange={e=>sNs(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&ns.trim()&&(sSubs(p=>[...p,{id:uid(),label:ns.trim()}]),sNs(""))}
                  placeholder="New sub-event..."
                  style={{flex:1,background:c.surf,border:BDR(c),borderRadius:10,
                    padding:"8px 12px",fontFamily:QF,fontSize:12,color:c.txt,outline:"none"}}/>
                <button onClick={()=>{if(ns.trim()){sSubs(p=>[...p,{id:uid(),label:ns.trim()}]);sNs("");}}}
                  style={{background:c.acc,color:c.bg,border:"none",borderRadius:10,padding:"8px 16px",
                    fontFamily:QF,fontWeight:600,fontSize:12,cursor:"pointer"}}>Add</button>
              </div>
              {subs.map((se,i) => (
                <div key={se.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                  background:c.surf,borderRadius:10,border:BDR(c),marginBottom:5}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:c.acc,color:c.bg,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>{i+1}</div>
                  <div style={{flex:1,fontSize:12,fontWeight:600,color:c.txt}}>{se.label}</div>
                  <button onClick={()=>sSubs(p=>p.filter(x=>x.id!==se.id))}
                    style={{background:"none",border:"none",color:c.txt3,cursor:"pointer",fontSize:15,fontWeight:700}}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{padding:"14px 24px",borderTop:BDR(c),display:"flex",justifyContent:"flex-end",gap:8}}>
          <button onClick={onClose} style={{background:"none",border:BDR(c),borderRadius:10,
            padding:"8px 18px",fontFamily:QF,fontWeight:600,fontSize:12,color:c.txt2,cursor:"pointer"}}>Cancel</button>
          <button onClick={save} style={{background:c.acc,color:c.bg,border:"none",borderRadius:10,
            padding:"8px 18px",fontFamily:QF,fontWeight:600,fontSize:12,cursor:"pointer"}}>Save</button>
        </div>
      </div>

    </div>
  );
}

/* ══════ WEBNODES ══════ */
function WebNodesTab({c,dark,projects,setProjects,aPid,setAPid,sbP,mob}) {
  const ncMap = dark?NCD:NCL;
  const sbFrames = useMemo(()=>{
    if(!sbP) return [];
    const frames=[];
    sbP.forEach(p=>(p.boards||[]).forEach(b=>(b.frames||[]).forEach(f=>{if(f.data)frames.push(f);})));
    return frames;
  },[sbP]);
  const [sbO,sSb] = useState(!mob);
  const [ctx,sCtx] = useState(null);
  const [mod,sMod] = useState(null);
  const [astP,sAstP] = useState(null);
  const [off,sOff] = useState({x:0,y:0});
  const [zm,sZm] = useState(1);
  const [pan,sPan] = useState(false);
  const [panS,sPanS] = useState({x:0,y:0});
  const [dN,sDN] = useState(null);
  const [marquee,sMarquee] = useState(null);
  const [selSet,sSelSet] = useState(()=>new Set());
  const [groups,sGroups] = useState([]);
  const [editGroupId,sEditGroupId] = useState(null);
  const [dO,sDO] = useState({x:0,y:0});
  const [dC,sDC] = useState(null);
  const [dCP,sDCP] = useState(null);
  const [mC,sMC] = useState({x:0,y:0});
  const [res,sRes] = useState(null);
  const [crn,sCRN] = useState(null);
  const [tls,sTLS] = useState(null);
  const [psl,sPSL] = useState(null);
  const [ppd,sPPD] = useState(null);
  const [snapLines,sSnapLines] = useState([]); /* plot point drag: {nid,pi} */
  const [spH,sSPH] = useState(false);
  const [selN,sSelN] = useState(null); /* selected node id */
  const [showHelp,sShowHelp] = useState(false);
  const helpTabRef = useRef("Shortcuts");
  const [confirmDel,sConfirmDel] = useState(null); /* {id,label} */
  const [search,sSearch] = useState("");
  const [searchOpen,sSearchOpen] = useState(false);
  const [searchResults,sSearchResults] = useState([]);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const cvR = useRef(null);

  const proj = projects.find(p=>p.id===aPid);
  const nodes = proj?.nodes||[];
  const conns = proj?.conns||[];

  const sN = useCallback(fn=>setProjects(p=>p.map(pr=>pr.id===aPid?{...pr,nodes:typeof fn==="function"?fn(pr.nodes):fn}:pr)),[aPid,setProjects]);
  const sCC = useCallback(fn=>setProjects(p=>p.map(pr=>pr.id===aPid?{...pr,conns:typeof fn==="function"?fn(pr.conns):fn}:pr)),[aPid,setProjects]);
  const uP = useCallback(u=>setProjects(p=>p.map(pr=>pr.id===aPid?{...pr,...u}:pr)),[aPid,setProjects]);
  const s2c = useCallback((sx,sy)=>{const r=cvR.current?.getBoundingClientRect();if(!r)return{x:0,y:0};return{x:(sx-r.left-off.x)/zm,y:(sy-r.top-off.y)/zm};},[off,zm]);

  /* Undo/redo helpers */
  const pushUndo = useCallback(()=>{
    const snap=JSON.stringify({nodes,conns});
    undoStack.current.push(snap);
    if(undoStack.current.length>40) undoStack.current.shift();
    redoStack.current=[];
  },[nodes,conns]);

  const doUndo = useCallback(()=>{
    if(!undoStack.current.length) return;
    const curSnap=JSON.stringify({nodes,conns});
    redoStack.current.push(curSnap);
    const prev=JSON.parse(undoStack.current.pop());
    sN(()=>prev.nodes); sCC(()=>prev.conns);
  },[nodes,conns,sN,sCC]);

  const doRedo = useCallback(()=>{
    if(!redoStack.current.length) return;
    const curSnap=JSON.stringify({nodes,conns});
    undoStack.current.push(curSnap);
    const next=JSON.parse(redoStack.current.pop());
    sN(()=>next.nodes); sCC(()=>next.conns);
  },[nodes,conns,sN,sCC]);

  /* Search handler */
  const runSearch = useCallback(q=>{
    if(!q.trim()){sSearchResults([]);return;}
    const lq=q.toLowerCase(), res=[];
    nodes.forEach(n=>{
      if((n.label||"").toLowerCase().includes(lq)) res.push({type:"node",id:n.id,text:n.label,x:n.x,y:n.y});
      if((n.notes||"").toLowerCase().includes(lq)) res.push({type:"note",id:n.id,text:n.label+" (notes)",x:n.x,y:n.y});
    });
    sSearchResults(res.slice(0,20));
  },[nodes]);

  /* Jump to node */
  const jumpTo = useCallback((x,y,nid)=>{
    const r=cvR.current?.getBoundingClientRect();
    if(!r) return;
    sOff({x:-x*zm+r.width/2, y:-y*zm+r.height/2});
    sSelN(nid);
  },[zm]);

  /* Export canvas to PNG */
  const exportPNG = useCallback(()=>{
    if(!nodes.length) return;
    const pad=60;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    nodes.forEach(n=>{
      minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);
      maxX=Math.max(maxX,n.x+(n.w||200));maxY=Math.max(maxY,n.y+(n.h||100));
    });
    const w=maxX-minX+pad*2, h=maxY-minY+pad*2;
    const cv=document.createElement("canvas");cv.width=w*2;cv.height=h*2;
    const x=cv.getContext("2d");x.scale(2,2);
    x.fillStyle=dark?"#1a1a1a":"#fff";x.fillRect(0,0,w,h);
    /* Draw connections */
    conns.forEach(cn=>{
      const fn=nodes.find(n=>n.id===cn.fN),tn=nodes.find(n=>n.id===cn.tN);
      if(!fn||!tn)return;
      const fp=(fn.ports||[]).find(p=>p.id===cn.fP),tp=(tn.ports||[]).find(p=>p.id===cn.tP);
      if(!fp||!tp)return;
      const a=pPos(fn,fp),b=pPos(tn,tp);
      x.beginPath();x.strokeStyle=dark?"#f0f0f0":"#1a1a1a";x.lineWidth=2;
      x.moveTo(a.x-minX+pad,a.y-minY+pad);x.lineTo(b.x-minX+pad,b.y-minY+pad);x.stroke();
    });
    /* Draw nodes */
    nodes.forEach(n=>{
      const nc=(dark?NCD:NCL)[n.type]||{bg:"#fff",bd:"#000"};
      const bg=n.cc||nc.bg;
      const nw=n.w||200,nh=n.h||100,nx=n.x-minX+pad,ny=n.y-minY+pad;
      x.fillStyle=bg;x.strokeStyle=nc.bd;x.lineWidth=1.5;
      x.beginPath();x.roundRect(nx,ny,nw,nh,12);x.fill();x.stroke();
      x.fillStyle=dark?"#f0f0f0":"#1a1a1a";x.font="bold 12px Quicksand,sans-serif";
      x.textAlign="center";x.fillText(n.label||"",nx+nw/2,ny+20);
    });
    cv.toBlob(blob=>{
      const u=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=u;a.download=`fathom-export-${Date.now()}.png`;a.click();
      URL.revokeObjectURL(u);
    });
  },[nodes,conns,dark]);

  const fitZoom = useCallback(()=>{
    if(!nodes.length||!cvR.current) return;
    const r=cvR.current.getBoundingClientRect();
    const pad=60;
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
    nodes.forEach(n=>{mnX=Math.min(mnX,n.x);mnY=Math.min(mnY,n.y);mxX=Math.max(mxX,n.x+(n.w||200));mxY=Math.max(mxY,n.y+(n.h||100));});
    const cw=mxX-mnX+pad*2, ch=mxY-mnY+pad*2;
    const nz=Math.min(r.width/cw, r.height/ch, 2);
    sZm(nz);
    sOff({x:-mnX*nz+pad*nz+(r.width-cw*nz)/2, y:-mnY*nz+pad*nz+(r.height-ch*nz)/2});
  },[nodes]);

  useEffect(()=>{
    const isInput=e=>e.target.closest("[contenteditable]")||e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA";
    const kd=e=>{
      if(e.code==="Space"&&!isInput(e)){e.preventDefault();sSPH(true);return;}
      if(isInput(e)) return;
      /* Undo/Redo */
      if((e.ctrlKey||e.metaKey)&&e.key==="z"&&!e.shiftKey){e.preventDefault();doUndo();return;}
      if((e.ctrlKey||e.metaKey)&&(e.key==="y"||(e.key==="z"&&e.shiftKey))){e.preventDefault();doRedo();return;}
      /* Search */
      if((e.ctrlKey||e.metaKey)&&e.key==="f"){e.preventDefault();sSearchOpen(o=>!o);return;}
      /* Group selected nodes (Ctrl+G) */
      if((e.ctrlKey||e.metaKey)&&e.key==="g"&&!e.shiftKey&&selSet.size>1){
        e.preventDefault();
        const ids=[...selSet];
        sGroups(prev=>{
          const filtered=prev.filter(g=>!g.nodeIds.some(id=>ids.includes(id)));
          return [...filtered,{id:uid(),nodeIds:ids,label:"Group",cc:null}];
        });
        return;
      }
      if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==="G"||e.key==="g")){
        e.preventDefault();
        sGroups(prev=>prev.filter(g=>!g.nodeIds.some(id=>selSet.has(id))));
        return;
      }
      /* Help overlay */
      if(e.key==="?"||e.key==="/"){sShowHelp(h=>!h);return;}
      /* Escape closes overlays */
      if(e.key==="Escape"){sShowHelp(false);sSearchOpen(false);sCtx(null);sConfirmDel(null);sSelN(null);return;}
      /* Selected node operations */
      if(selN){
        const sn=nodes.find(n=>n.id===selN);
        if(!sn) return;
        if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();sConfirmDel({id:sn.id,label:sn.label});return;}
        if(e.key==="ArrowUp"){e.preventDefault();pushUndo();sN(p=>p.map(n=>n.id===selN?{...n,y:n.y-10}:n));return;}
        if(e.key==="ArrowDown"){e.preventDefault();pushUndo();sN(p=>p.map(n=>n.id===selN?{...n,y:n.y+10}:n));return;}
        if(e.key==="ArrowLeft"){e.preventDefault();pushUndo();sN(p=>p.map(n=>n.id===selN?{...n,x:n.x-10}:n));return;}
        if(e.key==="ArrowRight"){e.preventDefault();pushUndo();sN(p=>p.map(n=>n.id===selN?{...n,x:n.x+10}:n));return;}
        /* Duplicate */
        if((e.ctrlKey||e.metaKey)&&e.key==="d"){e.preventDefault();pushUndo();
          const cl={...sn,id:uid(),x:sn.x+30,y:sn.y+30,ports:[],label:(sn.label||"")+" copy"};
          sN(p=>[...p,cl]);sSelN(cl.id);return;}
      }
    };
    const ku=e=>{if(e.code==="Space")sSPH(false);};
    window.addEventListener("keydown",kd);window.addEventListener("keyup",ku);
    return()=>{window.removeEventListener("keydown",kd);window.removeEventListener("keyup",ku);};
  },[selN,nodes,doUndo,doRedo,pushUndo,sN]);

  const addNode=(type,cx,cy)=>{
    pushUndo();
    const w=type==="note"?180:isTL(type)?380:type==="person"||type==="place"||type==="object"?220:200, hh=isTL(type)?150:type==="person"?260:type==="place"?240:type==="object"?200:100;
    sN(p=>[...p,{id:uid(),type,label:NTL[type],x:cx-w/2,y:cy-hh/2,w,h:hh,notes:"",media:[],subEvents:[],nt:"",info:{},af:null,ports:[],tld:[],cc:null}]);
  };

  const rmPort = useCallback((nid,pid)=>{
    /* Remove port and all its connections, plus orphan ports on the other end */
    sCC(prev=>{
      const hits=prev.filter(cn=>(cn.fN===nid&&cn.fP===pid)||(cn.tN===nid&&cn.tP===pid));
      const remaining=prev.filter(cn=>!hits.some(h=>h.id===cn.id));
      /* Clean up remote orphan ports */
      hits.forEach(cn=>{
        const oN=cn.fN===nid?cn.tN:cn.fN, oP=cn.fN===nid?cn.tP:cn.fP;
        const stillUsed=remaining.some(cc=>(cc.fN===oN&&cc.fP===oP)||(cc.tN===oN&&cc.tP===oP));
        if(!stillUsed) sN(ns=>ns.map(n=>n.id===oN?{...n,ports:(n.ports||[]).filter(p=>p.id!==oP)}:n));
      });
      return remaining;
    });
    sN(prev=>prev.map(n=>n.id===nid?{...n,ports:(n.ports||[]).filter(p=>p.id!==pid)}:n));
  },[sCC,sN]);

  const rmConn = useCallback(cid=>{
    pushUndo();
    /* Remove one connection and clean up both ports if orphaned */
    sCC(prev=>{
      const cn=prev.find(cc=>cc.id===cid);
      if(!cn) return prev.filter(cc=>cc.id!==cid);
      const remaining=prev.filter(cc=>cc.id!==cid);
      /* Check from-port */
      const fStill=remaining.some(cc=>(cc.fN===cn.fN&&cc.fP===cn.fP)||(cc.tN===cn.fN&&cc.tP===cn.fP));
      if(!fStill) sN(ns=>ns.map(n=>n.id===cn.fN?{...n,ports:(n.ports||[]).filter(p=>p.id!==cn.fP)}:n));
      /* Check to-port */
      const tStill=remaining.some(cc=>(cc.fN===cn.tN&&cc.fP===cn.tP)||(cc.tN===cn.tN&&cc.tP===cn.tP));
      if(!tStill) sN(ns=>ns.map(n=>n.id===cn.tN?{...n,ports:(n.ports||[]).filter(p=>p.id!==cn.tP)}:n));
      return remaining;
    });
  },[sCC,sN]);

  const dispatch = useCallback(action=>{
    switch(action.t){
      case"U":sN(p=>p.map(n=>n.id===action.id?{...n,...action.u}:n));break;
      case"CDEL":sConfirmDel({id:action.id,label:action.label});break;
      case"DEL":{
        pushUndo();
        const nd=nodes.find(n=>n.id===action.id);
        if(nd)(nd.ports||[]).forEach(port=>{
          conns.filter(cn=>(cn.fN===action.id&&cn.fP===port.id)||(cn.tN===action.id&&cn.tP===port.id))
            .forEach(cn=>{
              const oN=cn.fN===action.id?cn.tN:cn.fN, oP=cn.fN===action.id?cn.tP:cn.fP;
              sN(ns=>ns.map(n=>n.id===oN?{...n,ports:(n.ports||[]).filter(p=>p.id!==oP)}:n));
            });
        });
        sN(p=>p.filter(n=>n.id!==action.id));
        sCC(p=>p.filter(cn=>cn.fN!==action.id&&cn.tN!==action.id));
      }break;
      case"MOD":sMod(action.node);break;
      case"AP":sAstP(action.asset);break;
      case"ND":{pushUndo();action.e.stopPropagation();const pos=s2c(action.e.clientX,action.e.clientY);sDN(action.node);sDO({x:pos.x-action.node.x,y:pos.y-action.node.y});sSelN(action.node.id);}break;
      case"EDG":{
        const cp=s2c(action.e.clientX,action.e.clientY);
        const ep=nearE(action.node,cp.x,cp.y);
        const np={id:uid(),s:ep.s,p:ep.p,c:false};
        sN(prev=>prev.map(n=>n.id===action.node.id?{...n,ports:[...(n.ports||[]),np]}:n));
        sDC({nid:action.node.id,pid:np.id});
        sDCP(pPos({...action.node,ports:[...(action.node.ports||[]),np]},np));
      }break;
      case"PG":sDC({nid:action.node.id,pid:action.port.id});sDCP(pPos(action.node,action.port));break;
      case"PD":break;
      case"CP":{
        if(!dC||(dC.nid===action.toN.id&&dC.pid===action.toP.id))break;
        sCC(prev=>[...prev,{id:uid(),fN:dC.nid,fP:dC.pid,tN:action.toN.id,tP:action.toP.id}]);
        sN(prev=>prev.map(n=>({...n,ports:(n.ports||[]).map(p=>(p.id===dC.pid||p.id===action.toP.id)?{...p,c:true}:p)})));
        sDC(null);sDCP(null);
      }break;
      case"TLR":sRes({nid:action.nid,side:action.side,sx:action.sx,sw:action.sw,snx:action.snx});break;
      case"CRN":sCRN(action);break;
      case"TLS":sTLS({nid:action.nid,di:action.di});break;
      case"NCTX":{
        const ctxItems=[];
        const palette=dark?PA_D:PA_L;
        if(isTL(action.node.type)) ctxItems.push({icon:"📅",label:"Add Date Point",action:()=>{
          const nd=[...(action.node.tld||[])];
          nd.push({id:uid(),d:"",l:"Event",pos:0.5,tb:"top"});
          sN(p=>p.map(n=>n.id===action.node.id?{...n,tld:nd}:n));
        }});
        ctxItems.push({icon:"●",label:"Background Color",
          colors:palette.filter(p=>p.v).map(p=>p.v),
          activeColor:action.node.cc||"",
          onColor:(clr)=>sN(p=>p.map(n=>n.id===action.node.id?{...n,cc:clr}:n))
        });
        ctxItems.push({icon:"⬆",label:"Bring to Front",action:()=>{
          sN(p=>{const n=p.find(x=>x.id===action.node.id);if(!n)return p;return[...p.filter(x=>x.id!==action.node.id),n];});
        }});
        ctxItems.push({icon:"⬇",label:"Send to Back",action:()=>{
          sN(p=>{const n=p.find(x=>x.id===action.node.id);if(!n)return p;return[n,...p.filter(x=>x.id!==action.node.id)];});
        }});
        ctxItems.push({icon:"✕",label:"Delete Node",action:()=>sConfirmDel({id:action.node.id,label:action.node.label})});
        sCtx({x:action.e.clientX,y:action.e.clientY,items:ctxItems});
      }break;
      case"TLC":{
        sCtx({x:action.e.clientX,y:action.e.clientY,items:[
          {icon:"📅",label:"Add Date Point",action:()=>{
            const nd=[...(action.node.tld||[])];
            nd.push({id:uid(),d:"",l:"Event",pos:0.5,tb:"top"});
            sN(p=>p.map(n=>n.id===action.node.id?{...n,tld:nd}:n));
          }},
        ]});
      }break;
      case"PSLIDE":sPSL({nid:action.nid,pid:action.pid,side:action.side});break;
      case"PPD":sPPD({nid:action.nid,pi:action.pi});break;
      case"EDGF":{
        const n=action.node,cp=s2c(action.e.clientX,action.e.clientY),side=action.edge;
        const ww=n.w||200,hh=n.h||100,cl=v=>Math.max(0.05,Math.min(0.95,v));
        let p;
        if(side==="top"||side==="bottom") p=cl((cp.x-n.x)/ww);
        else p=cl((cp.y-n.y)/hh);
        const np={id:uid(),s:side,p,c:false};
        sN(prev=>prev.map(nd=>nd.id===n.id?{...nd,ports:[...(nd.ports||[]),np]}:nd));
        sDC({nid:n.id,pid:np.id});
        sDCP(pPos({...n,ports:[...(n.ports||[]),np]},np));
      }break;
    }
  },[dC,s2c,nodes,conns,rmPort,sN,sCC,pushUndo]);

  const CONN_COLORS=["#1a1a1a","#4a6fa5","#8b5e3c","#4a8b4a","#c4b84d","#e53935","#8e24aa","#e67e22"];
  const onCCtx=(cn,e)=>{sCtx({x:e.clientX,y:e.clientY,items:[
    {icon:"✕",label:"Remove Connection",action:()=>rmConn(cn.id)},
    {icon:cn.str?"〰":"─",label:cn.str?"Make Curved":"Make Straight",action:()=>sCC(p=>p.map(cc=>cc.id===cn.id?{...cc,str:!cc.str}:cc))},
    {icon:"✎",label:"Add/Edit Label",action:()=>{
      const txt=prompt("Connection label:",cn.label||"");
      if(txt!==null)sCC(p=>p.map(cc=>cc.id===cn.id?{...cc,label:txt}:cc));
    }},
    {icon:"\u25CF",label:"Color",colors:CONN_COLORS,activeColor:cn.color||"#1a1a1a",
      onColor:(clr)=>sCC(p=>p.map(cc=>cc.id===cn.id?{...cc,color:clr}:cc))},
  ]});};

  const onMD = e => {
    if(e.button===0){
      if(spH){e.preventDefault();e.stopPropagation();sPan(true);sPanS({x:e.clientX-off.x,y:e.clientY-off.y});return;}
      if(e.target===cvR.current){
        if(e.shiftKey){
          const pos=s2c(e.clientX,e.clientY);
          sMarquee({x1:pos.x,y1:pos.y,x2:pos.x,y2:pos.y});
        } else {
          sSelSet(new Set());
          sPan(true);sPanS({x:e.clientX-off.x,y:e.clientY-off.y});
        }
      }
    }
  };

  const onMM = e => {
    const pos=s2c(e.clientX,e.clientY); sMC(pos);
    if(pan) sOff({x:e.clientX-panS.x,y:e.clientY-panS.y});
    if(marquee){sMarquee(m=>({...m,x2:pos.x,y2:pos.y}));}
    if(dN){
      let nx=pos.x-dO.x, ny=pos.y-dO.y;
      const dw=dN.w||200, dh=dN.h||100, snap=8, guides=[];
      const moving=new Set();
      if(selSet.has(dN.id)&&selSet.size>1){selSet.forEach(id=>moving.add(id));}
      const dGrp=groups.find(g=>g.nodeIds?.includes(dN.id));
      if(dGrp){dGrp.nodeIds.forEach(id=>moving.add(id));}
      moving.add(dN.id);
      if(moving.size===1){
        nodes.forEach(n=>{
          if(n.id===dN.id)return;
          const nw=n.w||200,nh=n.h||100,ncx=n.x+nw/2,ncy=n.y+nh/2;
          if(Math.abs(ny-n.y)<snap){ny=n.y;guides.push({x1:Math.min(nx,n.x)-20,y1:ny,x2:Math.max(nx+dw,n.x+nw)+20,y2:ny});}
          if(Math.abs(ny+dh-n.y-nh)<snap){ny=n.y+nh-dh;guides.push({x1:Math.min(nx,n.x)-20,y1:ny+dh,x2:Math.max(nx+dw,n.x+nw)+20,y2:ny+dh});}
          if(Math.abs(ny+dh/2-ncy)<snap){ny=ncy-dh/2;guides.push({x1:Math.min(nx,n.x)-20,y1:ncy,x2:Math.max(nx+dw,n.x+nw)+20,y2:ncy});}
          if(Math.abs(nx-n.x)<snap){nx=n.x;guides.push({x1:nx,y1:Math.min(ny,n.y)-20,x2:nx,y2:Math.max(ny+dh,n.y+nh)+20});}
          if(Math.abs(nx+dw-n.x-nw)<snap){nx=n.x+nw-dw;guides.push({x1:nx+dw,y1:Math.min(ny,n.y)-20,x2:nx+dw,y2:Math.max(ny+dh,n.y+nh)+20});}
          if(Math.abs(nx+dw/2-ncx)<snap){nx=ncx-dw/2;guides.push({x1:ncx,y1:Math.min(ny,n.y)-20,x2:ncx,y2:Math.max(ny+dh,n.y+nh)+20});}
        });
        sSnapLines(guides.slice(0,4));
        sN(prev=>prev.map(n=>n.id===dN.id?{...n,x:nx,y:ny}:n));
      } else {
        const fdx=nx-dN.x, fdy=ny-dN.y;
        sN(prev=>prev.map(n=>moving.has(n.id)?{...n,x:n.x+fdx,y:n.y+fdy}:n));
      }
    }
    if(dC){const sn=nodes.find(n=>n.id===dC.nid);const sp=sn?.ports?.find(p=>p.id===dC.pid);if(sn&&sp)sDCP(pPos(sn,sp));}
    if(res){const dx=(e.clientX-res.sx)/zm;if(res.side==="right")sN(p=>p.map(n=>n.id===res.nid?{...n,w:Math.max(200,res.sw+dx)}:n));else{const nw=Math.max(200,res.sw-dx);sN(p=>p.map(n=>n.id===res.nid?{...n,w:nw,x:res.snx+(res.sw-nw)}:n));}}
    if(crn){const dx=(e.clientX-crn.sx)/zm,dy=(e.clientY-crn.sy)/zm;let nw,nh,nx=crn.snx,ny=crn.sny;if(crn.isR)nw=Math.max(120,crn.sw+dx);else{nw=Math.max(120,crn.sw-dx);nx=crn.snx+(crn.sw-nw);}if(crn.isB)nh=Math.max(60,crn.sh+dy);else{nh=Math.max(60,crn.sh-dy);ny=crn.sny+(crn.sh-nh);}sN(p=>p.map(n=>n.id===crn.nid?{...n,w:nw,h:nh,x:nx,y:ny}:n));}
    if(tls){sN(prev=>prev.map(n=>{if(n.id!==tls.nid)return n;const ww=n.w||380;const relX=pos.x-n.x-20;const lW=ww-40;const np=Math.max(0.02,Math.min(0.98,relX/lW));const nd=[...(n.tld||[])];nd[tls.di]={...nd[tls.di],pos:np};return{...n,tld:nd};}));}
    if(ppd){sN(prev=>prev.map(n=>{if(n.id!==ppd.nid)return n;const ww=n.w||380,plotH=120;const padL=19,padR=19;const relX=(pos.x-n.x-padL)/(ww-padL-padR);const relY=(pos.y-n.y-96)/plotH;const pts=[...(n.plotPts||[])];if(pts[ppd.pi]){const sorted4=[...pts].sort((a3,b3)=>a3.x-b3.x);const isFirst4=sorted4[0]?.id===pts[ppd.pi].id;const isLast4=sorted4[sorted4.length-1]?.id===pts[ppd.pi].id;pts[ppd.pi]={...pts[ppd.pi],x:isFirst4?0:isLast4?1:Math.max(0.02,Math.min(0.98,relX)),y:Math.max(0.05,Math.min(0.95,relY))};}return{...n,plotPts:pts};}));}
    if(psl){sN(prev=>prev.map(n=>{if(n.id!==psl.nid)return n;const ww=n.w||200,hh=n.h||100;return{...n,ports:(n.ports||[]).map(p=>{if(p.id!==psl.pid)return p;const isTB=psl.side==="top"||psl.side==="bottom";if(isTB){const rel=(pos.x-n.x)/ww;return{...p,p:Math.max(0.05,Math.min(0.95,rel))};}else{const rel=(pos.y-n.y)/hh;return{...p,p:Math.max(0.05,Math.min(0.95,rel))};}})};}))}
  };

  const onMU = e => {
    if(dC){
      const pos=s2c(e.clientX,e.clientY); let landed=false;
      const snapDist=45/zm;
      for(const node of nodes){
        if(node.id===dC.nid)continue;
        for(const port of(node.ports||[]).filter(p=>p.c)){
          if(d2(pos,pPos(node,port))<snapDist){
            sCC(prev=>[...prev,{id:uid(),fN:dC.nid,fP:dC.pid,tN:node.id,tP:port.id}]);
            sN(prev=>prev.map(n=>({...n,ports:(n.ports||[]).map(p=>p.id===dC.pid?{...p,c:true}:p)})));
            landed=true;break;
          }
        }
        if(landed)break;
      }
      if(!landed){
        for(const node of nodes){
          if(node.id===dC.nid)continue;
          const ww=node.w||200,hh=node.h||100;
          if(pos.x>=node.x-30&&pos.x<=node.x+ww+30&&pos.y>=node.y-30&&pos.y<=node.y+hh+30){
            const ep=nearE(node,pos.x,pos.y);
            const np={id:uid(),s:ep.s,p:ep.p,c:true};
            const isTLPort=(ep.s==="top"||ep.s==="bottom");
            const needsMarker=node.type==="stl"&&node.plotArc&&isTLPort;
            const srcNode=nodes.find(n2=>n2.id===dC.nid);
            sN(prev=>prev.map(n=>{
              if(n.id===node.id){
                let upd={...n,ports:[...(n.ports||[]),np]};
                if(needsMarker){
                  const sortedPts=[...(n.plotPts||[])].sort((a,b)=>a.x-b.x);
                  const threshold=10/(ww-38);
                  const exists=sortedPts.some(pt=>{
                    const isF=sortedPts[0]?.id===pt.id, isL=sortedPts[sortedPts.length-1]?.id===pt.id;
                    return Math.abs((isF?0:isL?1:pt.x)-ep.p)<threshold;
                  });
                  if(!exists) upd.plotPts=[...(n.plotPts||[]),{id:uid(),x:Math.max(0.05,Math.min(0.95,ep.p)),y:0.5,label:srcNode?.label||""}];
                }
                return upd;
              }
              if(n.id===dC.nid)return{...n,ports:(n.ports||[]).map(p=>p.id===dC.pid?{...p,c:true}:p)};
              return n;
            }));
            sCC(prev=>[...prev,{id:uid(),fN:dC.nid,fP:dC.pid,tN:node.id,tP:np.id}]);
            landed=true;break;
          }
        }
      }
      if(!landed) sN(prev=>prev.map(n=>({...n,ports:(n.ports||[]).filter(p=>p.c)})));
    }
    /* Always clean orphan ports on any mouse up */
    if(!dC) sN(prev=>prev.map(n=>({...n,ports:(n.ports||[]).filter(p=>p.c)})));
    sSnapLines([]);
    sPan(false);sDN(null);sDC(null);sDCP(null);sRes(null);sCRN(null);sTLS(null);sPSL(null);sPPD(null);

  };

  const onCtx = e => {
    e.preventDefault();
    if(mob) return;
    const pos=s2c(e.clientX,e.clientY);
    sCtx({x:e.clientX,y:e.clientY,items:[
      {icon:"◆",label:"Story Timeline",action:()=>addNode("stl",pos.x,pos.y)},
      {icon:"◇",label:"Event Timeline",action:()=>addNode("etl",pos.x,pos.y)},
      {div:true},
      {icon:"●",label:"Event",action:()=>addNode("evt",pos.x,pos.y)},
      {icon:"■",label:"Note",action:()=>addNode("note",pos.x,pos.y)},
      {icon:"▲",label:"Asset",action:()=>addNode("asset",pos.x,pos.y)},
      {div:true},
      {icon:String.fromCodePoint(0x1F464),label:"Person",action:()=>addNode("person",pos.x,pos.y)},
      {icon:String.fromCodePoint(0x1F3E0),label:"Place",action:()=>addNode("place",pos.x,pos.y)},
      {icon:String.fromCodePoint(0x1F9B4),label:"Object",action:()=>addNode("object",pos.x,pos.y)},
    ]});
  };

  const addPr=()=>{const p=mkP();setProjects(prev=>[...prev,p]);setAPid(p.id);sOff({x:0,y:0});sZm(1);};
  const delPr=pid=>{if(projects.length<=1)return;const rem=projects.filter(p=>p.id!==pid);setProjects(rem);if(aPid===pid)setAPid(rem[0].id);};

  useEffect(()=>{
    const el=cvR.current;if(!el)return;
    const h=e=>{e.preventDefault();const r=el.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;const d=e.deltaY>0?0.92:1.08;const nz=Math.min(3,Math.max(0.1,zm*d));sOff({x:mx-((mx-off.x)/zm)*nz,y:my-((my-off.y)/zm)*nz});sZm(nz);};
    el.addEventListener("wheel",h,{passive:false});return()=>el.removeEventListener("wheel",h);
  },[zm,off]);

  /* Touch event handlers for mobile */
  const pinchRef = useRef(null);
  const onTS = e => {
    if(e.touches.length===2){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      pinchRef.current={d,zm};return;
    }
    if(e.touches.length===1){
      const t=e.touches[0];
      if(e.target===cvR.current||e.target.closest("svg")){
        sPan(true);sPanS({x:t.clientX-off.x,y:t.clientY-off.y});
      }
    }
  };
  const onTM = e => {
    if(e.touches.length===2&&pinchRef.current){
      e.preventDefault();
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      const nz=Math.min(3,Math.max(0.1,pinchRef.current.zm*(d/pinchRef.current.d)));
      const mx=(e.touches[0].clientX+e.touches[1].clientX)/2;
      const my=(e.touches[0].clientY+e.touches[1].clientY)/2;
      const r=cvR.current?.getBoundingClientRect();
      if(r){const rx=mx-r.left,ry=my-r.top;sOff({x:rx-((rx-off.x)/zm)*nz,y:ry-((ry-off.y)/zm)*nz});}
      sZm(nz);return;
    }
    if(e.touches.length===1){
      const t=e.touches[0];
      const pos=s2c(t.clientX,t.clientY); sMC(pos);
      if(pan) sOff({x:t.clientX-panS.x,y:t.clientY-panS.y});
      if(marquee){sMarquee(m=>({...m,x2:pos.x,y2:pos.y}));}
    if(dN){
      let nx=pos.x-dO.x, ny=pos.y-dO.y;
      const dw=dN.w||200, dh=dN.h||100, snap=8, guides=[];
      const moving=new Set();
      if(selSet.has(dN.id)&&selSet.size>1){selSet.forEach(id=>moving.add(id));}
      const dGrp=groups.find(g=>g.nodeIds?.includes(dN.id));
      if(dGrp){dGrp.nodeIds.forEach(id=>moving.add(id));}
      moving.add(dN.id);
      if(moving.size===1){
        nodes.forEach(n=>{
          if(n.id===dN.id)return;
          const nw=n.w||200,nh=n.h||100,ncx=n.x+nw/2,ncy=n.y+nh/2;
          if(Math.abs(ny-n.y)<snap){ny=n.y;guides.push({x1:Math.min(nx,n.x)-20,y1:ny,x2:Math.max(nx+dw,n.x+nw)+20,y2:ny});}
          if(Math.abs(ny+dh-n.y-nh)<snap){ny=n.y+nh-dh;guides.push({x1:Math.min(nx,n.x)-20,y1:ny+dh,x2:Math.max(nx+dw,n.x+nw)+20,y2:ny+dh});}
          if(Math.abs(ny+dh/2-ncy)<snap){ny=ncy-dh/2;guides.push({x1:Math.min(nx,n.x)-20,y1:ncy,x2:Math.max(nx+dw,n.x+nw)+20,y2:ncy});}
          if(Math.abs(nx-n.x)<snap){nx=n.x;guides.push({x1:nx,y1:Math.min(ny,n.y)-20,x2:nx,y2:Math.max(ny+dh,n.y+nh)+20});}
          if(Math.abs(nx+dw-n.x-nw)<snap){nx=n.x+nw-dw;guides.push({x1:nx+dw,y1:Math.min(ny,n.y)-20,x2:nx+dw,y2:Math.max(ny+dh,n.y+nh)+20});}
          if(Math.abs(nx+dw/2-ncx)<snap){nx=ncx-dw/2;guides.push({x1:ncx,y1:Math.min(ny,n.y)-20,x2:ncx,y2:Math.max(ny+dh,n.y+nh)+20});}
        });
        sSnapLines(guides.slice(0,4));
        sN(prev=>prev.map(n=>n.id===dN.id?{...n,x:nx,y:ny}:n));
      } else {
        const fdx=nx-dN.x, fdy=ny-dN.y;
        sN(prev=>prev.map(n=>moving.has(n.id)?{...n,x:n.x+fdx,y:n.y+fdy}:n));
      }
    }
    }
  };
  const onTE = e => {
    pinchRef.current=null;
    sN(prev=>prev.map(n=>({...n,ports:(n.ports||[]).filter(p=>p.c)})));
    sSnapLines([]);
    sPan(false);sDN(null);sDC(null);sDCP(null);sRes(null);sCRN(null);sTLS(null);sPSL(null);sPPD(null);
  };

  const cur=spH?(pan?"grabbing":"grab"):pan?"grabbing":res?"ew-resize":crn?((crn.isR===crn.isB)?"nwse-resize":"nesw-resize"):psl?(psl.side==="top"||psl.side==="bottom"?"ew-resize":"ns-resize"):tls?"ew-resize":dC?"crosshair":"default";

  return (
    <div style={{flex:1,display:"flex",overflow:"hidden"}}>
      <div style={{width:sbO?(mob?160:200):0,background:c.sb,borderRight:sbO?BDR(c):"none",
        overflow:"hidden",transition:"width 0.25s",flexShrink:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"14px 14px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:c.txt3}}>Projects</div>
          <button onClick={addPr} style={{background:"none",border:BDR(c),borderRadius:8,
            width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",color:c.txt,fontSize:14,fontWeight:700,fontFamily:QF}}>+</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"0 8px 14px"}}>
          {projects.map(p => (
            <div key={p.id} onClick={()=>{setAPid(p.id);sOff({x:0,y:0});sZm(1);}}
              style={{display:"flex",alignItems:"center",gap:7,padding:"8px 10px",marginBottom:3,
                borderRadius:10,cursor:"pointer",background:p.id===aPid?c.surfH:"transparent"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:p.id===aPid?c.acc:c.txt3,flexShrink:0}}/>
              <div style={{flex:1,fontSize:12,fontWeight:p.id===aPid?700:500,color:c.txt,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
              {projects.length>1 && (
                <button onClick={e=>{e.stopPropagation();delPr(p.id);}}
                  style={{background:"none",border:"none",color:c.txt3,cursor:"pointer",fontSize:13,fontWeight:700,opacity:0.4}}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column"}}>
        <div style={{height:42,background:c.sb,borderBottom:BDR(c),display:"flex",alignItems:"center",
          padding:"0 12px",gap:8,flexShrink:0}}>
          <button onClick={()=>sSb(!sbO)} style={{background:"none",border:BDR(c),borderRadius:8,
            width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:10}}>
            {sbO?"◀":"▶"}
          </button>
          <input value={proj?.name||""} onChange={e=>uP({name:e.target.value})}
            style={{background:"transparent",border:"none",outline:"none",fontSize:15,fontWeight:700,
              fontFamily:QF,color:c.txt,flex:1,padding:"3px 6px",borderRadius:6}}
            onFocus={e=>e.currentTarget.style.background=c.surf}
            onBlur={e=>e.currentTarget.style.background="transparent"}/>
          <span style={{fontSize:10,color:c.txt3,fontWeight:500}}>{Math.round(zm*100)}%</span>
          <div style={{width:1,height:16,background:c.bdr,margin:"0 4px"}}/>
          <button onClick={doUndo} title="Undo (Ctrl+Z)" style={{background:"none",border:BDR(c),borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:12,fontFamily:QF}}>↩</button>
          <button onClick={doRedo} title="Redo (Ctrl+Y)" style={{background:"none",border:BDR(c),borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:12,fontFamily:QF}}>↪</button>
          <button onClick={()=>sSearchOpen(o=>!o)} title="Search (Ctrl+F)" style={{background:"none",border:BDR(c),borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:11}}>🔍</button>
          <button onClick={fitZoom} title="Fit all" style={{background:"none",border:BDR(c),borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:10}}>{"\u229E"}</button>
          <button onClick={exportPNG} title="Export PNG" style={{background:"none",border:BDR(c),borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:11}}>📷</button>
          <button onClick={()=>sShowHelp(true)} title="Shortcuts (?)" style={{background:"none",border:BDR(c),borderRadius:6,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:c.txt,fontSize:11}}>?</button>
        </div>
        <div ref={cvR} style={{flex:1,position:"relative",overflow:"hidden",cursor:cur,touchAction:"none"}}
          onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU} onContextMenu={onCtx}
          onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
          <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
            <defs>
              <pattern id="sg" width={20*zm} height={20*zm} patternUnits="userSpaceOnUse" x={off.x%(20*zm)} y={off.y%(20*zm)}>
                <path d={`M ${20*zm} 0 L 0 0 0 ${20*zm}`} fill="none" stroke={c.gr} strokeWidth={0.5}/>
              </pattern>
              <pattern id="bg" width={100*zm} height={100*zm} patternUnits="userSpaceOnUse" x={off.x%(100*zm)} y={off.y%(100*zm)}>
                <rect width={100*zm} height={100*zm} fill="url(#sg)"/>
                <path d={`M ${100*zm} 0 L 0 0 0 ${100*zm}`} fill="none" stroke={c.grM} strokeWidth={0.8}/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#bg)"/>
          </svg>
          {nodes.length===0 && (
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
              <div style={{fontSize:100,fontWeight:300,color:c.pl,animation:"pulse 2.5s ease-in-out infinite",lineHeight:1}}>+</div>
              <div style={{fontSize:13,fontWeight:500,color:c.txt3,marginTop:10,animation:"pulse 2.5s ease-in-out infinite"}}>{mob?"Tap + to add nodes":"Right-click to add"}</div>
            </div>
          )}
          <div style={{position:"absolute",left:0,top:0,transformOrigin:"0 0",transform:`translate(${off.x}px,${off.y}px) scale(${zm})`}}>
            {/* All connections BEHIND nodes */}
            <svg style={{position:"absolute",left:-10000,top:-10000,width:20000,height:20000,overflow:"visible"}}>
              <g transform="translate(10000,10000)">
                {conns.map(cn => <CLine key={cn.id} cn={cn} nodes={nodes} c={c}/>)}

                {dC&&dCP && <DLine from={dCP} to={mC} c={c}/>}
                {snapLines.map((sl,si)=><line key={si} x1={sl.x1} y1={sl.y1} x2={sl.x2} y2={sl.y2} stroke="#4a9eff" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.7}/>)}
              </g>
            </svg>
            {/* Group boxes — render BEHIND nodes */}
            {groups.map(g=>{
              const gNodes=g.nodeIds.map(id=>nodes.find(n=>n.id===id)).filter(Boolean);
              if(!gNodes.length) return null;
              let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
              gNodes.forEach(n=>{
                mnX=Math.min(mnX,n.x);mnY=Math.min(mnY,n.y);
                mxX=Math.max(mxX,n.x+(n.w||200));mxY=Math.max(mxY,n.y+(n.h||100));
              });
              const pad=20, labelH=26;
              const gx=mnX-pad,gy=mnY-pad-labelH,gw=mxX-mnX+pad*2,gh=mxY-mnY+pad*2+labelH;
              const gBg=g.cc||(dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)");
              const gBd=g.cc||(dark?"rgba(255,255,255,0.18)":"rgba(0,0,0,0.18)");
              return (
                <div key={g.id} style={{position:"absolute",left:gx,top:gy,width:gw,height:gh,
                  background:gBg,border:`1.5px solid ${gBd}`,borderRadius:18,zIndex:0,
                  pointerEvents:"none"}}>
                  <div onClick={()=>sEditGroupId(g.id)}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();
                      const palette=dark?PA_D:PA_L;
                      sCtx({x:e.clientX,y:e.clientY,items:[
                        {icon:"✎",label:"Rename Group",action:()=>{
                          const txt=prompt("Group label:",g.label||"Group");
                          if(txt!==null) sGroups(p=>p.map(gg=>gg.id===g.id?{...gg,label:txt}:gg));
                        }},
                        {icon:"●",label:"Background Color",
                          colors:palette.filter(p=>p.v).map(p=>p.v),
                          activeColor:g.cc||"",
                          onColor:(clr)=>sGroups(p=>p.map(gg=>gg.id===g.id?{...gg,cc:clr}:gg))},
                        {icon:"✕",label:"Ungroup",action:()=>sGroups(p=>p.filter(gg=>gg.id!==g.id))},
                      ]});
                    }}
                    style={{position:"absolute",top:6,left:14,fontSize:11,fontWeight:700,
                      color:c.txt,fontFamily:QF,cursor:"text",userSelect:"none",
                      padding:"3px 10px",borderRadius:6,background:`${gBd}30`,
                      pointerEvents:"auto"}}>
                    {editGroupId===g.id ? (
                      <input autoFocus value={g.label} onChange={e=>sGroups(p=>p.map(gg=>gg.id===g.id?{...gg,label:e.target.value}:gg))}
                        onBlur={()=>sEditGroupId(null)} onKeyDown={e=>{if(e.key==="Enter")sEditGroupId(null);}}
                        onClick={stop}
                        style={{background:"transparent",border:"none",outline:"none",
                          fontFamily:QF,fontSize:11,fontWeight:700,color:c.txt,width:120}}/>
                    ) : (g.label||"Group")}
                  </div>
                </div>
              );
            })}
            {nodes.map(node => (
              <NBox key={node.id} node={node} c={c} nc={ncMap[node.type]||{bg:"#fff",bd:c.acc}}
                dark={dark} dispatch={dispatch} dC={dC} mC={mC} sbFrames={sbFrames}
                isSelected={selN===node.id||selSet.has(node.id)} conns={conns} nodes={nodes}/>
            ))}
            {/* Marquee selection rectangle */}
            {marquee && (
              <div style={{position:"absolute",
                left:Math.min(marquee.x1,marquee.x2),top:Math.min(marquee.y1,marquee.y2),
                width:Math.abs(marquee.x2-marquee.x1),height:Math.abs(marquee.y2-marquee.y1),
                background:"rgba(74,158,255,0.1)",border:"1px dashed #4a9eff",pointerEvents:"none",zIndex:100}}/>
            )}
            {/* Bridge lines layer — ABOVE node bg, BELOW node UI content (z=65) */}
            <svg style={{position:"absolute",left:-10000,top:-10000,width:20000,height:20000,overflow:"visible",pointerEvents:"none",zIndex:2}}>
              <g transform="translate(10000,10000)">
                {nodes.filter(n=>isTL(n.type)).flatMap(n=>{
                  const nw=n.w||380;
                  const isSTL=n.type==="stl";
                  const hasPA=isSTL&&n.plotArc;
                  const headerH=47, toggleH=isSTL?(hasPA?40:18):0, plotVizH=hasPA?140:0, tlPadTop=hasPA?6:10;
                  const tlLineY=n.y+headerH+toggleH+plotVizH+tlPadTop+1;
                  const bdCol=(dark?NCD:NCL)[n.type]?.bd||"#999";
                  const padL3=19, areaW3=nw-38;
                  const sortedPts=[...(n.plotPts||[])].sort((a,b)=>a.x-b.x);
                  return (n.ports||[]).filter(p=>p.c).flatMap(port=>{
                    const pp=pPos(n,port);
                    const portRelX=(pp.x-n.x)/nw;
                    const result=[
                      <line key={"tbr-"+n.id+"-"+port.id} x1={pp.x} y1={pp.y} x2={pp.x} y2={tlLineY}
                        stroke={bdCol} strokeWidth={1.2} opacity={0.35} strokeDasharray="3 3"/>
                    ];
                    return result;
                  });
                })}
              </g>
            </svg>

            {/* Hit areas for ALL connections — above nodes so right-click works */}
            <svg style={{position:"absolute",left:-10000,top:-10000,width:20000,height:20000,overflow:"visible",zIndex:3}}>
              <g transform="translate(10000,10000)">
                {conns.map(cn => <CHit key={"h"+cn.id} cn={cn} nodes={nodes} onCtx={onCCtx}/>)}
              </g>
            </svg>
          </div>
          {!mob && <div style={{position:"absolute",bottom:8,right:8,fontSize:9,color:c.txt3,fontFamily:QF,
            fontWeight:500,opacity:0.5,textAlign:"right",lineHeight:1.6,pointerEvents:"none"}}>
            <div>Right-click → Add · ? → All shortcuts</div>
          </div>}
        </div>
        {mob && (
          <button onClick={()=>sCtx({mobile:true})}
            style={{position:"absolute",bottom:16,right:16,width:52,height:52,borderRadius:"50%",
              background:c.acc,color:c.bg,border:"none",fontSize:28,fontWeight:300,
              boxShadow:`0 4px 16px ${c.shd}`,cursor:"pointer",display:"flex",
              alignItems:"center",justifyContent:"center",zIndex:100,lineHeight:1}}>+</button>
        )}

        {/* ── MINIMAP ── */}
        {nodes.length>1 && !mob && (()=>{
          const mmW=150,mmH=100,pd=10;
          let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
          nodes.forEach(n=>{mnX=Math.min(mnX,n.x);mnY=Math.min(mnY,n.y);mxX=Math.max(mxX,n.x+(n.w||200));mxY=Math.max(mxY,n.y+(n.h||100));});
          const rW=mxX-mnX+pd*2||1, rH=mxY-mnY+pd*2||1;
          const sc2=Math.min((mmW-8)/rW,(mmH-8)/rH);
          const r2=cvR.current?.getBoundingClientRect();
          const vpX=r2?(-off.x/zm-mnX+pd)*sc2+4:0, vpY=r2?(-off.y/zm-mnY+pd)*sc2+4:0;
          const vpW=r2?(r2.width/zm)*sc2:mmW, vpH=r2?(r2.height/zm)*sc2:mmH;
          return (
            <div style={{position:"absolute",bottom:32,right:8,width:mmW,height:mmH,
              background:dark?"rgba(30,30,30,0.85)":"rgba(255,255,255,0.9)",
              border:BDR(c),borderRadius:10,overflow:"hidden",pointerEvents:"none",zIndex:50}}>
              <svg width={mmW} height={mmH}>
                {nodes.map(n=>{
                  const nc2=(dark?NCD:NCL)[n.type]; const bg2=n.cc||nc2?.bg||"#ccc";
                  return <rect key={n.id} x={(n.x-mnX+pd)*sc2+4} y={(n.y-mnY+pd)*sc2+4}
                    width={Math.max(2,(n.w||200)*sc2)} height={Math.max(2,(n.h||100)*sc2)} rx={2}
                    fill={bg2} stroke={nc2?.bd||"#999"} strokeWidth={0.5} opacity={n.id===selN?1:0.7}/>;
                })}
                <rect x={vpX} y={vpY} width={Math.min(vpW,mmW)} height={Math.min(vpH,mmH)}
                  fill="none" stroke={c.acc} strokeWidth={1.5} rx={2} opacity={0.6}/>
              </svg>
            </div>
          );
        })()}

        {/* ── SEARCH BAR ── */}
        {searchOpen && (
          <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",zIndex:200,
            background:c.ctx,border:BDR(c),borderRadius:12,padding:"8px 12px",
            boxShadow:`0 4px 16px ${c.shd}`,fontFamily:QF,width:320}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:14}}>{"🔍"}</span>
              <input value={search} onChange={e=>{sSearch(e.target.value);runSearch(e.target.value);}}
                placeholder="Search nodes..." autoFocus
                style={{flex:1,background:"transparent",border:"none",outline:"none",fontSize:13,
                  fontFamily:QF,color:c.txt,fontWeight:500}}
                onKeyDown={e=>{if(e.key==="Escape"){sSearchOpen(false);sSearch("");sSearchResults([]);}}}/>
              <button onClick={()=>{sSearchOpen(false);sSearch("");sSearchResults([]);}}
                style={{background:"none",border:"none",color:c.txt3,cursor:"pointer",fontSize:14}}>{"✕"}</button>
            </div>
            {searchResults.length>0 && (
              <div style={{marginTop:6,borderTop:BDR(c),paddingTop:4,maxHeight:200,overflow:"auto"}}>
                {searchResults.map((sr,si)=>(
                  <button key={si} onClick={()=>{jumpTo(sr.x,sr.y,sr.id);sSearchOpen(false);sSearch("");sSearchResults([]);}}
                    style={{display:"block",width:"100%",padding:"6px 8px",border:"none",
                      background:"transparent",cursor:"pointer",textAlign:"left",fontSize:12,borderRadius:6,
                      fontFamily:QF,color:c.txt,fontWeight:500}}
                    onMouseEnter={e=>{e.currentTarget.style.background=c.surfH;}}
                    onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                    {sr.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CONFIRM DELETE ── */}
        {confirmDel && (
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:300,
            background:c.ctx,border:BDR(c),borderRadius:14,padding:"20px 24px",
            boxShadow:`0 8px 30px ${c.shd}`,fontFamily:QF,textAlign:"center",minWidth:240}}>
            <div style={{fontSize:14,fontWeight:600,color:c.txt,marginBottom:6}}>{"Delete this node?"}</div>
            <div style={{fontSize:11,color:c.txt3,marginBottom:16}}>{"\""+confirmDel.label+"\" and all its connections will be removed."}</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button onClick={()=>sConfirmDel(null)}
                style={{padding:"6px 18px",borderRadius:8,border:BDR(c),
                  background:"transparent",color:c.txt,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:QF}}>Cancel</button>
              <button onClick={()=>{dispatch({t:"DEL",id:confirmDel.id});sConfirmDel(null);sSelN(null);}}
                style={{padding:"6px 18px",borderRadius:8,border:"none",
                  background:"#e53935",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:QF}}>Delete</button>
            </div>
          </div>
        )}

        {/* ── KEYBOARD SHORTCUTS ── */}
        {showHelp && (()=>{
          const [helpTab,sHelpTab]=[helpTabRef.current,v=>{helpTabRef.current=v;sShowHelp(true);}];
          return (
          <div onClick={()=>sShowHelp(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",
            zIndex:400,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div onClick={stop} style={{background:c.ctx,border:BDR(c),
              borderRadius:16,padding:"24px 28px",boxShadow:`0 8px 30px ${c.shd}`,fontFamily:QF,
              maxWidth:460,width:"90%",maxHeight:"75vh",display:"flex",flexDirection:"column"}}>
              {/* Tab buttons */}
              <div style={{display:"flex",gap:4,marginBottom:14}}>
                {["Shortcuts","Guide"].map(t=>(
                  <button key={t} onClick={()=>sHelpTab(t)}
                    style={{flex:1,padding:"6px 0",borderRadius:8,border:BDR(c),
                      background:helpTab===t?c.acc:"transparent",color:helpTab===t?c.bg:c.txt3,
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:QF}}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{flex:1,overflow:"auto"}}>
              {helpTab==="Shortcuts" && (
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:c.txt,marginBottom:10}}>Keyboard shortcuts</div>
                  {[
                    ["Right-click","Add nodes / context menu"],["Space + drag","Pan canvas"],["Scroll wheel","Zoom in/out"],
                    ["Click node","Select node"],["Delete","Delete selected node"],["Arrow keys","Nudge selected 10px"],
                    ["Ctrl+D","Duplicate node"],["Ctrl+Z","Undo"],["Ctrl+Y / Ctrl+Shift+Z","Redo"],
                    ["Ctrl+F","Search nodes"],["Escape","Close overlays / deselect"],["?","Toggle this help"],
                  ].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",
                      borderBottom:BDR(c),fontSize:11}}>
                      <span style={{fontWeight:600,color:c.txt}}>{k}</span>
                      <span style={{color:c.txt3}}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {helpTab==="Guide" && (
                <div style={{fontSize:11,lineHeight:1.7,color:c.txt2}}>
                  <div style={{fontSize:14,fontWeight:700,color:c.txt,marginBottom:10}}>Terminology & node guide</div>

                  <div style={{fontSize:12,fontWeight:700,color:c.txt,marginTop:10,marginBottom:4}}>Canvas basics</div>
                  <div style={{marginBottom:8}}>
                    <b style={{color:c.txt}}>Node</b> — A visual card on the canvas representing an element of your story. Each node has a type, a label, and can be connected to other nodes.<br/>
                    <b style={{color:c.txt}}>Port</b> — A connection point on the edge of a node. Created by clicking and dragging from any node edge. Ports appear as small dots.<br/>
                    <b style={{color:c.txt}}>Connection</b> — A line linking two ports on different nodes. Represents a relationship between story elements. Right-click a connection to label it, color it, straighten/curve it, or remove it.<br/>
                    <b style={{color:c.txt}}>Snap guides</b> — Blue dashed lines that appear when dragging a node near another node’s edge or center, helping you align your layout.
                  </div>

                  <div style={{fontSize:12,fontWeight:700,color:c.txt,marginTop:10,marginBottom:4}}>Node types</div>
                  <div style={{marginBottom:6,padding:"6px 10px",background:c.surf,borderRadius:8}}>
                    <b style={{color:"#4a6fa5"}}>Story Timeline</b> — The backbone of your story. Contains a horizontal timeline with date markers, and an optional <b>Plot Arc</b> visualization showing rising/falling action with draggable plot points. Other nodes can connect directly to plot points. Toggle between curved and linear arc styles.
                  </div>
                  <div style={{marginBottom:6,padding:"6px 10px",background:c.surf,borderRadius:8}}>
                    <b style={{color:"#8b5e3c"}}>Event Timeline</b> — A secondary timeline for organizing events, subplots, or character arcs. Has the same date marker system as Story Timeline but without the plot arc.
                  </div>
                  <div style={{marginBottom:6,padding:"6px 10px",background:c.surf,borderRadius:8}}>
                    <b style={{color:c.txt}}>Event</b> — A specific story event, scene, or beat. Has an Info panel with date, description, and a <b>Link Preview</b> feature — paste a URL to fetch article metadata, preview it, and auto-fill the event’s details.
                  </div>
                  <div style={{marginBottom:6,padding:"6px 10px",background:c.surf,borderRadius:8}}>
                    <b style={{color:"#c4b84d"}}>Note</b> — A freeform text note. Use it for ideas, reminders, research, or anything that doesn’t fit another type. Contains an editable text area.
                  </div>
                  <div style={{marginBottom:6,padding:"6px 10px",background:c.surf,borderRadius:8}}>
                    <b style={{color:"#4a8b4a"}}>Asset</b> — An image or media container. Upload files from your computer or import frames from the Storyboard tab. Double-click to view full-size.
                  </div>

                  <div style={{fontSize:12,fontWeight:700,color:c.txt,marginTop:10,marginBottom:4}}>Other tabs</div>
                  <div style={{marginBottom:6}}>
                    <b style={{color:c.txt}}>Scripting</b> — Write screenplays in industry-standard format (scene headings, action, dialogue, etc.) or use the document editor for freeform writing. Import .fountain files. Export to PDF, Word, or plain text.<br/>
                    <b style={{color:c.txt}}>Storyboard</b> — Draw storyboard frames with pencil, brush, eraser, line, fill, and text tools. Supports onion skinning, frame metadata (scene/shot/lens), and PDF contact sheet export. Drag frames in the timeline to reorder.
                  </div>
                </div>
              )}
              </div>
              <div style={{marginTop:14,textAlign:"center"}}>
                <button onClick={()=>sShowHelp(false)}
                  style={{padding:"6px 20px",borderRadius:8,border:BDR(c),
                    background:"transparent",color:c.txt,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:QF}}>Close</button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
      {ctx && !ctx.mobile && <CtxMenu x={ctx.x} y={ctx.y} c={c} items={ctx.items} onClose={()=>sCtx(null)}/>}
      {ctx && ctx.mobile && <MobileAddMenu c={c}
        onAdd={type=>{const pos=s2c(cvR.current?.getBoundingClientRect().width/2||200,cvR.current?.getBoundingClientRect().height/2||200);addNode(type,pos.x,pos.y);}}
        onClose={()=>sCtx(null)}/>}
      {mod && <Modal node={mod} c={c} onClose={()=>sMod(null)} onUpdate={(id,u)=>{sN(p=>p.map(n=>n.id===id?{...n,...u}:n));sMod(null);}}/>}
      {astP && (
        <div onClick={()=>sAstP(null)} style={{position:"fixed",inset:0,background:c.ov,zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div onClick={stop} style={{background:c.ctx,borderRadius:18,padding:18,maxWidth:"90vw",maxHeight:"90vh",overflow:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:13,fontWeight:700,color:c.txt}}>{astP.name}</span>
              <button onClick={()=>sAstP(null)} style={{background:"none",border:"none",fontSize:20,color:c.txt3,cursor:"pointer",fontWeight:700}}>×</button>
            </div>
            {astP.type?.startsWith("video")
              ? <video src={astP.url} controls style={{maxWidth:"80vw",maxHeight:"75vh",borderRadius:10}}/>
              : <img src={astP.url} alt="" style={{maxWidth:"80vw",maxHeight:"75vh",borderRadius:10,objectFit:"contain"}}/>}
          </div>
        </div>
      )}

    </div>
  );
}

/* ══════ STORYBOARDING ══════ */

const PENCILS = [
  {l:"6H",c:"#d4d4d4"},{l:"4H",c:"#bbb"},{l:"2H",c:"#a0a0a0"},
  {l:"H",c:"#888"},{l:"HB",c:"#555"},{l:"B",c:"#3a3a3a"},
  {l:"2B",c:"#252525"},{l:"4B",c:"#151515"},{l:"6B",c:"#080808"},
];

const BCOLORS = [
  "#1a1a1a","#fff","#e53935","#d81b60","#8e24aa","#5c6bc0",
  "#1e88e5","#00acc1","#00897b","#43a047","#7cb342","#c0ca33",
  "#fdd835","#ffb300","#fb8c00","#f4511e","#6d4c41","#78909c",
];

const mkSBP = () => ({id:uid(),name:"Untitled Storyboard",boards:[]});

const mkBoard = (tpl) => ({
  id:uid(), tpl,
  frames: tpl==="full"
    ? [{id:uid(),data:null,scene:"",shot:"",lens:"",action:"",dialog:"",notes:""}]
    : Array.from({length:6},()=>({id:uid(),data:null,scene:"",shot:"",lens:"",action:"",dialog:"",notes:""})),
});

function doFill(ctx,sx,sy,fc,w,h) {
  const img=ctx.getImageData(0,0,w,h), d=img.data;
  const idx=(x,y)=>(y*w+x)*4;
  const ti=idx(sx,sy);
  const tr=d[ti],tg=d[ti+1],tb=d[ti+2],ta=d[ti+3];
  const fr=parseInt(fc.slice(1,3),16),fg=parseInt(fc.slice(3,5),16),fb=parseInt(fc.slice(5,7),16);
  if(tr===fr&&tg===fg&&tb===fb&&ta===255) return;
  const match=i=>Math.abs(d[i]-tr)<15&&Math.abs(d[i+1]-tg)<15&&Math.abs(d[i+2]-tb)<15&&Math.abs(d[i+3]-ta)<40;
  const vis=new Uint8Array(w*h);
  const stk=[[sx,sy]];
  let ct=0;
  while(stk.length>0&&ct<800000){
    const[x,y]=stk.pop();
    if(x<0||x>=w||y<0||y>=h) continue;
    const vi=y*w+x;
    if(vis[vi]) continue;
    const i=idx(x,y);
    if(!match(i)) continue;
    vis[vi]=1; d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255;
    stk.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    ct++;
  }
  ctx.putImageData(img,0,0);
}

const SBFrame = React.memo(function SBFrame({frame,tool,color,bSz,pShade,prevData,onion,onSave,c,dark,fw,fh}) {
  const cvRef=useRef(null);
  const drRef=useRef(false);
  const ldRef=useRef(null);
  const strokeHistory=useRef([]);
  const lineStart=useRef(null);

  useEffect(()=>{
    const cv=cvRef.current; if(!cv) return;
    const x=cv.getContext("2d");
    if(frame.data){
      if(ldRef.current===frame.id+frame.data) return;
      const im=new Image();
      im.onload=()=>{x.clearRect(0,0,fw,fh);x.drawImage(im,0,0);ldRef.current=frame.id+frame.data;};
      im.src=frame.data;
    } else {
      x.fillStyle="#fff"; x.fillRect(0,0,fw,fh); ldRef.current=null;
    }
  },[frame.id]);

  const xy=e=>{const r=cvRef.current.getBoundingClientRect();const cx=e.touches?e.touches[0].clientX:e.clientX;const cy=e.touches?e.touches[0].clientY:e.clientY;return{x:(cx-r.left)*(fw/r.width),y:(cy-r.top)*(fh/r.height)};};

  const undoStroke=()=>{
    if(!strokeHistory.current.length||!cvRef.current) return;
    const prev=strokeHistory.current.pop();
    const cv=cvRef.current, x=cv.getContext("2d");
    const im=new Image();
    im.onload=()=>{x.clearRect(0,0,fw,fh);x.drawImage(im,0,0);onSave(cv.toDataURL("image/webp",0.7));};
    im.src=prev;
  };

  const dn=e=>{
    if(e.button!==undefined&&e.button!==0) return;
    if(e.touches) e.preventDefault();
    const cv=cvRef.current, x=cv.getContext("2d"), pt=xy(e);
    /* Save canvas state before this stroke */
    if(strokeHistory.current.length>30) strokeHistory.current.shift();
    strokeHistory.current.push(cv.toDataURL());
    if(tool==="fill"){doFill(x,Math.round(pt.x),Math.round(pt.y),color,fw,fh);onSave(cv.toDataURL("image/webp",0.7));return;}
    if(tool==="text"){
      const txt=prompt("Text:","");
      if(txt){
        if(strokeHistory.current.length>30) strokeHistory.current.shift();
        strokeHistory.current.push(cv.toDataURL());
        x.globalCompositeOperation="source-over";
        x.font=Math.max(14,bSz*3)+"px Quicksand,sans-serif";
        x.fillStyle=color;x.globalAlpha=1;
        x.fillText(txt,pt.x,pt.y);
        onSave(cv.toDataURL("image/webp",0.7));
      }
      return;
    }

    if(tool==="line"){lineStart.current=pt;drRef.current=true;return;}
    drRef.current=true;
    x.beginPath(); x.moveTo(pt.x,pt.y);
    if(tool==="eraser"){x.globalCompositeOperation="destination-out";x.strokeStyle="rgba(0,0,0,1)";x.lineWidth=bSz*2;x.globalAlpha=1;}
    else if(tool==="pencil"){x.globalCompositeOperation="source-over";x.strokeStyle=pShade;x.lineWidth=Math.max(1,bSz*0.5);x.globalAlpha=0.65;}
    else{x.globalCompositeOperation="source-over";x.strokeStyle=color;x.lineWidth=bSz;x.globalAlpha=1;}
    x.lineCap="round"; x.lineJoin="round";
  };

  const mv=e=>{
    if(!drRef.current) return;
    if(e.touches) e.preventDefault();
    if(tool==="line") return; /* line draws on up, not during move */
    const x=cvRef.current.getContext("2d"), pt=xy(e);
    x.lineTo(pt.x,pt.y); x.stroke(); x.beginPath(); x.moveTo(pt.x,pt.y);
  };

  const up=e=>{
    if(!drRef.current) return;
    drRef.current=false;
    const cv=cvRef.current, ctx2=cv.getContext("2d");
    if(tool==="line"&&lineStart.current){
      const pt=e?.touches?{x:0,y:0}:(e?xy(e):lineStart.current);
      ctx2.globalCompositeOperation="source-over";
      ctx2.beginPath();ctx2.moveTo(lineStart.current.x,lineStart.current.y);
      ctx2.lineTo(pt.x,pt.y);ctx2.strokeStyle=color;ctx2.lineWidth=bSz;ctx2.globalAlpha=1;
      ctx2.lineCap="round";ctx2.stroke();
      lineStart.current=null;
    }
    ctx2.globalAlpha=1; ctx2.globalCompositeOperation="source-over";
    onSave(cv.toDataURL("image/webp",0.7));
  };

  return (
    <div style={{position:"relative",width:"100%",height:"100%"}}>
      <canvas ref={cvRef} width={fw} height={fh} tabIndex={0}
        style={{width:"100%",height:"100%",cursor:tool==="line"?"crosshair":tool==="eraser"?"cell":"crosshair",display:"block",borderRadius:4,touchAction:"none",outline:"none"}}
        onMouseDown={dn} onMouseMove={mv} onMouseUp={up} onMouseLeave={up}
        onTouchStart={dn} onTouchMove={mv} onTouchEnd={up}
        onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==="z"){e.preventDefault();undoStroke();}}}/>
      {onion&&prevData && (
        <img src={prevData} alt=""
          style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.18,pointerEvents:"none",objectFit:"fill",mixBlendMode:"multiply"}}/>
      )}
    </div>
  );
});

function SBToolbox({tool,setTool,color,setColor,bSz,setBSz,pIdx,setPIdx,onion,setOnion,c,dark}) {
  const[drag,sDrag]=useState(false);
  const[pos,sPos]=useState({x:16,y:16});
  const[dOff,sDOff]=useState({x:0,y:0});
  const[hovH,sHovH]=useState(false);
  const[expd,sExpd]=useState(null);
  const boxRef=useRef(null);

  useEffect(()=>{
    if(!drag) return;
    const mm=e=>{
      const cx=e.touches?e.touches[0].clientX:e.clientX;
      const cy=e.touches?e.touches[0].clientY:e.clientY;
      const bw=boxRef.current?.offsetWidth||60;
      const nx=window.innerWidth-cx-dOff.x;
      sPos({x:Math.max(0,Math.min(window.innerWidth-bw-10,nx)),y:Math.max(0,cy-dOff.y)});
    };
    const mu=()=>sDrag(false);
    window.addEventListener("mousemove",mm); window.addEventListener("mouseup",mu);
    window.addEventListener("touchmove",mm,{passive:false}); window.addEventListener("touchend",mu);
    return()=>{window.removeEventListener("mousemove",mm);window.removeEventListener("mouseup",mu);
      window.removeEventListener("touchmove",mm);window.removeEventListener("touchend",mu);};
  },[drag,dOff]);

  const tools=[{k:"pencil",ic:"✏️",lb:"Pencil"},{k:"brush",ic:"🖌️",lb:"Brush"},{k:"line",ic:"╱",lb:"Line"},{k:"eraser",ic:"◻",lb:"Eraser"},{k:"fill",ic:"◓",lb:"Fill"},{k:"text",ic:"T",lb:"Text"}];

  return (
    <div ref={boxRef} style={{position:"absolute",right:pos.x,top:pos.y,zIndex:100,fontFamily:QF}}>
      <div style={{background:dark?"#2a2a2a":"#fff",border:BDR(c),borderRadius:14,
        boxShadow:`0 4px 20px ${c.shd}`,minWidth:52,overflow:"visible"}}>
        <div style={{padding:"5px 8px",borderBottom:BDR(c),
          cursor:hovH?"grab":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:3}}
          onMouseEnter={()=>sHovH(true)} onMouseLeave={()=>{if(!drag)sHovH(false);}}
          onMouseDown={e=>{
            e.preventDefault();
            const br=boxRef.current?.getBoundingClientRect();
            if(!br) return;
            sDOff({x:window.innerWidth-e.clientX-br.left+br.left-(window.innerWidth-pos.x), y:e.clientY-br.top});
            sDrag(true);
          }}>
          {hovH
            ? <div style={{display:"flex",gap:2}}>
                <div style={{width:3,height:3,borderRadius:"50%",background:c.txt3}}/>
                <div style={{width:3,height:3,borderRadius:"50%",background:c.txt3}}/>
                <div style={{width:3,height:3,borderRadius:"50%",background:c.txt3}}/>
              </div>
            : <span style={{fontSize:7,fontWeight:700,color:c.txt3,textTransform:"uppercase",letterSpacing:1}}>Tools</span>
          }
        </div>
        <div style={{padding:"6px 6px 4px",display:"flex",flexDirection:"column",gap:3}}>
          {tools.map(t=>(
            <button key={t.k}
              onClick={()=>{setTool(t.k);sExpd(expd===t.k?null:t.k);}}
              style={{width:40,height:32,borderRadius:8,
                border:tool===t.k?`2px solid ${c.acc}`:BDR(c),
                background:tool===t.k?(dark?"#383838":"#eee"):"transparent",
                cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",gap:0,fontSize:14,lineHeight:1}} title={t.lb}>
              <span>{t.ic}</span>
              <span style={{fontSize:6,fontWeight:600,color:c.txt3}}>{t.lb}</span>
            </button>
          ))}
          <div style={{height:1,background:c.bdr,margin:"2px 0"}}/>
          <button onClick={()=>setOnion(!onion)}
            style={{width:40,height:32,borderRadius:8,
              border:onion?`2px solid #f59e0b`:BDR(c),
              background:onion?(dark?"#3d3520":"#fef3c7"):"transparent",
              cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0}}
            title="Onion Skin">
            <span style={{fontSize:12}}>🧅</span>
            <span style={{fontSize:6,fontWeight:600,color:onion?"#f59e0b":c.txt3}}>Onion</span>
          </button>
        </div>
        <div style={{padding:"4px 6px 6px",borderTop:BDR(c)}}>
          <div style={{fontSize:7,fontWeight:600,color:c.txt3,marginBottom:2,textAlign:"center"}}>Size: {bSz}</div>
          <input type="range" min={1} max={24} value={bSz} onChange={e=>setBSz(+e.target.value)}
            style={{width:40,cursor:"pointer"}}/>
        </div>
      </div>

      {expd==="pencil" && (
        <div style={{position:"absolute",right:58,top:30,background:dark?"#2a2a2a":"#fff",
          border:BDR(c),borderRadius:12,padding:6,boxShadow:`0 4px 16px ${c.shd}`,
          display:"flex",flexDirection:"column",gap:2,minWidth:75}}>
          <div style={{fontSize:8,fontWeight:700,color:c.txt3,padding:"2px 4px",textTransform:"uppercase"}}>Pencil Grade</div>
          {PENCILS.map((ps,i)=>(
            <button key={ps.l} onClick={()=>setPIdx(i)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"3px 6px",borderRadius:6,
                border:pIdx===i?`2px solid ${c.acc}`:"1px solid transparent",
                background:pIdx===i?(dark?"#383838":"#f5f5f5"):"transparent",cursor:"pointer"}}>
              <div style={{width:12,height:12,borderRadius:3,background:ps.c,border:BDR(c)}}/>
              <span style={{fontSize:10,fontWeight:600,color:c.txt}}>{ps.l}</span>
            </button>
          ))}
        </div>
      )}

      {(expd==="brush"||expd==="fill") && (
        <div style={{position:"absolute",right:58,top:70,background:dark?"#2a2a2a":"#fff",
          border:BDR(c),borderRadius:12,padding:8,boxShadow:`0 4px 16px ${c.shd}`,minWidth:130}}>
          <div style={{fontSize:8,fontWeight:700,color:c.txt3,padding:"0 2px 4px",textTransform:"uppercase"}}>Color</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:3}}>
            {BCOLORS.map(bc=>(
              <button key={bc} onClick={()=>setColor(bc)}
                style={{width:16,height:16,borderRadius:4,background:bc,cursor:"pointer",
                  border:color===bc?`2px solid ${c.acc}`:BDR(c)}}/>
            ))}
          </div>
          <div style={{marginTop:6,display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:8,fontWeight:600,color:c.txt3}}>Custom:</span>
            <input type="color" value={color} onChange={e=>setColor(e.target.value)}
              style={{width:20,height:20,border:"none",padding:0,cursor:"pointer",borderRadius:4}}/>
          </div>
        </div>
      )}

    </div>
  );
}


function exportStoryboardPDF(proj) {
  if(!proj) return;
  const allFrames=[];
  (proj.boards||[]).forEach(b=>(b.frames||[]).forEach(f=>{if(f.data)allFrames.push(f);}));
  if(!allFrames.length){alert("No frames to export");return;}
  const w2=window.open("","","width=816,height=1056");
  const grid=allFrames.map(f=>'<div style="break-inside:avoid;margin:8px 0;">'
    +'<img src="'+f.data+'" style="width:100%;border:1px solid #ddd;border-radius:4px;"/>'
    +'<div style="font-size:10px;color:#666;padding:4px 0;">'
    +(f.scene?"<b>Scene:</b> "+f.scene+" ":"")+(f.shot?"<b>Shot:</b> "+f.shot+" ":"")+(f.lens?"<b>Lens:</b> "+f.lens:"")
    +'</div>'+(f.action?'<div style="font-size:9px;color:#888;">'+f.action+'</div>':"")+'</div>').join("");
  w2.document.write('<!DOCTYPE html><html><head><style>body{font-family:sans-serif;margin:40px;}h1{font-size:18px;margin-bottom:20px;}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}@page{size:letter;margin:0.75in;}</style></head><body>'
    +'<h1>'+(proj.name||"Storyboard")+'</h1><div class="grid">'+grid+'</div></body></html>');
  w2.document.close();
  setTimeout(()=>w2.print(),500);
}

function StoryboardingTab({c,dark,sbP,setSbP,sbPid,setSbPid,mob}) {
  const[sbO,sSb]=useState(!mob);
  const[tool,setTool]=useState("pencil");
  const[color,setColor]=useState("#1a1a1a");
  const[bSz,setBSz]=useState(3);
  const[pIdx,setPIdx]=useState(4);
  const[onion,setOnion]=useState(false);
  const[curB,setCurB]=useState(0);
  const[dragF,sDragF]=useState(null);
  const[dragOver,sDragOver]=useState(null);
  const[curF,setCurF]=useState(0);
  const tlRef=useRef(null);

  const proj=sbP.find(p=>p.id===sbPid);
  const boards=proj?.boards||[];
  const board=boards[curB];
  const frames=board?.frames||[];
  const frame=frames[curF];

  const sB=useCallback(fn=>setSbP(p=>p.map(pr=>pr.id===sbPid
    ?{...pr,boards:typeof fn==="function"?fn(pr.boards):fn}:pr)),[sbPid,setSbP]);

  const addProj=()=>{const p=mkSBP();setSbP(prev=>[...prev,p]);setSbPid(p.id);};
  const delProj=pid=>{if(sbP.length<=1)return;const rem=sbP.filter(p=>p.id!==pid);setSbP(rem);if(sbPid===pid)setSbPid(rem[0].id);};

  const addBoard=tpl=>{
    const nb=mkBoard(tpl);
    sB(prev=>[...prev,nb]);
    setCurB(boards.length); setCurF(0);
    setTimeout(()=>{if(tlRef.current) tlRef.current.scrollLeft=tlRef.current.scrollWidth;},60);
  };

  const saveFrame=d=>{
    sB(prev=>prev.map((b,bi)=>bi===curB
      ?{...b,frames:b.frames.map((f,fi)=>fi===curF?{...f,data:d}:f)}:b));
  };

  const updMeta=(k,v)=>{
    sB(prev=>prev.map((b,bi)=>bi===curB
      ?{...b,frames:b.frames.map((f,fi)=>fi===curF?{...f,[k]:v}:f)}:b));
  };

  const prevFD = useMemo(()=>{
    if(curF>0) return frames[curF-1]?.data||null;
    if(curB>0){
      const pb=boards[curB-1];
      if(pb&&pb.frames.length>0) return pb.frames[pb.frames.length-1]?.data||null;
    }
    return null;
  },[curF,curB,frames,boards]);
  const pShade=PENCILS[pIdx]?.c||"#555";

  if(!proj) return null;

  const META=[{k:"scene",l:"Scene #"},{k:"shot",l:"Shot Description"},{k:"lens",l:"Lens / FL"},
    {k:"action",l:"Action"},{k:"dialog",l:"Dialogue"},{k:"notes",l:"Notes"}];

  return (
    <div style={{flex:1,display:"flex",overflow:"hidden"}}>
      {/* Sidebar */}
      <div style={{width:sbO?(mob?160:200):0,background:c.sb,borderRight:sbO?BDR(c):"none",
        overflow:"hidden",transition:"width 0.25s",flexShrink:0,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"14px 14px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,color:c.txt3}}>Projects</div>
          <button onClick={addProj} style={{background:"none",border:BDR(c),borderRadius:8,
            width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
            cursor:"pointer",color:c.txt,fontSize:14,fontWeight:700,fontFamily:QF}}>+</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"0 8px 14px"}}>
          {sbP.map(p=>(
            <div key={p.id} onClick={()=>{setSbPid(p.id);setCurB(0);setCurF(0);}}
              style={{display:"flex",alignItems:"center",gap:7,padding:"8px 10px",marginBottom:3,
                borderRadius:10,cursor:"pointer",background:p.id===sbPid?c.surfH:"transparent"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:p.id===sbPid?c.acc:c.txt3,flexShrink:0}}/>
              <div style={{flex:1,fontSize:12,fontWeight:p.id===sbPid?700:500,color:c.txt,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</div>
              {sbP.length>1&&(
                <button onClick={e=>{e.stopPropagation();delProj(p.id);}}
                  style={{background:"none",border:"none",color:c.txt3,cursor:"pointer",fontSize:13,fontWeight:700,opacity:0.4}}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative"}}>
        {/* Header */}
        <div style={{height:42,background:c.sb,borderBottom:BDR(c),display:"flex",
          alignItems:"center",padding:"0 12px",gap:8,flexShrink:0}}>
          <button onClick={()=>sSb(!sbO)} style={{background:"none",border:BDR(c),borderRadius:8,
            width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
            color:c.txt,fontSize:10}}>{sbO?"◀":"▶"}</button>
          <button onClick={()=>exportStoryboardPDF(proj)} title="Export PDF"
            style={{background:"none",border:BDR(c),borderRadius:6,padding:"2px 8px",
              fontSize:9,fontWeight:600,cursor:"pointer",color:c.txt3,fontFamily:QF}}>Export PDF</button>
          <input value={proj.name}
            onChange={e=>setSbP(p=>p.map(pr=>pr.id===sbPid?{...pr,name:e.target.value}:pr))}
            style={{background:"transparent",border:"none",outline:"none",fontSize:15,fontWeight:700,
              fontFamily:QF,color:c.txt,flex:1,padding:"3px 6px",borderRadius:6}}
            onFocus={e=>e.currentTarget.style.background=c.surf}
            onBlur={e=>e.currentTarget.style.background="transparent"}/>
          {board&&(
            <span style={{fontSize:10,color:c.txt3,fontWeight:500}}>
              {board.tpl==="full"?"Full Screen":"Windowed (6)"} — Board {curB+1}/{boards.length}
              {board.tpl==="windowed"&&(" — Frame "+(curF+1)+"/"+frames.length)}
            </span>
          )}
        </div>

        {/* Template chooser or Editor */}
        {boards.length===0 ? (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:c.sBg}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,fontFamily:QF}}>
              <div style={{fontSize:22,fontWeight:700,color:c.txt}}>Choose a Template</div>
              <div style={{fontSize:12,color:c.txt3,marginBottom:8}}>Select a layout to start storyboarding</div>
              <div style={{display:"flex",gap:24}}>
                {/* Full screen option */}
                <button onClick={()=>addBoard("full")}
                  style={{width:210,height:170,background:c.surf,border:`2px solid ${c.bdr}`,borderRadius:16,
                    cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    gap:12,fontFamily:QF,transition:"border 0.2s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=c.acc}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=c.bdr}>
                  <div style={{width:130,height:73,border:`2px solid ${c.bdr}`,borderRadius:8,background:c.bg,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${c.bdr}`}}/>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:14,fontWeight:700,color:c.txt}}>Full Screen</div>
                    <div style={{fontSize:10,color:c.txt3}}>One large frame per page</div>
                  </div>
                </button>
                {/* Windowed option */}
                <button onClick={()=>addBoard("windowed")}
                  style={{width:210,height:170,background:c.surf,border:`2px solid ${c.bdr}`,borderRadius:16,
                    cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    gap:12,fontFamily:QF,transition:"border 0.2s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=c.acc}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=c.bdr}>
                  <div style={{width:130,height:73,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                    gridTemplateRows:"1fr 1fr",gap:3}}>
                    {Array.from({length:6}).map((_,i)=>(
                      <div key={i} style={{border:BDR(c),borderRadius:3,background:c.bg}}/>
                    ))}
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:14,fontWeight:700,color:c.txt}}>Windowed</div>
                    <div style={{fontSize:10,color:c.txt3}}>6 smaller frames per page</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : board ? (
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
            {/* Canvas area */}
            <div style={{flex:1,overflow:"auto",background:c.sBg,display:"flex",alignItems:"flex-start",
              justifyContent:"center",padding:20}}>
              {board.tpl==="full"&&frame ? (
                <div style={{width:"100%",maxWidth:920,display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{background:c.sPg,borderRadius:10,overflow:"hidden",border:BDR(c),
                    boxShadow:`0 2px 12px ${c.shd}`,aspectRatio:"16/9"}}>
                    <SBFrame frame={frame} tool={tool} color={tool==="pencil"?pShade:color}
                      bSz={bSz} pShade={pShade} prevData={prevFD} onion={onion} onSave={saveFrame}
                      c={c} dark={dark} fw={1280} fh={720}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,background:c.surf,
                    borderRadius:10,padding:10,border:BDR(c)}}>
                    {META.map(f=>(
                      <div key={f.k}>
                        <div style={{fontSize:8,fontWeight:700,color:c.txt3,textTransform:"uppercase",
                          letterSpacing:0.5,marginBottom:3}}>{f.l}</div>
                        <input value={frame[f.k]||""} onChange={e=>updMeta(f.k,e.target.value)}
                          style={{width:"100%",padding:"5px 7px",background:c.bg,border:BDR(c),
                            borderRadius:6,fontSize:10,color:c.txt,fontFamily:QF,outline:"none"}}/>
                      </div>
                    ))}
                  </div>
                </div>
              ) : board.tpl==="windowed" ? (
                <div style={{width:"100%",maxWidth:1050,display:"grid",gridTemplateColumns:"repeat(3,1fr)",
                  gridTemplateRows:"auto auto",gap:14}}>
                  {frames.map((fr,fi)=>(
                    <div key={fr.id}
                      onClick={()=>setCurF(fi)}
                      style={{background:c.sPg,borderRadius:10,
                        border:fi===curF?`2px solid ${c.acc}`:BDR(c),
                        boxShadow:`0 2px 8px ${c.shd}`,overflow:"hidden",cursor:"pointer"}}>
                      <div style={{aspectRatio:"16/9",position:"relative"}}>
                        {fi===curF ? (
                          <SBFrame frame={fr} tool={tool} color={tool==="pencil"?pShade:color}
                            bSz={bSz} pShade={pShade}
                            prevData={fi>0?frames[fi-1]?.data:(curB>0?boards[curB-1]?.frames?.slice(-1)[0]?.data:null)} onion={onion}
                            onSave={d=>{sB(prev=>prev.map((b,bi)=>bi===curB
                              ?{...b,frames:b.frames.map((ff,ffi)=>ffi===fi?{...ff,data:d}:ff)}:b));}}
                            c={c} dark={dark} fw={640} fh={360}/>
                        ) : fr.data ? (
                          <img src={fr.data} alt="" style={{width:"100%",height:"100%",objectFit:"fill"}}/>
                        ) : (
                          <div style={{width:"100%",height:"100%",background:"#fff",display:"flex",
                            alignItems:"center",justifyContent:"center",fontSize:10,color:c.txt3}}>
                            Click to edit
                          </div>
                        )}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,padding:6}}>
                        {[{k:"scene",l:"Scene"},{k:"shot",l:"Shot"},{k:"lens",l:"Lens"}].map(f=>(
                          <div key={f.k}>
                            <div style={{fontSize:7,fontWeight:700,color:c.txt3,textTransform:"uppercase",
                              letterSpacing:0.3}}>{f.l}</div>
                            <input value={fr[f.k]||""} onClick={stop}
                              onChange={e=>{const v=e.target.value;sB(prev=>prev.map((b,bi)=>bi===curB
                                ?{...b,frames:b.frames.map((ff,ffi)=>ffi===fi?{...ff,[f.k]:v}:ff)}:b));}}
                              style={{width:"100%",padding:"2px 4px",background:c.bg,border:BDR(c),
                                borderRadius:4,fontSize:8,color:c.txt,fontFamily:QF,outline:"none"}}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Toolbox */}
            <SBToolbox tool={tool} setTool={setTool} color={color} setColor={setColor}
              bSz={bSz} setBSz={setBSz} pIdx={pIdx} setPIdx={setPIdx}
              onion={onion} setOnion={setOnion} c={c} dark={dark}/>

            {/* Bottom timeline */}
            <div style={{height:88,background:c.sb,borderTop:BDR(c),display:"flex",
              alignItems:"center",padding:"0 12px",gap:8,flexShrink:0}}>
              <div ref={tlRef} style={{flex:1,display:"flex",gap:10,overflow:"auto",alignItems:"center",
                padding:"8px 0",scrollBehavior:"smooth"}}>
                {boards.map((b,bi)=>(
                  <div key={b.id} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                    <div style={{fontSize:7,fontWeight:700,color:c.txt3,textTransform:"uppercase"}}>
                      {b.tpl==="full"?"Full":"6-Up"} #{bi+1}
                    </div>
                    <div style={{display:"flex",gap:3}}>
                      {b.frames.slice(0,b.tpl==="full"?1:6).map((fr,fi)=>(
                        <button key={fr.id} draggable
                          onClick={()=>{setCurB(bi);setCurF(fi);}}
                          onDragStart={e2=>{sDragF({bi,fi});e2.dataTransfer.effectAllowed="move";}}
                          onDragOver={e2=>{e2.preventDefault();sDragOver({bi,fi});}}
                          onDragEnd={()=>{
                            if(dragF&&dragOver&&dragF.bi===dragOver.bi&&dragF.fi!==dragOver.fi){
                              const brd=boards[dragF.bi];
                              const nf=[...(brd.frames||[])];
                              const[moved]=nf.splice(dragF.fi,1);
                              nf.splice(dragOver.fi,0,moved);
                              setSbP(p=>p.map(pp=>pp.id===sbPid?{...pp,boards:boards.map((b2,bi2)=>bi2===dragF.bi?{...b2,frames:nf}:b2)}:pp));
                            }
                            sDragF(null);sDragOver(null);
                          }}
                          style={{width:b.tpl==="full"?80:30,height:b.tpl==="full"?45:17,
                            borderRadius:4,overflow:"hidden",cursor:"pointer",flexShrink:0,padding:0,
                            border:(bi===curB&&fi===curF)?`2px solid ${c.acc}`:BDR(c),
                            background:"#fff",
                            opacity:dragF&&dragF.bi===bi&&dragF.fi===fi?0.4:1,
                            outline:dragOver&&dragOver.bi===bi&&dragOver.fi===fi?"2px solid #4a9eff":"none"}}>
                          {fr.data
                            ? <img src={fr.data} alt="" style={{width:"100%",height:"100%",objectFit:"fill",display:"block"}}/>
                            : <div style={{width:"100%",height:"100%",background:"#fafafa"}}/>
                          }
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={()=>addBoard(boards[boards.length-1]?.tpl||"full")}
                  style={{width:48,height:48,borderRadius:10,border:`2px dashed ${c.bdr}`,background:"none",
                    color:c.txt3,fontSize:20,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",
                    justifyContent:"center",fontWeight:300,fontFamily:QF}}>+</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}

/* ══════ MOBILE ADD MENU ══════ */
function MobileAddMenu({c,onAdd,onClose}) {
  const items=[
    {icon:"◆",label:"Story Timeline",type:"stl"},
    {icon:"◇",label:"Event Timeline",type:"etl"},
    {icon:"●",label:"Event",type:"evt"},
    {icon:"■",label:"Note",type:"note"},
    {icon:"▲",label:"Asset",type:"asset"},
  ];
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:2000,
      display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:60}}>
      <div onClick={stop} style={{background:c.ctx,borderRadius:18,padding:"12px 8px",
        width:"90%",maxWidth:340,boxShadow:`0 8px 32px ${c.shd}`,fontFamily:QF}}>
        <div style={{fontSize:11,fontWeight:700,color:c.txt3,textTransform:"uppercase",letterSpacing:1,padding:"4px 12px 10px"}}>Add Node</div>
        {items.map(it=>(
          <button key={it.type} onClick={()=>{onAdd(it.type);onClose();}}
            style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 14px",
              background:"none",border:"none",borderRadius:12,color:c.txt,fontSize:14,fontWeight:600,
              fontFamily:QF,cursor:"pointer",textAlign:"left"}}
            onTouchStart={e=>e.currentTarget.style.background=c.surfH}
            onTouchEnd={e=>e.currentTarget.style.background="none"}>
            <span style={{fontSize:18,width:24,textAlign:"center"}}>{it.icon}</span>{it.label}
          </button>
        ))}
      </div>

    </div>
  );
}

/* ══════ MAIN ══════ */
export default function TimelineTool({ userId, onSignOut } = {}) {
  const mob = useIsMobile();
  const [dark,sDark] = useState(false);
  const [showAbout,sShowAbout] = useState(false);
  const [tab,sTab] = useState("webnodes");
  const [saveStatus,sSaveStatus] = useState("idle"); /* idle | saving | saved | error */

  /* Load initial state: cloud > localStorage > defaults */
  const [initData] = useState(()=>{
    try{
      const raw=localStorage.getItem("fathom-data");
      if(raw){const d=JSON.parse(raw);if(d&&d.projects)return d;}
    }catch(e){}
    return null;
  });

  const [projects,sPr] = useState(initData?.projects?.length?initData.projects:[mkP()]);
  const [aPid,sAPid] = useState(projects[0]?.id);
  const [scripts,sSc] = useState(initData?.scripts?.length?initData.scripts:[mkS()]);
  const [asId,sAsId] = useState(scripts[0]?.id);
  const [sbP,sSbP] = useState(initData?.sbP?.length?initData.sbP:[mkSBP()]);
  const [sbPid,sSbPid] = useState(sbP[0]?.id);
  const c = dark?TH.dark:TH.light;
  const fR = useRef(null);
  const [cloudLoaded,sCloudLoaded] = useState(!userId);

  useEffect(()=>{
    const l=document.createElement("link");l.href=FONT;l.rel="stylesheet";document.head.appendChild(l);
    let vm=document.querySelector('meta[name="viewport"]');
    if(!vm){vm=document.createElement("meta");vm.name="viewport";document.head.appendChild(vm);}
    vm.content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no";
    return()=>document.head.removeChild(l);
  },[]);

  /* Cloud load (only if userId is provided — deployment mode) */
  useEffect(()=>{
    if(!userId) return;
    import("./firebase").then(({db})=>{
      import("firebase/firestore").then(({doc,getDoc})=>{
        getDoc(doc(db,"users",userId)).then(snap=>{
          if(snap.exists()){
            const d=snap.data();
            if(d.projects?.length){sPr(d.projects);sAPid(d.projects[0]?.id);}
            if(d.scripts?.length){sSc(d.scripts);sAsId(d.scripts[0]?.id);}
            if(d.sbP?.length){sSbP(d.sbP);sSbPid(d.sbP[0]?.id);}
          }
          sCloudLoaded(true);
        }).catch(()=>sCloudLoaded(true));
      });
    }).catch(()=>sCloudLoaded(true));
  },[userId]);

  /* Cloud auto-save (debounced 2s) */
  useEffect(()=>{
    if(!userId||!cloudLoaded) return;
    sSaveStatus("saving");
    const timer=setTimeout(()=>{
      import("./firebase").then(({db})=>{
        import("firebase/firestore").then(({doc,setDoc})=>{
          setDoc(doc(db,"users",userId),{
            projects,scripts,sbP,updatedAt:new Date().toISOString()
          }).then(()=>sSaveStatus("saved"))
            .catch(()=>sSaveStatus("error"));
        });
      }).catch(()=>sSaveStatus("error"));
    },2000);
    return()=>clearTimeout(timer);
  },[projects,scripts,sbP,userId,cloudLoaded]);

  /* localStorage auto-save (debounced 1s, always active) */
  useEffect(()=>{
    const timer=setTimeout(()=>{
      try{
        localStorage.setItem("fathom-data",JSON.stringify({projects,scripts,sbP}));
        if(!userId) sSaveStatus("saved");
      }catch(e){if(!userId) sSaveStatus("error");}
    },1000);
    return()=>clearTimeout(timer);
  },[projects,scripts,sbP,userId]);

  /* Clear save indicator after 3 seconds */
  useEffect(()=>{
    if(saveStatus==="saved"){const t=setTimeout(()=>sSaveStatus("idle"),3000);return()=>clearTimeout(t);}
  },[saveStatus]);

  const backup = () => {
    const d={v:7,projects,scripts,sbP,at:new Date().toISOString()};
    const b=new Blob([JSON.stringify(d)],{type:"application/json"});
    const u=URL.createObjectURL(b);
    const a=document.createElement("a");a.href=u;a.download=`fathom-backup-${new Date().toISOString().split("T")[0]}.json`;a.click();URL.revokeObjectURL(u);
  };

  const restore = e => {
    const f=e.target.files?.[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const d=JSON.parse(ev.target.result);
        const err=validateBackup(d);
        if(err){alert("Backup error: "+err);return;}
        if(d.projects){sPr(d.projects);sAPid(d.projects[0]?.id);}
        if(d.scripts){sSc(d.scripts);sAsId(d.scripts[0]?.id);}
        if(d.sbP){sSbP(d.sbP);sSbPid(d.sbP[0]?.id);}
        sSaveStatus("saved");
      }catch(er){alert("Invalid backup file");}
    };
    r.readAsText(f);e.target.value="";
  };

  if(userId&&!cloudLoaded) return (
    <div style={{width:"100vw",height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:c.bg,fontFamily:"'Quicksand',sans-serif",color:c.txt}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:600,marginBottom:8}}>Loading your projects...</div>
        <div style={{fontSize:12,color:c.txt3}}>Fetching from cloud</div>
      </div>
    </div>
  );

  return (
    <div style={{width:"100vw",height:"100vh",display:"flex",flexDirection:"column",background:c.bg,fontFamily:"'Quicksand',sans-serif",color:c.txt,overflow:"hidden"}}>
      <style>{`@keyframes pulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.05)}}@keyframes edgePulse{0%,100%{opacity:.15}50%{opacity:.8}}@keyframes portSpawn{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:.6}}@keyframes nodeRipple{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.08);opacity:0}}*{box-sizing:border-box;}`}</style>
      <div role="tabpanel" aria-label={tab} style={{flex:1,display:"flex",overflow:"hidden"}}>
        {tab==="webnodes" && <ErrorBoundary><WebNodesTab c={c} dark={dark} projects={projects} setProjects={sPr} aPid={aPid} setAPid={sAPid} sbP={sbP} mob={mob}/></ErrorBoundary>}
        {tab==="scripting" && <ErrorBoundary><ScriptingTab c={c} dark={dark} scripts={scripts} setScripts={sSc} asId={asId} setAsId={sAsId} mob={mob}/></ErrorBoundary>}
        {tab==="storyboard" && <ErrorBoundary><StoryboardingTab c={c} dark={dark} sbP={sbP} setSbP={sSbP} sbPid={sbPid} setSbPid={sSbPid} mob={mob}/></ErrorBoundary>}
      </div>
      <div style={{height:mob?52:40,background:c.tBg,borderTop:BDR(c),display:"flex",alignItems:"center",justifyContent:"center",gap:mob?2:4,padding:mob?"0 6px":"0 14px",flexShrink:0}}>
        {!mob && <div style={{flex:1,display:"flex",gap:5,alignItems:"center"}}>
          <button onClick={backup} style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 10px",fontFamily:QF,fontWeight:600,fontSize:10,color:c.txt3,cursor:"pointer"}}>↓ Backup</button>
          <button onClick={()=>fR.current?.click()} style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 10px",fontFamily:QF,fontWeight:600,fontSize:10,color:c.txt3,cursor:"pointer"}}>↑ Restore</button>
          <input ref={fR} type="file" accept=".json" style={{display:"none"}} onChange={restore}/>
          {saveStatus==="saving"&&<span style={{fontSize:9,color:c.txt3,fontFamily:QF,fontWeight:500}}>Saving...</span>}
          {saveStatus==="saved"&&<span style={{fontSize:9,color:"#4caf50",fontFamily:QF,fontWeight:600}}>✓ Saved</span>}
          {saveStatus==="error"&&<span style={{fontSize:9,color:"#e53935",fontFamily:QF,fontWeight:600}}>✕ Save failed</span>}
        </div>}
        <div role="tablist" style={{display:"flex",gap:mob?2:4}}>
        {[{k:"webnodes",l:"WebNodes",i:"◈"},{k:"scripting",l:"Scripting",i:"✎"},{k:"storyboard",l:"Storyboard",i:"▦"}].map(tt => (
          <button key={tt.k} role="tab" aria-selected={tab===tt.k} aria-label={tt.l} onClick={()=>sTab(tt.k)}
            style={{padding:mob?"8px 12px":"6px 18px",borderRadius:10,border:"none",flex:mob?1:undefined,
              background:tab===tt.k?c.acc:"transparent",color:tab===tt.k?c.bg:c.tT,
              fontSize:mob?11:12,fontWeight:700,fontFamily:QF,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:mob?3:5,transition:"all 0.2s"}}>
            <span style={{fontSize:mob?16:14}}>{tt.i}</span>{mob?"":tt.l}
          </button>
        ))}
        </div>
        {!mob && <div style={{flex:1,display:"flex",justifyContent:"flex-end",gap:5}}>
          {userId&&<button onClick={()=>{
            const url=window.location.origin+"?view="+userId;
            navigator.clipboard?.writeText(url).then(()=>alert("Share link copied!\n"+url))
              .catch(()=>prompt("Copy this share link:",url));
          }} title="Copy share link"
            style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 10px",
              fontFamily:QF,fontWeight:600,fontSize:10,color:c.txt3,cursor:"pointer"}}>Share</button>}
          {onSignOut&&<button onClick={onSignOut}
            style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 10px",
              fontFamily:QF,fontWeight:600,fontSize:10,color:c.txt3,cursor:"pointer"}}>Sign Out</button>}
          <button onClick={()=>sDark(!dark)}
            style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 10px",
              fontFamily:QF,fontWeight:600,fontSize:11,color:c.txt3,cursor:"pointer"}}>
            {dark?"☀ Light":"● Dark"}
          </button>
          <button onClick={()=>sShowAbout(true)}
            style={{background:"none",border:BDR(c),borderRadius:8,padding:"4px 10px",
              fontFamily:QF,fontWeight:600,fontSize:10,color:c.txt3,cursor:"pointer"}}>About</button>
        </div>}
        {mob && <button onClick={()=>sDark(!dark)}
          style={{padding:"8px 10px",borderRadius:10,border:"none",background:"transparent",
            color:c.tT,fontSize:16,cursor:"pointer"}}>{dark?"☀":"●"}</button>}
      </div>

      {/* About Fathom */}
      {showAbout && (
        <div onClick={()=>sShowAbout(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",
          zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:QF}}>
          <div onClick={stop} style={{background:c.ctx,border:BDR(c),
            borderRadius:18,padding:"32px 36px",boxShadow:`0 12px 40px ${c.shd}`,maxWidth:440,width:"90%",
            maxHeight:"80vh",overflow:"auto"}}>
            <div style={{fontSize:22,fontWeight:700,color:c.txt,textAlign:"center",marginBottom:4}}>Fathom</div>
            <div style={{fontSize:11,color:c.txt3,textAlign:"center",marginBottom:20}}>Creative Suite for Filmmakers</div>
            <div style={{fontSize:12,fontWeight:600,color:c.txt,marginBottom:6}}>About New Iowa Digital</div>
            <div style={{fontSize:11,color:c.txt2,lineHeight:1.7,marginBottom:16}}>
              New Iowa Digital is a creative production company based in the Midwest, specializing in filmmaking, 3D art, and interactive digital experiences. Fathom is our flagship creative suite designed to help filmmakers organize stories, write screenplays, and visualize storyboards in one unified tool.
            </div>
            <div style={{fontSize:12,fontWeight:600,color:c.txt,marginBottom:6}}>AI Disclaimer</div>
            <div style={{fontSize:11,color:c.txt2,lineHeight:1.7,marginBottom:16,padding:"10px 14px",
              background:c.surf,borderRadius:10,border:BDR(c)}}>
              {"[AI Disclaimer placeholder \u2014 This section will contain New Iowa Digital\u2019s official AI usage disclosure, covering how AI technologies are used in the development and operation of Fathom, data handling practices, and any relevant terms of use. Content pending final review.]"}
            </div>
            <div style={{fontSize:10,color:c.txt3,textAlign:"center",marginBottom:16}}>
              {"Version 7.0 \u00b7 newiowafilms.com"}
            </div>
            <div style={{textAlign:"center"}}>
              <button onClick={()=>sShowAbout(false)}
                style={{padding:"8px 24px",borderRadius:10,border:BDR(c),
                  background:"transparent",color:c.txt,fontSize:12,fontWeight:600,cursor:"pointer",
                  fontFamily:QF}}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

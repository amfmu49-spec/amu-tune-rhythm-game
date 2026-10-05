/**
 * Bookmarklet Helper v14 - UUID・曲名・アーティスト・カバー画像の一括超強固抽出方式
 */
class BookmarkletHelper {
    static getBookmarkletCode() {
        const target = window.location.origin + window.location.pathname.replace(/index\.html.*$/, '') + 'index.html';

        const fn = `(async function(){
    const VER="AMU-TUNE-v2.4.0";
    function getCookie(n){let e=\`; \${document.cookie}\`.split(\`; \${n}=\`);return e.length>=2?e.pop().split(";").shift():null}
    function getToken(){return getCookie("__session")||localStorage.getItem("clerk-db-jwt")||localStorage.getItem("__session")||""}
    function cleanText(t){return(t||"").replace(/\\r/g,"").replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g,"").trim()}
    function isSectionTag(t){let s=cleanText(t);return /^\\[.*\\]$/.test(s)||/^\\(.*\\)$/.test(s)||/^\\uFF08.*\\uFF09$/.test(s)||/^【.*】$/.test(s)}
    function formatSrtTime(t){let e=Math.floor(t/3600),r=Math.floor(t%3600/60),o=Math.floor(t%60),a=Math.floor(t%1*1000);return\`\${e.toString().padStart(2,"0")}:\${r.toString().padStart(2,"0")}:\${o.toString().padStart(2,"0")},\${a.toString().padStart(3,"0")}\`}
    
    let songId=null;
    let pm=window.location.pathname.match(/\\/song\\/([a-f0-9\\-]+)/i);
    if(pm){songId=pm[1]}else{let searchParams=new URLSearchParams(window.location.search);songId=searchParams.get("song")||searchParams.get("id")}
    if(!songId){let audioEl=document.querySelector('audio[src*="suno.ai"], audio[src*="cdn1"]');if(audioEl&&audioEl.src){let m=audioEl.src.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);if(m)songId=m[1]}}
    if(!songId){let songLink=document.querySelector('a[href*="/song/"]');if(songLink){let m=songLink.getAttribute("href").match(/\\/song\\/([a-f0-9\\-]+)/i);if(m)songId=m[1]}}
    if(!songId){alert(\`[\${VER}] Sunoの曲IDを検出できませんでした。\\n曲の個別ページ (suno.com/song/...) を開いてから再実行してください。\`);return}
    
    let token=getToken(),headers=token?{Authorization:\`Bearer \${token}\`}:{};
    let audioUrl=\`https://cdn1.suno.ai/\${songId}.mp3\`,lyricsData=[];
    
    try{
        let res=await fetch(\`https://studio-api.prod.suno.com/api/gen/\${songId}/aligned_lyrics/v2/\`,{headers});
        if(res.ok){
            let json=await res.json(),raw=json.aligned_lyrics||json.data?.aligned_lyrics||[];
            if(Array.isArray(raw)&&raw.length>0){
                lyricsData=raw.map(i=>({text:cleanText(i.text||i.word||""),start_s:i.start_s||i.start||0,end_s:i.end_s||i.end||(i.start_s?i.start_s+2:2)})).filter(i=>i.text.length>0&&!isSectionTag(i.text))
            }
        }
    }catch(e){}
    if(lyricsData.length===0){
        let rawLines=document.body.innerText.split("\\n").map(cleanText).filter(l=>l.length>0&&!l.includes("Suno")&&!l.includes("Create")&&!l.includes("Library")&&!isSectionTag(l));
        if(rawLines.length>0){let step=180/Math.max(1,rawLines.length);lyricsData=rawLines.slice(0,40).map((txt,idx)=>({text:txt,start_s:idx*step,end_s:(idx+1)*step}))}
    }
    if(lyricsData.length===0){alert(\`[\${VER}] 歌詞データを取得できませんでした。Suno側で歌詞の生成が完了しているかご確認ください。\`);return}
    
    let oldOverlay=document.getElementById("suno-lrc-bm-overlay");if(oldOverlay)oldOverlay.remove();
    let overlay=document.createElement("div");overlay.id="suno-lrc-bm-overlay";
    Object.assign(overlay.style,{position:"fixed",top:"0",left:"0",width:"100vw",height:"100vh",backgroundColor:"rgba(0,0,0,0.85)",zIndex:"999999",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"system-ui, sans-serif",padding:"20px",boxSizing:"border-box"});
    let box=document.createElement("div");
    Object.assign(box.style,{background:"#18181b",padding:"24px",borderRadius:"16px",width:"100%",maxWidth:"520px",boxShadow:"0 10px 30px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",gap:"16px",border:"1px solid #27272a"});
    
    let getFormattedText=()=>{
        return lyricsData.map((l,i)=>\`\${i+1}\\n\${formatSrtTime(l.start_s)} --> \${formatSrtTime(l.end_s)}\\n\${l.text}\\n\`).join("\\n")
    };
    
    let header=document.createElement("div");header.style.display="flex";header.style.justifyContent="space-between";header.style.alignItems="center";
    let title=document.createElement("h2");title.textContent=\`🎵 AMU TUNE Export\`;Object.assign(title.style,{margin:"0",color:"#fff",fontSize:"18px"});
    header.appendChild(title);box.appendChild(header);
    
    let textarea=document.createElement("textarea");textarea.value=getFormattedText();textarea.readOnly=!0;
    Object.assign(textarea.style,{width:"100%",height:"220px",backgroundColor:"#09090b",color:"#22c55e",border:"1px solid #27272a",borderRadius:"8px",padding:"12px",boxSizing:"border-box",fontFamily:"monospace",fontSize:"12px",resize:"none"});
    box.appendChild(textarea);
    
    let btnRow=document.createElement("div");btnRow.style.display="flex";btnRow.style.gap="8px";btnRow.style.flexWrap="wrap";
    let copyBtn=document.createElement("button");copyBtn.textContent="📋 コピー";
    Object.assign(copyBtn.style,{flex:"1",minWidth:"90px",padding:"10px",background:"#3f3f46",color:"#fff",border:"none",borderRadius:"8px",fontWeight:"bold",cursor:"pointer"});
    copyBtn.onclick=async()=>{
        try{await navigator.clipboard.writeText(getFormattedText());}catch(e){
            textarea.select();document.execCommand('copy');
        }
        copyBtn.textContent="✅ コピー完了!";setTimeout(()=>copyBtn.textContent="📋 コピー",2e3)
    };
    
    let openBtn=document.createElement("button");openBtn.textContent="🎮 AMU TUNE を開く";
    Object.assign(openBtn.style,{flex:"2",minWidth:"160px",padding:"10px",background:"#16a34a",color:"#fff",border:"none",borderRadius:"8px",fontWeight:"bold",cursor:"pointer"});
    openBtn.onclick=()=>{window.open(\`https://amfmu49-spec.github.io/amu-tune-rhythm-game/\`,'_blank')};
    
    let closeBtn=document.createElement("button");closeBtn.textContent="✕ 閉じる";
    Object.assign(closeBtn.style,{padding:"10px 16px",background:"#27272a",color:"#a1a1aa",border:"none",borderRadius:"8px",cursor:"pointer"});
    closeBtn.onclick=()=>overlay.remove();
    
    btnRow.appendChild(copyBtn);btnRow.appendChild(openBtn);btnRow.appendChild(closeBtn);
    box.appendChild(btnRow);overlay.appendChild(box);document.body.appendChild(overlay)
})();`;

        // encodeURI を使ってブックマークレット化する (スペースや改行による破損を防ぐ)
        return 'javascript:' + encodeURI(fn);
    }
}

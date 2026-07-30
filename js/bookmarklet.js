(function(){
    try {
        var mp3 = "";
        // 0. Suno.com 特有の処理: ページURL、またはHTML全体から曲のUUIDを抽出して cdn1.suno.ai 直接URLを組み立てる
        if (window.location.host.indexOf("suno.com") !== -1) {
            var uuid = "";
            var urlPath = window.location.pathname;
            var uuidMatch = urlPath.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
            if (uuidMatch) {
                uuid = uuidMatch[1];
            }
            if (!uuid) {
                var htmlText = document.documentElement.innerHTML;
                var songLinkMatch = htmlText.match(/\/song\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                if (songLinkMatch) {
                    uuid = songLinkMatch[1];
                }
            }
            if (!uuid) {
                var generalUuidMatch = document.documentElement.innerHTML.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                if (generalUuidMatch) {
                    uuid = generalUuidMatch[1];
                }
            }
            if (uuid) {
                mp3 = "https://cdn1.suno.ai/" + uuid + ".mp3";
            }
        }

        // 1. オーディオ/ビデオ要素から src を取得
        var mediaEls = document.querySelectorAll("audio, source, video");
        for(var i=0; i<mediaEls.length; i++){
            var s = mediaEls[i].src || mediaEls[i].getAttribute("src");
            if(s && (s.indexOf("http")===0 || s.indexOf("blob:")===0)){
                mp3 = s;
                break;
            }
        }
        // 2. HTMLの生テキストから MP3/WAV のURLを正規表現検索
        if(!mp3){
            var htmlText = document.documentElement.innerHTML;
            var match = htmlText.match(/https?:\/\/[^"']+\.(?:mp3|wav|m4a)/i);
            if(match) mp3 = match[0];
        }
        
        // 3. 字幕(SRT) または 歌詞の抽出
        var srt = "";
        var lyricsText = "";
        var textNodes = document.querySelectorAll("textarea, pre, p, div, span, [class*='lyrics'], [class*='text']");
        for(var k=0; k<textNodes.length; k++){
            var txt = (textNodes[k].value || textNodes[k].innerText || textNodes[k].textContent || "").trim();
            if(txt.indexOf("-->") !== -1 && txt.length > 15){
                srt = txt;
                break;
            }
            if(!lyricsText && txt.length > 30 && txt.indexOf("\n") !== -1 && (textNodes[k].className && String(textNodes[k].className).indexOf("lyrics") !== -1)){
                lyricsText = txt;
            }
        }
        if(!srt && !lyricsText){
            for(var k=0; k<textNodes.length; k++){
                var txt = (textNodes[k].value || textNodes[k].innerText || textNodes[k].textContent || "").trim();
                if(txt.length > 40 && txt.indexOf("\n") !== -1 && txt.length < 1500){
                    lyricsText = txt;
                    break;
                }
            }
        }
        if(!srt && lyricsText){
            var lines = lyricsText.split("\n").filter(function(l){ return l.trim().length > 0; });
            var sec = 2.0;
            for(var l=0; l<lines.length; l++){
                var formatTime = function(s){
                    var m = Math.floor(s/60);
                    var rs = Math.floor(s%60);
                    return "00:" + (m<10?"0"+m:m) + ":" + (rs<10?"0"+rs:rs) + ",000";
                };
                srt += (l+1) + "\n" + formatTime(sec) + " --> " + formatTime(sec + 3.0) + "\n" + lines[l].trim() + "\n\n";
                sec += 3.8;
            }
        }
        
        // 4. カバー画像の抽出
        var cover = "";
        var imgs = document.querySelectorAll("img, [class*='cover'], [class*='image']");
        for(var m=0; m<imgs.length; m++){
            var imgSrc = imgs[m].src || imgs[m].getAttribute("src");
            if(!imgSrc && window.getComputedStyle){
                var bg = window.getComputedStyle(imgs[m]).backgroundImage;
                if(bg && bg.indexOf("url") !== -1){
                    var mBg = bg.match(/url\((['"]?)(.*?)\1\)/);
                    if(mBg) imgSrc = mBg[2];
                }
            }
            if(imgSrc && imgSrc.indexOf("http") === 0 && (imgSrc.indexOf("cover") !== -1 || imgSrc.indexOf("cdn") !== -1 || imgSrc.indexOf("image") !== -1)){
                cover = imgSrc;
                break;
            }
        }
        if(!cover && imgs.length > 0) {
            for(var m=0; m<imgs.length; m++){
                var imgSrc = imgs[m].src || imgs[m].getAttribute("src");
                if(imgSrc && imgSrc.indexOf("http") === 0) {
                    cover = imgSrc;
                    break;
                }
            }
        }
        
        // 5. 曲タイトルの取得
        var title = document.title || "AI Music Track";
        var h1El = document.querySelector("h1");
        if(h1El) title = h1El.innerText || h1El.textContent || title;
        title = title.replace(/\n/g, " ").trim();

        if(!mp3){
            alert("MP3音源が見つかりません。音楽を再生中、または完全に読み込みが完了してからもう一度お試しください。");
            return;
        }

        var payload = {
            mp3Url: mp3,
            srtText: srt,
            coverUrl: cover,
            title: title,
            autoPlay: true
        };
        var jsonStr = JSON.stringify(payload);
        
        // 6. リダイレクト先 (このスクリプトがロードされたオリジンを自動取得)
        var scripts = document.getElementsByTagName("script");
        var currentScriptSrc = "";
        for(var sIdx=0; sIdx<scripts.length; sIdx++){
            if(scripts[sIdx].src && scripts[sIdx].src.indexOf("bookmarklet.js") !== -1){
                currentScriptSrc = scripts[sIdx].src;
                break;
            }
        }
        var targetOrigin = "";
        if(currentScriptSrc){
            var parser = document.createElement("a");
            parser.href = currentScriptSrc;
            var pathname = parser.pathname;
            var basePathOnly = pathname.substring(0, pathname.indexOf("js/bookmarklet.js"));
            targetOrigin = parser.protocol + "//" + parser.host + basePathOnly;
        } else {
            // フォールバック
            targetOrigin = window.location.origin + "/";
        }

        location.href = targetOrigin + "index.html?v=" + Date.now() + "&amu_data=" + encodeURIComponent(jsonStr);
    } catch(e) {
        alert("Error: " + e.message);
    }
})();

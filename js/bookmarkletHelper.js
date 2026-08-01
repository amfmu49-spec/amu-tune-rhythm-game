/**
 * Bookmarklet Helper v11 - UUID・曲名・アーティスト・カバー画像の一括超強固抽出方式
 */
class BookmarkletHelper {
    static getBookmarkletCode() {
        const target = window.location.origin + window.location.pathname.replace(/index\.html.*$/, '') + 'index.html';

        const fn = `(function(){
var uuid='';
var pm=window.location.pathname.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
if(pm)uuid=pm[1];
if(!uuid){var sm=document.documentElement.innerHTML.match(/song\\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);if(sm)uuid=sm[1];}
if(!uuid){var gm=document.documentElement.innerHTML.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);if(gm)uuid=gm[1];}
if(!uuid){alert('曲IDが見つかりません。Sunoの曲ページを開いてから実行してください。');return;}

var title = (document.querySelector('meta[property="og:title"]')?.content || document.title || '').replace(/ \\| Suno$/i,'').replace(/^Suno - /i,'').trim();
var cover = (document.querySelector('meta[property="og:image"]')?.content || 'https://cdn1.suno.ai/image_' + uuid + '.png');
var artist = (document.querySelector('meta[name="author"]')?.content || '').trim();

var dest = '${target}?suno_id=' + uuid + '&song=' + encodeURIComponent(title) + '&artist=' + encodeURIComponent(artist) + '&cover=' + encodeURIComponent(cover) + '&autostart=true&t=' + Date.now();
location.href = dest;
})();`;

        return 'javascript:' + fn.replace(/\n/g, '');
    }
}

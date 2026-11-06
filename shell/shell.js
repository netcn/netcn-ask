(function(){
var d=document, r=d.documentElement, host=(location.hostname||'').replace(/^www\./,'');
var key=/^ask\./.test(host)?'ask':/^quiz\./.test(host)?'quiz':/^game\./.test(host)?'game':'nav';
/* 本地预览时按子目录判断（localhost/home|quiz|game），或 ?nc= 强制指定 */
var path=(location.pathname||'').split('/')[1]||'';
if(host==='localhost'||host==='127.0.0.1'){
  if(path==='quiz'||path==='game'||path==='ask') key=path;
  if(path==='home') key='nav';
}
var force=(location.search.match(/[?&]nc=(nav|ask|quiz|game)/)||[])[1];
if(force) key=force;
/* 各站自有的语言存储键；壳层负责与全域 cookie 对齐 */
var LKEY={game:'arcade_lang'};
var lkey=LKEY[key]||'lang';
function get(n){var m=(d.cookie||'').match('(?:^|; )'+n+'=([^;]*)');return m?decodeURIComponent(m[1]):'';}
function put(n,v){
  var dom=/(^|\.)netcn\.org$/.test(host)?'; Domain=.netcn.org':'';
  d.cookie=n+'='+encodeURIComponent(v)+'; Path=/; Max-Age=31536000; SameSite=Lax'+dom;
}
/* 1) 跨子域状态：cookie 优先，喂给页面各自的读取逻辑（主题由页面自己的脚本落地） */
var ct=get('ncn_theme'), cl=get('ncn_lang');
if(ct && ct!==localStorage.getItem('theme')) localStorage.setItem('theme',ct);
if(cl && cl!==localStorage.getItem(lkey)) localStorage.setItem(lkey,cl);

/* 2) 当前站：顶栏高亮 + 主题色 */
function paint(){
  [].slice.call(d.querySelectorAll('.nc-shell,.nc-inner,.nc-sw,.nc-foot')).forEach(function(s){s.setAttribute('data-nc',key);});
  [].slice.call(d.querySelectorAll('[data-nc-to]')).forEach(function(a){
    if(a.getAttribute('data-nc-to')===key) a.setAttribute('aria-current','page');
  });
}
if(d.readyState==='loading') d.addEventListener('DOMContentLoaded',paint); else paint();

/* 3) 页面自己的开关改完后，写回全域 cookie */
function mirror(){
  var t=r.getAttribute('data-theme')||localStorage.getItem('theme');
  var l=localStorage.getItem(lkey);
  if(t) put('ncn_theme',t);
  if(l) put('ncn_lang',l);
}
d.addEventListener('click',function(e){
  var b=e.target.closest?e.target.closest('.nc-tools button,.nc-sw button,#themeToggle,#langToggle,.lang-btn,#lang,#theme,#kids'):null;
  if(b) setTimeout(mirror,0);
},true);
addEventListener('pageshow',mirror);
})();

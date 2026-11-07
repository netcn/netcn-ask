/* ============================================================
   ask 首页 · 小朋友提问区交互
   就地显示答案，不依赖 11MB 的 index.mpack：点开立刻有内容。
   顶栏搜索 / 语言 / 主题仍由原有 ui.js + shell.js 驱动。
   ============================================================ */
(function () {
  var PICKS = window.KIDS_PICKS || [];
  var GROUPS = window.KIDS_GROUPS || [];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var T = {
    zh: {
      title: '你想知道什么？', desc: '把心里的小问题写下来，或者点一个好玩的问题，马上就能看到答案。',
      badgeA: '有', badgeB: '个真实科学问答', ph: '例如：天空为什么是蓝色的？', go: '找答案 →',
      label: '大家最爱问：', random: '🎲 随便来一题', daily: '📅 今日一题',
      reveal: '👀 看答案', hide: '🙈 收起答案', next: '🔄 换一题', more: '📖 看更多这类问题',
      how: '怎么用？', h1: '① 写下你想问的', h2: '② 或点一个好奇的问题', h3: '③ 看答案，再换一题',
      sec: '挑一个你感兴趣的话题', num: '第 ', unit: ' 题', waiting: '正在准备题目，稍等一下再试～'
    },
    en: {
      title: 'What do you want to know?', desc: 'Type a question, or tap a fun one — the answer shows up right here.',
      badgeA: '', badgeB: ' real science questions', ph: 'e.g. Why is the sky blue?', go: 'Find the answer →',
      label: 'Kids often ask:', random: '🎲 Surprise me', daily: '📅 Question of the day',
      reveal: '👀 Show the answer', hide: '🙈 Hide the answer', next: '🔄 Another one', more: '📖 More like this',
      how: 'How to use', h1: '① Type your question', h2: '② Or tap one you like', h3: '③ Read, then try another',
      sec: 'Pick a topic you like', num: 'No. ', unit: '', waiting: 'Still loading questions, try again in a moment.'
    }
  };
  var lang = (localStorage.getItem('lang') === 'en') ? 'en' : 'zh';
  var cur = null, count = 0;

  function groupOf(topic) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].key === topic) return GROUPS[i];
    return { icon: '🔎', name: '科学', en: 'Science', key: topic };
  }
  function byId(id) {
    for (var i = 0; i < PICKS.length; i++) if (PICKS[i].id === id) return PICKS[i];
    return null;
  }
  function randomPick() {
    if (!PICKS.length) return null;
    if (PICKS.length === 1) return PICKS[0];
    var p = null, guard = 0;
    do { p = PICKS[Math.floor(Math.random() * PICKS.length)]; guard++; }
    while (cur && p.id === cur.id && guard < 12);
    return p;
  }
  function dailyPick() {
    if (!PICKS.length) return null;
    var d = new Date(), key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return PICKS[key % PICKS.length];
  }

  /* ---------- 渲染 ---------- */
  function renderSamples() {
    var box = $('kidsSamples');
    if (!box) return;
    // 按「生活化」评分挑 6 条最贴近孩子日常的，尽量来自不同主题
    var pool = PICKS.slice().sort(function (a, b) { return (a.fun || 99) - (b.fun || 99); });
    var seen = {}, list = [];
    for (var i = 0; i < pool.length && list.length < 6; i++) {
      var g = pool[i].topic;
      if (seen[g]) continue;
      seen[g] = 1; list.push(pool[i]);
    }
    box.innerHTML = list.map(function (p) {
      return '<button class="kids-chip" type="button" data-pick="' + esc(p.id) + '">' + esc(p.q) + '</button>';
    }).join('');
  }
  function renderTopics() {
    var box = $('kidsTopics');
    if (!box) return;
    box.innerHTML = GROUPS.map(function (g) {
      var items = PICKS.filter(function (p) { return p.topic === g.key; })
        .sort(function (a, b) { return (a.fun || 99) - (b.fun || 99); })
        .slice(0, 3);
      return '<div class="kids-topic"><h4><span>' + g.icon + '</span>' + esc(g.name) + '</h4>' +
        items.map(function (p) {
          return '<a href="#" data-pick="' + esc(p.id) + '">' + esc(p.q) + '</a>';
        }).join('') + '</div>';
    }).join('');
  }

  /* ---------- 就地答案卡 ---------- */
  function show(p, label) {
    if (!p) return;
    cur = p;
    count++;
    var g = groupOf(p.topic);
    var card = $('kidsCard');
    $('kidsTag').textContent = g.icon + ' ' + g.name;
    $('kidsNum').textContent = (label || (T[lang].num + count + T[lang].unit));
    $('kidsQText').textContent = p.q;
    $('kidsAnswer').textContent = p.a;
    $('kidsAnswer').hidden = true;
    $('kidsReveal').textContent = T[lang].reveal;
    $('kidsReveal').hidden = false;
    $('kidsMore').href = '/cat/' + encodeURIComponent(p.cat) + '.html';
    card.hidden = false;
    // 关键：把答案卡滚到视口内，避免内容出现在页面底部没人看见
    if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function toggleAnswer() {
    var a = $('kidsAnswer'), btn = $('kidsReveal');
    if (!a || !btn) return;
    a.hidden = !a.hidden;
    btn.textContent = a.hidden ? T[lang].reveal : T[lang].hide;
  }

  /* ---------- 提问：先本地精选，没命中再交给全站搜索 ---------- */
  function submitAsk(v) {
    v = (v || '').trim();
    if (!v) return;
    var hit = null;
    for (var i = 0; i < PICKS.length; i++) {
      var q = PICKS[i].q;
      if (q.indexOf(v) >= 0 || (v.length >= 4 && q.indexOf(v.slice(0, 6)) >= 0)) { hit = PICKS[i]; break; }
    }
    if (hit) { show(hit, T[lang].num + count + T[lang].unit); return; }
    var top = $('q');
    if (top) {
      top.value = v;
      top.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(function () {
        var r = $('results');
        if (r && r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 420);
    } else {
      location.href = '/?q=' + encodeURIComponent(v);
    }
  }

  /* ---------- 界面文案随中英切换 ---------- */
  function applyLang(l) {
    lang = (l === 'en') ? 'en' : 'zh';
    var t = T[lang], map = {
      title: 'kidsTitle', desc: 'kidsDesc', go: 'kidsGo', label: 'kidsLabel',
      random: 'kidsRandom', daily: 'kidsDaily', next: 'kidsNext', more: 'kidsMore',
      how: 'kidsHowB', h1: 'kidsH1', h2: 'kidsH2', h3: 'kidsH3', sec: 'kidsSec'
    };
    Object.keys(map).forEach(function (k) {
      var el = $(map[k]); if (el) el.textContent = t[k];
    });
    var q = $('kidsQ'); if (q) q.placeholder = t.ph;
    var bA = document.querySelector('[data-kt="badgeA"]');
    var bB = document.querySelector('[data-kt="badgeB"]');
    if (bA) bA.textContent = t.badgeA;
    if (bB) bB.textContent = t.badgeB;
    var reveal = $('kidsReveal');
    if (reveal && !reveal.hidden) reveal.textContent = $('kidsAnswer').hidden ? t.reveal : t.hide;
    if (cur) {
      var num = $('kidsNum');
      if (num && num.textContent.indexOf(T.zh.num) === 0) num.textContent = t.num + count + t.unit;
    }
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    var form = $('kidsAsk');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault(); submitAsk($('kidsQ') ? $('kidsQ').value : '');
    });
    var qEl = $('kidsQ');
    if (qEl) qEl.addEventListener('keydown', function (e) {
      // 顶栏的 "/" 聚焦快捷键不要抢走小朋友正在输入的问题
      if (e.key === '/') e.stopPropagation();
    });
    var box = $('kidsHome');
    if (box) box.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-pick]') : null;
      if (!el) return;
      e.preventDefault();
      var p = byId(el.getAttribute('data-pick'));
      if (p) show(p);
    });
    var r = $('kidsRandom'); if (r) r.addEventListener('click', function () { show(randomPick()); });
    var d = $('kidsDaily'); if (d) d.addEventListener('click', function () { show(dailyPick(), T[lang].daily); });
    var rev = $('kidsReveal'); if (rev) rev.addEventListener('click', toggleAnswer);
    var nx = $('kidsNext'); if (nx) nx.addEventListener('click', function () { show(randomPick()); });
    document.addEventListener('ncn:lang', function (e) { applyLang(e.detail && e.detail.lang); });
  }

  renderSamples();
  renderTopics();
  applyLang(lang);
  bind();
})();

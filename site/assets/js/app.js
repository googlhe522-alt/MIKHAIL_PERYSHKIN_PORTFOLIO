/* Две коллекции, выключенные по ширине ряды, листалка с зумом.
   Данные приходят из assets/js/photos.js как window.PHOTOS. */
(function () {
  'use strict';

  var ALL = window.PHOTOS || [];
  if (!ALL.length) return;

  var COLLS = {
    bw: { slug: 'bw', label: 'Чёрно-белое', tag: 'ЧБ' },
    color: { slug: 'color', label: 'Цвет', tag: 'Ц' }
  };

  var by = { bw: [], color: [] };
  ALL.forEach(function (p) { if (by[p.collection]) by[p.collection].push(p); });

  var $ = function (s) { return document.querySelector(s); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };

  /* Русское склонение: 1 кадр, 2 кадра, 5 кадров. */
  function frames(n) {
    var d = n % 10, h = n % 100;
    var word = (d === 1 && h !== 11) ? 'кадр'
      : (d >= 2 && d <= 4 && (h < 12 || h > 14)) ? 'кадра'
      : 'кадров';
    return n + ' ' + word;
  }
  var ratio = function (p) { return p.w / p.h; };

  /* Ритм рядов: сколько кадров ставить в строку. Единица — кадр во всю
     ширину, тройка — плотная строка. Массив зацикливается. */
  var RHYTHM = [1, 2, 3, 2, 1, 3, 2, 2, 3, 2, 1, 3];

  /* Запасной JPEG для браузеров без WebP. Через onerror, а не <picture>:
     srcset подменяется из JS, и <source> пришлось бы двигать отдельно. */
  function fallback(img, fb) {
    img.onerror = function () {
      if (img.dataset.fellBack) return;
      img.dataset.fellBack = '1';
      img.removeAttribute('srcset');
      img.src = fb;
    };
  }

  var countOf = function (k) { return k === 'all' ? ALL.length : by[k].length; };
  document.querySelectorAll('[data-count]').forEach(function (el) {
    el.textContent = countOf(el.getAttribute('data-count'));
  });
  document.querySelectorAll('[data-frames]').forEach(function (el) {
    el.textContent = frames(countOf(el.getAttribute('data-frames')));
  });

  /* --- лента ------------------------------------------------------- */
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
  }

  function buildReel(slug) {
    var reel = $('[data-reel="' + slug + '"]');
    var list = by[slug];
    var i = 0, r = 0;

    while (i < list.length) {
      var n = Math.min(RHYTHM[r % RHYTHM.length], list.length - i);
      var chunk = list.slice(i, i + n);
      var row = document.createElement('div');
      row.className = 'row';
      // Сумма соотношений задаёт высоту ряда, а значит и его max-width.
      var sum = chunk.reduce(function (a, p) { return a + ratio(p); }, 0);
      row.style.setProperty('--sumar', sum.toFixed(4));
      row.style.setProperty('--n', n);

      chunk.forEach(function (p, k) {
        var idx = i + k;
        var fig = document.createElement('figure');
        fig.className = 'shot';
        fig.style.setProperty('--ar', ratio(p).toFixed(4));

        var btn = document.createElement('button');
        btn.className = 'shot__btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Открыть кадр ' + pad(p.n) + ', ' + COLLS[slug].label);

        var img = new Image();
        img.srcset = p.srcset;
        // Доля ряда, которую займёт кадр: по ней браузер берёт нужную ступень.
        // Без этого он считает по 100vw и тянет лишнее, либо мажет апскейлом.
        img.sizes = '(max-width:620px) 92vw, ' + Math.round(ratio(p) / sum * 90) + 'vw';
        img.src = p.fb;
        img.alt = '';
        img.loading = idx < 4 ? 'eager' : 'lazy';
        img.decoding = 'async';
        img.width = p.w; img.height = p.h;
        fallback(img, p.fb);

        var no = document.createElement('figcaption');
        no.className = 'shot__no';
        no.innerHTML = '<span>' + COLLS[slug].tag + ' ' + pad(p.n) + '</span>';

        btn.appendChild(img);
        fig.appendChild(btn);
        fig.appendChild(no);
        btn.addEventListener('click', function () { open(slug, idx); });
        row.appendChild(fig);

        if (io) io.observe(fig); else fig.classList.add('is-in');
      });

      reel.appendChild(row);
      i += n; r += 1;
    }
  }

  buildReel('bw');
  buildReel('color');

  /* ================= шапка: где мы и сколько прошли ================= */
  var bar = $('[data-bar]');
  var progress = $('[data-progress]');
  var navBtns = [].slice.call(document.querySelectorAll('[data-jump]'));

  /* Границы секций кешируем: иначе каждый скролл дёргает layout.
     Высоты кадров зарезервированы атрибутами width/height, поэтому
     до загрузки картинок они уже верные. */
  var bounds = [], docH = 0;
  function measure() {
    bounds = ['bw', 'color', 'about'].map(function (id) {
      var el = document.getElementById(id);
      return { id: id, top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight };
    });
    docH = document.documentElement.scrollHeight - innerHeight;
  }

  function onScroll() {
    progress.style.transform =
      'scaleX(' + (docH > 0 ? Math.min(1, Math.max(0, scrollY / docH)) : 0) + ')';
    bar.classList.toggle('is-up', scrollY > innerHeight * 0.7);

    // Активная коллекция — та, что сейчас пересекает середину экрана.
    var mid = scrollY + innerHeight / 2;
    var active = '';
    bounds.forEach(function (b) { if (mid >= b.top && mid < b.bottom) active = b.id; });
    bar.classList.toggle('is-paper', active === 'color' || active === 'about');
    navBtns.forEach(function (b) {
      b.setAttribute('aria-current', String(b.getAttribute('data-jump') === active));
    });
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', function () { measure(); onScroll(); });
  addEventListener('load', function () { measure(); onScroll(); });
  // Высота страницы меняется, пока догружаются кадры и шрифты, — один замер
  // на старте даёт и неверный прогресс, и неверную активную коллекцию.
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { measure(); onScroll(); }).observe(document.body);
  }
  measure();
  onScroll();

  /* ======================= листалка ================================ */
  var viewer = $('[data-viewer]');
  var vimg = $('[data-vimg]');
  var vframe = $('[data-vframe]');
  var vid = $('[data-vid]');
  var vcoll = $('[data-vcoll]');
  var vcount = $('[data-vcount]');
  var vstrip = $('[data-vstrip]');
  var vcopy = $('[data-copy]');
  var vzoom = $('[data-zoom]');

  var state = { coll: 'bw', index: 0 };
  var lastFocus = null;
  var isOpen = function () { return !viewer.hidden; };
  var current = function () { return by[state.coll]; };

  /* --- зум и панорамирование --------------------------------------
     Плёнку смотрят по зерну, поэтому 1:1 здесь не украшение.        */
  var zoom = { on: false, x: 0, y: 0, dragging: false, sx: 0, sy: 0 };

  function applyZoom() {
    viewer.classList.toggle('is-zoomed', zoom.on);
    vimg.style.transform = zoom.on
      ? 'scale(2) translate(' + zoom.x + 'px,' + zoom.y + 'px)'
      : '';
    vzoom.textContent = zoom.on ? 'Вписать' : '1:1';
    vzoom.setAttribute('aria-pressed', String(zoom.on));
  }

  function setZoom(on, originEvent) {
    zoom.on = on;
    if (!on) { zoom.x = 0; zoom.y = 0; }
    else if (originEvent) {
      // Тянем к точке, по которой кликнули, а не к центру кадра.
      var r = vimg.getBoundingClientRect();
      zoom.x = (r.left + r.width / 2 - originEvent.clientX) / 2;
      zoom.y = (r.top + r.height / 2 - originEvent.clientY) / 2;
      clampPan();
    }
    applyZoom();
  }

  function clampPan() {
    var r = vframe.getBoundingClientRect();
    var mx = r.width / 4, my = r.height / 4;
    zoom.x = Math.max(-mx, Math.min(mx, zoom.x));
    zoom.y = Math.max(-my, Math.min(my, zoom.y));
  }

  vimg.addEventListener('click', function (e) { setZoom(!zoom.on, e); });
  vzoom.addEventListener('click', function () { setZoom(!zoom.on); });

  vimg.addEventListener('pointerdown', function (e) {
    if (!zoom.on) return;
    zoom.dragging = true; zoom.sx = e.clientX; zoom.sy = e.clientY;
    vimg.setPointerCapture(e.pointerId);
  });
  vimg.addEventListener('pointermove', function (e) {
    if (!zoom.dragging) return;
    zoom.x += (e.clientX - zoom.sx) / 2;
    zoom.y += (e.clientY - zoom.sy) / 2;
    zoom.sx = e.clientX; zoom.sy = e.clientY;
    clampPan(); applyZoom();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    vimg.addEventListener(ev, function () { zoom.dragging = false; });
  });

  function preload(i) {
    var list = current();
    [i - 1, i + 1].forEach(function (n) {
      if (n >= 0 && n < list.length) {
        var im = new Image(); im.sizes = '100vw'; im.srcset = list[n].srcset;
      }
    });
  }

  function buildStrip() {
    vstrip.textContent = '';
    current().forEach(function (p, i) {
      var b = document.createElement('button');
      b.className = 'vstrip__btn';
      b.type = 'button';
      b.setAttribute('aria-label', 'Кадр ' + pad(p.n));
      var im = new Image();
      im.src = p.srcset.split(' ')[0];
      im.alt = ''; im.loading = 'lazy';
      b.appendChild(im);
      b.addEventListener('click', function () { state.index = i; render(); });
      vstrip.appendChild(b);
    });
  }

  function markStrip() {
    var btns = vstrip.children;
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-current', String(i === state.index));
    }
    var act = btns[state.index];
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function render() {
    var list = current();
    var p = list[state.index];

    setZoom(false);
    viewer.classList.add('is-swapping');
    delete vimg.dataset.fellBack;
    fallback(vimg, p.fb);
    vimg.width = p.w; vimg.height = p.h;
    vimg.sizes = '100vw';
    vimg.srcset = p.srcset;
    vimg.src = p.fb;
    vimg.alt = COLLS[state.coll].label + ', кадр ' + pad(p.n);

    var done = function () { viewer.classList.remove('is-swapping'); };
    if (vimg.complete) done();
    else { vimg.onload = done; vimg.addEventListener('error', done, { once: true }); }

    vid.textContent = COLLS[state.coll].tag + ' ' + pad(p.n);
    vcoll.textContent = COLLS[state.coll].label;
    vcount.textContent = pad(state.index + 1) + ' / ' + pad(list.length);
    markStrip();
    preload(state.index);

    var hash = '#' + state.coll + '/' + pad(p.n);
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function open(coll, i) {
    lastFocus = document.activeElement;
    var changed = coll !== state.coll || !vstrip.children.length;
    state.coll = coll;
    state.index = i;
    viewer.hidden = false;
    document.documentElement.classList.add('is-locked');
    if (changed) buildStrip();
    render();
    $('[data-close]').focus();
  }

  function close() {
    setZoom(false);
    viewer.hidden = true;
    document.documentElement.classList.remove('is-locked');
    history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function step(d) {
    var list = current();
    state.index = (state.index + d + list.length) % list.length;
    render();
  }

  $('[data-prev]').addEventListener('click', function () { step(-1); });
  $('[data-next]').addEventListener('click', function () { step(1); });
  $('[data-close]').addEventListener('click', close);

  vcopy.addEventListener('click', function () {
    var url = location.origin + location.pathname + '#' + state.coll +
      '/' + pad(current()[state.index].n);
    var say = function (t) {
      vcopy.textContent = t;
      setTimeout(function () { vcopy.textContent = 'Скопировать ссылку'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { say('Скопировано'); },
        function () { say('Нажми ⌘C'); });
    } else { say('Нажми ⌘C'); }
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { zoom.on ? setZoom(false) : close(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.key === 'z' || e.key === 'Z') { setZoom(!zoom.on); e.preventDefault(); }
    else if (e.key === 'Tab') {
      // Фокус не должен убегать на страницу под модалкой.
      var f = viewer.querySelectorAll('button');
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  var tx = 0, ty = 0;
  viewer.addEventListener('touchstart', function (e) {
    tx = e.changedTouches[0].clientX; ty = e.changedTouches[0].clientY;
  }, { passive: true });
  viewer.addEventListener('touchend', function (e) {
    if (zoom.on) return;                 // в зуме палец панорамирует, а не листает
    var dx = e.changedTouches[0].clientX - tx;
    var dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* --- ссылка на кадр, битый хэш молча игнорируем ------------------- */
  function fromHash() {
    var m = /^#(bw|color)\/(\d{1,3})$/.exec(location.hash || '');
    if (!m) return null;
    var list = by[m[1]];
    var i = Number(m[2]) - 1;
    if (i < 0 || i >= list.length) return null;
    return { coll: m[1], index: i };
  }

  addEventListener('hashchange', function () {
    var h = fromHash();
    if (!h) { if (isOpen()) close(); return; }
    if (!isOpen() || h.coll !== state.coll) open(h.coll, h.index);
    else { state.index = h.index; render(); }
  });

  var start = fromHash();
  if (start) open(start.coll, start.index);
})();

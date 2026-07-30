/* ============================================================
   DOUBLE CUTS — логика страницы
   ============================================================ */
(function () {
  'use strict';

  var HEADER_H = function () { return window.innerWidth <= 1080 ? 66 : 84; };

  /* ---------------- Год в подвале ---------------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- Шапка: фон при скролле ---------------- */
  var header = document.getElementById('header');
  function onScrollHeader() {
    header.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  onScrollHeader();
  window.addEventListener('scroll', onScrollHeader, { passive: true });

  /* ---------------- Бургер-меню ---------------- */
  var burger = document.getElementById('burger');
  var mobileMenu = document.getElementById('mobile-menu');

  function openMobileMenu() {
    mobileMenu.hidden = false;
    requestAnimationFrame(function () { mobileMenu.classList.add('is-open'); });
    burger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
  }
  function closeMobileMenu() {
    mobileMenu.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
    setTimeout(function () { mobileMenu.hidden = true; }, 320);
  }
  burger.addEventListener('click', function () {
    burger.getAttribute('aria-expanded') === 'true' ? closeMobileMenu() : openMobileMenu();
  });
  mobileMenu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMobileMenu);
  });

  /* ---------------- Плавный скролл по якорям ---------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.scrollY - HEADER_H() + 1;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  /* ---------------- Активный пункт меню ---------------- */
  var navLinks = document.querySelectorAll('.nav__link');
  var sections = [];
  navLinks.forEach(function (link) {
    var sec = document.getElementById(link.getAttribute('href').slice(1));
    if (sec) sections.push({ link: link, sec: sec });
  });

  function updateActiveNav() {
    var pos = window.scrollY + HEADER_H() + 60;
    var current = sections[0];
    sections.forEach(function (item) {
      if (item.sec.offsetTop <= pos) current = item;
    });
    navLinks.forEach(function (l) { l.classList.remove('is-active'); });
    if (current) current.link.classList.add('is-active');
  }
  updateActiveNav();
  window.addEventListener('scroll', updateActiveNav, { passive: true });

  /* ---------------- Табы прайса ---------------- */
  var priceTabs = document.querySelectorAll('.price-tab');
  var pricePanels = document.querySelectorAll('[data-price-panel]');

  priceTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.dataset.priceTab;
      priceTabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      pricePanels.forEach(function (p) {
        p.hidden = p.dataset.pricePanel !== name;
      });
    });
  });

  /* ---------------- Галерея: стрелки ---------------- */
  var galGrid = document.getElementById('gallery-grid');
  function galStep() {
    var first = galGrid.querySelector('.shot');
    return first ? first.getBoundingClientRect().width + 16 : 316;
  }
  document.getElementById('gal-prev').addEventListener('click', function () {
    galGrid.scrollBy({ left: -galStep() * 2, behavior: 'smooth' });
  });
  document.getElementById('gal-next').addEventListener('click', function () {
    galGrid.scrollBy({ left: galStep() * 2, behavior: 'smooth' });
  });

  /* ---------------- Лайтбокс ---------------- */
  var shots = Array.prototype.slice.call(document.querySelectorAll('.shot'));
  var lightbox = document.getElementById('lightbox');
  var lbImg = document.getElementById('lb-img');
  var lbCounter = document.getElementById('lb-counter');
  var lbIndex = 0;

  function renderLightbox() {
    var img = shots[lbIndex].querySelector('img');
    lbImg.src = img.src;
    lbImg.alt = img.alt;
    lbCounter.textContent = (lbIndex + 1) + ' / ' + shots.length;
  }
  function openLightbox(i) {
    lbIndex = i;
    renderLightbox();
    lightbox.hidden = false;
    document.body.classList.add('no-scroll');
  }
  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('no-scroll');
  }
  function lbNext() { lbIndex = (lbIndex + 1) % shots.length; renderLightbox(); }
  function lbPrev() { lbIndex = (lbIndex - 1 + shots.length) % shots.length; renderLightbox(); }

  shots.forEach(function (shot, i) {
    shot.addEventListener('click', function () { openLightbox(i); });
  });
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  document.getElementById('lb-next').addEventListener('click', lbNext);
  document.getElementById('lb-prev').addEventListener('click', lbPrev);
  lightbox.addEventListener('click', function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  /* Свайп по лайтбоксу */
  var lbTouchX = null;
  lightbox.addEventListener('touchstart', function (e) { lbTouchX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', function (e) {
    if (lbTouchX === null) return;
    var diff = e.changedTouches[0].clientX - lbTouchX;
    if (Math.abs(diff) > 40) { diff < 0 ? lbNext() : lbPrev(); }
    lbTouchX = null;
  }, { passive: true });

  /* ---------------- Карусель отзывов ---------------- */
  var track = document.getElementById('reviews-track');
  var reviews = Array.prototype.slice.call(document.querySelectorAll('.review'));
  var dotsWrap = document.getElementById('reviews-dots');
  var reviewIndex = 0;
  var reviewsTimer = null;

  reviews.forEach(function (_, i) {
    var dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Отзыв ' + (i + 1));
    if (i === 0) dot.classList.add('is-active');
    dot.addEventListener('click', function () { goToReview(i); restartReviews(); });
    dotsWrap.appendChild(dot);
  });
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function goToReview(i) {
    reviewIndex = i;
    track.style.transform = 'translateX(-' + i * 100 + '%)';
    dots.forEach(function (d, idx) { d.classList.toggle('is-active', idx === i); });
  }
  function restartReviews() {
    clearInterval(reviewsTimer);
    reviewsTimer = setInterval(function () {
      goToReview((reviewIndex + 1) % reviews.length);
    }, 7000);
  }
  restartReviews();

  var slider = document.getElementById('reviews-slider');
  var revTouchX = null;
  slider.addEventListener('touchstart', function (e) { revTouchX = e.touches[0].clientX; }, { passive: true });
  slider.addEventListener('touchend', function (e) {
    if (revTouchX === null) return;
    var diff = e.changedTouches[0].clientX - revTouchX;
    if (Math.abs(diff) > 40) {
      goToReview(diff < 0
        ? (reviewIndex + 1) % reviews.length
        : (reviewIndex - 1 + reviews.length) % reviews.length);
      restartReviews();
    }
    revTouchX = null;
  }, { passive: true });

  /* ---------------- Карта: подгружаем, когда доскроллили ---------------- */
  var mapFrame = document.querySelector('.map iframe');
  if (mapFrame && 'IntersectionObserver' in window) {
    var mapObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          mapFrame.src = mapFrame.dataset.src;
          mapObserver.disconnect();
        }
      });
    }, { rootMargin: '300px' });
    mapObserver.observe(mapFrame);
  } else if (mapFrame) {
    mapFrame.src = mapFrame.dataset.src;
  }

  /* ---------------- Нижняя панель: скрыта, пока видны кнопки в hero ---------------- */
  var bottombar = document.querySelector('.bottombar');
  var heroActions = document.querySelector('.hero__actions');
  if (bottombar && heroActions && 'IntersectionObserver' in window) {
    var bottombarObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        bottombar.classList.toggle('is-visible', !entry.isIntersecting);
      });
    });
    bottombarObserver.observe(heroActions);
  } else if (bottombar) {
    bottombar.classList.add('is-visible');
  }

  /* ---------------- Нижняя панель: «Записаться» прячем, пока на экране карточка барбера со своей кнопкой ---------------- */
  var bottombarBookBtn = bottombar ? bottombar.querySelector('.js-booking') : null;
  var masterBookButtons = document.querySelectorAll('.master .js-booking');
  if (bottombarBookBtn && masterBookButtons.length && 'IntersectionObserver' in window) {
    var visibleMasterBtns = new Set();
    var masterBtnObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visibleMasterBtns.add(entry.target);
        else visibleMasterBtns.delete(entry.target);
      });
      bottombarBookBtn.hidden = visibleMasterBtns.size > 0;
    });
    masterBookButtons.forEach(function (btn) { masterBtnObserver.observe(btn); });
  }

  /* ---------------- Сертификаты: сначала один, остальные — по кнопке ---------------- */
  var certMoreBtn = document.getElementById('certMore');
  var certCards = document.querySelectorAll('.cert-card');
  if (certMoreBtn && certCards.length > 1) {
    certCards.forEach(function (card, i) { if (i > 0) card.hidden = true; });
    certMoreBtn.addEventListener('click', function () {
      certCards.forEach(function (card) { card.hidden = false; });
      certMoreBtn.hidden = true;
    });
  } else if (certMoreBtn) {
    certMoreBtn.hidden = true;
  }

  /* Платёжного шлюза на сайте нет — «Купить» открывает Telegram с готовым
     текстом заявки, администратор оформит сертификат и пришлёт реквизиты
     для оплаты. Ссылка берётся из booking-data.js (грузится после этого
     файла), поэтому читаем window.DOUBLECUTS только в момент клика. */
  document.querySelectorAll('.cert-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var amount = Number(btn.dataset.amount) || 0;
      var telegram = (window.DOUBLECUTS && window.DOUBLECUTS.contacts && window.DOUBLECUTS.contacts.telegram) || 'https://t.me/doublecuts';
      var text = 'Здравствуйте! Хочу купить подарочный сертификат Double Cuts на ' + amount.toLocaleString('ru-RU') + ' ₽. Как оформить?';
      window.open(telegram + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  });

  /* ---------------- Запись: закрываем бургер-меню, когда открывается визард ----------------
     Сама запись (мастер, услуги, календарь занятости) — отдельный модуль,
     см. booking-data.js и booking.js. Здесь только гасим мобильное меню,
     чтобы блокировка скролла страницы досталась модалке записи, а не бургеру. */
  document.addEventListener('click', function (e) {
    if (e.target.closest('.js-booking') && !mobileMenu.hidden) closeMobileMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!lightbox.hidden) { closeLightbox(); return; }
    if (!mobileMenu.hidden) closeMobileMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) return;
    if (e.key === 'ArrowRight') lbNext();
    if (e.key === 'ArrowLeft') lbPrev();
  });

})();

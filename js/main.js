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

  /* ---------------- Прайс: длинные списки сворачиваем по умолчанию ---------------- */
  var PRICE_COLLAPSE_LIMIT = 4;

  function pluralizeRu(n, one, few, many) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  pricePanels.forEach(function (list) {
    var rows = Array.prototype.slice.call(list.querySelectorAll('.price-row'));
    if (rows.length <= PRICE_COLLAPSE_LIMIT) return;

    var hiddenRows = rows.slice(PRICE_COLLAPSE_LIMIT);
    hiddenRows.forEach(function (r) { r.classList.add('price-row--collapsed'); });

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'price-list__toggle';
    toggle.setAttribute('aria-expanded', 'false');

    function renderLabel(expanded) {
      var n = hiddenRows.length;
      toggle.textContent = expanded
        ? 'Свернуть список'
        : 'Показать ещё ' + n + ' ' + pluralizeRu(n, 'услугу', 'услуги', 'услуг');
    }
    renderLabel(false);

    toggle.addEventListener('click', function () {
      var expand = toggle.getAttribute('aria-expanded') !== 'true';
      hiddenRows.forEach(function (r) { r.classList.toggle('price-row--collapsed', !expand); });
      toggle.setAttribute('aria-expanded', String(expand));
      renderLabel(expand);
      if (!expand) list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    list.appendChild(toggle);
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

  /* ============================================================
     МОДАЛКА ЗАПИСИ
     ============================================================ */

  var modal = document.getElementById('booking');
  var formStep = document.getElementById('booking-form-step');
  var doneStep = document.getElementById('booking-done');
  var form = document.getElementById('booking-form');
  var bookingIframe = document.getElementById('booking-iframe');
  var fallbackLink = document.getElementById('booking-fallback-link');
  var masterLabel = document.getElementById('booking-master');
  var modalTabs = document.querySelectorAll('.modal__tab');
  var modalPanels = document.querySelectorAll('.modal__panel');

  var DEFAULT_BOOKING_URL = bookingIframe.dataset.src;
  var currentBookingUrl = DEFAULT_BOOKING_URL;

  /* Грузим виджет YClients только когда он реально нужен —
     чтобы не тянуть стороннюю страницу при каждой загрузке сайта. */
  function loadWidget(url) {
    if (bookingIframe.getAttribute('src') !== url) {
      bookingIframe.setAttribute('src', url);
    }
    fallbackLink.href = url;
  }

  function showBookingTab(name) {
    modalTabs.forEach(function (t) {
      var active = t.dataset.tab === name;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    modalPanels.forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    if (name === 'schedule') loadWidget(currentBookingUrl);
  }

  modalTabs.forEach(function (t) {
    t.addEventListener('click', function () { showBookingTab(t.dataset.tab); });
  });

  var lastFocused = null;

  /* ---------------- Выбор мастера с фото ---------------- */
  var masterPicker = document.getElementById('master-picker');
  var masterToggle = document.getElementById('master-picker-toggle');
  var masterList = document.getElementById('master-picker-list');
  var masterValueEl = document.getElementById('master-picker-value');
  var masterAvatarEl = document.getElementById('master-picker-avatar');
  var masterInput = document.getElementById('f-master');
  var masterOptions = Array.prototype.slice.call(masterList.querySelectorAll('li'));
  var masterDefaultOption = masterOptions[0];

  function openMasterList() {
    masterList.hidden = false;
    masterPicker.classList.add('is-open');
    masterToggle.setAttribute('aria-expanded', 'true');
  }
  function closeMasterList() {
    masterList.hidden = true;
    masterPicker.classList.remove('is-open');
    masterToggle.setAttribute('aria-expanded', 'false');
  }
  function selectMasterOption(li) {
    masterOptions.forEach(function (o) { o.setAttribute('aria-selected', String(o === li)); });
    var liAvatar = li.querySelector('.master-picker__avatar');
    masterInput.value = li.dataset.value;
    masterValueEl.textContent = li.dataset.value;
    masterAvatarEl.innerHTML = liAvatar.innerHTML;
    masterAvatarEl.classList.toggle('master-picker__avatar--any', liAvatar.classList.contains('master-picker__avatar--any'));
  }

  masterToggle.addEventListener('click', function () {
    masterList.hidden ? openMasterList() : closeMasterList();
  });

  masterOptions.forEach(function (li, i) {
    li.tabIndex = -1;
    li.addEventListener('click', function () {
      selectMasterOption(li);
      closeMasterList();
      masterToggle.focus();
    });
    li.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); (masterOptions[i + 1] || masterOptions[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (masterOptions[i - 1] || masterOptions[masterOptions.length - 1]).focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
      else if (e.key === 'Tab') { closeMasterList(); }
    });
  });

  document.addEventListener('click', function (e) {
    if (!masterList.hidden && !masterPicker.contains(e.target)) closeMasterList();
  });

  /* Сброс формы возвращает скрытый input к значению по умолчанию,
     но не трогает наш кастомный список — синхронизируем вручную. */
  form.addEventListener('reset', function () {
    selectMasterOption(masterDefaultOption);
  });

  function openBooking(opts) {
    opts = opts || {};
    lastFocused = document.activeElement;

    currentBookingUrl = opts.url || DEFAULT_BOOKING_URL;

    if (opts.master) {
      masterLabel.textContent = 'Мастер: ' + opts.master;
      masterLabel.hidden = false;
      var shortName = opts.master.split(',')[0].trim();
      var matched = masterOptions.filter(function (o) { return o.dataset.value.indexOf(shortName) === 0; })[0];
      if (matched) selectMasterOption(matched);
    } else {
      masterLabel.hidden = true;
    }

    if (opts.service) {
      var serviceSelect = document.getElementById('f-service');
      Array.prototype.forEach.call(serviceSelect.options, function (o) {
        if (o.textContent === opts.service) serviceSelect.value = o.value;
      });
    }

    formStep.hidden = false;
    doneStep.hidden = true;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    showBookingTab('schedule');
  }

  function closeBooking() {
    modal.hidden = true;
    document.body.classList.remove('no-scroll');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.querySelectorAll('.js-booking').forEach(function (btn) {
    btn.addEventListener('click', function () {
      /* Меню закрываем ДО открытия модалки: closeMobileMenu() синхронно снимает
         no-scroll, и в обратном порядке он бы снял блокировку уже у модалки. */
      if (!mobileMenu.hidden) closeMobileMenu();
      openBooking({
        url: btn.dataset.yclients,
        master: btn.dataset.master,
        service: btn.dataset.service
      });
    });
  });

  modal.querySelectorAll('[data-close]').forEach(function (el) {
    el.addEventListener('click', closeBooking);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!lightbox.hidden) { closeLightbox(); return; }
    if (!masterList.hidden) { closeMasterList(); masterToggle.focus(); return; }
    if (!modal.hidden) { closeBooking(); return; }
    if (!mobileMenu.hidden) closeMobileMenu();
  });

  document.addEventListener('keydown', function (e) {
    if (lightbox.hidden) return;
    if (e.key === 'ArrowRight') lbNext();
    if (e.key === 'ArrowLeft') lbPrev();
  });

  /* ---------------- Маска телефона ---------------- */
  var phoneInput = document.getElementById('f-phone');
  phoneInput.addEventListener('input', function () {
    var digits = phoneInput.value.replace(/\D/g, '').replace(/^[78]/, '').slice(0, 10);
    var out = '+7';
    if (digits.length > 0) out += ' (' + digits.slice(0, 3);
    if (digits.length >= 3) out += ')';
    if (digits.length > 3) out += ' ' + digits.slice(3, 6);
    if (digits.length > 6) out += '-' + digits.slice(6, 8);
    if (digits.length > 8) out += '-' + digits.slice(8, 10);
    phoneInput.value = out;
  });

  /* ---------------- Валидация и отправка заявки ---------------- */
  function setError(input, message) {
    var el = form.querySelector('[data-error-for="' + input.id + '"]');
    if (el) el.textContent = message || '';
    input.classList.toggle('is-invalid', !!message);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('f-name');
    var phone = document.getElementById('f-phone');
    var valid = true;

    if (name.value.trim().length < 2) { setError(name, 'Введите имя'); valid = false; }
    else setError(name, '');

    if (phone.value.replace(/\D/g, '').length < 11) {
      setError(phone, 'Введите номер телефона полностью');
      valid = false;
    } else setError(phone, '');

    if (!valid) return;

    /* TODO: подключить реальную отправку заявки.
       Вариант 1 — Telegram-бот:
         fetch('https://api.telegram.org/bot<TOKEN>/sendMessage', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ chat_id: '<CHAT_ID>', text: text })
         });
       Вариант 2 — Formspree: form.action = 'https://formspree.io/f/<ID>' и обычный submit.
       Сейчас заявка никуда не уходит — показываем только экран подтверждения. */

    document.getElementById('booking-done-text').textContent =
      'Спасибо, ' + name.value.trim() + '! Заявка на «' +
      document.getElementById('f-service').value + '» принята. ' +
      'Мы перезвоним на ' + phone.value + ', чтобы подтвердить время.';

    formStep.hidden = true;
    doneStep.hidden = false;
    form.reset();
  });

})();

/* ============================================================================
   DOUBLE CUTS — онлайн-запись: мастер, услуги, календарь свободного времени
   ----------------------------------------------------------------------------
   Как это работает
   ----------------
   1. У каждого барбера в booking-data.js задан график: рабочие дни, начало
      и конец смены, обед и «плотность» загрузки (load).
   2. Занятые окна на конкретную дату генерируются детерминированно: из пары
      «мастер + дата» считается число-семя, и по нему псевдослучайно
      расставляются блоки занятости. Одна и та же дата у одного мастера
      ВСЕГДА даёт одну и ту же картину — календарь не «прыгает» между
      перезагрузками страницы.
   3. Записи, сделанные на сайте, сохраняются в localStorage и складываются
      с занятостью из графика — выбранное окно сразу становится недоступным.
   4. Слот доступен, только если суммарная длительность ВСЕХ выбранных услуг
      укладывается в свободный промежуток до конца смены или обеда.

   Чтобы подключить РЕАЛЬНОЕ расписание (YClients или свой сервер), достаточно
   переписать одну функцию — loadBusy().
   ============================================================================ */

(function () {
  'use strict';

  var D = window.DOUBLECUTS;
  if (!D) return;

  var STEP_MIN = 30;   // шаг сетки времени, минут
  var DAYS     = 14;   // на сколько дней вперёд открыта запись
  var LEAD_MIN = 60;   // нельзя записаться раньше чем через час
  var LS_KEY   = 'doublecuts_bookings';

  var WD_SHORT  = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                   'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                            */
  /* ------------------------------------------------------------------ */

  function toMin(hm) { var p = hm.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function toHM(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function dateKey(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function fmtDateLong(d) { return d.getDate() + ' ' + MONTH_GEN[d.getMonth()] + ', ' + WD_SHORT[d.getDay()]; }
  function fmtMoney(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; }
  function fmtDur(min) {
    if (min < 60) return min + ' мин';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  }

  /* Детерминированный ГПСЧ: одна и та же дата → один и тот же график */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Данные                                                             */
  /* ------------------------------------------------------------------ */

  function barberById(id) {
    for (var i = 0; i < D.barbers.length; i++) if (D.barbers[i].id === id) return D.barbers[i];
    return null;
  }
  function allServices() {
    var out = [];
    D.serviceGroups.forEach(function (g) { out = out.concat(g.items); });
    return out;
  }
  function serviceById(id) {
    var items = allServices();
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function priceOf(service, barber) { return service.price[barber.tier]; }
  function priceLabel(service, barber) {
    var p = priceOf(service, barber);
    return service.approx ? 'от ' + fmtMoney(p) : fmtMoney(p);
  }

  /* Выбранные услуги: суммарная длительность и стоимость */
  function selectedServices() { return state.services.map(serviceById).filter(Boolean); }
  function totalMinutes() {
    return selectedServices().reduce(function (sum, s) { return sum + s.min; }, 0);
  }
  function totalPrice(barber) {
    return selectedServices().reduce(function (sum, s) { return sum + priceOf(s, barber); }, 0);
  }
  function hasApprox() { return selectedServices().some(function (s) { return s.approx; }); }

  /* Записи, сделанные на сайте */
  function savedBookings() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveBooking(b) {
    var all = savedBookings();
    all.push(b);
    try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* Расписание                                                         */
  /* ------------------------------------------------------------------ */

  /* ТОЧКА ЗАМЕНЫ ДЛЯ РЕАЛЬНЫХ ДАННЫХ.
     Возвращает { off: true } либо { busy: Set(минуты начала занятых слотов) }.
     Чтобы подключить YClients / свой сервер — отдайте отсюда реальные
     занятые интервалы (см. README.md). */
  function loadBusy(barberId, key, cfg) {
    var ov = (D.scheduleOverrides[barberId] || {})[key];
    if (ov && ov.off) return { off: true };

    var busy = generateBusy(barberId, key, cfg);

    if (ov && ov.busy) ov.busy.forEach(function (t) { busy.add(toMin(t)); });

    savedBookings().forEach(function (b) {
      if (b.barberId !== barberId || b.date !== key) return;
      var s = toMin(b.time), n = Math.ceil(b.min / STEP_MIN);
      for (var i = 0; i < n; i++) busy.add(s + i * STEP_MIN);
    });

    return { busy: busy };
  }

  function generateBusy(barberId, key, cfg) {
    var rnd = mulberry32(hashStr(barberId + '|' + key));
    var start = toMin(cfg.start), end = toMin(cfg.end);
    var total = Math.floor((end - start) / STEP_MIN);
    var busy = new Set();
    var i = 0;

    while (i < total) {
      if (rnd() < cfg.load) {
        var len = 2 + Math.floor(rnd() * 3);
        for (var k = 0; k < len && i + k < total; k++) busy.add(start + (i + k) * STEP_MIN);
        i += len + 1 + Math.floor(rnd() * 4);
      } else {
        i += 1;
      }
    }

    var run = 0, best = 0;
    for (var s = 0; s < total; s++) {
      run = busy.has(start + s * STEP_MIN) ? 0 : run + 1;
      if (run > best) best = run;
    }
    if (best < 4) {
      var at = Math.floor(rnd() * Math.max(1, total - 4));
      for (var j = 0; j < 4; j++) busy.delete(start + (at + j) * STEP_MIN);
    }

    return busy;
  }

  function daySlots(barber, date, dur) {
    var cfg = D.schedule[barber.id];
    var key = dateKey(date);

    if (cfg.days.indexOf(date.getDay()) === -1) return { off: true };

    var data = loadBusy(barber.id, key, cfg);
    if (data.off) return { off: true };

    var busy  = data.busy;
    var start = toMin(cfg.start), end = toMin(cfg.end);
    var lunch = cfg.lunch ? [toMin(cfg.lunch[0]), toMin(cfg.lunch[1])] : null;
    var need  = Math.max(1, Math.ceil(dur / STEP_MIN));

    var now = new Date();
    var isToday = dateKey(now) === key;
    var earliest = isToday ? now.getHours() * 60 + now.getMinutes() + LEAD_MIN : -1;

    function blocked(t) {
      if (busy.has(t)) return true;
      if (lunch && t >= lunch[0] && t < lunch[1]) return true;
      return false;
    }

    var slots = [], free = 0;
    for (var t = start; t + STEP_MIN <= end; t += STEP_MIN) {
      if (t < earliest) continue;

      var state_;
      if (lunch && t >= lunch[0] && t < lunch[1]) {
        state_ = 'lunch';
      } else if (busy.has(t)) {
        state_ = 'busy';
      } else if (t + dur > end) {
        state_ = 'tight';
      } else {
        state_ = 'free';
        for (var k = 1; k < need; k++) {
          if (blocked(t + k * STEP_MIN)) { state_ = 'tight'; break; }
        }
      }
      if (state_ === 'free') free++;
      slots.push({ min: t, time: toHM(t), state: state_ });
    }

    return { slots: slots, free: free };
  }

  function freeCount(barber, date, dur) {
    var r = daySlots(barber, date, dur);
    return r.off ? -1 : r.free;
  }

  /* ------------------------------------------------------------------ */
  /* Разметка виджета                                                   */
  /* ------------------------------------------------------------------ */

  var STEPS = ['Мастер', 'Услуги', 'Дата и время', 'Контакты'];
  var TITLES = ['Выберите мастера', 'Выберите услуги', 'Выберите дату и время',
                'Как с вами связаться', 'Вы записаны'];

  var state = { step: 0, barber: null, services: [], date: null, time: null };
  var root, panes, titleEl, stepsEl, footEl, nextBtn, backBtn, hintEl;

  function build() {
    root = document.createElement('div');
    root.className = 'modal';
    root.id = 'bookModal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bookTitle');

    root.innerHTML =
      '<div class="modal__overlay" data-close></div>' +
      '<div class="modal__box modal__box--wizard">' +
        '<button class="modal__close" data-close type="button" aria-label="Закрыть">×</button>' +
        '<div class="book">' +
          '<div class="book__head">' +
            '<span class="book__kicker">Онлайн-запись</span>' +
            '<h2 class="book__title" id="bookTitle"></h2>' +
            '<div class="steps"></div>' +
          '</div>' +
          '<div class="book__body">' +
            '<div class="book__pane" data-pane="0"></div>' +
            '<div class="book__pane" data-pane="1" hidden></div>' +
            '<div class="book__pane" data-pane="2" hidden></div>' +
            '<div class="book__pane" data-pane="3" hidden></div>' +
            '<div class="book__pane" data-pane="4" hidden></div>' +
          '</div>' +
          '<div class="book__foot">' +
            '<button class="book__back" type="button" data-back>← Назад</button>' +
            '<span class="book__hint"></span>' +
            '<button class="btn btn--primary" type="button" data-next disabled>Далее <span class="arw">→</span></button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(root);

    panes   = root.querySelectorAll('.book__pane');
    titleEl = root.querySelector('.book__title');
    stepsEl = root.querySelector('.steps');
    footEl  = root.querySelector('.book__foot');
    nextBtn = root.querySelector('[data-next]');
    backBtn = root.querySelector('[data-back]');
    hintEl  = root.querySelector('.book__hint');

    stepsEl.innerHTML = STEPS.map(function (s) {
      return '<div class="steps__item"><div class="steps__bar"><i></i></div><span class="steps__lbl">' + s + '</span></div>';
    }).join('');

    root.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    nextBtn.addEventListener('click', function () { goTo(state.step + 1); });
    backBtn.addEventListener('click', function () { goTo(state.step - 1); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('is-open')) close();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Шаг 1 — мастер                                                     */
  /* ------------------------------------------------------------------ */
  function renderBarbers() {
    panes[0].innerHTML =
      '<div class="pick-barbers">' +
      D.barbers.map(function (b) {
        return '<button class="pick-barber' + (state.barber === b.id ? ' is-sel' : '') + '" type="button" data-barber="' + b.id + '">' +
          '<img src="' + b.photo + '" alt="" loading="lazy">' +
          '<b>' + b.name + '</b><span>' + b.role + '</span>' +
        '</button>';
      }).join('') +
      '</div>' +
      '<p class="text">Цена зависит от уровня мастера — она подставится автоматически на следующих шагах.</p>';

    panes[0].querySelectorAll('[data-barber]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (state.barber && state.barber !== el.dataset.barber) { state.date = null; state.time = null; }
        state.barber = el.dataset.barber;
        renderBarbers();
        goTo(1);
      });
    });
    sync();
  }

  /* ------------------------------------------------------------------ */
  /* Шаг 2 — услуги (можно выбрать несколько)                           */
  /* ------------------------------------------------------------------ */
  function renderServices() {
    var b = barberById(state.barber);

    var tabs = D.serviceGroups.map(function (g, i) {
      return '<button type="button" class="pick-serv-tab' + (i === 0 ? ' is-active' : '') + '" data-serv-tab="' + i + '">' + g.title + '</button>';
    }).join('');

    var panels = D.serviceGroups.map(function (g, i) {
      var rows = g.items.map(function (s) {
        var checked = state.services.indexOf(s.id) > -1;
        return '<label class="pick-serv' + (checked ? ' is-sel' : '') + '">' +
          '<input type="checkbox" data-service="' + s.id + '"' + (checked ? ' checked' : '') + '>' +
          '<span class="pick-serv__name">' + s.name + '</span>' +
          '<span class="pick-serv__dur">' + fmtDur(s.min) + '</span>' +
          '<span class="pick-serv__price">' + priceLabel(s, b) + '</span>' +
        '</label>';
      }).join('');
      return '<div class="pick-serv-panel" data-serv-panel="' + i + '"' + (i === 0 ? '' : ' hidden') + '>' + rows + '</div>';
    }).join('');

    panes[1].innerHTML =
      '<div class="pick-serv-tabs">' + tabs + '</div>' + panels +
      '<div class="pick-serv-summary" id="pickServSummary" hidden>' +
        '<div class="pick-serv-summary__row"><span>Выбрано услуг</span><b id="pickServCount"></b></div>' +
        '<div class="pick-serv-summary__row"><span>Длительность</span><b id="pickServDur"></b></div>' +
        '<div class="pick-serv-summary__row pick-serv-summary__total"><span>Стоимость</span><b id="pickServPrice"></b></div>' +
      '</div>' +
      '<p class="pick-serv-hint" id="pickServHint">Отметьте одну или несколько услуг — можно из разных разделов.</p>';

    panes[1].querySelectorAll('[data-serv-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        panes[1].querySelectorAll('[data-serv-tab]').forEach(function (t) { t.classList.toggle('is-active', t === tab); });
        panes[1].querySelectorAll('[data-serv-panel]').forEach(function (p) { p.hidden = p.dataset.servPanel !== tab.dataset.servTab; });
      });
    });

    panes[1].querySelectorAll('[data-service]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.dataset.service;
        cb.closest('.pick-serv').classList.toggle('is-sel', cb.checked);
        if (cb.checked) {
          if (state.services.indexOf(id) === -1) state.services.push(id);
          state.time = null; /* набор услуг изменился — длительность другая, время сбрасываем */
        } else {
          state.services = state.services.filter(function (s) { return s !== id; });
          state.time = null;
        }
        renderServSummary();
        sync();
      });
    });

    renderServSummary();
    sync();
  }

  function renderServSummary() {
    var b = barberById(state.barber);
    var services = selectedServices();
    var summary = document.getElementById('pickServSummary');
    var hint = document.getElementById('pickServHint');
    if (!summary) return;

    summary.hidden = services.length === 0;
    hint.hidden = services.length > 0;

    if (services.length) {
      document.getElementById('pickServCount').textContent = services.length;
      document.getElementById('pickServDur').textContent = fmtDur(totalMinutes());
      document.getElementById('pickServPrice').textContent = (hasApprox() ? 'от ' : '') + fmtMoney(totalPrice(b));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Шаг 3 — дата и время                                               */
  /* ------------------------------------------------------------------ */
  function renderCalendar() {
    var b = barberById(state.barber);
    var dur = totalMinutes();

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var days = [];
    for (var i = 0; i < DAYS; i++) { var d = new Date(today); d.setDate(today.getDate() + i); days.push(d); }

    if (!state.date) {
      for (var j = 0; j < days.length; j++) {
        if (freeCount(b, days[j], dur) > 0) { state.date = dateKey(days[j]); break; }
      }
      if (!state.date) state.date = dateKey(days[0]);
    }

    var strip = days.map(function (d) {
      var key = dateKey(d);
      var free = freeCount(b, d, dur);
      var dis = free <= 0;
      var note = free < 0 ? 'выходной' : (free === 0 ? 'нет окон' : (free < 5 ? free + (free === 1 ? ' окно' : ' окна') : free + ' окон'));
      return '<button class="pick-date' + (state.date === key ? ' is-sel' : '') + '" type="button" data-date="' + key + '"' +
        (dis ? ' disabled' : '') + '>' +
        '<span>' + WD_SHORT[d.getDay()] + '</span><b>' + d.getDate() + '</b><em>' + note + '</em>' +
      '</button>';
    }).join('');

    var sel = new Date(state.date + 'T00:00:00');
    var res = daySlots(b, sel, dur);
    var body;

    if (res.off) {
      body = '<div class="notice">' + b.name + ' в этот день не работает. Выберите другую дату — свободные дни отмечены в ленте выше.</div>';
    } else if (res.free === 0) {
      body = '<div class="notice">На ' + fmtDateLong(sel) + ' у мастера всё занято. Ближайшие свободные окна показаны в ленте дат.</div>' +
             '<div class="slots" style="margin-top:16px">' + slotsHTML(res.slots) + '</div>';
    } else {
      body = '<div class="slots">' + slotsHTML(res.slots) + '</div>';
    }

    panes[2].innerHTML =
      '<div class="pick-dates">' + strip + '</div>' +
      '<div class="book__legend">' +
        '<span><i class="i-free"></i>свободно</span>' +
        '<span><i class="i-busy"></i>занято</span>' +
        '<span><i class="i-tight"></i>не хватает времени на услугу</span>' +
      '</div>' + body +
      '<p class="text">Выбранные услуги займут ' + fmtDur(dur) + ', поэтому доступны только окна, в которые это время помещается целиком.</p>';

    panes[2].querySelectorAll('[data-date]').forEach(function (el) {
      el.addEventListener('click', function () { state.date = el.dataset.date; state.time = null; renderCalendar(); });
    });
    panes[2].querySelectorAll('[data-time]').forEach(function (el) {
      el.addEventListener('click', function () { state.time = el.dataset.time; renderCalendar(); });
    });

    var selected = panes[2].querySelector('.pick-date.is-sel');
    if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'center' });
    sync();
  }

  function slotsHTML(slots) {
    return slots.map(function (s) {
      if (s.state === 'lunch') return '<span class="slot slot--lunch">обед</span>';
      if (s.state === 'busy')  return '<span class="slot slot--busy" title="Время занято">' + s.time + '</span>';
      if (s.state === 'tight') return '<span class="slot slot--tight" title="Выбранные услуги не помещаются в это окно">' + s.time + '</span>';
      return '<button class="slot slot--free' + (state.time === s.time ? ' is-sel' : '') + '" type="button" data-time="' + s.time + '">' + s.time + '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Шаг 4 — контакты                                                   */
  /* ------------------------------------------------------------------ */
  function renderForm() {
    panes[3].innerHTML =
      summaryHTML() +
      '<label class="field" id="fName">' +
        '<span class="field__lbl">Ваше имя</span>' +
        '<input type="text" data-f="name" placeholder="Как к вам обращаться" autocomplete="name">' +
        '<span class="field__err">Укажите имя</span>' +
      '</label>' +
      '<label class="field" id="fPhone">' +
        '<span class="field__lbl">Телефон</span>' +
        '<input type="tel" data-f="phone" placeholder="+7 (___) ___-__-__" autocomplete="tel" inputmode="tel">' +
        '<span class="field__err">Введите номер полностью</span>' +
      '</label>' +
      '<label class="field" id="fNote">' +
        '<span class="field__lbl">Комментарий <span class="field__lbl-opt">— необязательно</span></span>' +
        '<input type="text" data-f="note" placeholder="Пожелания к стрижке">' +
      '</label>' +
      '<label class="check"><input type="checkbox" data-f="agree" checked>' +
        '<span>Согласен на обработку персональных данных и подтверждаю, что приду в выбранное время.</span>' +
      '</label>';

    var phone = panes[3].querySelector('[data-f="phone"]');
    phone.addEventListener('input', function () { phone.value = maskPhone(phone.value); });
    phone.addEventListener('focus', function () { if (!phone.value) phone.value = '+7 ('; });

    panes[3].querySelectorAll('input').forEach(function (i) {
      i.addEventListener('input', sync);
      i.addEventListener('change', sync);
    });
    sync();
  }

  function maskPhone(v) {
    var d = v.replace(/\D/g, '');
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }

  function formOK() {
    var name = panes[3].querySelector('[data-f="name"]');
    var phone = panes[3].querySelector('[data-f="phone"]');
    var agree = panes[3].querySelector('[data-f="agree"]');
    if (!name || !phone) return false;
    return name.value.trim().length >= 2 &&
           phone.value.replace(/\D/g, '').length === 11 &&
           agree.checked;
  }

  function summaryHTML() {
    var b = barberById(state.barber);
    var services = selectedServices();
    var d = new Date(state.date + 'T00:00:00');
    var dur = totalMinutes();
    var endMin = toMin(state.time) + dur;
    return '<div class="summary">' +
      row('Мастер', b.name + ' · ' + b.role) +
      row('Услуги', services.map(function (s) { return s.name; }).join(', ')) +
      row('Дата', fmtDateLong(d)) +
      row('Время', state.time + ' – ' + toHM(endMin) + ' (' + fmtDur(dur) + ')') +
      '<div class="summary__row summary__total"><span>Стоимость</span><b>' + (hasApprox() ? 'от ' : '') + fmtMoney(totalPrice(b)) + '</b></div>' +
    '</div>';

    function row(k, v) { return '<div class="summary__row"><span>' + k + '</span><b>' + v + '</b></div>'; }
  }

  /* ------------------------------------------------------------------ */
  /* Шаг 5 — готово                                                     */
  /* ------------------------------------------------------------------ */
  function renderDone(booking) {
    var b = barberById(state.barber);
    panes[4].innerHTML =
      '<div class="done">' +
        '<div class="done__ico"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg></div>' +
        '<h3 class="done__ttl">Вы записаны</h3>' +
        '<p class="text">Ждём вас по адресу: ' + D.contacts.address + '.<br>Администратор перезвонит для подтверждения.</p>' +
        summaryHTML() +
        '<div class="done__actions">' +
          '<button class="btn btn--primary btn--sm" type="button" data-ics>Добавить в календарь</button>' +
          '<a class="btn btn--ghost btn--sm" href="' + (b.yclients || D.contacts.yclients) + '" target="_blank" rel="noopener">Открыть в YClients</a>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-restart>Записаться ещё</button>' +
        '</div>' +
      '</div>';

    panes[4].querySelector('[data-ics]').addEventListener('click', function () { downloadICS(booking); });
    panes[4].querySelector('[data-restart]').addEventListener('click', function () {
      state = { step: 0, barber: null, services: [], date: null, time: null };
      renderBarbers();
      goTo(0);
    });
  }

  function downloadICS(bk) {
    var b = barberById(bk.barberId);
    var services = bk.serviceIds.map(serviceById).filter(Boolean);
    var start = bk.date.replace(/-/g, '') + 'T' + bk.time.replace(':', '') + '00';
    var end = bk.date.replace(/-/g, '') + 'T' + toHM(toMin(bk.time) + bk.min).replace(':', '') + '00';
    var ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Double Cuts//RU',
      'BEGIN:VEVENT',
      'UID:' + Date.now() + '@doublecuts.ru',
      'DTSTAMP:' + start,
      'DTSTART:' + start,
      'DTEND:' + end,
      'SUMMARY:' + services.map(function (s) { return s.name; }).join(', ') + ' — Double Cuts (' + b.name + ')',
      'LOCATION:' + D.contacts.address,
      'DESCRIPTION:Мастер: ' + b.name + '. Телефон барбершопа: ' + D.contacts.phone,
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');

    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'double-cuts.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /* ------------------------------------------------------------------ */
  /* Навигация по шагам                                                 */
  /* ------------------------------------------------------------------ */
  function canLeave(step) {
    if (step === 0) return !!state.barber;
    if (step === 1) return state.services.length > 0;
    if (step === 2) return !!state.time;
    if (step === 3) return formOK();
    return true;
  }

  function goTo(step) {
    if (step > state.step && !canLeave(state.step)) return;
    if (step < 0) return;

    if (step === 4 && state.step === 3) {
      var booking = {
        barberId: state.barber,
        serviceIds: state.services.slice(),
        date: state.date,
        time: state.time,
        min: totalMinutes(),
        name: panes[3].querySelector('[data-f="name"]').value.trim(),
        phone: panes[3].querySelector('[data-f="phone"]').value,
        note: panes[3].querySelector('[data-f="note"]').value.trim(),
        created: new Date().toISOString()
      };

      /* TODO: подключить реальную отправку заявки администратору.
         Вариант 1 — Telegram-бот:
           fetch('https://api.telegram.org/bot<TOKEN>/sendMessage', {
             method: 'POST', headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ chat_id: '<CHAT_ID>', text: text })
           });
         Вариант 2 — Formspree: обычный fetch/submit на https://formspree.io/f/<ID>.
         Сейчас запись сохраняется только в localStorage браузера (учитывается
         при построении календаря дальше) — администратор её не увидит, пока
         этот TODO не подключён. */
      saveBooking(booking);
      renderDone(booking);
    }

    state.step = step;

    if (step === 1) renderServices();
    if (step === 2) renderCalendar();
    if (step === 3) renderForm();

    for (var i = 0; i < panes.length; i++) panes[i].hidden = (i !== step);
    titleEl.textContent = TITLES[step];
    root.querySelector('.book__body').scrollTop = 0;
    sync();
  }

  function sync() {
    if (!stepsEl) return;
    var items = stepsEl.children;
    for (var i = 0; i < items.length; i++) {
      items[i].className = 'steps__item' + (i < state.step ? ' is-done' : '') + (i === state.step ? ' is-active' : '');
    }

    var done = state.step === 4;
    footEl.style.display = done ? 'none' : '';
    backBtn.style.visibility = state.step === 0 ? 'hidden' : 'visible';
    nextBtn.disabled = !canLeave(state.step);
    nextBtn.innerHTML = (state.step === 3 ? 'Подтвердить запись' : 'Далее') + ' <span class="arw">→</span>';

    var hint = '';
    if (state.step === 1 && state.barber) hint = barberById(state.barber).name;
    if (state.step === 2 && state.services.length) hint = totalMinutes() + ' мин суммарно';
    if (state.step === 3 && state.time) hint = fmtDateLong(new Date(state.date + 'T00:00:00')) + ', ' + state.time;
    hintEl.textContent = hint;
  }

  /* ------------------------------------------------------------------ */
  /* Открытие / закрытие                                                */
  /* ------------------------------------------------------------------ */
  var lastFocused = null;

  function open(opts) {
    opts = opts || {};
    if (!root) build();

    lastFocused = document.activeElement;

    if (opts.barber && barberById(opts.barber)) state.barber = opts.barber;
    if (opts.service && serviceById(opts.service) && state.services.indexOf(opts.service) === -1) {
      state.services.push(opts.service);
    }

    renderBarbers();
    var step = state.barber ? 1 : 0;
    state.step = 0;
    goTo(step);

    root.classList.add('is-open');
    document.body.classList.add('no-scroll');

    setTimeout(function () {
      var f = root.querySelector('.pick-barber, .pick-serv, .pick-date');
      if (f) f.focus({ preventScroll: true });
    }, 350);
  }

  function close() {
    if (!root || !root.classList.contains('is-open')) return;
    root.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ------------------------------------------------------------------ */
  /* Инициализация                                                      */
  /* ------------------------------------------------------------------ */
  function init() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('.js-booking');
      if (!t) return;
      e.preventDefault();
      open({ barber: t.dataset.barber, service: t.dataset.service });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.DoubleCutsBooking = { open: open, close: close };
})();

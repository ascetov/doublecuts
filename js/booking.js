/* ============================================================================
   DOUBLE CUTS — онлайн-запись: мастер, услуги, удобное время
   ----------------------------------------------------------------------------
   Как это работает
   ----------------
   1. Часы работы в booking-data.js — настоящие (Пн-Вс 10:00–22:00, с сайта),
      одинаковые у всех мастеров. Никакой «занятости» календарь не выдумывает
      и не показывает — только реальные рабочие часы.
   2. Поэтому выбранное время — ПРЕДВАРИТЕЛЬНОЕ. Заявка уходит администратору
      в Telegram (см. sendToTelegram ниже и README.md), и он перезванивает
      подтвердить точный слот. Это явно написано гостю на шагах записи.
   3. Слот показывается в списке, только если суммарная длительность ВСЕХ
      выбранных услуг умещается в рабочий день до закрытия (и, если запись
      на сегодня, не раньше чем через час от текущего времени).

   Чтобы подключить настоящую занятость мастеров (YClients API или свой
   сервер) — смотрите функцию daySlots() ниже.
   ============================================================================ */

(function () {
  'use strict';

  var D = window.DOUBLECUTS;
  if (!D) return;

  var STEP_MIN = 30;   // шаг сетки времени, минут
  var DAYS     = 14;   // на сколько дней вперёд открыта запись
  var LEAD_MIN = 60;   // нельзя записаться раньше чем через час

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
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  /* ------------------------------------------------------------------ */
  /* Расписание — только реальные рабочие часы, без выдуманной занятости */
  /* ------------------------------------------------------------------ */

  /* Список времени на дату: только то, что реально умещается в рабочий день.
     off — мастер в этот день не работает (согласно schedule[].days). */
  function daySlots(barber, date, dur) {
    var cfg = D.schedule[barber.id];
    if (cfg.days.indexOf(date.getDay()) === -1) return { off: true, slots: [] };

    var start = toMin(cfg.start), end = toMin(cfg.end);
    var now = new Date();
    var isToday = dateKey(now) === dateKey(date);
    var earliest = isToday ? now.getHours() * 60 + now.getMinutes() + LEAD_MIN : -1;

    var slots = [];
    for (var t = start; t + dur <= end; t += STEP_MIN) {
      if (t < earliest) continue;
      slots.push(toHM(t));
    }
    return { off: false, slots: slots };
  }

  /* ------------------------------------------------------------------ */
  /* Разметка виджета                                                   */
  /* ------------------------------------------------------------------ */

  var STEPS = ['Мастер', 'Услуги', 'Дата и время', 'Контакты'];
  var TITLES = ['Выберите мастера', 'Выберите услуги', 'Выберите дату и время',
                'Как с вами связаться', 'Вы записаны'];

  var state = { step: 0, barber: null, services: [], date: null, time: null };
  var root, panes, titleEl, stepsEl, footEl, nextBtn, backBtn, hintEl;
  /* Шаг, с которого визард стартовал в этот раз: 1, если мастер уже был
     выбран кнопкой на странице (шаг «Мастер» тогда пропускается), иначе 0.
     «Назад» с этого шага закрывает визард, а не ведёт на шаг, которого
     гость не видел — так понятнее уйти обратно на страницу с сайта. */
  var entryStep = 0;

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
    backBtn.addEventListener('click', function () {
      if (state.step <= entryStep) { close(); return; }
      goTo(state.step - 1);
    });

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

    var dayInfo = days.map(function (d) { return { date: d, key: dateKey(d), res: daySlots(b, d, dur) }; });

    if (!state.date) {
      var firstOpen = dayInfo.filter(function (x) { return !x.res.off && x.res.slots.length > 0; })[0];
      state.date = firstOpen ? firstOpen.key : dayInfo[0].key;
    }

    var strip = dayInfo.map(function (x) {
      var dis = x.res.off || x.res.slots.length === 0;
      var label = x.res.off ? 'выходной' : (dis ? 'нет мест' : '');
      return '<button class="pick-date' + (state.date === x.key ? ' is-sel' : '') + '" type="button" data-date="' + x.key + '"' +
        (dis ? ' disabled' : '') + '>' +
        '<span>' + WD_SHORT[x.date.getDay()] + '</span><b>' + x.date.getDate() + '</b>' +
        (label ? '<em>' + label + '</em>' : '<em>&nbsp;</em>') +
      '</button>';
    }).join('');

    var sel = new Date(state.date + 'T00:00:00');
    var res = daySlots(b, sel, dur);
    var body;

    if (res.off) {
      body = '<div class="notice">' + b.name + ' в этот день не работает. Выберите другую дату — доступные дни отмечены в ленте выше.</div>';
    } else if (res.slots.length === 0) {
      body = '<div class="notice">На ' + fmtDateLong(sel) + ' для выбранных услуг уже не осталось времени. Выберите другую дату.</div>';
    } else {
      body = '<div class="slots">' + slotsHTML(res.slots) + '</div>';
    }

    panes[2].innerHTML =
      '<div class="pick-dates">' + strip + '</div>' + body +
      '<p class="text">Это удобное для вас время — оно предварительное. Администратор позвонит и подтвердит точный слот. ' +
      'Выбранные услуги займут ' + fmtDur(dur) + ', поэтому показаны только окна, куда это время помещается целиком.</p>';

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

  function slotsHTML(times) {
    return times.map(function (t) {
      return '<button class="slot' + (state.time === t ? ' is-sel' : '') + '" type="button" data-time="' + t + '">' + t + '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------------ */
  /* Шаг 4 — контакты                                                   */
  /* ------------------------------------------------------------------ */
  function renderForm() {
    panes[3].innerHTML =
      summaryHTML() +
      '<p class="text" style="margin:0 0 18px">Время предварительное — мы позвоним по указанному телефону и подтвердим его окончательно.</p>' +
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
      row('Время', state.time + ' – ' + toHM(endMin) + ' (' + fmtDur(dur) + ', предварительно)') +
      '<div class="summary__row summary__total"><span>Стоимость</span><b>' + (hasApprox() ? 'от ' : '') + fmtMoney(totalPrice(b)) + '</b></div>' +
    '</div>';

    function row(k, v) { return '<div class="summary__row"><span>' + k + '</span><b>' + v + '</b></div>'; }
  }

  /* ------------------------------------------------------------------ */
  /* Отправка заявки администратору в Telegram                          */
  /* ------------------------------------------------------------------ */

  /* Настройки — botToken и chatId в booking-data.js. Пока они пустые,
     заявка нигде не сохраняется и не отправляется — гость всё равно
     увидит экран «Вы записаны», но администратор о заявке не узнает.
     Как получить токен и chatId — см. комментарий в booking-data.js
     и README.md. */
  function sendToTelegram(bk) {
    var cfg = D.telegram || {};
    if (!cfg.botToken || !cfg.chatId) {
      console.warn('Double Cuts: заявка не отправлена — заполните telegram.botToken и telegram.chatId в js/booking-data.js (см. README.md).');
      return;
    }

    var b = barberById(bk.barberId);
    var services = bk.serviceIds.map(serviceById).filter(Boolean);
    var d = new Date(bk.date + 'T00:00:00');

    var text =
      '💈 <b>Новая заявка с сайта</b>\n\n' +
      '<b>Мастер:</b> ' + escapeHtml(b.name + ' · ' + b.role) + '\n' +
      '<b>Услуги:</b> ' + escapeHtml(services.map(function (s) { return s.name; }).join(', ')) + '\n' +
      '<b>Дата:</b> ' + escapeHtml(fmtDateLong(d)) + '\n' +
      '<b>Время:</b> ' + escapeHtml(bk.time) + ' (предварительно, нужно подтвердить)\n' +
      '<b>Стоимость:</b> ' + (hasApprox() ? 'от ' : '') + fmtMoney(totalPrice(b)) + '\n\n' +
      '<b>Имя:</b> ' + escapeHtml(bk.name) + '\n' +
      '<b>Телефон:</b> ' + escapeHtml(bk.phone) +
      (bk.note ? '\n<b>Комментарий:</b> ' + escapeHtml(bk.note) : '');

    fetch('https://api.telegram.org/bot' + cfg.botToken + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text: text, parse_mode: 'HTML' })
    }).catch(function (err) {
      console.error('Double Cuts: не удалось отправить заявку в Telegram', err);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Шаг 5 — готово                                                     */
  /* ------------------------------------------------------------------ */
  function renderDone(booking) {
    var b = barberById(state.barber);
    panes[4].innerHTML =
      '<div class="done">' +
        '<div class="done__ico"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 6 9 17l-5-5"/></svg></div>' +
        '<h3 class="done__ttl">Заявка отправлена</h3>' +
        '<p class="text">Время предварительное. Ждём вас по адресу: ' + D.contacts.address +
        '.<br>Администратор позвонит вам в ближайшее время, чтобы подтвердить точный слот.</p>' +
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
      entryStep = 0;
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
      'SUMMARY:' + services.map(function (s) { return s.name; }).join(', ') + ' — Double Cuts (' + b.name + '), предварительно',
      'LOCATION:' + D.contacts.address,
      'DESCRIPTION:Мастер: ' + b.name + '. Время предварительное, ждите звонка для подтверждения. Телефон барбершопа: ' + D.contacts.phone,
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

      sendToTelegram(booking);
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
    entryStep = state.barber ? 1 : 0;
    state.step = 0;
    goTo(entryStep);

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

/* ============================================================================
   DOUBLE CUTS — данные для онлайн-записи
   ----------------------------------------------------------------------------
   Редактируемый файл: правьте его — календарь записи обновится.

   Календарь показывает ТОЛЬКО реальные часы работы (Пн-Вс 10:00–22:00,
   взяты с сайта) и не притворяется, что знает занятость мастеров —
   никакой выдуманной «свободно/занято» картины здесь нет. Это выбор
   удобного времени, а не бронирование: последний шаг записи — не форма
   с отправкой, а две кнопки «Позвонить» и «Написать в Telegram», гость
   сам уточняет доступность у администратора. YClients — запасной вариант
   на этом же шаге, кнопкой поменьше.

   Длительность услуг (min) на исходном сайте нигде не указана — проставлена
   реалистично по типу процедуры, чтобы понимать, сколько слотов занять.
   Поправьте на настоящие значения, если они появятся.

   Чтобы подключить РЕАЛЬНОЕ расписание с занятостью (YClients или свой
   сервер) — смотрите функцию daySlots() в booking.js и README.md.
   ============================================================================ */

window.DOUBLECUTS = {

  contacts: {
    phone:     '+7 (995) 037-43-70',
    phoneHref: 'tel:+79950374370',
    telegram:  'https://t.me/doublecuts',
    address:   'Воронеж, ул. Карла Маркса, 112',
    hours:     'ежедневно, 10:00–22:00',
    yclients:  'https://n1283932.yclients.com/select-city/56/select-branch'
  },

  /* tier — уровень из прайса: barber / senior / chef / brand.
     Определяет, какая колонка цены подставится в календаре. */
  barbers: [
    { id: 'mikhail',   name: 'Михаил',    role: 'бренд-барбер',   tier: 'brand',  photo: 'img/michael_new-2.webp',
      yclients: 'https://n1283932.yclients.com/company/704044/personal/select-services?o=m2612541' },
    { id: 'vadim',     name: 'Вадим',     role: 'шеф-барбер',     tier: 'chef',   photo: 'img/vadim_new-2.webp',
      yclients: 'https://n748041.yclients.com/company/704044/personal/select-services?o=m3113572' },
    { id: 'anton',     name: 'Антон',     role: 'старший барбер', tier: 'senior', photo: 'img/anton_new-2.webp',
      yclients: 'https://n1283932.yclients.com/company/704044/personal/select-services?o=m3844591' },
    { id: 'pavel-s',   name: 'Павел',     role: 'старший барбер', tier: 'senior', photo: 'img/barber-voroshilin.webp',
      yclients: 'https://n1283932.yclients.com/company/704044/personal/select-services?o=m5018118' },
    { id: 'vladislav', name: 'Владислав', role: 'старший барбер', tier: 'senior', photo: 'img/vlad.webp',
      yclients: 'https://n1283932.yclients.com/company/1159746/personal/select-services?o=m3527780' },
    { id: 'denis',     name: 'Денис',     role: 'барбер',         tier: 'barber', photo: 'img/denis-2.webp',
      yclients: 'https://n748041.yclients.com/company/704044/personal/select-services?o=m4417185' },
    { id: 'andrey',    name: 'Андрей',    role: 'барбер',         tier: 'barber', photo: 'img/andrey_new-2.webp',
      yclients: 'https://n1283932.yclients.com/company/1159746/personal/select-services?o=m3623623' },
    { id: 'pavel-b',   name: 'Павел',     role: 'барбер',         tier: 'barber', photo: 'img/pavel_new-2.webp',
      yclients: 'https://n1283932.yclients.com/company/704044/personal/select-services?o=m4411836' }
  ],

  /* Настоящие часы работы, одинаковые у всех — Пн-Вс 10:00–22:00.
     days: 0=вс, 1=пн, ... 6=сб. Если у конкретного мастера правда есть
     выходной день — уберите его номер из массива days именно этого мастера. */
  schedule: {
    mikhail:     { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' },
    vadim:       { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' },
    anton:       { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' },
    'pavel-s':   { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' },
    vladislav:   { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' },
    denis:       { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' },
    andrey:      { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' },
    'pavel-b':   { days: [0,1,2,3,4,5,6], start: '10:00', end: '22:00' }
  },

  /* Цены — 4 тарифа, совпадают с разделом «Цены» на сайте.
     approx: true — у услуги на сайте указан диапазон (напр. химзавивка);
     показываем цену тарифа как «от», а не точную сумму. */
  serviceGroups: [
    { title: 'Стрижки', items: [
      { id: 'cut-classic', name: 'Мужская стрижка', min: 60, price: { barber: 1200, senior: 1400, chef: 1600, brand: 1800 } },
      { id: 'cut-fix', name: 'Коррекция стрижки', min: 30, price: { barber: 900, senior: 1100, chef: 1200, brand: 1400 } },
      { id: 'cut-machine', name: 'Стрижка машинкой', min: 30, price: { barber: 900, senior: 1100, chef: 1200, brand: 1400 } },
      { id: 'cut-kids', name: 'Детская стрижка', min: 45, price: { barber: 1200, senior: 1400, chef: 1600, brand: 1800 } },
      { id: 'shave-head-electric', name: 'Бритьё головы электробритвой', min: 20, price: { barber: 600, senior: 700, chef: 800, brand: 900 } },
      { id: 'shave-head-razor', name: 'Бритьё головы опасной бритвой', min: 40, price: { barber: 1200, senior: 1400, chef: 1600, brand: 1800 } }
    ]},
    { title: 'Борода', items: [
      { id: 'beard-model', name: 'Моделирование бороды', min: 30, price: { barber: 900, senior: 1100, chef: 1200, brand: 1400 } },
      { id: 'beard-cut', name: 'Стрижка бороды', min: 20, price: { barber: 600, senior: 700, chef: 800, brand: 900 } },
      { id: 'beard-shaver', name: 'Бритьё шейвером', min: 20, price: { barber: 600, senior: 700, chef: 800, brand: 900 } },
      { id: 'beard-razor', name: 'Бритьё опасной бритвой', min: 40, price: { barber: 1200, senior: 1400, chef: 1600, brand: 1800 } }
    ]},
    { title: 'Комбо', items: [
      { id: 'combo-father-son', name: 'Стрижка «отец + сын»', min: 90, price: { barber: 1800, senior: 2200, chef: 2600, brand: 3000 } },
      { id: 'combo-cut-beard-wax', name: 'Стрижка + борода + воск', min: 75, price: { barber: 1500, senior: 2000, chef: 2500, brand: 3000 } },
      { id: 'combo-cut-beardmodel-wax', name: 'Стрижка + моделирование бороды + воск', min: 90, price: { barber: 1700, senior: 2200, chef: 2700, brand: 3200 } },
      { id: 'combo-cut-volcano-wax', name: 'Стрижка + уход Volcano + воск', min: 90, price: { barber: 1700, senior: 2200, chef: 2400, brand: 2900 } }
    ]},
    { title: 'Уход за лицом', items: [
      { id: 'face-premium', name: 'Премиум уход за лицом', min: 40, price: { barber: 900, senior: 1100, chef: 1100, brand: 1300 } },
      { id: 'face-volcano-express', name: 'Экспресс-уход Volcano', min: 15, price: { barber: 200, senior: 200, chef: 200, brand: 200 } },
      { id: 'face-eye-volcano', name: 'Уход вокруг глаз Volcano', min: 15, price: { barber: 400, senior: 500, chef: 500, brand: 600 } }
    ]},
    { title: 'Дополнительно', items: [
      { id: 'wax-depil', name: 'Восковая депиляция', min: 15, price: { barber: 200, senior: 300, chef: 300, brand: 400 } },
      { id: 'wax-complex', name: 'Воск — комплекс', min: 20, price: { barber: 300, senior: 400, chef: 400, brand: 500 } },
      { id: 'peeling-premium', name: 'Премиум пилинг головы', min: 30, price: { barber: 600, senior: 700, chef: 800, brand: 900 } },
      { id: 'perm', name: 'Химическая завивка', min: 90, price: { barber: 3500, senior: 4000, chef: 4500, brand: 5000 }, approx: true },
      { id: 'perm-consult', name: 'Консультация по завивке', min: 20, price: { barber: 400, senior: 500, chef: 600, brand: 700 } },
      { id: 'tone-head', name: 'Тонирование головы', min: 45, price: { barber: 700, senior: 800, chef: 900, brand: 1000 } },
      { id: 'tone-beard', name: 'Тонирование бороды', min: 30, price: { barber: 700, senior: 800, chef: 900, brand: 1000 } },
      { id: 'styling', name: 'Профессиональная укладка', min: 20, price: { barber: 400, senior: 500, chef: 600, brand: 700 } }
    ]}
  ]
};

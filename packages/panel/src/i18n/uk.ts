import type { Messages } from './messages.js';

/**
 * The Ukrainian half.
 *
 * Typed as `Messages` on purpose: a key added to `en.ts` and forgotten here is
 * a build failure. Keep the order and the section comments of `en.ts` so the
 * two files stay diffable line for line.
 */
export const uk: Messages = {
  // ── settings ─────────────────────────────────────────────────────────────
  //
  // Жодне слово тут не довше за одинадцять символів: колонка підпису
  // переносить рядок, але не переносить слово — вона його розриває.
  'settings.open': 'Налаштування',
  'settings.close': 'Закрити',
  'settings.reset': 'Скинути налаштування',
  'settings.tab.general': 'Загальні',
  'settings.tab.colors': 'Кольори',
  'settings.tab.hotkeys': 'Клавіші',
  'settings.language': 'Мова',
  'settings.customTab': 'Власна вкладка',
  'settings.pollRate': 'Частота опитування',
  'settings.pickerDepth': 'Глибина пікера',
  'settings.bookmarkLimit': 'Ліміт закладок',
  'settings.colorTheme': 'Колір теми',

  'settings.accent.Blue': 'Синій',
  'settings.accent.Yellow': 'Жовтий',
  'settings.accent.Red': 'Червоний',
  'settings.accent.Green': 'Зелений',

  // ── hotkeys ──────────────────────────────────────────────────────────────
  'settings.hotkeys.enabled': 'Увімкнено',
  'settings.hotkeys.press': 'Натисніть клавішу…',
  'hotkey.picker': 'Пікер',
  'hotkey.highlight': 'Підсвітка',
  'hotkey.wrapBox': 'Рамка переносу',
  'hotkey.axes': 'Осі',
  'hotkey.transform': 'Трансформування',
  'hotkey.counts': 'Лічильники вузлів',

  // ── the two tab strips ───────────────────────────────────────────────────
  'tab.scene': 'Сцена',
  'tab.assets': 'Ресурси',
  'tab.stats': 'Статистика',
  'tab.custom': 'Власна',
  'tab.properties': 'Властивості',

  // ── the Custom tab ───────────────────────────────────────────────────────
  'custom.anchor': 'Завжди видима — решту панелей читають по сцені',
  'custom.show': 'Показати: {panel}',
  'custom.swap': 'Показати замість «{other}»: {panel}',
  'custom.hide': 'Сховати: {panel}',
  'custom.only': 'Єдина панель поруч зі сценою — щоб змінити, оберіть іншу',

  // ── navbar ───────────────────────────────────────────────────────────────
  'navbar.reload': 'Перезапустити інспектор',
  'navbar.theme': 'Перемкнути тему',
  'navbar.theme.light': 'Світла',
  'navbar.theme.dark': 'Темна',
  'navbar.theme.system': 'Системна',
  'navbar.help': 'Довідка',

  // ── the screens with no scene on them ────────────────────────────────────
  'screen.connecting.title': 'Підключення',
  'screen.connecting.body': 'Опитуємо сторінку…',
  'screen.noHost.title': 'Перезавантажте сторінку',
  'screen.noHost.body':
    'Інспектора не було на сторінці, коли вона завантажувалась. Перезавантажте вкладку, щоб її інспектувати.',
  'screen.notDetected.title': 'PixiJS не знайдено',
  'screen.notDetected.body':
    'Сторінка не публікує ні `__PIXI_DEVTOOLS__`, ні `__PIXI_APP__`, ні рендерера чи сцени — ані в самому вікні, ані в жодному з його iframe.',
  'screen.unsupported.title': 'Непідтримувана версія',
  'screen.unsupported.body':
    'Застосунок знайдено ({version}), але його версія поза підтримуваним діапазоном (v6–v8).',
  'screen.unsupported.bodyUnknown':
    'Застосунок знайдено, але його версія поза підтримуваним діапазоном (v6–v8).',
  'screen.help': 'Як панель знаходить застосунок',

  // ── scene: the tree and what hangs under it ──────────────────────────────
  'scene.search': 'Пошук',
  'scene.selectNode': 'Виберіть вузол у дереві.',
  'scene.unpinAll': 'Відкріпити всі закріплені в дереві гізмо',
  'scene.picker.tip':
    'Дозволяє вибрати вузол просто на сцені, клікнувши по ньому. [[Натисніть {key}]]',
  'scene.counts.tip': 'Рахує, з чого складається сцена, під деревом. [[Натисніть {key}]]',

  'scene.delete.title': 'Видалити «{name}»?',
  'scene.delete.body':
    'Вузол і все, що під ним, зникнуть зі сцени. Скасувати це буде неможливо.',
  'scene.delete.confirm': 'Видалити',
  'scene.delete.cancel': 'Скасувати',

  'scene.node.visible': 'Перемкнути видимість вузла.',
  'scene.node.bookmark':
    'Тримати цей вузол у списку закладок під деревом, щоб знайти його знову після перезавантаження сторінки.',
  'scene.node.pin':
    'Тримати гізмо початку координат на цьому вузлі, підписане його іменем, а не лише поки він вибраний.',

  // Клаузула `[[…]]` розбирається як «перше слово — дієслово, решта —
  // комбінація», тож слово перед клавішею мусить бути одним. Скрізь
  // «Натисніть»: різниця між toggle і cycle сказана в самому реченні, а рядок
  // із клавішею відповідає на одне питання — що натиснути.
  'scene.overlay.highlight':
    'Обводити вибраний вузол на сцені й той, що під курсором. Клік перебирає: із заливкою, лише рамка, вимкнено. [[Натисніть {key}]]',
  'scene.overlay.wrapBox':
    'Малювати рамку, всередині якої переноситься вибраний текст. [[Натисніть {key}]]',
  'scene.overlay.axes':
    'Позначати нуль вибраного вузла й того, що під курсором. Клік перебирає: стрілки, центр, вимкнено. [[Натисніть {key}]]',
  'scene.overlay.transform':
    'Тягніть вибраний вузол просто на сцені: рамка рухає його, маркери масштабують, а простір одразу за кутом обертає. [[Натисніть {key}]]',

  'scene.counts.title': 'Лічильники',
  'scene.counts.close': 'Закрити лічильники',
  'scene.counts.mode.scene': 'Усе, що є на сцені',
  'scene.counts.mode.node': 'Вибраний вузол і все, що під ним',
  'scene.counts.mode.both': 'Уся сцена й частка вибраного вузла в ній',
  'scene.counts.empty': 'На сцені порожньо.',

  'scene.picked.title': 'Під курсором',
  'scene.picked.close': 'Закрити список',
  // `{type}` — це ім'я класу PixiJS, воно вставляється неперекладеним; тому
  // слот іменований, а речення — цілий рядок на мову.
  'scene.picked.filter': 'Показати лише вузли {type}',
  'scene.picked.empty': 'Під кліком немає нічого такого.',

  'scene.bookmarks.title': 'Закладки',
  'scene.bookmarks.clearAll': 'Прибрати всі закладки',
  'scene.bookmarks.remove': 'Прибрати цю закладку',

  // ── scene: hints inside the property panel, whose rows stay English ───────
  'scene.prop.pickTexture': 'Вибрати завантажену текстуру',
  'scene.prop.copyTextureId': 'Скопіювати id текстури',
  'scene.prop.copyObject': "Скопіювати об'єкт у буфер обміну",
  'scene.prop.logNode': "Вивести вузол у консоль сторінки — живим об'єктом",
  'scene.prop.copyStyle': 'Скопіювати стиль у буфер обміну',
  'scene.prop.addTag': 'Додати тег',
  'scene.prop.addTagProperty': 'Додати властивість до цього тега',
  'scene.prop.resetOnTag': 'Повернути {field} на <{tag}> до типового',
  'scene.prop.deleteTag': 'Видалити тег <{tag}>',

  // ── scene: hints inside the Spine section, whose text stays English ───────
  'spine.addTest': 'Зібрати другий Spine поруч, щоб пробувати на ньому',
  'spine.addTrack': 'Додати порожній трек. Нічого не почнеться до Play.',
  'spine.clearTracks': 'Зупинити всі треки там, де вони стоять',
  'spine.trackIndex': 'Номер трека',
  'spine.chooseAnimation': 'Вибрати анімацію',
  'spine.copyAnimation': 'Скопіювати назву анімації',
  'spine.repeat': 'Повторювати анімацію',
  'spine.removeTrack': 'Прибрати цей трек',
  'spine.clearQueue': 'Скинути все, що стоїть у черзі за поточною анімацією',
  'spine.copyLog': 'Скопіювати лог у буфер обміну',
  'spine.changeSkeleton': 'Змінити, який скелет несе цей вузол',
  'spine.applySetup': 'Застосувати цей набір до скелета',
  // Ім'я API — це підмет, і воно лишається; перекладено те, чим його пояснено.
  'spine.stateTimeScale': 'AnimationState.timeScale — усі треки разом',

  // ── assets: the two toolbar rows, and nothing below them ─────────────────
  'assets.filter': 'Фільтр',
  'assets.filter.gpu': 'GPU',
  'assets.filter.gpu.all': 'Усі',
  'assets.filter.gpu.loaded': 'Завантажені на GPU',
  'assets.filter.gpu.unloaded': 'Не завантажені на GPU',
  'assets.filter.name': 'Назва',
  'assets.filter.name.all': 'Усі',
  // Ці дві лишаються англійськими навмисно: вони перегукуються з підписом
  // плитки `Unnamed`, який теж лишається англійським.
  'assets.filter.name.named': 'Named only',
  'assets.filter.name.unnamed': 'Unnamed only',
  'assets.search': 'Пошук',
  'assets.refresh': 'Оновити текстури',
  'assets.grid': 'Текстури',

  'assets.sort': 'Порядок',
  'assets.sort.latest': 'У тому порядку, в якому їх вивантажив рендерер',
  'assets.sort.name': 'За назвою, під якою показано текстуру',
  'assets.sort.size': 'За тим, скільки вона коштує на GPU',
  'assets.sort.reverse': 'Клік перевертає порядок',

  'assets.selectTexture': 'Виберіть текстуру, щоб побачити її властивості',
  'assets.background.checker': 'Шахівниця',
  'assets.background.black': 'Чорний',
  'assets.background.white': 'Білий',
  'assets.noName': 'Ця текстура не має назви',
  'assets.openFile': 'Подвійний клік відкриє файл у новій вкладці',
  // Заголовок над таблицею метаданих, а не назви рядків у ній: ті лишаються
  // англійськими, бо це словник самого рендерера.
  'assets.info': 'Відомості',
  'assets.frames': 'Кадри',
  'assets.usedBy': 'Хто використовує',

  // ── stats: the retention control and the hints, and nothing else ─────────
  'stats.keep': 'Зберігати',
  'stats.keep.tip':
    'Скільки історії тримають графіки. Типово вимкнено, і наступного дня буде вимкнено знову — запис коштує грі трохи на кожному кадрі, тож вмикайте його, коли він потрібен.',
  'stats.keep.off':
    'Не зберігати нічого: сторінка припиняє запис, і графіки показують лише живе вікно',
  'stats.keep.some': 'Зберігати останні {n} хв',
  'stats.dropped': 'Семпли, які панель не встигла зібрати, — в історії є діра',
  'stats.pickCharts': 'Вибрати, які графіки малювати',
  'stats.minimap': 'Увесь запис; тягніть, щоб пересувати графіки по ньому',

  'stats.about.fps': 'Скільки кадрів рендерер намалював за секунду.',
  'stats.about.frameMs':
    'Мілісекунди між кадрами. Ловить ті ривки, які частота, усереднена за секунду, згладжує.',
  'stats.about.renderMs':
    'Скільки з кадру PixiJS витратив усередині власного рендера. Читайте проти Frame time вище: різниця — це все, що не є малюванням: логіка гри, інші скрипти, браузер. Саме це варто знати першим, коли кадр повільний.',
  'stats.about.worstFrameMs':
    'Найдовший окремий проміжок між кадрами за останню секунду. Frame time — це середнє, а середнє ховає ривок: один кадр на 120 мс серед шістдесяти по 16 майже його не зрушить. Відстань між ними і є ривком.',
  'stats.about.filters':
    'Вузли, що несуть хоча б один фільтр. Кожен коштує перемикання на render target і назад, тож жменька їх часто і є всією причиною, чому сцена повільна. Це не тип вузла — Container із фільтром лишається Container, — тож лічильники нижче про нього не скажуть.',
  'stats.about.masks':
    'Вузли, що несуть маску. Кожна розриває батч з обох боків, і саме тому кількість draw calls росте швидше за кількість вузлів.',
  'stats.about.drawCalls':
    'Скільки разів за кадр іде подання на малювання — приблизно на скільки батчів розпадається сцена, і звична причина повільного кадру, коли річ не в логіці гри. Риска замість числа означає, що в цього рендерера немає шляху малювання, який інспектор упізнає.',
  'stats.about.heapMB':
    "Пам'ять, яку сторінка тримає в JavaScript: об'єкти, масиви, замикання — гра й усе інше, що на ній працює. Не текстури й не GPU, це графік нижче. Лінія, що росте й ніколи не спадає, — саме так виглядає витік.",
  'stats.about.gpuMB':
    'Оцінка того, скільки байтів текстури рендерера займають на GPU, за їхнім розміром і форматом.',
  'stats.about.textures': 'Текстури, які рендерер тримає на обліку.',
  'stats.about.texturesOnGpu':
    'Скільки текстур рендерера справді вивантажено на GPU.',
  'stats.about.nodes': 'Кожен вузол у графі сцени.',

  // ── shared editors: hints only ───────────────────────────────────────────
  'ui.color.keyword': 'Це ключове слово CSS, а не число',
  'ui.color.pick': 'Вибрати колір',
  'ui.gradient.needsTwo': 'Градієнту потрібні два кольори',
  'ui.gradient.removeStop': 'Прибрати цей колір',
  'ui.gradient.offset': 'Де цей колір стоїть уздовж переходу, від 0 до 1',
  'ui.gradient.preview': 'Перехід таким, яким його намалюють',
  'ui.gradient.vertical': 'Вертикальний',
  'ui.gradient.horizontal': 'Горизонтальний',
  'ui.gradient.radial': 'Радіальний',
  'ui.fill.solid': 'Один колір',
  'ui.fill.gradient': 'Перехід кольорів',
  'ui.textList.onePerLine': 'По одному запису на рядок',
  'ui.split.drag': 'Тягніть, щоб поділити дві половини',
  // ── settings: the overlay's own colours ──────────────────────────────────
  'settings.overlay.filled': 'Рамка з заливкою',
  'settings.overlay.bare': 'Рамка без заливки',
  'settings.overlay.selected': 'Вибране',
  'settings.overlay.hovered': 'Під курсором',
  'settings.overlay.wrapBox': 'Рамка переносу',
  'settings.overlay.fill': 'Заливка',
  'settings.overlay.fillAlpha': 'Прозорість заливки',
  'settings.overlay.outline': 'Контур',
  'settings.overlay.outlineAlpha': 'Прозорість контуру',
  'settings.overlay.outlineWidth': 'Товщина контуру',

  // ── the counts strip's three modes ───────────────────────────────────────
  'scene.counts.mode.scene.label': 'Сцена',
  'scene.counts.mode.node.label': 'Вузол',
  'scene.counts.mode.both.label': 'Разом',

  // ── assets: the order row ────────────────────────────────────────────────
  'assets.sort.latest.label': 'Час',
  'assets.sort.name.label': 'Назва',
  'assets.sort.size.label': 'Розмір',
  'assets.order.latest.desc': 'Спершу нові',
  'assets.order.latest.asc': 'Спершу старі',
  'assets.order.name.asc': 'Від А до Я',
  'assets.order.name.desc': 'Від Я до А',
  'assets.order.size.desc': 'Спершу великі',
  'assets.order.size.asc': 'Спершу малі',

  // ── stats: the chart picker ──────────────────────────────────────────────
  'stats.charts': 'Графіки',
  'stats.charts.all': 'Усі',
  'stats.charts.none': 'Жодного',

  // ── spine: what the one button under a track is for ──────────────────────
  'spine.chosen': 'Вибрано — натисніть Play, щоб запустити',
  'spine.play': 'Запустити вибрану анімацію',
  'spine.pause': 'Пауза',
  'spine.resume': 'Продовжити',
  'spine.playOffline': 'Застосуйте цей набір до скелета, щоб програти його',
};

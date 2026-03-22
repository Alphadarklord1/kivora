/**
 * Kivora global translation dictionary.
 * Keys are English strings; values are per-locale translations.
 * Used by useI18n as a shared fallback before component-local dicts.
 */

export type SupportedLocale = 'en' | 'ar' | 'fr' | 'es' | 'de' | 'zh';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'ar', 'fr', 'es', 'de', 'zh'];

export const RTL_LOCALES: SupportedLocale[] = ['ar'];

export function isRtl(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** Map from English key → locale → translated string */
export const GLOBAL_TRANSLATIONS: Record<string, Partial<Record<SupportedLocale, string>>> = {

  // ─── Navigation ────────────────────────────────────────────────────────────
  Study:            { ar: 'الدراسة',      fr: 'Étude',             es: 'Estudio',             de: 'Lernen',         zh: '学习' },
  'Models & Downloads': { ar: 'النماذج والتنزيلات', fr: 'Modèles & Téléch.', es: 'Modelos y descargas', de: 'Modelle & Downloads', zh: '模型与下载' },
  Workspace:        { ar: 'مساحة العمل',  fr: 'Espace de travail', es: 'Espacio de trabajo', de: 'Arbeitsbereich', zh: '工作区' },
  Library:          { ar: 'المكتبة',       fr: 'Bibliothèque',       es: 'Biblioteca',          de: 'Bibliothek',     zh: '图书馆' },
  Decks:            { ar: 'البطاقات',      fr: 'Decks',              es: 'Mazos',               de: 'Decks',          zh: '卡组' },
  'Review Sets':    { ar: 'مجموعات المراجعة', fr: 'Sets de révision', es: 'Conjuntos de repaso', de: 'Lernsets', zh: '复习集' },
  'Scholar Hub': { ar: 'مدرب المراجعة', fr: 'Coach de révision',  es: 'Coach de repaso',     de: 'Lerncoach',      zh: '复习教练' },
  Analytics:        { ar: 'التحليلات',     fr: 'Analyses',           es: 'Analíticas',          de: 'Analysen',       zh: '分析' },
  Planner:          { ar: 'المخطط',        fr: 'Planificateur',      es: 'Planificador',        de: 'Planer',         zh: '计划器' },
  Math:             { ar: 'الرياضيات',     fr: 'Mathématiques',      es: 'Matemáticas',         de: 'Mathematik',     zh: '数学' },
  Settings:         { ar: 'الإعدادات',     fr: 'Paramètres',         es: 'Configuración',       de: 'Einstellungen',  zh: '设置' },
  Sharing:          { ar: 'المشاركة',      fr: 'Partage',            es: 'Compartir',           de: 'Teilen',         zh: '共享' },
  Report:           { ar: 'الإبلاغ',       fr: 'Rapport',            es: 'Informe',             de: 'Bericht',        zh: '报告' },

  // ─── Auth ──────────────────────────────────────────────────────────────────
  'Sign in':        { ar: 'تسجيل الدخول',  fr: 'Se connecter',       es: 'Iniciar sesión',      de: 'Anmelden',       zh: '登录' },
  'Sign out':       { ar: 'تسجيل الخروج',  fr: 'Se déconnecter',     es: 'Cerrar sesión',       de: 'Abmelden',       zh: '退出' },
  'Create account': { ar: 'إنشاء حساب',    fr: 'Créer un compte',    es: 'Crear cuenta',        de: 'Konto erstellen', zh: '创建账户' },
  'Continue as Guest': { ar: 'المتابعة كضيف', fr: 'Continuer en tant qu\'invité', es: 'Continuar como invitado', de: 'Als Gast fortfahren', zh: '以访客身份继续' },

  // ─── Common actions ────────────────────────────────────────────────────────
  Save:             { ar: 'حفظ',          fr: 'Enregistrer',        es: 'Guardar',             de: 'Speichern',      zh: '保存' },
  Cancel:           { ar: 'إلغاء',        fr: 'Annuler',            es: 'Cancelar',            de: 'Abbrechen',      zh: '取消' },
  Delete:           { ar: 'حذف',          fr: 'Supprimer',          es: 'Eliminar',            de: 'Löschen',        zh: '删除' },
  Edit:             { ar: 'تعديل',        fr: 'Modifier',           es: 'Editar',              de: 'Bearbeiten',     zh: '编辑' },
  Copy:             { ar: 'نسخ',          fr: 'Copier',             es: 'Copiar',              de: 'Kopieren',       zh: '复制' },
  Search:           { ar: 'بحث',          fr: 'Rechercher',         es: 'Buscar',              de: 'Suchen',         zh: '搜索' },
  Close:            { ar: 'إغلاق',        fr: 'Fermer',             es: 'Cerrar',              de: 'Schließen',      zh: '关闭' },
  Open:             { ar: 'فتح',          fr: 'Ouvrir',             es: 'Abrir',               de: 'Öffnen',         zh: '打开' },
  Add:              { ar: 'إضافة',        fr: 'Ajouter',            es: 'Agregar',             de: 'Hinzufügen',     zh: '添加' },
  Create:           { ar: 'إنشاء',        fr: 'Créer',              es: 'Crear',               de: 'Erstellen',      zh: '创建' },
  Upload:           { ar: 'رفع',          fr: 'Téléverser',         es: 'Subir',               de: 'Hochladen',      zh: '上传' },
  Download:         { ar: 'تنزيل',        fr: 'Télécharger',        es: 'Descargar',           de: 'Herunterladen',  zh: '下载' },
  Share:            { ar: 'مشاركة',       fr: 'Partager',           es: 'Compartir',           de: 'Teilen',         zh: '共享' },
  Export:           { ar: 'تصدير',        fr: 'Exporter',           es: 'Exportar',            de: 'Exportieren',    zh: '导出' },
  Import:           { ar: 'استيراد',      fr: 'Importer',           es: 'Importar',            de: 'Importieren',    zh: '导入' },
  Confirm:          { ar: 'تأكيد',        fr: 'Confirmer',          es: 'Confirmar',           de: 'Bestätigen',     zh: '确认' },
  'Load more':      { ar: 'تحميل المزيد', fr: 'Charger plus',       es: 'Cargar más',          de: 'Mehr laden',     zh: '加载更多' },
  Refresh:          { ar: 'تحديث',        fr: 'Actualiser',         es: 'Actualizar',          de: 'Aktualisieren',  zh: '刷新' },
  Done:             { ar: 'تم',           fr: 'Terminé',            es: 'Listo',               de: 'Fertig',         zh: '完成' },
  Back:             { ar: 'رجوع',         fr: 'Retour',             es: 'Volver',              de: 'Zurück',         zh: '返回' },
  Next:             { ar: 'التالي',       fr: 'Suivant',            es: 'Siguiente',           de: 'Weiter',         zh: '下一步' },
  Previous:         { ar: 'السابق',       fr: 'Précédent',          es: 'Anterior',            de: 'Vorherige',      zh: '上一步' },

  // ─── Status / feedback ────────────────────────────────────────────────────
  Loading:          { ar: 'جار التحميل…', fr: 'Chargement…',        es: 'Cargando…',           de: 'Laden…',         zh: '加载中…' },
  'Loading…':       { ar: 'جار التحميل…', fr: 'Chargement…',        es: 'Cargando…',           de: 'Laden…',         zh: '加载中…' },
  Saved:            { ar: 'تم الحفظ',     fr: 'Enregistré',         es: 'Guardado',            de: 'Gespeichert',    zh: '已保存' },
  Copied:           { ar: 'تم النسخ',     fr: 'Copié',              es: 'Copiado',             de: 'Kopiert',        zh: '已复制' },
  Deleted:          { ar: 'تم الحذف',     fr: 'Supprimé',           es: 'Eliminado',           de: 'Gelöscht',       zh: '已删除' },
  Error:            { ar: 'خطأ',          fr: 'Erreur',             es: 'Error',               de: 'Fehler',         zh: '错误' },
  Success:          { ar: 'نجاح',         fr: 'Succès',             es: 'Éxito',               de: 'Erfolg',         zh: '成功' },
  Warning:          { ar: 'تحذير',        fr: 'Avertissement',      es: 'Advertencia',         de: 'Warnung',        zh: '警告' },

  // ─── Settings page ────────────────────────────────────────────────────────
  Language:         { ar: 'اللغة',        fr: 'Langue',             es: 'Idioma',              de: 'Sprache',        zh: '语言' },
  Theme:            { ar: 'المظهر',       fr: 'Thème',              es: 'Tema',                de: 'Thema',          zh: '主题' },
  'Font size':      { ar: 'حجم الخط',    fr: 'Taille de police',   es: 'Tamaño de fuente',    de: 'Schriftgröße',   zh: '字体大小' },
  Appearance:       { ar: 'المظهر',       fr: 'Apparence',          es: 'Apariencia',          de: 'Erscheinungsbild', zh: '外观' },
  General:          { ar: 'عام',          fr: 'Général',            es: 'General',             de: 'Allgemein',      zh: '常规' },
  Account:          { ar: 'الحساب',       fr: 'Compte',             es: 'Cuenta',              de: 'Konto',          zh: '账户' },
  Profile:          { ar: 'الملف الشخصي', fr: 'Profil',             es: 'Perfil',              de: 'Profil',         zh: '个人资料' },
  'Display name':   { ar: 'الاسم المعروض', fr: 'Nom affiché',       es: 'Nombre mostrado',     de: 'Anzeigename',    zh: '显示名称' },

  // ─── Library ──────────────────────────────────────────────────────────────
  'Saved items':    { ar: 'العناصر المحفوظة', fr: 'Éléments sauvegardés', es: 'Elementos guardados', de: 'Gespeicherte Elemente', zh: '已保存项目' },
  'No saved items yet': { ar: 'لا توجد عناصر محفوظة بعد', fr: 'Aucun élément sauvegardé', es: 'No hay elementos guardados aún', de: 'Noch keine gespeicherten Elemente', zh: '暂无已保存项目' },
  'Search library': { ar: 'بحث في المكتبة', fr: 'Rechercher dans la bibliothèque', es: 'Buscar en la biblioteca', de: 'Bibliothek durchsuchen', zh: '搜索图书馆' },
  Summarize:        { ar: 'ملخص',         fr: 'Résumer',            es: 'Resumir',             de: 'Zusammenfassen', zh: '总结' },
  Notes:            { ar: 'ملاحظات',      fr: 'Notes',              es: 'Notas',               de: 'Notizen',        zh: '笔记' },
  Quiz:             { ar: 'اختبار',       fr: 'Quiz',               es: 'Cuestionario',        de: 'Quiz',           zh: '测验' },
  Flashcards:       { ar: 'بطاقات',       fr: 'Fiches',             es: 'Tarjetas',            de: 'Lernkarten',     zh: '闪卡' },

  // ─── Planner ──────────────────────────────────────────────────────────────
  'New Event':      { ar: 'حدث جديد',     fr: 'Nouvel événement',   es: 'Nuevo evento',        de: 'Neues Ereignis', zh: '新建事件' },
  Today:            { ar: 'اليوم',        fr: 'Aujourd\'hui',       es: 'Hoy',                 de: 'Heute',          zh: '今天' },
  Month:            { ar: 'الشهر',        fr: 'Mois',               es: 'Mes',                 de: 'Monat',          zh: '月' },
  Week:             { ar: 'الأسبوع',      fr: 'Semaine',            es: 'Semana',              de: 'Woche',          zh: '周' },
  Day:              { ar: 'اليوم',        fr: 'Jour',               es: 'Día',                 de: 'Tag',            zh: '天' },
  Agenda:           { ar: 'جدول الأعمال', fr: 'Agenda',             es: 'Agenda',              de: 'Tagesordnung',   zh: '日程' },
  Exam:             { ar: 'امتحان',       fr: 'Examen',             es: 'Examen',              de: 'Prüfung',        zh: '考试' },
  Deadline:         { ar: 'موعد نهائي',   fr: 'Date limite',        es: 'Fecha límite',        de: 'Frist',          zh: '截止日期' },
  Class:            { ar: 'درس',          fr: 'Cours',              es: 'Clase',               de: 'Unterricht',     zh: '课程' },
  Break:            { ar: 'استراحة',      fr: 'Pause',              es: 'Descanso',            de: 'Pause',          zh: '休息' },
  Revision:         { ar: 'مراجعة',       fr: 'Révision',           es: 'Revisión',            de: 'Wiederholung',   zh: '复习' },
  Title:            { ar: 'العنوان',      fr: 'Titre',              es: 'Título',              de: 'Titel',          zh: '标题' },
  Description:      { ar: 'الوصف',        fr: 'Description',        es: 'Descripción',         de: 'Beschreibung',   zh: '描述' },
  'Start time':     { ar: 'وقت البدء',    fr: 'Heure de début',     es: 'Hora de inicio',      de: 'Startzeit',      zh: '开始时间' },
  'End time':       { ar: 'وقت الانتهاء', fr: 'Heure de fin',       es: 'Hora de fin',         de: 'Endzeit',        zh: '结束时间' },
  'All day':        { ar: 'طوال اليوم',   fr: 'Toute la journée',   es: 'Todo el día',         de: 'Den ganzen Tag', zh: '全天' },
  'No events today': { ar: 'لا أحداث اليوم', fr: 'Aucun événement aujourd\'hui', es: 'No hay eventos hoy', de: 'Keine Ereignisse heute', zh: '今天没有事件' },
  'No events':      { ar: 'لا توجد أحداث', fr: 'Aucun événement',   es: 'No hay eventos',      de: 'Keine Ereignisse', zh: '没有事件' },

  // ─── Sharing ──────────────────────────────────────────────────────────────
  'Shared with me': { ar: 'تمت مشاركته معي', fr: 'Partagé avec moi', es: 'Compartido conmigo', de: 'Mit mir geteilt', zh: '与我共享' },
  'My shares':      { ar: 'مشاركاتي',    fr: 'Mes partages',       es: 'Mis compartidos',     de: 'Meine Freigaben', zh: '我的共享' },
  'Revoke':         { ar: 'إلغاء المشاركة', fr: 'Révoquer',        es: 'Revocar',             de: 'Widerrufen',     zh: '撤销' },
  'Copy Link':      { ar: 'نسخ الرابط',   fr: 'Copier le lien',    es: 'Copiar enlace',       de: 'Link kopieren',  zh: '复制链接' },
  'Can edit':       { ar: 'يمكن التعديل', fr: 'Peut modifier',     es: 'Puede editar',        de: 'Kann bearbeiten', zh: '可以编辑' },
  'View only':      { ar: 'عرض فقط',      fr: 'Lecture seule',     es: 'Solo lectura',        de: 'Nur ansehen',    zh: '仅查看' },
  Expires:          { ar: 'ينتهي',        fr: 'Expire',             es: 'Expira',              de: 'Läuft ab',       zh: '到期' },
  Expired:          { ar: 'منتهي',        fr: 'Expiré',             es: 'Expirado',            de: 'Abgelaufen',     zh: '已到期' },
  From:             { ar: 'من',           fr: 'De',                 es: 'De',                  de: 'Von',            zh: '来自' },
  To:               { ar: 'إلى',          fr: 'À',                  es: 'Para',                de: 'An',             zh: '到' },
  File:             { ar: 'ملف',          fr: 'Fichier',            es: 'Archivo',             de: 'Datei',          zh: '文件' },
  Folder:           { ar: 'مجلد',         fr: 'Dossier',            es: 'Carpeta',             de: 'Ordner',         zh: '文件夹' },
  Topic:            { ar: 'موضوع',        fr: 'Sujet',              es: 'Tema',                de: 'Thema',          zh: '主题' },
  All:              { ar: 'الكل',         fr: 'Tout',               es: 'Todo',                de: 'Alle',           zh: '全部' },

  // ─── Report ───────────────────────────────────────────────────────────────
  'Report issue':   { ar: 'الإبلاغ عن مشكلة', fr: 'Signaler un problème', es: 'Reportar problema', de: 'Problem melden', zh: '报告问题' },
  'Issue type':     { ar: 'نوع البلاغ',    fr: 'Type de problème',   es: 'Tipo de problema',    de: 'Problemtyp',     zh: '问题类型' },
  'Error report':   { ar: 'بلاغ خطأ',      fr: 'Rapport d\'erreur',  es: 'Informe de error',    de: 'Fehlerbericht',  zh: '错误报告' },
  'Bug report':     { ar: 'بلاغ عطل',      fr: 'Rapport de bogue',   es: 'Informe de bug',      de: 'Fehlermeldung',  zh: '漏洞报告' },
  'Feature request': { ar: 'طلب ميزة',    fr: 'Demande de fonctionnalité', es: 'Solicitud de función', de: 'Funktionsanfrage', zh: '功能请求' },

  // ─── Months ───────────────────────────────────────────────────────────────
  January:   { ar: 'يناير',   fr: 'Janvier',   es: 'Enero',      de: 'Januar',   zh: '一月' },
  February:  { ar: 'فبراير',  fr: 'Février',   es: 'Febrero',    de: 'Februar',  zh: '二月' },
  March:     { ar: 'مارس',    fr: 'Mars',      es: 'Marzo',      de: 'März',     zh: '三月' },
  April:     { ar: 'أبريل',   fr: 'Avril',     es: 'Abril',      de: 'April',    zh: '四月' },
  May:       { ar: 'مايو',    fr: 'Mai',       es: 'Mayo',       de: 'Mai',      zh: '五月' },
  June:      { ar: 'يونيو',   fr: 'Juin',      es: 'Junio',      de: 'Juni',     zh: '六月' },
  July:      { ar: 'يوليو',   fr: 'Juillet',   es: 'Julio',      de: 'Juli',     zh: '七月' },
  August:    { ar: 'أغسطس',  fr: 'Août',      es: 'Agosto',     de: 'August',   zh: '八月' },
  September: { ar: 'سبتمبر',  fr: 'Septembre', es: 'Septiembre', de: 'September', zh: '九月' },
  October:   { ar: 'أكتوبر',  fr: 'Octobre',   es: 'Octubre',    de: 'Oktober',  zh: '十月' },
  November:  { ar: 'نوفمبر',  fr: 'Novembre',  es: 'Noviembre',  de: 'November', zh: '十一月' },
  December:  { ar: 'ديسمبر',  fr: 'Décembre',  es: 'Diciembre',  de: 'Dezember', zh: '十二月' },

  // ─── Days ─────────────────────────────────────────────────────────────────
  Sunday:    { ar: 'الأحد',    fr: 'Dimanche',  es: 'Domingo',    de: 'Sonntag',  zh: '星期日' },
  Monday:    { ar: 'الاثنين',  fr: 'Lundi',     es: 'Lunes',      de: 'Montag',   zh: '星期一' },
  Tuesday:   { ar: 'الثلاثاء', fr: 'Mardi',     es: 'Martes',     de: 'Dienstag', zh: '星期二' },
  Wednesday: { ar: 'الأربعاء', fr: 'Mercredi',  es: 'Miércoles',  de: 'Mittwoch', zh: '星期三' },
  Thursday:  { ar: 'الخميس',   fr: 'Jeudi',     es: 'Jueves',     de: 'Donnerstag', zh: '星期四' },
  Friday:    { ar: 'الجمعة',   fr: 'Vendredi',  es: 'Viernes',    de: 'Freitag',  zh: '星期五' },
  Saturday:  { ar: 'السبت',    fr: 'Samedi',    es: 'Sábado',     de: 'Samstag',  zh: '星期六' },

  // ─── Short days ───────────────────────────────────────────────────────────
  Sun: { ar: 'أحد',  fr: 'Dim', es: 'Dom', de: 'So', zh: '日' },
  Mon: { ar: 'اثن',  fr: 'Lun', es: 'Lun', de: 'Mo', zh: '一' },
  Tue: { ar: 'ثلا',  fr: 'Mar', es: 'Mar', de: 'Di', zh: '二' },
  Wed: { ar: 'أرب',  fr: 'Mer', es: 'Mié', de: 'Mi', zh: '三' },
  Thu: { ar: 'خمس',  fr: 'Jeu', es: 'Jue', de: 'Do', zh: '四' },
  Fri: { ar: 'جمع',  fr: 'Ven', es: 'Vie', de: 'Fr', zh: '五' },
  Sat: { ar: 'سبت',  fr: 'Sam', es: 'Sáb', de: 'Sa', zh: '六' },

  // ─── Analytics ────────────────────────────────────────────────────────────
  'Total sessions':  { ar: 'إجمالي الجلسات', fr: 'Sessions totales', es: 'Sesiones totales', de: 'Sitzungen gesamt', zh: '总会话' },
  'Average score':   { ar: 'متوسط الدرجات',  fr: 'Score moyen',      es: 'Puntuación media', de: 'Durchschnittswert', zh: '平均分' },
  'Study streak':    { ar: 'سلسلة الدراسة',   fr: 'Série d\'étude',   es: 'Racha de estudio', de: 'Lernstreak',       zh: '学习连击' },
  'Cards mastered':  { ar: 'البطاقات المتقنة', fr: 'Cartes maîtrisées', es: 'Tarjetas dominadas', de: 'Beherrschte Karten', zh: '已掌握卡片' },

  // ─── Workspace tools ──────────────────────────────────────────────────────
  Generate:          { ar: 'توليد',         fr: 'Générer',           es: 'Generar',            de: 'Generieren',     zh: '生成' },
  'Upload file':     { ar: 'رفع ملف',       fr: 'Téléverser un fichier', es: 'Subir archivo',  de: 'Datei hochladen', zh: '上传文件' },
  'Select a file':   { ar: 'اختر ملفًا',    fr: 'Sélectionner un fichier', es: 'Seleccionar archivo', de: 'Datei auswählen', zh: '选择文件' },
  'No file selected': { ar: 'لم يتم تحديد ملف', fr: 'Aucun fichier sélectionné', es: 'No se seleccionó archivo', de: 'Keine Datei ausgewählt', zh: '未选择文件' },
  'Save to Library': { ar: 'حفظ في المكتبة', fr: 'Sauvegarder dans la bibliothèque', es: 'Guardar en la biblioteca', de: 'In Bibliothek speichern', zh: '保存到图书馆' },
  'Save to Folder':  { ar: 'حفظ في المجلد',  fr: 'Sauvegarder dans le dossier', es: 'Guardar en la carpeta', de: 'Im Ordner speichern', zh: '保存到文件夹' },

  // ─── Models ───────────────────────────────────────────────────────────────
  'AI Models':       { ar: 'نماذج الذكاء الاصطناعي', fr: 'Modèles IA', es: 'Modelos IA', de: 'KI-Modelle', zh: 'AI 模型' },
  'Local AI':        { ar: 'ذكاء اصطناعي محلي', fr: 'IA locale',     es: 'IA local',   de: 'Lokale KI',   zh: '本地 AI' },
  'Cloud AI':        { ar: 'ذكاء اصطناعي سحابي', fr: 'IA cloud',     es: 'IA en la nube', de: 'Cloud-KI', zh: '云端 AI' },

  // ─── Math ─────────────────────────────────────────────────────────────────
  Solve:             { ar: 'حل',           fr: 'Résoudre',           es: 'Resolver',           de: 'Lösen',          zh: '求解' },
  'Show steps':      { ar: 'عرض الخطوات', fr: 'Afficher les étapes', es: 'Mostrar pasos',      de: 'Schritte anzeigen', zh: '显示步骤' },
  Problem:           { ar: 'المسألة',      fr: 'Problème',           es: 'Problema',           de: 'Aufgabe',        zh: '问题' },
  Solution:          { ar: 'الحل',         fr: 'Solution',           es: 'Solución',           de: 'Lösung',         zh: '解答' },
};

/**
 * Look up a translation for the given key and locale.
 * Falls back to the key (English) if no translation exists.
 */
export function globalT(key: string, locale: SupportedLocale): string {
  if (locale === 'en') return key;
  return GLOBAL_TRANSLATIONS[key]?.[locale] ?? key;
}

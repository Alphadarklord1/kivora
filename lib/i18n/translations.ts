/**
 * Kivora global translation dictionary.
 * Keys are English strings; values are per-locale translations.
 * Supported locales: English (en), Arabic (ar), French (fr).
 */

export type SupportedLocale = 'en' | 'ar' | 'fr';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'ar', 'fr'];

export const RTL_LOCALES: SupportedLocale[] = ['ar'];

export function isRtl(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** Map from English key → locale → translated string */
export const GLOBAL_TRANSLATIONS: Record<string, Partial<Record<SupportedLocale, string>>> = {

  // ─── Sidebar section labels ───────────────────────────────────────────────
  Core:           { ar: 'الأساسي',       fr: 'Principal' },
  Tools:          { ar: 'الأدوات',       fr: 'Outils' },

  // ─── Navigation ────────────────────────────────────────────────────────────
  Study:                { ar: 'الدراسة',              fr: 'Étude' },
  'Models & Downloads': { ar: 'النماذج والتنزيلات',  fr: 'Modèles & Téléch.' },
  Workspace:            { ar: 'مساحة العمل',          fr: 'Espace de travail' },
  Library:              { ar: 'المكتبة',               fr: 'Bibliothèque' },
  Decks:                { ar: 'البطاقات',              fr: 'Decks' },
  'Review Sets':        { ar: 'مجموعات المراجعة',     fr: 'Sets de révision' },
  'Scholar Hub':        { ar: 'مركز الباحث',          fr: 'Scholar Hub' },
  Analytics:            { ar: 'التحليلات',             fr: 'Analyses' },
  Planner:              { ar: 'المخطط',                fr: 'Planificateur' },
  Math:                 { ar: 'الرياضيات',             fr: 'Mathématiques' },
  Settings:             { ar: 'الإعدادات',             fr: 'Paramètres' },
  Grapher:              { ar: 'راسم المنحنيات',         fr: 'Grapheur' },
  'Study Audio':        { ar: 'الصوت الدراسي',         fr: 'Audio d\'étude' },
  Groups:               { ar: 'المجموعات',             fr: 'Groupes' },
  'Study Groups':       { ar: 'مجموعات الدراسة',      fr: 'Groupes d\'étude' },
  'Share decks and study together with classmates.': {
    ar: 'شارك المجموعات وادرس مع زملائك.',
    fr: 'Partagez des decks et étudiez ensemble avec vos camarades.',
  },
  'Join group':         { ar: 'انضم إلى مجموعة',      fr: 'Rejoindre un groupe' },
  '+ New group':        { ar: '+ مجموعة جديدة',        fr: '+ Nouveau groupe' },
  'Create a study group': { ar: 'إنشاء مجموعة دراسية', fr: 'Créer un groupe d\'étude' },
  'Join a group':       { ar: 'الانضمام إلى مجموعة',  fr: 'Rejoindre un groupe' },
  'Create group':       { ar: 'إنشاء المجموعة',        fr: 'Créer le groupe' },
  'Creating…':          { ar: 'جارٍ الإنشاء…',         fr: 'Création…' },
  'Joining…':           { ar: 'جارٍ الانضمام…',        fr: 'Connexion…' },
  'Loading groups…':    { ar: 'جارٍ تحميل المجموعات…', fr: 'Chargement des groupes…' },
  'No groups yet':      { ar: 'لا توجد مجموعات بعد',  fr: 'Aucun groupe pour l\'instant' },
  'Create one to share decks, or ask a classmate for their group code.': {
    ar: 'أنشئ مجموعة لمشاركة المجموعات، أو اطلب من زميل رمز مجموعته.',
    fr: 'Créez-en un pour partager des decks, ou demandez le code de groupe d\'un camarade.',
  },
  'Copy code':          { ar: 'نسخ الرمز',             fr: 'Copier le code' },
  'Code copied!':       { ar: 'تم نسخ الرمز!',         fr: 'Code copié !' },
  'No decks shared yet. Open a deck in Flashcards and use "Share to Group" to add one.': {
    ar: 'لم يتم مشاركة أي مجموعة بعد. افتح مجموعة في البطاقات واستخدم "مشاركة مع المجموعة" لإضافتها.',
    fr: 'Aucun deck partagé. Ouvrez un deck dans Flashcards et utilisez "Partager au groupe" pour en ajouter un.',
  },
  'Share to Group':     { ar: 'مشاركة مع المجموعة',   fr: 'Partager au groupe' },
  '6-character group code': { ar: 'رمز المجموعة (6 أحرف)', fr: 'Code de groupe (6 caractères)' },
  owner:                { ar: 'المالك',                 fr: 'propriétaire' },
  'delete this group':  { ar: 'حذف هذه المجموعة',      fr: 'supprimer ce groupe' },
  'leave this group':   { ar: 'مغادرة هذه المجموعة',   fr: 'quitter ce groupe' },
  'Are you sure you want to': { ar: 'هل أنت متأكد أنك تريد', fr: 'Êtes-vous sûr de vouloir' },
  'Failed to create group.':  { ar: 'فشل إنشاء المجموعة.',   fr: 'Échec de la création du groupe.' },
  'Could not join group.':    { ar: 'تعذر الانضمام للمجموعة.', fr: 'Impossible de rejoindre le groupe.' },
  "You're already in that group.": { ar: 'أنت بالفعل في هذه المجموعة.', fr: 'Vous êtes déjà dans ce groupe.' },
  'No cards found in this deck.': { ar: 'لم يتم العثور على بطاقات في هذه المجموعة.', fr: 'Aucune carte trouvée dans ce deck.' },
  'Failed to build deck.':    { ar: 'فشل بناء المجموعة.',    fr: 'Échec de la construction du deck.' },
  'Failed.':                  { ar: 'فشل.',                   fr: 'Échec.' },
  'Group created!':     { ar: 'تم إنشاء المجموعة!',   fr: 'Groupe créé !' },
  'Joined group!':      { ar: 'تم الانضمام للمجموعة!', fr: 'Groupe rejoint !' },
  'Group deleted.':     { ar: 'تم حذف المجموعة.',      fr: 'Groupe supprimé.' },
  'Left group.':        { ar: 'تم مغادرة المجموعة.',   fr: 'Groupe quitté.' },

  // ─── Reference Library ────────────────────────────────────────────────────
  'Save source':        { ar: 'حفظ المصدر',            fr: 'Enregistrer la source' },
  'Source saved':       { ar: 'تم حفظ المصدر',         fr: 'Source enregistrée' },
  'Saved sources':      { ar: 'المصادر المحفوظة',      fr: 'Sources enregistrées' },
  'My references':      { ar: 'مراجعي',                fr: 'Mes références' },
  'Export BibTeX':      { ar: 'تصدير BibTeX',           fr: 'Exporter BibTeX' },
  'Copy BibTeX':        { ar: 'نسخ BibTeX',             fr: 'Copier BibTeX' },
  'BibTeX copied':      { ar: 'تم نسخ BibTeX',          fr: 'BibTeX copié' },
  'Remove source':      { ar: 'إزالة المصدر',           fr: 'Supprimer la source' },
  'Source removed':     { ar: 'تم إزالة المصدر',        fr: 'Source supprimée' },
  'Resolve DOI / arXiv ID': { ar: 'تحليل DOI / معرّف arXiv', fr: 'Résoudre DOI / ID arXiv' },
  'Resolving…':         { ar: 'جارٍ التحليل…',          fr: 'Résolution…' },
  'Resolved!':          { ar: 'تم التحليل!',            fr: 'Résolu !' },
  'DOI or arXiv ID (e.g. 10.1038/nature12345 or 2301.07041)': {
    ar: 'DOI أو معرّف arXiv (مثال: 10.1038/nature12345 أو 2301.07041)',
    fr: 'DOI ou ID arXiv (ex. : 10.1038/nature12345 ou 2301.07041)',
  },
  'Encrypted · local content stays on device': {
    ar: 'مشفّر · يبقى المحتوى المحلي على الجهاز',
    fr: 'Chiffré · le contenu local reste sur l\'appareil',
  },
  'Write a note for the group…': { ar: 'اكتب ملاحظة للمجموعة…', fr: 'Écrire une note pour le groupe…' },
  'No notes yet. Be the first to post one.': { ar: 'لا توجد ملاحظات بعد. كن أول من يضيف واحدة.', fr: 'Aucune note pour l\'instant. Soyez le premier à en publier une.' },
  Post:   { ar: 'نشر', fr: 'Publier' },
  'Deck shared!':       { ar: 'تمت مشاركة المجموعة!', fr: 'Deck partagé !' },
  'Deck removed.':      { ar: 'تم إزالة المجموعة.',   fr: 'Deck supprimé.' },
  'Remove deck':        { ar: 'إزالة المجموعة',        fr: 'Retirer le deck' },
  'Shared by {name}':   { ar: 'شاركه {name}',          fr: 'Partagé par {name}' },
  'Select a group':     { ar: 'اختر مجموعة',           fr: 'Sélectionner un groupe' },
  'No groups — create or join one first.': {
    ar: 'لا توجد مجموعات — أنشئ مجموعة أو انضم إليها أولاً.',
    fr: "Aucun groupe — créez-en un ou rejoignez-en un d'abord.",
  },
  'Group name (e.g. Bio 101 Study Squad)': {
    ar: 'اسم المجموعة (مثال: فريق بيولوجي 101)',
    fr: 'Nom du groupe (ex. : Groupe Bio 101)',
  },
  'Description (optional)': { ar: 'الوصف (اختياري)', fr: 'Description (facultative)' },
  Sharing:              { ar: 'المشاركة',              fr: 'Partage' },
  Report:               { ar: 'الإبلاغ',               fr: 'Rapport' },

  // ─── Auth ──────────────────────────────────────────────────────────────────
  'Sign in':            { ar: 'تسجيل الدخول',         fr: 'Se connecter' },
  'Sign out':           { ar: 'تسجيل الخروج',         fr: 'Se déconnecter' },
  'Create account':     { ar: 'إنشاء حساب',           fr: 'Créer un compte' },
  'Continue as Guest':  { ar: 'المتابعة كضيف',        fr: "Continuer en tant qu'invité" },

  // ─── Common actions ────────────────────────────────────────────────────────
  Save:           { ar: 'حفظ',           fr: 'Enregistrer' },
  Cancel:         { ar: 'إلغاء',         fr: 'Annuler' },
  Delete:         { ar: 'حذف',           fr: 'Supprimer' },
  Edit:           { ar: 'تعديل',         fr: 'Modifier' },
  Copy:           { ar: 'نسخ',           fr: 'Copier' },
  Search:         { ar: 'بحث',           fr: 'Rechercher' },
  Close:          { ar: 'إغلاق',         fr: 'Fermer' },
  Open:           { ar: 'فتح',           fr: 'Ouvrir' },
  Add:            { ar: 'إضافة',         fr: 'Ajouter' },
  Create:         { ar: 'إنشاء',         fr: 'Créer' },
  Upload:         { ar: 'رفع',           fr: 'Téléverser' },
  Download:       { ar: 'تنزيل',         fr: 'Télécharger' },
  Share:          { ar: 'مشاركة',        fr: 'Partager' },
  Export:         { ar: 'تصدير',         fr: 'Exporter' },
  Import:         { ar: 'استيراد',       fr: 'Importer' },
  Confirm:        { ar: 'تأكيد',         fr: 'Confirmer' },
  'Load more':    { ar: 'تحميل المزيد', fr: 'Charger plus' },
  Refresh:        { ar: 'تحديث',         fr: 'Actualiser' },
  Done:           { ar: 'تم',            fr: 'Terminé' },
  Back:           { ar: 'رجوع',          fr: 'Retour' },
  Next:           { ar: 'التالي',        fr: 'Suivant' },
  Previous:       { ar: 'السابق',        fr: 'Précédent' },

  // ─── Status / feedback ────────────────────────────────────────────────────
  Loading:        { ar: 'جار التحميل…',  fr: 'Chargement…' },
  'Loading…':     { ar: 'جار التحميل…',  fr: 'Chargement…' },
  Saved:          { ar: 'تم الحفظ',      fr: 'Enregistré' },
  Copied:         { ar: 'تم النسخ',      fr: 'Copié' },
  Deleted:        { ar: 'تم الحذف',      fr: 'Supprimé' },
  Error:          { ar: 'خطأ',           fr: 'Erreur' },
  Success:        { ar: 'نجاح',          fr: 'Succès' },
  Warning:        { ar: 'تحذير',         fr: 'Avertissement' },

  // ─── Settings page ────────────────────────────────────────────────────────
  Language:       { ar: 'اللغة',         fr: 'Langue' },
  Theme:          { ar: 'المظهر',        fr: 'Thème' },
  'Font size':    { ar: 'حجم الخط',     fr: 'Taille de police' },
  Appearance:     { ar: 'المظهر',        fr: 'Apparence' },
  General:        { ar: 'عام',           fr: 'Général' },
  Account:        { ar: 'الحساب',        fr: 'Compte' },
  Profile:        { ar: 'الملف الشخصي', fr: 'Profil' },
  'Display name': { ar: 'الاسم المعروض', fr: 'Nom affiché' },

  // Settings form labels
  'Profile picture URL':  { ar: 'رابط صورة الملف الشخصي', fr: 'URL de photo de profil' },
  'Short description':    { ar: 'وصف قصير',                 fr: 'Description courte' },
  'Study interests':      { ar: 'الاهتمامات الدراسية',      fr: "Centres d'intérêt" },
  'Save profile':         { ar: 'حفظ الملف الشخصي',         fr: 'Enregistrer le profil' },
  'New password':         { ar: 'كلمة المرور الجديدة',      fr: 'Nouveau mot de passe' },
  'Current password':     { ar: 'كلمة المرور الحالية',      fr: 'Mot de passe actuel' },
  'Confirm password':     { ar: 'تأكيد كلمة المرور',        fr: 'Confirmer le mot de passe' },
  'Change password':      { ar: 'تغيير كلمة المرور',        fr: 'Changer le mot de passe' },
  'Verify email':         { ar: 'تأكيد البريد الإلكتروني', fr: 'Vérifier l\'e-mail' },

  // Settings section labels
  Security:                                          { ar: 'الأمان',             fr: 'Sécurité' },
  Notifications:                                     { ar: 'الإشعارات',          fr: 'Notifications' },
  Runtime:                                           { ar: 'بيئة التشغيل',       fr: 'Environnement' },
  'AI & Downloads':                                  { ar: 'الذكاء الاصطناعي والتنزيلات', fr: 'IA et téléchargements' },
  Utilities:                                         { ar: 'الأدوات المساعدة',   fr: 'Utilitaires' },
  'Report Issue':                                    { ar: 'الإبلاغ عن مشكلة',  fr: 'Signaler un problème' },
  Privacy:                                           { ar: 'الخصوصية',           fr: 'Confidentialité' },

  // Settings section titles
  'Profile and account basics':                      { ar: 'أساسيات الملف الشخصي والحساب', fr: 'Profil et informations de base' },
  'Password and 2-step verification':                { ar: 'كلمة المرور والتحقق بخطوتين', fr: 'Mot de passe et vérification en 2 étapes' },
  'Theme, language, and readability':                { ar: 'المظهر واللغة وسهولة القراءة', fr: 'Thème, langue et lisibilité' },
  'Notification preferences':                        { ar: 'تفضيلات الإشعارات',   fr: 'Préférences de notification' },
  'What works in this runtime':                      { ar: 'ما يعمل في بيئة التشغيل هذه', fr: 'Ce qui fonctionne dans cet environnement' },
  'AI routing and desktop downloads':                { ar: 'توجيه الذكاء الاصطناعي وتنزيلات سطح المكتب', fr: 'Routage IA et téléchargements bureau' },
  'Secondary tools':                                 { ar: 'الأدوات الثانوية',    fr: 'Outils secondaires' },
  'Diagnostics and issue reporting':                 { ar: 'التشخيص والإبلاغ عن المشكلات', fr: 'Diagnostics et signalement de problèmes' },
  'Privacy and data control':                        { ar: 'الخصوصية والتحكم في البيانات', fr: 'Confidentialité et contrôle des données' },

  // Settings section descriptions
  'Name, image, bio, and sign-in details.':          { ar: 'الاسم والصورة والسيرة الذاتية وتفاصيل تسجيل الدخول.', fr: 'Nom, image, biographie et informations de connexion.' },
  'Protect the account before you rely on it.':      { ar: 'احمِ حسابك قبل الاعتماد عليه.', fr: 'Protégez votre compte avant de vous en servir.' },
  'Keep the app readable without oversized defaults.': { ar: 'اجعل التطبيق سهل القراءة دون إعدادات افتراضية مفرطة.', fr: "Gardez l'application lisible sans paramètres surdimensionnés." },
  'Control reminders, review alerts, and system messages.': { ar: 'تحكم في التذكيرات وتنبيهات المراجعة ورسائل النظام.', fr: 'Contrôlez les rappels, alertes de révision et messages système.' },
  'Check cloud, auth, and storage readiness.':       { ar: 'تحقق من جاهزية السحابة والمصادقة والتخزين.', fr: "Vérifiez l'état du cloud, de l'authentification et du stockage." },
  'One place for model mode and releases.':          { ar: 'مكان واحد لوضع النموذج والإصدارات.', fr: 'Un seul endroit pour le mode modèle et les versions.' },
  'Analytics, sharing, and status live here.':       { ar: 'التحليلات والمشاركة والحالة هنا.', fr: 'Les statistiques, le partage et le statut sont ici.' },
  'File bugs without leaving settings.':             { ar: 'أرسل تقارير الأخطاء دون مغادرة الإعدادات.', fr: 'Signalez des bugs sans quitter les paramètres.' },
  'Choose how much Kivora stores and sends.':        { ar: 'اختر مقدار ما يخزنه Kivora ويرسله.', fr: 'Choisissez combien Kivora stocke et envoie.' },

  // ─── Library ──────────────────────────────────────────────────────────────
  'Saved items':       { ar: 'العناصر المحفوظة',     fr: 'Éléments sauvegardés' },
  'No saved items yet':{ ar: 'لا توجد عناصر محفوظة بعد', fr: 'Aucun élément sauvegardé' },
  'Search library':    { ar: 'بحث في المكتبة',       fr: 'Rechercher dans la bibliothèque' },
  Summarize:           { ar: 'ملخص',                 fr: 'Résumer' },
  Notes:               { ar: 'ملاحظات',              fr: 'Notes' },
  Quiz:                { ar: 'اختبار',                fr: 'Quiz' },
  Flashcards:          { ar: 'بطاقات',               fr: 'Fiches' },

  // ─── Planner ──────────────────────────────────────────────────────────────
  'New Event':    { ar: 'حدث جديد',      fr: 'Nouvel événement' },
  Today:          { ar: 'اليوم',         fr: "Aujourd'hui" },
  Month:          { ar: 'الشهر',         fr: 'Mois' },
  Week:           { ar: 'الأسبوع',       fr: 'Semaine' },
  Day:            { ar: 'اليوم',         fr: 'Jour' },
  Agenda:         { ar: 'جدول الأعمال',  fr: 'Agenda' },
  Exam:           { ar: 'امتحان',        fr: 'Examen' },
  Deadline:       { ar: 'موعد نهائي',    fr: 'Date limite' },
  Class:          { ar: 'درس',           fr: 'Cours' },
  Break:          { ar: 'استراحة',       fr: 'Pause' },
  Revision:       { ar: 'مراجعة',        fr: 'Révision' },
  Title:          { ar: 'العنوان',       fr: 'Titre' },
  Description:    { ar: 'الوصف',         fr: 'Description' },
  'Start time':   { ar: 'وقت البدء',     fr: 'Heure de début' },
  'End time':     { ar: 'وقت الانتهاء',  fr: 'Heure de fin' },
  'All day':      { ar: 'طوال اليوم',    fr: 'Toute la journée' },
  'No events today': { ar: 'لا أحداث اليوم', fr: "Aucun événement aujourd'hui" },
  'No events':    { ar: 'لا توجد أحداث', fr: 'Aucun événement' },

  // ─── Sharing ──────────────────────────────────────────────────────────────
  'Shared with me': { ar: 'تمت مشاركته معي', fr: 'Partagé avec moi' },
  'My shares':      { ar: 'مشاركاتي',         fr: 'Mes partages' },
  Revoke:           { ar: 'إلغاء المشاركة',   fr: 'Révoquer' },
  'Copy Link':      { ar: 'نسخ الرابط',        fr: 'Copier le lien' },
  'Can edit':       { ar: 'يمكن التعديل',      fr: 'Peut modifier' },
  'View only':      { ar: 'عرض فقط',           fr: 'Lecture seule' },
  Expires:          { ar: 'ينتهي',             fr: 'Expire' },
  Expired:          { ar: 'منتهي',             fr: 'Expiré' },
  From:             { ar: 'من',                fr: 'De' },
  To:               { ar: 'إلى',               fr: 'À' },
  File:             { ar: 'ملف',               fr: 'Fichier' },
  Folder:           { ar: 'مجلد',              fr: 'Dossier' },
  Topic:            { ar: 'موضوع',             fr: 'Sujet' },
  All:              { ar: 'الكل',              fr: 'Tout' },

  // ─── Report ───────────────────────────────────────────────────────────────
  'Report issue':    { ar: 'الإبلاغ عن مشكلة', fr: 'Signaler un problème' },
  'Issue type':      { ar: 'نوع البلاغ',        fr: 'Type de problème' },
  'Error report':    { ar: 'بلاغ خطأ',          fr: "Rapport d'erreur" },
  'Bug report':      { ar: 'بلاغ عطل',          fr: 'Rapport de bogue' },
  'Feature request': { ar: 'طلب ميزة',          fr: 'Demande de fonctionnalité' },

  // ─── Months ───────────────────────────────────────────────────────────────
  January:   { ar: 'يناير',   fr: 'Janvier' },
  February:  { ar: 'فبراير',  fr: 'Février' },
  March:     { ar: 'مارس',    fr: 'Mars' },
  April:     { ar: 'أبريل',   fr: 'Avril' },
  May:       { ar: 'مايو',    fr: 'Mai' },
  June:      { ar: 'يونيو',   fr: 'Juin' },
  July:      { ar: 'يوليو',   fr: 'Juillet' },
  August:    { ar: 'أغسطس',  fr: 'Août' },
  September: { ar: 'سبتمبر',  fr: 'Septembre' },
  October:   { ar: 'أكتوبر',  fr: 'Octobre' },
  November:  { ar: 'نوفمبر',  fr: 'Novembre' },
  December:  { ar: 'ديسمبر',  fr: 'Décembre' },

  // ─── Days ─────────────────────────────────────────────────────────────────
  Sunday:    { ar: 'الأحد',    fr: 'Dimanche' },
  Monday:    { ar: 'الاثنين',  fr: 'Lundi' },
  Tuesday:   { ar: 'الثلاثاء', fr: 'Mardi' },
  Wednesday: { ar: 'الأربعاء', fr: 'Mercredi' },
  Thursday:  { ar: 'الخميس',   fr: 'Jeudi' },
  Friday:    { ar: 'الجمعة',   fr: 'Vendredi' },
  Saturday:  { ar: 'السبت',    fr: 'Samedi' },

  // ─── Short days ───────────────────────────────────────────────────────────
  Sun: { ar: 'أحد', fr: 'Dim' },
  Mon: { ar: 'اثن', fr: 'Lun' },
  Tue: { ar: 'ثلا', fr: 'Mar' },
  Wed: { ar: 'أرب', fr: 'Mer' },
  Thu: { ar: 'خمس', fr: 'Jeu' },
  Fri: { ar: 'جمع', fr: 'Ven' },
  Sat: { ar: 'سبت', fr: 'Sam' },

  // ─── Analytics ────────────────────────────────────────────────────────────
  'Total sessions': { ar: 'إجمالي الجلسات', fr: 'Sessions totales' },
  'Average score':  { ar: 'متوسط الدرجات',  fr: 'Score moyen' },
  'Study streak':   { ar: 'سلسلة الدراسة',   fr: "Série d'étude" },
  'Cards mastered': { ar: 'البطاقات المتقنة', fr: 'Cartes maîtrisées' },

  // ─── Workspace tools ──────────────────────────────────────────────────────
  Generate:          { ar: 'توليد',          fr: 'Générer' },
  'Upload file':     { ar: 'رفع ملف',        fr: 'Téléverser un fichier' },
  'Select a file':   { ar: 'اختر ملفًا',     fr: 'Sélectionner un fichier' },
  'No file selected':{ ar: 'لم يتم تحديد ملف', fr: 'Aucun fichier sélectionné' },
  'Save to Library': { ar: 'حفظ في المكتبة', fr: 'Sauvegarder dans la bibliothèque' },
  'Save to Folder':  { ar: 'حفظ في المجلد',  fr: 'Sauvegarder dans le dossier' },

  // ─── Models ───────────────────────────────────────────────────────────────
  'AI Models': { ar: 'نماذج الذكاء الاصطناعي', fr: 'Modèles IA' },
  'Local AI':  { ar: 'ذكاء اصطناعي محلي',      fr: 'IA locale' },
  'Cloud AI':  { ar: 'ذكاء اصطناعي سحابي',     fr: 'IA cloud' },

  // ─── Quick search palette ────────────────────────────────────────────────
  'Quick Search':      { ar: 'بحث سريع',     fr: 'Recherche rapide' },
  'Search pages, files, and library...': { ar: 'ابحث في الصفحات والملفات والمكتبة...', fr: 'Rechercher pages, fichiers et bibliothèque...' },
  Pages:               { ar: 'الصفحات',       fr: 'Pages' },
  Files:               { ar: 'الملفات',       fr: 'Fichiers' },
  'No results':        { ar: 'لا توجد نتائج', fr: 'Aucun résultat' },
  'Type to search pages, files, and library items.': { ar: 'اكتب للبحث في الصفحات والملفات وعناصر المكتبة.', fr: 'Tapez pour rechercher des pages, fichiers et éléments de bibliothèque.' },
  'Use arrows to navigate, Enter to open, Esc to close': { ar: 'استخدم الأسهم للتنقل، Enter للفتح، Esc للإغلاق', fr: 'Flèches pour naviguer, Entrée pour ouvrir, Échap pour fermer' },

  // ─── Vault / encryption ──────────────────────────────────────────────────
  'Encryption paused':  { ar: 'التشفير معطل',  fr: 'Chiffrement suspendu' },
  'Encryption Paused':  { ar: 'التشفير معطل',  fr: 'Chiffrement suspendu' },
  'Encryption disabled for beta': { ar: 'التشفير معطل في النسخة التجريبية', fr: 'Chiffrement désactivé en bêta' },
  'Local vault password prompts are turned off until encryption returns in a later beta update.':
    { ar: 'تم إيقاف مطالبات كلمة مرور الخزنة المحلية حتى يعود التشفير في تحديث تجريبي لاحق.',
      fr: 'Les invites de mot de passe du coffre local sont désactivées jusqu\'au retour du chiffrement.' },
  'Lock vault':           { ar: 'قفل الخزنة',          fr: 'Verrouiller le coffre' },
  'Vault locked':         { ar: 'الخزنة مقفلة',         fr: 'Coffre verrouillé' },
  'Vault Locked':         { ar: 'الخزنة مقفلة',         fr: 'Coffre verrouillé' },
  'Not Set Up':           { ar: 'غير مُعد',             fr: 'Non configuré' },
  Encrypted:              { ar: 'مشفّر',                fr: 'Chiffré' },
  Locked:                 { ar: 'مقفل',                 fr: 'Verrouillé' },
  'End-to-End Encrypted': { ar: 'تشفير طرفي كامل',      fr: 'Chiffrement de bout en bout' },
  'Set up encryption to protect your data': { ar: 'قم بإعداد التشفير لحماية بياناتك', fr: 'Configurer le chiffrement pour protéger vos données' },
  'Your data is encrypted before leaving your device. Click to lock.': { ar: 'تُشفّر بياناتك قبل مغادرة جهازك. انقر للقفل.', fr: 'Vos données sont chiffrées avant de quitter votre appareil. Cliquez pour verrouiller.' },
  'Enter your password to access your encrypted data': { ar: 'أدخل كلمة المرور للوصول إلى بياناتك المشفرة', fr: 'Entrez votre mot de passe pour accéder à vos données chiffrées' },
  'Client-side encryption':    { ar: 'تشفير على جهاز العميل',    fr: 'Chiffrement côté client' },
  'Zero-knowledge architecture':{ ar: 'بنية بدون معرفة مسبقة',  fr: 'Architecture sans connaissance' },
  'AES-256 encryption':        { ar: 'تشفير AES-256',            fr: 'Chiffrement AES-256' },

  // ─── Share dialog ────────────────────────────────────────────────────────
  'Share file':           { ar: 'مشاركة الملف',                   fr: 'Partager le fichier' },
  'Share folder':         { ar: 'مشاركة المجلد',                  fr: 'Partager le dossier' },
  'Share topic':          { ar: 'مشاركة المجلد الفرعي',           fr: 'Partager le sujet' },
  'Share library':        { ar: 'مشاركة عنصر المكتبة',            fr: 'Partager la bibliothèque' },
  'Email required':       { ar: 'البريد الإلكتروني مطلوب',        fr: 'E-mail requis' },
  'Please enter the email address to share with': { ar: 'يرجى إدخال البريد الإلكتروني للمشاركة معه', fr: 'Veuillez entrer l\'adresse e-mail pour partager' },
  'Failed to create share': { ar: 'تعذر إنشاء المشاركة',          fr: 'Impossible de créer le partage' },
  'Share link created':   { ar: 'تم إنشاء رابط المشاركة',         fr: 'Lien de partage créé' },
  'Shared successfully':  { ar: 'تمت المشاركة بنجاح',              fr: 'Partagé avec succès' },
  'Failed to share':      { ar: 'تعذر إتمام المشاركة',             fr: 'Échec du partage' },
  'Link copied to clipboard': { ar: 'تم نسخ الرابط',             fr: 'Lien copié' },
  'Only invited users can open this link.': { ar: 'يمكن للمستخدمين المدعوين فقط فتح هذا الرابط.', fr: 'Seuls les utilisateurs invités peuvent ouvrir ce lien.' },
  'Link expires in {days} days.': { ar: 'تنتهي صلاحية الرابط خلال {days} أيام.', fr: 'Le lien expire dans {days} jours.' },
  'Create Another':       { ar: 'إنشاء أخرى',                     fr: 'Créer un autre' },
  'Share Link':           { ar: 'رابط مشاركة',                    fr: 'Lien de partage' },
  'Share with User':      { ar: 'مشاركة مع مستخدم',               fr: 'Partager avec un utilisateur' },
  'Email address':        { ar: 'البريد الإلكتروني',               fr: 'Adresse e-mail' },
  'Enter email to share with...': { ar: 'أدخل البريد الإلكتروني للمشاركة معه...', fr: 'Entrez l\'e-mail pour partager...' },
  Permission:             { ar: 'الصلاحية',                        fr: 'Permission' },
  'Can view':             { ar: 'عرض فقط',                         fr: 'Lecture seule' },
  'Link expiration':      { ar: 'انتهاء الرابط',                   fr: 'Expiration du lien' },
  'Never expires':        { ar: 'لا تنتهي الصلاحية',               fr: 'N\'expire jamais' },
  '1 day':                { ar: 'يوم واحد',                        fr: '1 jour' },
  '7 days':               { ar: '7 أيام',                          fr: '7 jours' },
  '30 days':              { ar: '30 يومًا',                        fr: '30 jours' },
  '90 days':              { ar: '90 يومًا',                        fr: '90 jours' },
  'Creating...':          { ar: 'جارٍ الإنشاء...',                 fr: 'Création...' },
  'Create Link':          { ar: 'إنشاء الرابط',                    fr: 'Créer le lien' },

  // ─── Model setup wizard ──────────────────────────────────────────────────
  'Choose your local AI model': { ar: 'اختر نموذج الذكاء الاصطناعي المحلي', fr: 'Choisir votre modèle IA local' },
  Recommended:    { ar: 'موصى به',           fr: 'Recommandé' },
  'Not installed':{ ar: 'غير مثبّت',         fr: 'Non installé' },
  'Install & Use':{ ar: 'تثبيت واستخدام',    fr: 'Installer et utiliser' },
  'Use Now':      { ar: 'استخدام الآن',       fr: 'Utiliser maintenant' },
  'Skip and start with Mini': { ar: 'تخطي والبدء بـ Mini', fr: 'Ignorer et démarrer avec Mini' },
  'Continue with Mini':       { ar: 'المتابعة بنموذج Mini', fr: 'Continuer avec Mini' },
  'Working...':   { ar: 'جارٍ التنفيذ...',   fr: 'En cours...' },
  Laptop:         { ar: 'لابتوب',            fr: 'Portable' },
  Desktop:        { ar: 'مكتبي',             fr: 'Bureau' },
  Downloading:    { ar: 'جارٍ التنزيل',      fr: 'Téléchargement' },
  'Size unavailable': { ar: 'الحجم غير متوفر', fr: 'Taille indisponible' },
  'Failed to install model.': { ar: 'تعذر تثبيت النموذج.', fr: 'Échec de l\'installation du modèle.' },
  'Best for':     { ar: 'موصى به لـ',        fr: 'Idéal pour' },
  'Failed to activate model': { ar: 'تعذر تفعيل النموذج',    fr: "Impossible d'activer le modèle" },
  'Loading models...':        { ar: 'جارٍ تحميل النماذج...', fr: 'Chargement des modèles...' },
  'Unexpected error':         { ar: 'حدث خطأ غير متوقع',     fr: 'Erreur inattendue' },
  Installed:                  { ar: 'مثبّت',                  fr: 'Installé' },
  'You can start immediately with Mini offline, or install a stronger model now.':
    { ar: 'يمكنك البدء فورًا بنموذج Mini بدون إنترنت، أو تثبيت نموذج أقوى لاحقًا.',
      fr: 'Vous pouvez démarrer immédiatement avec Mini hors ligne, ou installer un modèle plus puissant maintenant.' },
  'Mini is already included in this desktop download, so you can start locally from the first launch.':
    { ar: 'نموذج Mini مضمن بالفعل في هذا التنزيل، لذا يمكنك البدء محليًا من أول تشغيل.',
      fr: 'Mini est déjà inclus dans ce téléchargement de bureau, vous pouvez démarrer localement dès le premier lancement.' },
  'This build does not currently include bundled Mini, so local AI will not be ready from first launch until a model is installed.':
    { ar: 'هذا التنزيل لا يحتوي حاليًا على نموذج Mini المضمن، لذلك لن يكون الذكاء الاصطناعي المحلي جاهزًا من أول تشغيل حتى يتم تثبيت نموذج.',
      fr: "Ce build n'inclut pas Mini en bundle, l'IA locale ne sera pas prête dès le premier lancement." },
  'Could not download optional model. Continue with Mini offline.':
    { ar: 'تعذر تنزيل النموذج الاختياري. يمكنك المتابعة بنموذج Mini بدون إنترنت.',
      fr: 'Impossible de télécharger le modèle optionnel. Continuez avec Mini hors ligne.' },
  'Model integrity validation failed. Continue with Mini offline.':
    { ar: 'فشل التحقق من سلامة النموذج. يمكنك المتابعة بنموذج Mini بدون إنترنت.',
      fr: "Validation d'intégrité du modèle échouée. Continuez avec Mini hors ligne." },
  'Could not save model to disk. Continue with Mini offline.':
    { ar: 'تعذر حفظ النموذج على القرص. يمكنك المتابعة بنموذج Mini بدون إنترنت.',
      fr: 'Impossible de sauvegarder le modèle sur le disque. Continuez avec Mini hors ligne.' },

  // ─── Empty states ────────────────────────────────────────────────────────
  'No folders yet':           { ar: 'لا توجد مجلدات بعد',              fr: 'Aucun dossier pour l\'instant' },
  'Create a folder to organize your study materials and files.':
                              { ar: 'أنشئ مجلدًا لتنظيم موادك وملفاتك الدراسية.',
                                fr: 'Créez un dossier pour organiser vos fichiers et supports de cours.' },
  'Create Folder':            { ar: 'إنشاء مجلد',                      fr: 'Créer un dossier' },
  'No files in this folder':  { ar: 'لا توجد ملفات في هذا المجلد',     fr: 'Aucun fichier dans ce dossier' },
  'Upload PDFs, documents, or paste text to start generating study materials.':
                              { ar: 'ارفع ملفات PDF أو مستندات، أو ألصق نصًا لبدء توليد مواد دراسية.',
                                fr: 'Importez des PDF, des documents ou collez du texte pour générer des supports.' },
  'Upload File':              { ar: 'رفع ملف',                          fr: 'Importer un fichier' },
  'No results found':         { ar: 'لا توجد نتائج',                    fr: 'Aucun résultat' },
  'No results for {query}. Try a different search term.':
                              { ar: 'لم نعثر على نتائج مطابقة لـ {query}. جرّب كلمات بحث مختلفة.',
                                fr: 'Aucun résultat pour {query}. Essayez un autre terme.' },
  'Clear Search':             { ar: 'مسح البحث',                        fr: 'Effacer la recherche' },
  'Your library is empty':    { ar: 'مكتبتك فارغة',                    fr: 'Votre bibliothèque est vide' },
  'Save generated content like MCQs, summaries, and notes to your library for easy access.':
                              { ar: 'احفظ المحتوى المُنشأ مثل الأسئلة والملخصات والملاحظات للوصول السريع.',
                                fr: 'Enregistrez les QCM, résumés et notes générés pour y accéder facilement.' },
  'Go to Tools':              { ar: 'الانتقال إلى الأدوات',             fr: 'Aller aux outils' },
  'Something went wrong':     { ar: 'حدث خطأ ما',                      fr: 'Une erreur est survenue' },
  'We encountered an error. Please try again.':
                              { ar: 'واجهنا خطأ. يرجى المحاولة مرة أخرى.',
                                fr: 'Une erreur est survenue. Veuillez réessayer.' },
  'Try Again':                { ar: 'حاول مرة أخرى',                    fr: 'Réessayer' },

  // ─── Workspace main tabs (new entries only — duplicates kept at original locations) ──
  Chat:       { ar: 'المحادثة',   fr: 'Discussion' },
  Focus:      { ar: 'التركيز',    fr: 'Concentration' },

  // ─── Workspace tool modes (new entries only) ──────────────────────────────
  Written:      { ar: 'كتابي',              fr: 'Rédigé' },
  MCQ:          { ar: 'أسئلة متعددة',       fr: 'QCM' },
  'Exam Prep':  { ar: 'التحضير للامتحان',   fr: "Prép. d'examen" },
  'From file':  { ar: 'من ملف',             fr: 'Depuis un fichier' },
  'Paste text': { ar: 'لصق النص',           fr: 'Coller du texte' },

  // ─── Analytics tab labels ─────────────────────────────────────────────────
  Overview:   { ar: 'نظرة عامة',   fr: "Vue d'ensemble" },
  Scores:     { ar: 'النتائج',      fr: 'Scores' },
  Activity:   { ar: 'النشاط',       fr: 'Activité' },
  Retention:  { ar: 'الاستبقاء',    fr: 'Rétention' },
  Goals:      { ar: 'الأهداف',      fr: 'Objectifs' },

  // ─── Math ─────────────────────────────────────────────────────────────────
  Solve:        { ar: 'حل',            fr: 'Résoudre' },
  'Show steps': { ar: 'عرض الخطوات',  fr: 'Afficher les étapes' },
  Problem:      { ar: 'المسألة',       fr: 'Problème' },
  Solution:     { ar: 'الحل',          fr: 'Solution' },

  // ─── Scholar Hub tab labels ───────────────────────────────────────────────
  Research:       { ar: 'البحث',            fr: 'Recherche' },
  Writing:        { ar: 'الكتابة',          fr: 'Rédaction' },
  Recovery:       { ar: 'المراجعة',         fr: 'Récupération' },
  'AI Policy':    { ar: 'سياسة الذكاء',     fr: 'Politique IA' },

  // ─── Scholar Hub / Recovery UI ───────────────────────────────────────────
  'Due Review':           { ar: 'المراجعة المستحقة',  fr: 'Révision due' },
  'Weak Topics':          { ar: 'المواضيع الضعيفة',   fr: 'Points faibles' },
  "Today's Mission":      { ar: 'مهمة اليوم',          fr: "Mission du jour" },
  'Session progress':     { ar: 'تقدم الجلسة',         fr: 'Progression de session' },
  'All caught up!':       { ar: 'أحسنت! كل شيء منجز', fr: 'Tout est à jour !' },
  'Nothing due right now ✔': { ar: 'لا شيء مستحق الآن ✔', fr: 'Rien à faire pour l\'instant ✔' },
  'No weak topics detected ✔': { ar: 'لا توضيع ضعيفة ✔', fr: 'Aucun point faible détecté ✔' },
  'Manage all in Workspace →': { ar: 'إدارة الكل في مساحة العمل ←', fr: 'Tout gérer dans Espace de travail →' },
  'Go to Workspace →':    { ar: 'انتقل إلى مساحة العمل ←', fr: 'Aller à Espace de travail →' },
  'Open in Workspace':    { ar: 'فتح في مساحة العمل',  fr: "Ouvrir dans l'espace de travail" },
  'Stay here':            { ar: 'البقاء هنا',           fr: 'Rester ici' },

  // ─── SRS card actions ─────────────────────────────────────────────────────
  Again:  { ar: 'مجددًا',  fr: 'À revoir' },
  Hard:   { ar: 'صعب',     fr: 'Difficile' },
  Good:   { ar: 'جيد',     fr: 'Bien' },
  Easy:   { ar: 'سهل',     fr: 'Facile' },
  Review: { ar: 'مراجعة',  fr: 'Réviser' },
  Manage: { ar: 'إدارة',   fr: 'Gérer' },
  Practice: { ar: 'تدريب', fr: 'Pratiquer' },
  Explain:  { ar: 'شرح',   fr: 'Expliquer' },
  Reading:  { ar: 'قراءة', fr: 'Lecture' },

  // ─── Writing studio ───────────────────────────────────────────────────────
  'Build Report':   { ar: 'بناء التقرير',  fr: 'Créer le rapport' },
  'Write & Check':  { ar: 'كتابة ومراجعة', fr: 'Rédiger et vérifier' },
  'Key Points':     { ar: 'النقاط الرئيسية', fr: 'Points clés' },
  'Clear draft':    { ar: 'مسح المسودة',   fr: 'Effacer le brouillon' },
  'Write Draft':    { ar: 'كتابة مسودة',   fr: 'Rédiger un brouillon' },
  Outline:          { ar: 'مخطط',          fr: 'Plan' },

  // ─── Workspace tool modes ─────────────────────────────────────────────────
  Rephrase:   { ar: 'إعادة صياغة', fr: 'Reformuler' },
  Assignment: { ar: 'الواجب',      fr: 'Devoir' },

  // ─── Settings description / helper text ───────────────────────────────────
  'This shows up as your short profile description across the app.': {
    ar: 'يظهر هذا كوصف ملفك الشخصي القصير في جميع أنحاء التطبيق.',
    fr: "Ceci apparaît comme votre courte description de profil dans toute l'application.",
  },
  'Separate topics with commas so they show up as profile tags.': {
    ar: 'افصل المواضيع بفواصل لتظهر كوسوم الملف الشخصي.',
    fr: 'Séparez les sujets par des virgules pour qu\'ils apparaissent comme tags de profil.',
  },
  'Profile picture, display name, and description are saved to your account.': {
    ar: 'يتم حفظ صورة الملف الشخصي والاسم المعروض والوصف في حسابك.',
    fr: 'La photo de profil, le nom affiché et la description sont enregistrés dans votre compte.',
  },

  // ─── Flashcard view — phases & actions ────────────────────────────────────
  Preview:      { ar: 'معاينة',        fr: 'Aperçu' },
  Learn:        { ar: 'تعلّم',         fr: 'Apprendre' },
  Write:        { ar: 'كتابة',         fr: 'Écrire' },
  Test:         { ar: 'اختبار',        fr: 'Tester' },
  Stats:        { ar: 'الإحصاءات',     fr: 'Statistiques' },
  Browse:       { ar: 'استعراض',       fr: 'Parcourir' },
  Publish:      { ar: 'نشر',           fr: 'Publier' },
  Publishing:   { ar: 'جارٍ النشر',    fr: 'Publication…' },
  Public:       { ar: 'عام',           fr: 'Public' },
  Retry:        { ar: 'أعد المحاولة',  fr: 'Réessayer' },
  Shared:       { ar: 'تمت المشاركة', fr: 'Partagé' },
  Restart:      { ar: 'إعادة البدء',   fr: 'Recommencer' },
  Submit:       { ar: 'إرسال',         fr: 'Soumettre' },
  Correct:      { ar: 'صحيح',          fr: 'Correct' },
  Check:        { ar: 'تحقق',          fr: 'Vérifier' },
  'Go back':    { ar: 'رجوع',          fr: 'Retourner' },
  'Try again':  { ar: 'حاول مرة أخرى', fr: 'Réessayer' },
  'Play again': { ar: 'العب مرة أخرى', fr: 'Rejouer' },
  'Show answer':{ ar: 'أظهر الإجابة',  fr: 'Afficher la réponse' },

  // Flashcard view — card types & states
  New:          { ar: 'جديد',          fr: 'Nouveau' },
  Learning:     { ar: 'قيد التعلّم',   fr: 'En cours' },
  Mature:       { ar: 'متقن',           fr: 'Maîtrisé' },
  Front:        { ar: 'الوجه الأمامي', fr: 'Recto' },
  Tomorrow:     { ar: 'غداً',           fr: 'Demain' },

  // Flashcard view — session end
  'Session complete!':                   { ar: 'اكتملت الجلسة!',         fr: 'Session terminée !' },
  '{correct}/{total} recalled ({percent}%)': { ar: 'تم تذكر {correct} من {total} ({percent}%)', fr: '{correct}/{total} rappelé ({percent}%)' },
  '{count}-day streak!':                 { ar: 'سلسلة {count} أيام!',    fr: 'Série de {count} jours !' },
  'Review {count} remaining':            { ar: 'راجع {count} متبقية',    fr: '{count} restant à réviser' },
  'Browse all cards':                    { ar: 'تصفح كل البطاقات',       fr: 'Parcourir toutes les cartes' },
  'Next review due tomorrow':            { ar: 'موعد المراجعة التالية غداً', fr: 'Prochaine révision demain' },
  'Next review in {count} days ({date})':{ ar: 'المراجعة التالية خلال {count} أيام ({date})', fr: 'Prochaine révision dans {count} jours ({date})' },

  // Flashcard view — grade hints
  'Forgot — review soon':          { ar: 'نسيت — راجع قريباً',       fr: 'Oublié — revoir bientôt' },
  'Recalled with effort':          { ar: 'تذكرته بصعوبة',             fr: 'Rappelé avec effort' },
  'Recalled correctly':            { ar: 'تذكرته بشكل صحيح',         fr: 'Rappelé correctement' },
  'Instant recall — longer gap':   { ar: 'تذكر فوري — فترة أطول',    fr: 'Rappel instantané — intervalle plus long' },
  'Tap to reveal · swipe to grade':{ ar: 'اضغط للكشف · اسحب للتقييم', fr: 'Appuyer pour révéler · glisser pour noter' },

  // Flashcard view — study modes
  'Study all':                     { ar: 'ادرس الكل',                  fr: 'Tout étudier' },
  'Study {count}':                 { ar: 'ادرس {count}',               fr: 'Étudier {count}' },
  'Daily goal':                    { ar: 'الهدف اليومي',               fr: 'Objectif quotidien' },
  '{done}/{goal} cards today':     { ar: '{done}/{goal} بطاقة اليوم',   fr: "{done}/{goal} cartes aujourd'hui" },
  '{done}/{goal} today':           { ar: '{done}/{goal} اليوم',         fr: "{done}/{goal} aujourd'hui" },
  '{count} due today':             { ar: '{count} مستحقة اليوم',       fr: "{count} dûes aujourd'hui" },
  '{count} new':                   { ar: '{count} جديد',               fr: '{count} nouveau' },
  '{count} learning':              { ar: '{count} قيد التعلّم',        fr: '{count} en cours' },
  '{count} mature':                { ar: '{count} متقن',               fr: '{count} maîtrisé' },
  '{count} day':                   { ar: '{count} يوم',                fr: '{count} jour' },
  '{count} days':                  { ar: '{count} أيام',               fr: '{count} jours' },
  '{count} cards':                 { ar: '{count} بطاقة',              fr: '{count} cartes' },

  // Flashcard view — match game
  'Match Game':                    { ar: 'لعبة المطابقة',              fr: 'Jeu de correspondance' },
  '{matched}/{total} matched':     { ar: 'تمت مطابقة {matched}/{total}', fr: '{matched}/{total} correspondances' },
  'All matched!':                  { ar: 'تمت المطابقة بالكامل!',      fr: 'Tout correspondance !' },
  'Completed in {count} seconds':  { ar: 'اكتملت خلال {count} ثانية', fr: 'Terminé en {count} secondes' },
  'Terms':                         { ar: 'المصطلحات',                  fr: 'Termes' },
  'Definitions':                   { ar: 'التعريفات',                  fr: 'Définitions' },

  // Flashcard view — write mode
  'Write mode complete!':          { ar: 'اكتمل وضع الكتابة!',        fr: 'Mode écriture terminé !' },
  'Review these ({count})':        { ar: 'راجع هذه ({count})',         fr: 'Réviser ceux-ci ({count})' },
  'Write the definition':          { ar: 'اكتب التعريف',               fr: 'Écrire la définition' },
  'Type your answer…':             { ar: 'اكتب إجابتك…',              fr: 'Tapez votre réponse…' },
  'Type the answer':               { ar: 'اكتب الإجابة',               fr: 'Tapez la réponse' },
  'Enter to check · Shift+Enter for newline': { ar: 'اضغط Enter للتحقق · Shift+Enter لسطر جديد', fr: 'Entrée pour vérifier · Maj+Entrée pour nouvelle ligne' },
  'Correct answer':                { ar: 'الإجابة الصحيحة',            fr: 'Réponse correcte' },
  'Looks correct!':                { ar: 'تبدو صحيحة!',               fr: 'Semble correct !' },
  'Not quite right':               { ar: 'ليست صحيحة تماماً',         fr: 'Pas tout à fait correct' },
  'Got wrong':                     { ar: 'إجابة خاطئة',               fr: 'Raté' },
  'Got right':                     { ar: 'إجابة صحيحة',               fr: 'Réussi' },

  // Flashcard view — test mode
  'Mixed test':                    { ar: 'اختبار متنوع',              fr: 'Test mixte' },
  'Test complete!':                { ar: 'اكتمل الاختبار!',           fr: 'Test terminé !' },
  '{correct}/{total} correct ({percent}%)': { ar: '{correct}/{total} صحيحة ({percent}%)', fr: '{correct}/{total} correct ({percent}%)' },
  'Your answer':                   { ar: 'إجابتك',                   fr: 'Votre réponse' },
  '(no answer)':                   { ar: '(بدون إجابة)',              fr: '(pas de réponse)' },
  'New test':                      { ar: 'اختبار جديد',              fr: 'Nouveau test' },
  'Multiple Choice':               { ar: 'اختيار من متعدد',          fr: 'Choix multiple' },
  'True / False':                  { ar: 'صح / خطأ',                 fr: 'Vrai / Faux' },
  'Type your answer and press Enter…': { ar: 'اكتب إجابتك ثم اضغط Enter…', fr: 'Tapez votre réponse et appuyez sur Entrée…' },

  // Flashcard view — learn mode
  'Learn complete!':               { ar: 'اكتمل التعلم!',            fr: 'Apprentissage terminé !' },
  'All {count} cards correct!':    { ar: 'صحّحت جميع البطاقات ({count})!', fr: 'Toutes les {count} cartes correctes !' },

  // Flashcard view — deck management
  'Flashcards ({count} cards)':    { ar: 'بطاقات تعليمية ({count} بطاقة)', fr: 'Cartes ({count} cartes)' },
  'Imported deck':                 { ar: 'مجموعة مستوردة',            fr: 'Deck importé' },
  'Imported ({count} cards)':      { ar: 'مستورد ({count} بطاقة)',    fr: 'Importé ({count} cartes)' },
  'Deck description':              { ar: 'وصف المجموعة',              fr: 'Description du deck' },
  'Public deck description':       { ar: 'وصف المجموعة العامة',       fr: 'Description du deck public' },
  'Optional public deck description': { ar: 'وصف اختياري للمجموعة العامة', fr: 'Description optionnelle du deck public' },
  'Add a short description for this deck': { ar: 'أضف وصفاً قصيراً لهذه المجموعة', fr: 'Ajouter une description courte pour ce deck' },
  'Rename deck':                   { ar: 'إعادة تسمية المجموعة',      fr: 'Renommer le deck' },
  'Double-click to rename':        { ar: 'انقر مرتين لإعادة التسمية', fr: 'Double-cliquer pour renommer' },
  'TTS on flip':                   { ar: 'النطق الصوتي عند القلب',    fr: 'Synthèse vocale au retournement' },
  'Deck settings':                 { ar: 'إعدادات المجموعة',          fr: 'Paramètres du deck' },
  'Show settings':                 { ar: 'إظهار الإعدادات',           fr: 'Afficher les paramètres' },
  'Hide settings':                 { ar: 'إخفاء الإعدادات',           fr: 'Masquer les paramètres' },
  'Add card':                      { ar: 'إضافة بطاقة',               fr: 'Ajouter une carte' },
  'Save card':                     { ar: 'حفظ البطاقة',               fr: 'Enregistrer la carte' },
  'Edit card':                     { ar: 'تعديل البطاقة',             fr: 'Modifier la carte' },
  'Add image':                     { ar: 'إضافة صورة',                fr: 'Ajouter une image' },
  'Save changes':                  { ar: 'حفظ التغييرات',             fr: 'Enregistrer les modifications' },
  'Term or question…':             { ar: 'المصطلح أو السؤال…',        fr: 'Terme ou question…' },
  'Definition or answer…':        { ar: 'التعريف أو الإجابة…',       fr: 'Définition ou réponse…' },
  '⌘↵ to save':                   { ar: '⌘↵ للحفظ',                  fr: '⌘↵ pour enregistrer' },
  'Export CSV':                    { ar: 'تصدير CSV',                  fr: 'Exporter CSV' },
  'Export Anki':                   { ar: 'تصدير Anki',                 fr: 'Exporter Anki' },
  'Import Anki .apkg file':        { ar: 'استيراد ملف Anki .apkg',      fr: 'Importer un fichier Anki .apkg' },
  'Imported Anki deck':            { ar: 'مجموعة Anki مستوردة',         fr: 'Paquet Anki importé' },
  'Supports Anki 2 and Anki 21 packages — drag exported .apkg files from Anki desktop': {
    ar: 'يدعم حزم Anki 2 وAnki 21 — اسحب ملفات .apkg من تطبيق Anki',
    fr: 'Compatible Anki 2 et Anki 21 — glissez les fichiers .apkg exportés depuis Anki',
  },
  'Copy link':                     { ar: 'نسخ الرابط',                fr: 'Copier le lien' },

  // Flashcard view — stats
  'Total cards':                   { ar: 'إجمالي البطاقات',           fr: 'Total des cartes' },
  Reviews:                         { ar: 'المراجعات',                  fr: 'Révisions' },
  'Avg accuracy':                  { ar: 'متوسط الدقة',               fr: 'Précision moyenne' },
  'Weak cards':                    { ar: 'بطاقات ضعيفة',              fr: 'Cartes faibles' },
  '{count} weak':                  { ar: '{count} ضعيفة',             fr: '{count} faibles' },
  '{count} reviews · next: {date}':{ ar: '{count} مراجعات · التالي: {date}', fr: '{count} révisions · prochain : {date}' },
  'FSRS health':                   { ar: 'صحة FSRS',                   fr: 'Santé FSRS' },
  'Avg recall confidence':         { ar: 'متوسط الثقة في التذكر',     fr: 'Confiance de rappel moyenne' },
  'Average stability':             { ar: 'متوسط الثبات',              fr: 'Stabilité moyenne' },
  'Image cards':                   { ar: 'بطاقات مصوّرة',             fr: 'Cartes avec images' },
  'Recent reviews':                { ar: 'آخر المراجعات',             fr: 'Révisions récentes' },
  'No review history yet':         { ar: 'لا يوجد سجل مراجعات بعد',  fr: "Pas encore d'historique de révision" },
  'Next review: {date} · interval {count}d': { ar: 'المراجعة التالية: {date} · الفاصل {count} يوم', fr: 'Prochaine révision : {date} · intervalle {count}j' },
  'Progress — {name}':             { ar: 'التقدم — {name}',           fr: 'Progression — {name}' },
  'Due cards — next 14 days':      { ar: 'البطاقات المستحقة — خلال 14 يوماً', fr: 'Cartes dues — 14 prochains jours' },
  'Due cards — next 7 days':       { ar: 'البطاقات المستحقة — خلال 7 أيام',   fr: 'Cartes dues — 7 prochains jours' },
  'No cards due in the next week': { ar: 'لا توجد بطاقات مستحقة خلال الأسبوع القادم', fr: 'Aucune carte due la semaine prochaine' },
  'Study activity':                { ar: 'نشاط الدراسة',              fr: "Activité d'étude" },
  'Card performance':              { ar: 'أداء البطاقات',             fr: 'Performance des cartes' },
  'Not yet reviewed':              { ar: 'لم تتم مراجعتها بعد',       fr: 'Pas encore révisé' },
  'Next: {date} · {accuracy}% acc':{ ar: 'التالي: {date} · دقة {accuracy}%', fr: 'Prochaine : {date} · {accuracy}% préc.' },

  // Flashcard view — activity heatmap
  '{date}: {count} cards':         { ar: '{date}: {count} بطاقة',     fr: '{date} : {count} cartes' },
  '{count} cards reviewed':        { ar: 'تمت مراجعة {count} بطاقة', fr: '{count} cartes révisées' },
  '{count} active days':           { ar: '{count} أيام نشطة',        fr: '{count} jours actifs' },
  Less:                            { ar: 'أقل',                        fr: 'Moins' },
  More:                            { ar: 'أكثر',                       fr: 'Plus' },

  // Flashcard view — import
  'Loading decks…':                { ar: 'جارٍ تحميل المجموعات…',    fr: 'Chargement des decks…' },
  'Search public decks':           { ar: 'ابحث في المجموعات العامة', fr: 'Rechercher des decks publics' },
  'Import deck':                   { ar: 'استيراد المجموعة',          fr: 'Importer un deck' },
  'Import cards':                  { ar: 'استيراد البطاقات',          fr: 'Importer des cartes' },
  'Import link':                   { ar: 'استيراد الرابط',            fr: "Lien d'importation" },
  'Import from a Kivora shared review-set link': { ar: 'استيراد من رابط Kivora مشترك لمجموعة مراجعة', fr: 'Importer depuis un lien de set de révision Kivora partagé' },
  'One card per line. Separate term and definition with a comma or tab.': {
    ar: 'بطاقة واحدة في كل سطر. افصل بين المصطلح والتعريف بفاصلة أو بعلامة تبويب.',
    fr: 'Une carte par ligne. Séparez le terme et la définition avec une virgule ou une tabulation.',
  },
  'Could not parse. Use "term, definition" or tab-separated per line.': {
    ar: 'تعذر التحليل. استخدم "المصطلح، التعريف" أو افصل بعلامة تبويب في كل سطر.',
    fr: 'Impossible d\'analyser. Utilisez "terme, définition" ou séparation par tabulation par ligne.',
  },
  'No cards were found in that URL.': { ar: 'لم يتم العثور على بطاقات في هذا الرابط.', fr: 'Aucune carte trouvée dans cette URL.' },
  'Import failed':                 { ar: 'فشل الاستيراد',             fr: "Échec de l'importation" },
  '{count} line detected':         { ar: 'تم اكتشاف سطر واحد',       fr: '{count} ligne détectée' },
  '{count} lines detected':        { ar: 'تم اكتشاف {count} أسطر',   fr: '{count} lignes détectées' },
  'Public deck library':           { ar: 'مكتبة المجموعات العامة',    fr: 'Bibliothèque de decks publics' },
  'No public decks found yet. Publish one from the preview screen to seed the library.': {
    ar: 'لا توجد مجموعات عامة بعد. انشر مجموعة من شاشة المعاينة لبدء المكتبة.',
    fr: "Aucun deck public trouvé. Publiez-en un depuis l'écran d'aperçu pour amorcer la bibliothèque.",
  },
};

/**
 * Look up a translation for the given key and locale.
 * Falls back to the key (English) if no translation exists.
 */
export function globalT(key: string, locale: SupportedLocale): string {
  if (locale === 'en') return key;
  return GLOBAL_TRANSLATIONS[key]?.[locale] ?? key;
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/useI18n';
import styles from './WelcomePanel.module.css';

interface WelcomePanelProps {
  onGetStarted?: () => void;
}

const STARTER_PATHS = [
  {
    title: 'AP Biology review',
    description: 'Start with a guided research topic, then turn it into notes or flashcards.',
    href: '/coach?starter=cell%20respiration&section=research',
    action: 'Start research',
  },
  {
    title: 'History essay scaffold',
    description: 'Open Writing Studio with a topic ready so you can build an outline instead of starting blank.',
    href: '/coach?starter=causes%20of%20World%20War%20I&section=write',
    action: 'Open writing studio',
  },
  {
    title: 'Calculus problem practice',
    description: 'Jump straight into Math when you already know the subject and want step-by-step solving.',
    href: '/math',
    action: 'Open math',
  },
  {
    title: 'First study plan',
    description: 'Build a simple plan first, then attach notes, quizzes, and review work as you go.',
    href: '/planner',
    action: 'Open planner',
  },
] as const;

export function WelcomePanel({ onGetStarted }: WelcomePanelProps) {
  const router = useRouter();
  const { t, isArabic } = useI18n({
    'Start with structure': 'ابدأ بهيكل واضح',
    'Your workspace is empty, but the flow is already defined. Create a folder, drop in study material, then generate exactly the artifact you need.': 'مساحة العمل فارغة الآن، لكن مسار العمل جاهز. أنشئ مجلدًا، أضف المادة الدراسية، ثم أنشئ المخرجات التي تحتاجها بالضبط.',
    'Create first folder': 'أنشئ أول مجلد',
    'Browse starter packs': 'تصفح المسارات الجاهزة',
    'Go to planner': 'اذهب إلى المخطط',
    'Organize by subject': 'نظّم حسب المادة',
    'Build folders and topics so every quiz, note, and summary stays attached to the right module.': 'ابنِ مجلدات وموضوعات بحيث يبقى كل اختبار وملاحظة وملخص مرتبطًا بالمقرر الصحيح.',
    'Generate study assets': 'أنشئ مخرجات دراسية',
    'Use quizzes, summaries, notes, rephrase, math, and MATLAB from the same workspace.': 'استخدم الاختبارات والملخصات والملاحظات وإعادة الصياغة والرياضيات وMATLAB من نفس مساحة العمل.',
    'Move into execution': 'انتقل إلى التنفيذ',
    'Push work into the planner and track progress through analytics instead of leaving outputs unused.': 'ادفع العمل إلى المخطط وتتبع التقدم عبر التحليلات بدلًا من ترك المخرجات دون استخدام.',
    'Quick start': 'بدء سريع',
    'Create a folder and topic for your first module.': 'أنشئ مجلدًا وموضوعًا لأول مقرر لديك.',
    'Upload a PDF, slide deck, or notes file.': 'ارفع ملف PDF أو عرض شرائح أو ملاحظات.',
    'Generate a summary, quiz, or study plan from it.': 'أنشئ ملخصًا أو اختبارًا أو خطة دراسة منه.',
    'Core workflow': 'مسار العمل الأساسي',
    'Workspace': 'مساحة العمل',
    'Tools': 'الأدوات',
    'Planner': 'المخطط',
    'Analytics': 'التحليلات',
    'Nothing is blocked here. You can start in guest mode and add sign-in later if you want sync and linked providers.': 'لا يوجد شيء معطل هنا. يمكنك البدء بوضع الضيف ثم إضافة تسجيل الدخول لاحقًا إذا أردت المزامنة وربط المزوّدات.',
    'Start from a subject': 'ابدأ من مادة أو هدف',
    "You do not need a PDF to begin. Pick a lane below and Kivora will open the right workspace for you.": 'لا تحتاج إلى ملف PDF لتبدأ. اختر مسارًا من الأسفل وسيفتح Kivora مساحة العمل المناسبة لك.',
    'AP Biology review': 'مراجعة أحياء AP',
    'Start with a guided research topic, then turn it into notes or flashcards.': 'ابدأ بموضوع بحث موجّه ثم حوّله إلى ملاحظات أو بطاقات تعليمية.',
    'Start research': 'ابدأ البحث',
    'History essay scaffold': 'هيكل أولي لمقال تاريخي',
    'Open Writing Studio with a topic ready so you can build an outline instead of starting blank.': 'افتح استوديو الكتابة مع موضوع جاهز حتى تبني مخططًا بدلًا من البدء من الصفر.',
    'Open writing studio': 'افتح استوديو الكتابة',
    'Calculus problem practice': 'تدريب على مسائل التفاضل والتكامل',
    'Jump straight into Math when you already know the subject and want step-by-step solving.': 'انتقل مباشرة إلى الرياضيات عندما تعرف الموضوع وتريد حلًا خطوة بخطوة.',
    'Open math': 'افتح الرياضيات',
    'First study plan': 'أول خطة دراسة',
    'Build a simple plan first, then attach notes, quizzes, and review work as you go.': 'ابنِ خطة بسيطة أولًا ثم أضف الملاحظات والاختبارات والمراجعة أثناء التقدم.',
    'Starter paths': 'مسارات جاهزة',
  });

  const workflow = [t('Workspace'), t('Tools'), t('Planner'), t('Analytics')];
  const steps = [
    t('Create a folder and topic for your first module.'),
    t('Upload a PDF, slide deck, or notes file.'),
    t('Generate a summary, quiz, or study plan from it.'),
  ];

  return (
    <section className={styles.shell} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{t('Start with structure')}</span>
          <h1>{t('Your workspace is empty, but the flow is already defined. Create a folder, drop in study material, then generate exactly the artifact you need.')}</h1>
          <div className={styles.actionRow}>
            <button className={styles.primaryButton} onClick={() => onGetStarted?.()}>
              {t('Create first folder')}
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push('/library')}>
              {t('Browse starter packs')}
            </button>
            <Link className={styles.secondaryButton} href="/planner">
              {t('Go to planner')}
            </Link>
          </div>
          <p className={styles.note}>{t('Nothing is blocked here. You can start in guest mode and add sign-in later if you want sync and linked providers.')}</p>
        </div>

        <div className={styles.heroPanel}>
          <div className={styles.mockHeader}>
            <span className={styles.mockDot} />
            <span className={styles.mockDot} />
            <span className={styles.mockDot} />
          </div>
          <div className={styles.workflowRail}>
            {workflow.map((item, index) => (
              <div key={item} className={styles.workflowItem}>
                <span className={styles.workflowIndex}>0{index + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.cardGrid}>
        <article className={styles.featureCard}>
          <span className={styles.cardEyebrow}>{t('Organize by subject')}</span>
          <p>{t('Build folders and topics so every quiz, note, and summary stays attached to the right module.')}</p>
        </article>
        <article className={styles.featureCard}>
          <span className={styles.cardEyebrow}>{t('Generate study assets')}</span>
          <p>{t('Use quizzes, summaries, notes, rephrase, math, and MATLAB from the same workspace.')}</p>
        </article>
        <article className={styles.featureCard}>
          <span className={styles.cardEyebrow}>{t('Move into execution')}</span>
          <p>{t('Push work into the planner and track progress through analytics instead of leaving outputs unused.')}</p>
        </article>
      </div>

      <div className={styles.bottomGrid}>
        <article className={styles.stepCard}>
          <span className={styles.eyebrow}>{t('Quick start')}</span>
          <ol className={styles.stepList}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className={styles.stepCardStrong}>
          <span className={styles.eyebrow}>{t('Core workflow')}</span>
          <div className={styles.flowChips}>
            {workflow.map((item) => (
              <span key={item} className={styles.flowChip}>
                {item}
              </span>
            ))}
          </div>
        </article>
      </div>

      <section className={styles.starterSection}>
        <div className={styles.starterHeading}>
          <span className={styles.eyebrow}>{t('Starter paths')}</span>
          <h2>{t('Start from a subject')}</h2>
          <p>{t('You do not need a PDF to begin. Pick a lane below and Kivora will open the right workspace for you.')}</p>
        </div>
        <div className={styles.starterGrid}>
          {STARTER_PATHS.map((path) => (
            <article key={path.title} className={styles.starterCard}>
              <strong>{t(path.title)}</strong>
              <p>{t(path.description)}</p>
              <Link href={path.href} className={styles.starterLink}>
                {t(path.action)} <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

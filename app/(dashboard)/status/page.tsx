'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/useI18n';
import styles from './status.module.css';

const ERROR_REPORT_URL = 'https://github.com/Alphadarklord1/kivora/issues/new?template=error_report.yml';
const BUG_REPORT_URL = 'https://github.com/Alphadarklord1/kivora/issues/new?template=bug_report.yml';
const FEATURE_REQUEST_URL = 'https://github.com/Alphadarklord1/kivora/issues/new?template=feature_request.yml';
const TEAM_TASK_URL = 'https://github.com/Alphadarklord1/kivora/issues/new?template=team_task.yml';
const TEAM_WORKFLOW_URL = 'https://github.com/Alphadarklord1/kivora/blob/main/docs/TEAM_WORKFLOW.md';
const ROADMAP_URL = 'https://github.com/Alphadarklord1/kivora/blob/main/ROADMAP.md';

export default function StatusPage() {
  const { t, isArabic } = useI18n({
    'Status & Support': 'الحالة والدعم',
    'Known product state, issue reporting, and team workflow in one place.': 'حالة المنتج الحالية والإبلاغ عن المشاكل ومسار عمل الفريق في مكان واحد.',
    'Stable beta surfaces': 'أسطح البيتا المستقرة',
    'Desktop-first, guest-friendly, and focused on the active study workflow.': 'المنتج موجه لسطح المكتب أولًا ويدعم وضع الضيف ويركز على مسار الدراسة النشط.',
    'Known limits': 'القيود المعروفة',
    'Web remains a beta runtime. Optional model installs depend on published release assets. Some advanced surfaces are intentionally hidden until stable.': 'الويب ما يزال بيئة بيتا. تثبيت النماذج الاختيارية يعتمد على نشر ملفات الإصدار. بعض الأسطح المتقدمة مخفية عمدًا حتى تصبح مستقرة.',
    'Report the right issue': 'أبلغ عن النوع الصحيح من المشكلة',
    'Choose the issue type that matches what went wrong so the team can reproduce it quickly.': 'اختر نوع البلاغ الذي يطابق المشكلة حتى يتمكن الفريق من إعادة إنتاجها بسرعة.',
    'Error report': 'بلاغ خطأ',
    'Bug report': 'بلاغ عطل',
    'Feature request': 'طلب ميزة',
    'Team task': 'مهمة للفريق',
    'Runtime / crash': 'تعطل / انهيار',
    'UI / layout': 'واجهة / تخطيط',
    'Auth / sign-in': 'المصادقة / تسجيل الدخول',
    'Planner / analytics': 'المخطط / التحليلات',
    'AI / generation': 'الذكاء الاصطناعي / التوليد',
    'Math / tool behavior': 'الرياضيات / سلوك الأدوات',
    'Team collaboration': 'تعاون الفريق',
    'Contributors should use issues, pull requests, and the workflow docs instead of ad hoc changes on main.': 'يجب على المساهمين استخدام القضايا وطلبات السحب ووثائق سير العمل بدلًا من التعديلات العشوائية على main.',
    'Open team workflow': 'افتح سير عمل الفريق',
    'Open roadmap': 'افتح خارطة الطريق',
    'Go to settings': 'اذهب إلى الإعدادات',
    'Open GitHub repo': 'افتح مستودع GitHub',
  });

  const categories = [
    t('Runtime / crash'),
    t('UI / layout'),
    t('Auth / sign-in'),
    t('Planner / analytics'),
    t('AI / generation'),
    t('Math / tool behavior'),
  ];

  return (
    <section className={styles.page} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className={styles.hero}>
        <div>
          <span className="sp-eyebrow">{t('Status & Support')}</span>
          <h1>{t('Status & Support')}</h1>
          <p>{t('Known product state, issue reporting, and team workflow in one place.')}</p>
        </div>
        <div className={styles.heroActions}>
          <a className="sp-button-primary" href={ERROR_REPORT_URL} target="_blank" rel="noreferrer">
            {t('Error report')}
          </a>
          <Link className="sp-button-secondary" href="/settings?tab=security">
            {t('Go to settings')}
          </Link>
        </div>
      </div>

      <div className={styles.grid}>
        <article className={`sp-panel ${styles.card}`}>
          <span className="sp-eyebrow">{t('Stable beta surfaces')}</span>
          <p>{t('Desktop-first, guest-friendly, and focused on the active study workflow.')}</p>
          <ul className={styles.list}>
            <li>`/workspace`</li>
            <li>`/tools`</li>
            <li>`/planner`</li>
            <li>`/library`</li>
            <li>`/analytics`</li>
            <li>`/settings`</li>
          </ul>
        </article>

        <article className={`sp-panel ${styles.card}`}>
          <span className="sp-eyebrow">{t('Known limits')}</span>
          <p>{t('Web remains a beta runtime. Optional model installs depend on published release assets. Some advanced surfaces are intentionally hidden until stable.')}</p>
        </article>
      </div>

      <article className={`sp-panel ${styles.reportCard}`}>
        <span className="sp-eyebrow">{t('Report the right issue')}</span>
        <h2>{t('Choose the issue type that matches what went wrong so the team can reproduce it quickly.')}</h2>
        <div className={styles.chips}>
          {categories.map((category) => (
            <span key={category} className={styles.chip}>{category}</span>
          ))}
        </div>
        <div className={styles.actions}>
          <a className="sp-button-secondary" href={ERROR_REPORT_URL} target="_blank" rel="noreferrer">{t('Error report')}</a>
          <a className="sp-button-secondary" href={BUG_REPORT_URL} target="_blank" rel="noreferrer">{t('Bug report')}</a>
          <a className="sp-button-secondary" href={FEATURE_REQUEST_URL} target="_blank" rel="noreferrer">{t('Feature request')}</a>
          <a className="sp-button-secondary" href={TEAM_TASK_URL} target="_blank" rel="noreferrer">{t('Team task')}</a>
        </div>
      </article>

      <div className={styles.grid}>
        <article className={`sp-panel ${styles.card}`}>
          <span className="sp-eyebrow">{t('Team collaboration')}</span>
          <p>{t('Contributors should use issues, pull requests, and the workflow docs instead of ad hoc changes on main.')}</p>
          <div className={styles.actions}>
            <a className="sp-button-secondary" href={TEAM_WORKFLOW_URL} target="_blank" rel="noreferrer">{t('Open team workflow')}</a>
            <a className="sp-button-secondary" href={ROADMAP_URL} target="_blank" rel="noreferrer">{t('Open roadmap')}</a>
            <a className="sp-button-secondary" href="https://github.com/Alphadarklord1/kivora" target="_blank" rel="noreferrer">{t('Open GitHub repo')}</a>
          </div>
        </article>
      </div>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/useI18n';
import { usePathname } from 'next/navigation';
import { useSettings } from '@/providers/SettingsProvider';
import styles from './report.module.css';

const GITHUB_NEW_ISSUE = 'https://github.com/Alphadarklord1/kivora/issues/new';

type ReportType = 'error_report' | 'bug_report' | 'feature_request';

const TEMPLATE_MAP: Record<ReportType, string> = {
  error_report: 'error_report.yml',
  bug_report: 'bug_report.yml',
  feature_request: 'feature_request.yml',
};

export default function ReportPage() {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { t, isArabic } = useI18n({
    'Report issue': 'الإبلاغ عن مشكلة',
    'Capture what went wrong and open the right GitHub issue template with your diagnostics prefilled.': 'سجل ما حدث وافتح قالب البلاغ الصحيح على GitHub مع تعبئة البيانات التشخيصية تلقائيًا.',
    'Issue type': 'نوع البلاغ',
    'Error report': 'بلاغ خطأ',
    'Bug report': 'بلاغ عطل',
    'Feature request': 'طلب ميزة',
    'Title': 'العنوان',
    'Short summary of the problem': 'ملخص قصير للمشكلة',
    'What happened?': 'ماذا حدث؟',
    'Describe the issue in one clear paragraph.': 'صف المشكلة في فقرة واضحة واحدة.',
    'Steps to reproduce': 'خطوات إعادة المشكلة',
    'One step per line': 'خطوة في كل سطر',
    'Expected result': 'النتيجة المتوقعة',
    'What should have happened?': 'ما الذي كان يجب أن يحدث؟',
    'Actual result': 'النتيجة الفعلية',
    'What happened instead?': 'ما الذي حدث بدلًا من ذلك؟',
    'Diagnostics preview': 'معاينة البيانات التشخيصية',
    'Copy diagnostics': 'نسخ البيانات التشخيصية',
    'Open GitHub issue': 'فتح بلاغ GitHub',
    'Need a quick path?': 'تحتاج إلى مسار سريع؟',
    'Open status & support': 'افتح الحالة والدعم',
    'Copied diagnostics.': 'تم نسخ البيانات التشخيصية.',
    'Please add a title first.': 'أضف عنوانًا أولًا.',
    'Current route': 'المسار الحالي',
    'Language': 'اللغة',
    'Theme': 'المظهر',
    'User agent': 'متصفح المستخدم',
    'Timestamp': 'الوقت',
  });

  const [type, setType] = useState<ReportType>('error_report');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const diagnostics = useMemo(() => {
    const route = typeof window !== 'undefined' ? window.location.href : pathname || '/report';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const lines = [
      `${t('Current route')}: ${route}`,
      `${t('Language')}: ${settings.language || 'en'}`,
      `${t('Theme')}: ${settings.theme || 'system'}`,
      `${t('Timestamp')}: ${new Date().toISOString()}`,
      `${t('User agent')}: ${userAgent}`,
    ];
    return lines.join('\n');
  }, [pathname, settings.language, settings.theme, t]);

  function buildIssueUrl() {
    const body = [
      '## Summary',
      summary || '-',
      '',
      '## Steps to reproduce',
      steps || '-',
      '',
      '## Expected result',
      expected || '-',
      '',
      '## Actual result',
      actual || '-',
      '',
      '## Diagnostics',
      '```text',
      diagnostics,
      '```',
    ].join('\n');

    const params = new URLSearchParams({
      template: TEMPLATE_MAP[type],
      title,
      body,
    });

    return `${GITHUB_NEW_ISSUE}?${params.toString()}`;
  }

  async function copyDiagnostics() {
    await navigator.clipboard.writeText(diagnostics);
    setCopyMessage(t('Copied diagnostics.'));
    window.setTimeout(() => setCopyMessage(''), 2000);
  }

  function openIssue() {
    if (!title.trim()) {
      setCopyMessage(t('Please add a title first.'));
      window.setTimeout(() => setCopyMessage(''), 2000);
      return;
    }
    window.open(buildIssueUrl(), '_blank', 'noopener,noreferrer');
  }

  return (
    <section className={styles.page} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className={styles.hero}>
        <div>
          <span className="sp-eyebrow">{t('Report issue')}</span>
          <h1>{t('Report issue')}</h1>
          <p>{t('Capture what went wrong and open the right GitHub issue template with your diagnostics prefilled.')}</p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" className="sp-button-primary" onClick={openIssue}>{t('Open GitHub issue')}</button>
          <button type="button" className="sp-button-secondary" onClick={copyDiagnostics}>{t('Copy diagnostics')}</button>
        </div>
      </div>

      <div className={styles.grid}>
        <article className={`sp-panel ${styles.formCard}`}>
          <label className={styles.field}>
            <span>{t('Issue type')}</span>
            <select value={type} onChange={(event) => setType(event.target.value as ReportType)}>
              <option value="error_report">{t('Error report')}</option>
              <option value="bug_report">{t('Bug report')}</option>
              <option value="feature_request">{t('Feature request')}</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>{t('Title')}</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('Short summary of the problem')} />
          </label>

          <label className={styles.field}>
            <span>{t('What happened?')}</span>
            <textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder={t('Describe the issue in one clear paragraph.')} />
          </label>

          <label className={styles.field}>
            <span>{t('Steps to reproduce')}</span>
            <textarea rows={4} value={steps} onChange={(event) => setSteps(event.target.value)} placeholder={t('One step per line')} />
          </label>

          <div className={styles.twoCol}>
            <label className={styles.field}>
              <span>{t('Expected result')}</span>
              <textarea rows={3} value={expected} onChange={(event) => setExpected(event.target.value)} placeholder={t('What should have happened?')} />
            </label>
            <label className={styles.field}>
              <span>{t('Actual result')}</span>
              <textarea rows={3} value={actual} onChange={(event) => setActual(event.target.value)} placeholder={t('What happened instead?')} />
            </label>
          </div>
        </article>

        <aside className={`sp-panel ${styles.sideCard}`}>
          <span className="sp-eyebrow">{t('Diagnostics preview')}</span>
          <pre className={styles.diagnostics}>{diagnostics}</pre>
          <div className={styles.sideActions}>
            <button type="button" className="sp-button-secondary" onClick={copyDiagnostics}>{t('Copy diagnostics')}</button>
            <Link className="sp-button-secondary" href="/status">{t('Open status & support')}</Link>
          </div>
          {copyMessage ? <p className={styles.copyMessage}>{copyMessage}</p> : null}
        </aside>
      </div>
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/useI18n';
import {
  crashReportsEnabledClient,
  getCrashSnapshot,
  getUsageSnapshot,
  usageAnalyticsEnabledClient,
} from '@/lib/privacy/preferences';
import { useSettings } from '@/providers/SettingsProvider';
import styles from '@/app/(dashboard)/report/report.module.css';

const GITHUB_NEW_ISSUE = 'https://github.com/Alphadarklord1/kivora/issues/new';

type ReportType = 'error_report' | 'bug_report' | 'feature_request';

const TEMPLATE_MAP: Record<ReportType, string> = {
  error_report: 'error_report.yml',
  bug_report: 'bug_report.yml',
  feature_request: 'feature_request.yml',
};

const ISSUE_TYPE_META: Record<ReportType, { icon: string; title: string; desc: string }> = {
  error_report: {
    icon: '⚠️',
    title: 'Error report',
    desc: 'Use this when something crashes, throws an exception, or blocks normal use.',
  },
  bug_report: {
    icon: '🪲',
    title: 'Bug report',
    desc: 'Use this for broken UI, unexpected behavior, or flows that do not work correctly.',
  },
  feature_request: {
    icon: '✨',
    title: 'Feature request',
    desc: 'Use this when a workflow is missing, incomplete, or needs a clearer implementation.',
  },
};

const REPORT_TIPS = [
  'Include the exact page or tool where the issue happened.',
  'List one action per line in steps to reproduce.',
  'Mention whether this blocks studying completely or is only cosmetic.',
] as const;

export function ReportIssuePanel({ embedded = false }: { embedded?: boolean }) {
  const pathname = usePathname();
  const { settings } = useSettings();
  const { t, isRTL } = useI18n({
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
    'Use this when something crashes, throws an exception, or blocks normal use.': 'استخدم هذا عندما يتعطل شيء ما أو يظهر استثناء أو يمنع الاستخدام الطبيعي.',
    'Use this for broken UI, unexpected behavior, or flows that do not work correctly.': 'استخدم هذا لواجهة مكسورة أو سلوك غير متوقع أو مسارات لا تعمل كما يجب.',
    'Use this when a workflow is missing, incomplete, or needs a clearer implementation.': 'استخدم هذا عندما يكون هناك مسار عمل مفقود أو غير مكتمل أو يحتاج تنفيذًا أوضح.',
    'Ready to submit': 'جاهز للإرسال',
    'Add a little more detail': 'أضف مزيدًا من التفاصيل',
    'The report has enough context to open a useful issue.': 'يحتوي البلاغ على سياق كافٍ لفتح مشكلة مفيدة.',
    'A title plus either a summary or steps will make this much easier to act on.': 'وجود عنوان مع ملخص أو خطوات سيجعل التعامل مع البلاغ أسهل بكثير.',
    'Include the exact page or tool where the issue happened.': 'اذكر الصفحة أو الأداة الدقيقة التي حدثت فيها المشكلة.',
    'List one action per line in steps to reproduce.': 'اكتب إجراءً واحدًا في كل سطر ضمن خطوات إعادة المشكلة.',
    'Mention whether this blocks studying completely or is only cosmetic.': 'اذكر ما إذا كانت المشكلة تمنع الدراسة بالكامل أو أنها مجرد مشكلة شكلية.',
  });

  const [type, setType] = useState<ReportType>('error_report');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const diagnostics = useMemo(() => {
    const route = typeof window !== 'undefined' ? window.location.href : pathname || '/settings';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
    const usageSnapshot = getUsageSnapshot();
    const crashSnapshot = getCrashSnapshot();
    const usageEnabled = usageAnalyticsEnabledClient();
    const crashEnabled = crashReportsEnabledClient();
    const lines = [
      `${t('Current route')}: ${route}`,
      `${t('Language')}: ${settings.language || 'en'}`,
      `${t('Theme')}: ${settings.theme || 'system'}`,
      `${t('Timestamp')}: ${new Date().toISOString()}`,
      `${t('User agent')}: ${userAgent}`,
    ];

    if (usageEnabled) {
      const topRoutes = usageSnapshot.topRoutes.length
        ? usageSnapshot.topRoutes.map((entry) => `${entry.route} (${entry.count})`).join(', ')
        : 'none yet';
      lines.push(`Usage snapshot: ${usageSnapshot.totalViews} local page views`);
      lines.push(`Top routes: ${topRoutes}`);
    } else {
      lines.push('Usage snapshot: disabled');
    }

    if (crashEnabled) {
      const latestCrash = crashSnapshot[0];
      lines.push(`Recent crashes: ${crashSnapshot.length}`);
      if (latestCrash) {
        lines.push(`Latest crash: ${latestCrash.message} @ ${latestCrash.page}`);
      }
    } else {
      lines.push('Recent crashes: disabled');
    }

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

  const issuePreview = ISSUE_TYPE_META[type];
  const canSubmit = title.trim().length > 0 && (summary.trim().length > 0 || steps.trim().length > 0);
  const submitTitle = canSubmit ? t('Ready to submit') : t('Add a little more detail');
  const submitBody = canSubmit
    ? t('The report has enough context to open a useful issue.')
    : t('A title plus either a summary or steps will make this much easier to act on.');
  const diagnosticsMeta = [
    { label: t('Current route'), value: pathname || '/settings' },
    { label: t('Language'), value: settings.language || 'en' },
    { label: t('Theme'), value: settings.theme || 'system' },
  ];

  return (
    <section className={embedded ? styles.embedded : styles.page} dir={isRTL ? 'rtl' : 'ltr'}>
      {!embedded && (
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
      )}

      <div className={styles.quickGrid}>
        {(Object.entries(ISSUE_TYPE_META) as Array<[ReportType, typeof ISSUE_TYPE_META[ReportType]]>).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={`${styles.typeCard} ${type === key ? styles.typeCardActive : ''}`}
            onClick={() => setType(key)}
          >
            <span className={styles.typeIcon}>{meta.icon}</span>
            <div>
              <strong>{t(meta.title)}</strong>
              <p>{t(meta.desc)}</p>
            </div>
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <article className={`sp-panel ${styles.formCard}`}>
          <div className={styles.formHeader}>
            <div>
              <span className="sp-eyebrow">{t('Issue type')}</span>
              <h2>{t(issuePreview.title)}</h2>
              <p>{t(issuePreview.desc)}</p>
            </div>
            <span className={styles.formIcon}>{issuePreview.icon}</span>
          </div>

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

          <div className={styles.submitRow}>
            <div className={styles.submitHint}>
              <strong>{submitTitle}</strong>
              <span>{submitBody}</span>
            </div>
            <button type="button" className="sp-button-primary" onClick={openIssue} disabled={!canSubmit}>
              {t('Open GitHub issue')}
            </button>
          </div>
        </article>

        <aside className={`sp-panel ${styles.sideCard}`}>
          <span className="sp-eyebrow">{t('Diagnostics preview')}</span>
          <div className={styles.metaGrid}>
            {diagnosticsMeta.map((entry) => (
              <div key={entry.label} className={styles.metaCard}>
                <strong>{entry.label}</strong>
                <span>{entry.value}</span>
              </div>
            ))}
          </div>
          <pre className={styles.diagnostics}>{diagnostics}</pre>
          <div className={styles.sideActions}>
            <button type="button" className="sp-button-secondary" onClick={copyDiagnostics}>{t('Copy diagnostics')}</button>
            <Link className="sp-button-secondary" href="/status">{t('Open status & support')}</Link>
          </div>
          {copyMessage ? <p className={styles.copyMessage}>{copyMessage}</p> : null}

          <div className={styles.tipCard}>
            <strong>{t('Need a quick path?')}</strong>
            <ul>
              {REPORT_TIPS.map((tip) => <li key={tip}>{t(tip)}</li>)}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

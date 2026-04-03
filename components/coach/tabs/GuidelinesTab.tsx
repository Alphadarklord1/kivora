'use client';

import styles from '@/app/(dashboard)/coach/page.module.css';

export function GuidelinesTab() {
  return (
    <div className={styles.guidelinesPage}>
      <div className={styles.guidelinesHero}>
        <h2>AI Guidelines</h2>
        <p>
          Kivora AI is a study assistant — not a search engine, ghostwriter, or general chatbot.
          Read this once so you know what it's great at, where its limits are, and how to use it responsibly.
        </p>
      </div>

      {/* What the AI does */}
      <div className={styles.guidelinesSection}>
        <div className={styles.guidelinesSectionHead}>
          <span className={styles.guidelinesSectionIcon}>✅</span>
          <h3>What Kivora AI is designed to do</h3>
        </div>
        <div className={styles.guidelinesCard}>
          <div className={styles.guidelinesGrid}>
            {[
              'Summarize lectures, textbooks, and readings',
              'Generate MCQs, quizzes, and flashcards',
              'Create structured study notes and outlines',
              'Break down assignments and study plans',
              'Solve academic math problems step by step',
              'Write and improve study-focused essays',
              'Rephrase writing in a formal or concise tone',
              'Research topics across academic sources',
              'Extract questions from images and PDFs',
              'Build knowledge maps from study material',
            ].map(item => (
              <div key={item} className={styles.guidelineItem}>
                <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotGreen}`} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What the AI won't do */}
      <div className={styles.guidelinesSection}>
        <div className={styles.guidelinesSectionHead}>
          <span className={styles.guidelinesSectionIcon}>🚫</span>
          <h3>What Kivora AI will not do</h3>
        </div>
        <div className={styles.guidelinesCard}>
          <div className={styles.guidelinesGrid}>
            {[
              'Write casual chat messages or roleplay',
              'Debug or write production code',
              'Draft emails, cover letters, or CVs',
              'Give legal, medical, or financial advice',
              'Answer questions unrelated to studying',
              'Generate creative fiction or social content',
            ].map(item => (
              <div key={item} className={styles.guidelineItem}>
                <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotRed}`} />
                {item}
              </div>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.65rem', lineHeight: 1.55 }}>
            Requests outside these boundaries are blocked automatically. This keeps the AI focused and keeps your account safe.
          </p>
        </div>
      </div>

      {/* Academic integrity */}
      <div className={styles.guidelinesSection}>
        <div className={styles.guidelinesSectionHead}>
          <span className={styles.guidelinesSectionIcon}>🎓</span>
          <h3>Academic integrity</h3>
        </div>
        <div className={styles.guidelinesCallout + ' ' + styles.guidelinesCalloutWarning}>
          <strong>Important:</strong> AI-generated content is a starting point — not a finished submission. Submitting AI output as your own original work without disclosure may violate your institution's academic integrity policy. Always verify facts, add your own analysis, and follow your school's rules on AI use.
        </div>
        <div className={styles.guidelinesCard} style={{ marginTop: '0.65rem' }}>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotBlue}`} />
            Use summaries to understand material faster — don't use them to skip reading entirely.
          </div>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotBlue}`} />
            Use quizzes and flashcards to self-test — the goal is learning, not memorising AI-generated answers.
          </div>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotBlue}`} />
            Use the essay writer as a draft scaffold — add your own argument and evidence before submitting.
          </div>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotBlue}`} />
            Use Scholar Hub research to find sources — always read and cite the original source, not Kivora's summary.
          </div>
        </div>
      </div>

      {/* Privacy */}
      <div className={styles.guidelinesSection}>
        <div className={styles.guidelinesSectionHead}>
          <span className={styles.guidelinesSectionIcon}>🔒</span>
          <h3>Your data and privacy</h3>
        </div>
        <div className={styles.guidelinesCard}>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotGreen}`} />
            <span><strong>Online mode</strong> — requests are sent to Groq (primary), Grok, or OpenAI for generation. Your content is sent to their servers transiently and is not stored by Kivora beyond your session.</span>
          </div>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotGreen}`} />
            <span><strong>Offline / Privacy mode</strong> — all AI runs locally on your device using Ollama or the bundled model. Nothing leaves your machine.</span>
          </div>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotGreen}`} />
            <span><strong>Desktop app</strong> — the bundled Mini model (Qwen 1.5B) runs entirely on-device. No internet required for basic AI features.</span>
          </div>
          <div className={styles.guidelineItem}>
            <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotBlue}`} />
            Never paste passwords, personal ID numbers, or sensitive personal data into any AI input field.
          </div>
        </div>
      </div>

      {/* Limitations */}
      <div className={styles.guidelinesSection}>
        <div className={styles.guidelinesSectionHead}>
          <span className={styles.guidelinesSectionIcon}>⚠️</span>
          <h3>Known limitations</h3>
        </div>
        <div className={styles.guidelinesCallout + ' ' + styles.guidelinesCalloutInfo}>
          AI models can hallucinate — they sometimes produce plausible-sounding but incorrect facts, citations, or calculations. Always cross-check important information against your textbook or a trusted source, especially for maths, science, and history facts.
        </div>
        <div className={styles.guidelinesCard} style={{ marginTop: '0.65rem' }}>
          {[
            'Knowledge cutoff: the model may not know about events after its training date.',
            'Math: complex symbolic algebra or multi-step proofs may contain errors — verify with a calculator or textbook.',
            "Citations: Scholar Hub citations point to real sources but the AI's excerpt may simplify or paraphrase.",
            'Languages: English and Arabic are best supported. Other languages may have reduced quality.',
            'Images: Vision analysis works best on clear, high-contrast photos. Blurry or hand-written content may be misread.',
          ].map(item => (
            <div key={item} className={styles.guidelineItem}>
              <span className={`${styles.guidelineItemDot} ${styles.guidelineItemDotBlue}`} />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* How to report */}
      <div className={styles.guidelinesSection}>
        <div className={styles.guidelinesSectionHead}>
          <span className={styles.guidelinesSectionIcon}>💬</span>
          <h3>Feedback and issues</h3>
        </div>
        <div className={styles.guidelinesCallout + ' ' + styles.guidelinesCalloutSuccess}>
          If the AI produces something harmful, incorrect, or unexpected, please report it using the feedback link in Settings → Help. Your reports improve the guardrails for everyone.
        </div>
      </div>
    </div>
  );
}

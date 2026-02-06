'use client';

import { AudioPodcast } from '@/components/tools/AudioPodcast';

export default function PodcastPage() {
  return (
    <div className="podcast-page">
      <AudioPodcast />

      <style jsx>{`
        .podcast-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 24px;
        }

        @media (max-width: 600px) {
          .podcast-page {
            padding: 16px;
          }
        }
      `}</style>
    </div>
  );
}

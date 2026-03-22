import { redirect } from 'next/navigation';

export default function DownloadsPage() {
  redirect('/settings#ai-models');
}

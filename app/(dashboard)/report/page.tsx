import { redirect } from 'next/navigation';

export default function ReportRedirectPage() {
  redirect('/settings#reporting');
}

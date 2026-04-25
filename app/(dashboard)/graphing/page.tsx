import { redirect } from 'next/navigation';

export default function GraphingRedirectPage() {
  redirect('/math?panel=graph');
}

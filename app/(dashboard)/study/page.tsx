import { redirect } from 'next/navigation';
import { buildCoachHomeRedirect } from '@/lib/coach/routes';

type SearchParamsInput = Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;

export default async function StudyRedirectPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  redirect(buildCoachHomeRedirect(resolvedSearchParams));
}

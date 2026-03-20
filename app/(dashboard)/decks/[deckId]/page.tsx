import { redirect } from 'next/navigation';
import { buildCoachLegacySetRedirect } from '@/lib/coach/routes';

type ParamsInput = { deckId: string } | Promise<{ deckId: string }>;
type SearchParamsInput = Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;

export default async function DeckDetailRedirectPage({
  params,
  searchParams,
}: {
  params: ParamsInput;
  searchParams?: SearchParamsInput;
}) {
  const { deckId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  redirect(buildCoachLegacySetRedirect(deckId, resolvedSearchParams));
}

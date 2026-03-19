import { redirect } from 'next/navigation';

type SearchParamsInput = Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;

function toQueryString(searchParams: Record<string, string | string[] | undefined>) {
  const nextQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => nextQuery.append(key, entry));
    } else if (typeof value === 'string') {
      nextQuery.set(key, value);
    }
  }
  return nextQuery.toString();
}

export default async function DecksRedirectPage({
  searchParams,
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const query = toQueryString(resolvedSearchParams);
  redirect(query ? `/study?${query}` : '/study');
}

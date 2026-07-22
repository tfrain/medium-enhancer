// Self-citation assist: while editing a Medium draft, surface the author's own
// best-performing past posts (real lifetime earnings, via Medium's own GraphQL)
// so a matching one can be linked as a native mixtape embed card.
//
// Reuses the browser's existing logged-in Medium session (same-origin fetch,
// credentials included) — no token handling in this extension, same posture
// as everything else here that talks to medium.com directly.

export type SelfCitePost = {
  title: string
  url: string
  publication: string | null
  revenueUsd: number
  firstPublishedAt: number
}

const GRAPHQL_URL = 'https://medium.com/_/graphql'

const QUERY = `query UserLifetimeStoryStatsPostsQuery($username: ID!, $first: Int!, $after: String!, $orderBy: UserPostsOrderBy, $filter: UserPostsFilter) {
  user(username: $username) {
    id
    postsConnection(first: $first, after: $after, orderBy: $orderBy, filter: $filter) {
      edges {
        node {
          title
          mediumUrl
          firstPublishedAt
          earnings { total { units nanos } }
          collection { name }
        }
      }
    }
  }
}`

const isEditorPathname = (pathname: string): boolean =>
  /^\/p\/[a-f0-9]+\/edit\/?$/.test(pathname) || pathname.startsWith('/new-story')

export const isMediumEditorPage = (): boolean => {
  const host = window.location.hostname.toLowerCase()
  const onMedium = host === 'medium.com' || host.endsWith('.medium.com')
  return onMedium && isEditorPathname(window.location.pathname)
}

let cache: { username: string; posts: SelfCitePost[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10min — avoid refetching on every URL-poll tick

export const fetchTopEarners = async (username: string, limit = 5): Promise<SelfCitePost[]> => {
  if (cache && cache.username === username && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.posts.slice(0, limit)
  }

  const body = [
    {
      operationName: 'UserLifetimeStoryStatsPostsQuery',
      variables: {
        username,
        first: 20,
        after: '',
        orderBy: { lifetimeEarnings: 'DESC' },
        filter: { published: true },
      },
      query: QUERY,
    },
  ]

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`self-cite: GraphQL request failed (${res.status})`)

  const json = await res.json()
  const edges = json?.[0]?.data?.user?.postsConnection?.edges ?? []
  const posts: SelfCitePost[] = edges.map((edge: any) => {
    const n = edge.node
    const earn = n?.earnings?.total ?? { units: 0, nanos: 0 }
    return {
      title: n?.title ?? '(untitled)',
      url: n?.mediumUrl ?? '',
      publication: n?.collection?.name ?? null,
      revenueUsd: (earn.units ?? 0) + (earn.nanos ?? 0) / 1e9,
      firstPublishedAt: n?.firstPublishedAt ?? 0,
    }
  }).filter((p: SelfCitePost) => p.url)

  posts.sort((a, b) => b.revenueUsd - a.revenueUsd)
  cache = { username, posts, fetchedAt: Date.now() }
  return posts.slice(0, limit)
}

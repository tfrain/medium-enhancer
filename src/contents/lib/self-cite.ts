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
      pageInfo { endCursor hasNextPage }
    }
  }
}`

// The story being edited (/p/<id>/edit) is not something to cite inside itself.
export const editingPostId = (pathname: string): string | null =>
  pathname.match(/^\/p\/([a-f0-9]+)\/edit\/?$/)?.[1] ?? null

export const isSamePost = (url: string, postId: string | null): boolean => {
  if (!postId) return false
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '')
  return path.endsWith('-' + postId) || path.endsWith('/' + postId)
}

const isEditorPathname = (pathname: string): boolean =>
  /^\/p\/[a-f0-9]+\/edit\/?$/.test(pathname) || pathname.startsWith('/new-story')

export const isMediumEditorPage = (): boolean => {
  const host = window.location.hostname.toLowerCase()
  const onMedium = host === 'medium.com' || host.endsWith('.medium.com')
  return onMedium && isEditorPathname(window.location.pathname)
}

// Best-effort read of the draft title straight out of the editor's contenteditable
// title field. Medium's DOM has shifted selectors before, so this tries a few
// fallbacks, then falls back to the tab title, then gives up ('' — callers must
// degrade to revenue-only sorting and say so visibly, not silently).
const TITLE_SELECTORS = [
  '[data-testid="editorTitleParagraph"]',
  'article [data-testid*="title" i][contenteditable]',
  'h1[contenteditable], h3[contenteditable]',
  '.graf--title',
  // Broader fallback: the first contenteditable element inside the editor's
  // article root is very likely the title field even if its testid changed.
  'article [contenteditable]:first-of-type',
]

const stripTabTitleSuffix = (t: string): string =>
  t.replace(/\s*[–—-]\s*(Medium|Draft)\s*$/i, '').trim()

export const getCurrentDraftTitle = (): string => {
  for (const sel of TITLE_SELECTORS) {
    const el = document.querySelector(sel)
    const text = el?.textContent?.trim()
    if (text) return text
  }
  // Medium keeps the tab title in sync with the draft title while editing,
  // usually as "<title> - Medium" or similar — strip that suffix if present.
  const tabTitle = stripTabTitleSuffix(document.title || '')
  if (tabTitle && tabTitle.toLowerCase() !== 'medium') return tabTitle
  return ''
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are',
  'was', 'were', 'it', 'its', 'that', 'this', 'with', 'you', 'your', 'he',
  'his', 'she', 'her', 'they', 'their', 'be', 'has', 'have', 'how', 'why',
  'what', 'when', 'from', 'but', 'not', 'my', 'me', 'i', 'we', 'our',
])

const tokenize = (s: string): Set<string> => {
  const words = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    // length > 1, not > 2 — a > 2 cutoff was silently dropping short but
    // meaningful tech terms (AI, Go, ML, UX, OS...), exactly the words most
    // likely to carry real topical signal in this author's writing. Real
    // function words that length alone wouldn't catch are in STOPWORDS.
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  return new Set(words)
}

// Overlap-coefficient word match between the draft title and a candidate post's
// title — crude, but needs zero extra infra (no access to our local writeflow DB
// from inside the extension sandbox) and is enough to stop an unrelated
// high-earning post from outranking an actually-relevant lower-earning one.
export const scoreRelevance = (draftTitle: string, candidateTitle: string): number => {
  const a = tokenize(draftTitle)
  const b = tokenize(candidateTitle)
  if (a.size === 0 || b.size === 0) return 0
  let overlap = 0
  for (const w of a) if (b.has(w)) overlap++
  return overlap / Math.min(a.size, b.size)
}

let cache: { username: string; posts: SelfCitePost[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10min — avoid refetching on every URL-poll tick

const graphqlData = (json: any): any => {
  const result = Array.isArray(json) ? json[0] : json
  if (result?.errors?.length) {
    throw new Error('Medium could not load your stories: ' + result.errors.map((error: any) => error.message || 'GraphQL error').join('; '))
  }
  if (!result?.data) throw new Error('Medium returned no story data. Sign in to Medium and try again.')
  return result.data
}

export const fetchViewerUsername = async (): Promise<string> => {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([{
      operationName: 'ViewerQuery',
      query: 'query ViewerQuery { viewer { id username } }',
      variables: {},
    }]),
  })
  if (!res.ok) throw new Error(`Medium viewer request failed (${res.status}). Sign in to Medium and try again.`)
  const username = graphqlData(await res.json()).viewer?.username
  if (!username) throw new Error('Sign in to Medium to see your stories.')
  return username
}

const PAGE_SIZE = 50
const MAX_PAGES = 10 // 500 stories: enough for nearly every writer, bounded for the rest

// Every published story, not just the top earners: the first version pulled
// only the top 20 by earnings, so an on-topic story that earned little could
// never be suggested (2026-10-18: a draft about Stats Insights 1.2 found
// nothing, although the 1.1.2 post exists).
export const fetchAllStories = async (username: string): Promise<SelfCitePost[]> => {
  if (cache && cache.username === username && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.posts.slice()
  }

  const posts: SelfCitePost[] = []
  const seen = new Set<string>()
  let after = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{
        operationName: 'UserLifetimeStoryStatsPostsQuery',
        variables: {
          username,
          first: PAGE_SIZE,
          after,
          orderBy: { lifetimeEarnings: 'DESC' },
          filter: { published: true },
        },
        query: QUERY,
      }]),
    })
    if (!res.ok) throw new Error(`self-cite: GraphQL request failed (${res.status})`)

    const user = graphqlData(await res.json()).user
    if (!user?.postsConnection) throw new Error('Medium could not load your stories. Sign in to Medium and try again.')
    for (const edge of user.postsConnection.edges ?? []) {
      const n = edge?.node
      const url = n?.mediumUrl ?? ''
      if (!url || seen.has(url)) continue
      seen.add(url)
      const earn = n?.earnings?.total ?? { units: 0, nanos: 0 }
      posts.push({
        title: n?.title ?? '(untitled)',
        url,
        publication: n?.collection?.name ?? null,
        revenueUsd: (earn.units ?? 0) + (earn.nanos ?? 0) / 1e9,
        firstPublishedAt: n?.firstPublishedAt ?? 0,
      })
    }
    const info = user.postsConnection.pageInfo
    if (!info?.hasNextPage || !info.endCursor) break
    after = info.endCursor
  }

  posts.sort((a, b) => b.revenueUsd - a.revenueUsd)
  cache = { username, posts, fetchedAt: Date.now() }
  return posts.slice()
}

export const fetchTopEarners = async (username: string, limit = 5): Promise<SelfCitePost[]> =>
  (await fetchAllStories(username)).slice(0, limit)

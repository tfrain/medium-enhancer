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

// Best-effort read of the draft title straight out of the editor's contenteditable
// title field. Medium's DOM has shifted selectors before, so this tries a few
// fallbacks and returns '' (not a hard error) if none match — callers should
// degrade to revenue-only sorting rather than fail outright.
const TITLE_SELECTORS = [
  '[data-testid="editorTitleParagraph"]',
  'article [data-testid*="title" i][contenteditable]',
  'h1[contenteditable], h3[contenteditable]',
  '.graf--title',
]

export const getCurrentDraftTitle = (): string => {
  for (const sel of TITLE_SELECTORS) {
    const el = document.querySelector(sel)
    const text = el?.textContent?.trim()
    if (text) return text
  }
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
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
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

// Ask the same local Ollama / cloud (BYOK) provider already wired for AI summarize
// (see options.tsx "AI Provider") for one short "why read this" sentence, so
// self-citing doesn't leave the user to write that transition line by hand.
// Reuses background.ts's existing generic 'summarize' port protocol — no
// background.ts changes needed, it already accepts any {instruction,title,text}.
export const generateTeaser = (draftTitle: string, candidateTitle: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      {
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: '',
        aiProvider: 'ollama',
        aiApiKey: '',
        aiCloudModel: '',
      },
      (cfg) => {
        const provider = cfg.aiProvider === 'openai' || cfg.aiProvider === 'anthropic' ? cfg.aiProvider : 'ollama'
        const model = provider === 'ollama' ? cfg.ollamaModel : cfg.aiCloudModel
        if (!model) {
          reject(new Error(provider === 'ollama' ? 'No Ollama model selected in Options.' : `No ${provider} model configured in Options.`))
          return
        }
        if (provider !== 'ollama' && !cfg.aiApiKey) {
          reject(new Error(`No ${provider} API key configured in Options.`))
          return
        }

        const instruction =
          'You are helping a writer add a "further reading" recommendation for their own past article ' +
          'at the end of a new draft. Write exactly ONE short sentence (under 25 words) recommending the ' +
          'reader check out that past article, in the SAME language as the draft title below. ' +
          'Output ONLY that one sentence — no quotes, no labels, no extra commentary.'

        let accumulated = ''
        let settled = false
        const port = chrome.runtime.connect({ name: 'summarize' })
        const timeout = window.setTimeout(() => {
          if (settled) return
          settled = true
          try { port.disconnect() } catch {}
          reject(new Error('Timed out waiting for a response.'))
        }, 30000)

        port.onMessage.addListener((msg: any) => {
          if (msg.type === 'chunk') {
            accumulated += msg.chunk
          } else if (msg.type === 'done') {
            if (settled) return
            settled = true
            window.clearTimeout(timeout)
            resolve(accumulated.trim().replace(/^["“]|["”]$/g, ''))
          } else if (msg.type === 'error') {
            if (settled) return
            settled = true
            window.clearTimeout(timeout)
            reject(new Error(msg.error || 'AI request failed'))
          }
        })
        port.onDisconnect.addListener(() => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          reject(new Error('Connection closed before a response arrived.'))
        })
        port.postMessage({
          instruction,
          title: draftTitle || '(untitled draft)',
          text: candidateTitle,
          baseUrl: cfg.ollamaBaseUrl || 'http://localhost:11434',
          model,
          provider,
          apiKey: cfg.aiApiKey,
        })
      },
    )
  })
}

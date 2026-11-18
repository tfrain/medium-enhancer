// Reader Interests (Pro, 0.12): what a Medium reader claps, highlights and
// responds to, read from the GraphQL answers Medium's own profile page already
// fetched (src/contents/reader-interest-tap.ts). Nothing here makes a request,
// and nothing is stored: the panel keeps it in memory for the open tab only.
//
// Pure functions so the parsing and scoring can be tested against a real
// Activity-tab capture (test/reader-interest.test.ts).

export const TAP_SOURCE = 'me-reader-interest'

/** Medium operations the tap copies. Anything else is ignored. */
export const WATCHED_OPERATIONS = ['UserActivitiesQuery', 'UserCatalogsListQuery', 'NavBarQuery'] as const

export type GraphqlOp = { name: string; variables: any }

export type ActivityKind = 'clap' | 'response' | 'highlight'

export type ReaderActivity = {
  key: string
  kind: ActivityKind
  at: number
  postId: string
  title: string
  url: string
  authorId: string
  authorName: string
  publication: string
  tags: { slug: string; title: string }[]
  quote?: string
  response?: string
}

export type ReaderList = { name: string; count: number }

export type ActivityPage = { userId: string; first: boolean; hasMore: boolean; activities: ReaderActivity[]; username?: string }
export type ListsPage = { userId: string; username?: string; lists: ReaderList[] }

/** Weights: a highlight is a sentence they chose; a response is effort; a clap is cheap. */
export const KIND_WEIGHT: Record<ActivityKind, number> = { highlight: 3, response: 2, clap: 1 }

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The operations named in a GraphQL request body (Medium batches them in an array). */
export const operationsInBody = (body: unknown): GraphqlOp[] => {
  if (typeof body !== 'string' || !body.includes('operationName')) return []
  try {
    const parsed = JSON.parse(body)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list
      .filter(op => op && typeof op.operationName === 'string')
      .map(op => ({ name: op.operationName, variables: op.variables ?? {} }))
  } catch {
    return []
  }
}

export const isWatched = (ops: GraphqlOp[]): boolean =>
  ops.some(op => (WATCHED_OPERATIONS as readonly string[]).includes(op.name))

const paragraphsText = (paragraphs: unknown): string =>
  (Array.isArray(paragraphs) ? paragraphs : [])
    .map(p => str(p?.text).trim())
    .filter(Boolean)
    .join('\n')

/** The highlighted words: Medium sends the whole paragraph plus offsets. */
export const quoteText = (quote: any): string => {
  const paragraphs = Array.isArray(quote?.paragraphs) ? quote.paragraphs : []
  if (paragraphs.length === 1) {
    const text = str(paragraphs[0]?.text)
    const start = Number(quote.startOffset)
    const end = Number(quote.endOffset)
    if (!(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length))
      return text.trim()
    // Medium's offsets can land mid-word ("known as proti"): widen to whole words.
    let from = start
    let to = end
    while (from > 0 && /\w/.test(text[from - 1]) && /\w/.test(text[from])) from--
    while (to < text.length && /\w/.test(text[to - 1]) && /\w/.test(text[to])) to++
    return text.slice(from, to).trim()
  }
  return paragraphsText(paragraphs)
}

const KIND_BY_TYPE: Record<string, ActivityKind> = {
  post_recommended: 'clap',
  post_clapped: 'clap',
  response_created: 'response',
  quote: 'highlight',
  post_highlighted: 'highlight',
}

export const activityFromNode = (node: any): ReaderActivity | null => {
  const kind = KIND_BY_TYPE[str(node?.activityType).toLowerCase()]
  if (!kind) return null
  const post = node.post || node.quote?.post || node.responsePost?.responseRootPost?.post
  if (!post?.id) return null
  const creator = post.creator || {}
  const activity: ReaderActivity = {
    key: str(node.activityName) || `${kind}-${post.id}-${node.occurredAt}`,
    kind,
    at: Number(node.occurredAt) || 0,
    postId: str(post.id),
    title: str(post.title) || str(post.responseRootPost?.post?.title),
    url: str(post.mediumUrl) || `https://medium.com/p/${post.id}`,
    authorId: str(creator.id),
    authorName: str(creator.name) || str(creator.username),
    publication: str(post.collection?.name),
    tags: (Array.isArray(post.tags) ? post.tags : [])
      .map((t: any) => ({ slug: str(t?.normalizedTagSlug) || str(t?.id), title: str(t?.displayTitle) || str(t?.id) }))
      .filter((t: { slug: string }) => t.slug),
  }
  if (kind === 'highlight') activity.quote = quoteText(node.quote)
  if (kind === 'response') activity.response = paragraphsText(node.responsePost?.content?.bodyModel?.paragraphs)
  return activity
}

/** One UserActivitiesQuery answer. Returns null when the shape is not recognised. */
export const activityPage = (op: GraphqlOp, result: any): ActivityPage | null => {
  const conn = result?.data?.userActivitiesConnection
  const userId = str(op.variables?.input?.userId)
  if (!conn || !Array.isArray(conn.edges) || !userId) return null
  const activities = conn.edges.map((e: any) => activityFromNode(e?.node)).filter(Boolean) as ReaderActivity[]
  // A response is a post written by the reader: its creator names them.
  const username = conn.edges
    .map((e: any) => e?.node?.responsePost?.creator)
    .find((c: any) => c?.id === userId && c?.username)?.username
  return {
    userId,
    first: !str(op.variables?.input?.after),
    hasMore: conn.pageInfo?.hasNextPage === true,
    activities,
    ...(username ? { username } : {}),
  }
}

export const listsPage = (op: GraphqlOp, result: any): ListsPage | null => {
  const user = result?.data?.userResult
  const catalogs = user?.viewerEdge?.catalogsConnection?.catalogs ?? user?.catalogsConnection?.catalogs
  const userId = str(user?.id) || str(op.variables?.id)
  if (!userId || !Array.isArray(catalogs)) return null
  const lists = catalogs
    .filter((c: any) => c && c.visibility !== 'PRIVATE' && str(c.name).trim())
    .map((c: any) => ({ name: str(c.name).trim(), count: Number(c.postItemsCount) || 0 }))
  const username = catalogs.map((c: any) => c?.creator).find((c: any) => c?.id === userId && c?.username)?.username
  return { userId, lists, ...(username ? { username } : {}) }
}

export const viewerIdFrom = (result: any): string => str(result?.data?.viewer?.id)

/** Pair each operation in a batched request with its answer. */
export const pairResults = (ops: GraphqlOp[], json: unknown): { op: GraphqlOp; result: any }[] => {
  const results = Array.isArray(json) ? json : [json]
  return ops.map((op, i) => ({ op, result: results[i] })).filter(p => p.result)
}

// ---- Profile state ---------------------------------------------------------

export type ReaderProfile = {
  userId: string
  username: string
  activities: Map<string, ReaderActivity>
  lists: ReaderList[] | null
  hasMore: boolean
}

export const emptyProfile = (userId: string): ReaderProfile =>
  ({ userId, username: '', activities: new Map(), lists: null, hasMore: false })

export const addActivityPage = (profile: ReaderProfile, page: ActivityPage) => {
  if (page.username) profile.username = page.username
  for (const a of page.activities) profile.activities.set(a.key, a)
  // The first page arrives first; later pages decide whether more remain.
  if (!page.first || profile.activities.size === page.activities.length) profile.hasMore = page.hasMore
}

// ---- Summary ----------------------------------------------------------------

export type Ranked = { name: string; score: number; count: number }

export type ReaderSummary = {
  total: number
  counts: Record<ActivityKind, number>
  from: number
  to: number
  tags: Ranked[]
  authors: Ranked[]
  publications: Ranked[]
  highlights: ReaderActivity[]
  responses: ReaderActivity[]
  yourStories: ReaderActivity[]
}

const rank = (entries: { name: string; weight: number }[], limit: number): Ranked[] => {
  const by = new Map<string, Ranked>()
  for (const { name, weight } of entries) {
    if (!name) continue
    const r = by.get(name) || { name, score: 0, count: 0 }
    r.score += weight
    r.count += 1
    by.set(name, r)
  }
  return [...by.values()].sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit)
}

export const summarize = (activities: Iterable<ReaderActivity>, viewerId = ''): ReaderSummary => {
  const all = [...activities].sort((a, b) => b.at - a.at)
  const counts: Record<ActivityKind, number> = { clap: 0, response: 0, highlight: 0 }
  for (const a of all) counts[a.kind]++
  const times = all.map(a => a.at).filter(Boolean)
  // Your stories: one row per story, the strongest signal first.
  const yours = new Map<string, ReaderActivity>()
  if (viewerId) {
    for (const a of all) {
      if (a.authorId !== viewerId) continue
      const seen = yours.get(a.postId)
      if (!seen || KIND_WEIGHT[a.kind] > KIND_WEIGHT[seen.kind]) yours.set(a.postId, a)
    }
  }
  return {
    total: all.length,
    counts,
    from: times.length ? Math.min(...times) : 0,
    to: times.length ? Math.max(...times) : 0,
    tags: rank(all.flatMap(a => a.tags.map(t => ({ name: t.title, weight: KIND_WEIGHT[a.kind] }))), 12),
    authors: rank(all.map(a => ({ name: a.authorName, weight: KIND_WEIGHT[a.kind] })), 6),
    publications: rank(all.map(a => ({ name: a.publication, weight: KIND_WEIGHT[a.kind] })), 6),
    highlights: all.filter(a => a.kind === 'highlight' && a.quote),
    responses: all.filter(a => a.kind === 'response' && a.response),
    yourStories: [...yours.values()],
  }
}

const KIND_LABEL: Record<ActivityKind, string> = { clap: 'clapped', response: 'responded', highlight: 'highlighted' }
export const kindLabel = (kind: ActivityKind) => KIND_LABEL[kind]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "40 activities (35 claps, 4 responses, 1 highlight)" */
export const countsLine = (s: ReaderSummary): string =>
  `${s.total} ${s.total === 1 ? 'activity' : 'activities'} (${plural(s.counts.clap, 'clap')}, ${plural(s.counts.response, 'response')}, ${plural(s.counts.highlight, 'highlight')})`

export const formatDay = (ms: number): string =>
  ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

/** Markdown for notes / topic ideas: public activity only, no account data. */
export const summaryMarkdown = (username: string, s: ReaderSummary, lists: ReaderList[] | null): string => {
  const lines: string[] = [`# Reader interests: @${username || 'unknown'}`, '']
  lines.push(`Based on ${countsLine(s)}, ${formatDay(s.from)} – ${formatDay(s.to)}.`, '')
  if (s.yourStories.length) {
    lines.push('## Your stories they engaged with')
    for (const a of s.yourStories) lines.push(`- ${kindLabel(a.kind)}: [${a.title}](${a.url})`)
    lines.push('')
  }
  if (s.tags.length) lines.push('## Top tags', s.tags.map(t => `${t.name} (${t.score})`).join(', '), '')
  if (s.highlights.length) {
    lines.push('## Highlights')
    for (const a of s.highlights) lines.push(`> ${a.quote}`, `— [${a.title}](${a.url})`, '')
  }
  if (s.responses.length) {
    lines.push('## Their responses')
    for (const a of s.responses) lines.push(`- On [${a.title}](${a.url}): ${a.response!.replace(/\s+/g, ' ')}`)
    lines.push('')
  }
  if (s.authors.length) lines.push('## Writers', s.authors.map(r => `${r.name} (${r.count})`).join(', '), '')
  if (s.publications.length) lines.push('## Publications', s.publications.map(r => `${r.name} (${r.count})`).join(', '), '')
  if (lists?.length) lines.push('## Public lists', lists.map(l => `${l.name} (${l.count})`).join(', '), '')
  return lines.join('\n').trim() + '\n'
}

// ---- Which profile is this page? -----------------------------------------------

const NOT_A_USER_SUBDOMAIN = new Set(['www', 'policy', 'help', 'blog', 'glyph', 'miro', 'cdn-images-1', 'link', 'api'])

/** The profile username in a Medium URL, or '' when the page is not a profile. */
export const profileUsernameFromUrl = (href: string): string => {
  try {
    const u = new URL(href)
    const parts = u.pathname.split('/').filter(Boolean)
    if (u.hostname === 'medium.com' && parts[0]?.startsWith('@') && parts.length <= 2) {
      if (parts.length === 1 || /^(activity|lists|about|followers|following|has-recommended)$/i.test(parts[1]))
        return decodeURIComponent(parts[0].slice(1)).toLowerCase()
      return ''
    }
    const sub = u.hostname.match(/^([a-z0-9-]+)\.medium\.com$/i)?.[1]?.toLowerCase()
    if (sub && !NOT_A_USER_SUBDOMAIN.has(sub) && parts.length === 1 && /^(activity|lists|about)$/i.test(parts[0])) return sub
    return ''
  } catch {
    return ''
  }
}

export const isActivityUrl = (href: string): boolean => {
  try { return /\/activity\/?$/i.test(new URL(href).pathname) } catch { return false }
}

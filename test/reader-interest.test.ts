import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

// Reader Interests (0.12). Shapes mirror a real Activity-tab capture
// (UserActivitiesQuery / UserCatalogsListQuery / NavBarQuery, 2026-11-18);
// names and text here are synthetic.
const ri = loadSource('src/shared/reader-interest.ts', {})
const READER = 'u-reader'
const VIEWER = 'u-viewer'

const post = (id: string, title: string, creatorId: string, tags: string[], collection: string | null = null) => ({
  id, title, mediumUrl: `https://medium.com/p/${id}`,
  creator: { id: creatorId, name: `Writer ${creatorId}`, username: creatorId },
  collection: collection ? { name: collection } : null,
  tags: tags.map(t => ({ id: t, normalizedTagSlug: t, displayTitle: t[0].toUpperCase() + t.slice(1) })),
})
const node = (type: string, key: string, p: any, extra: any = {}) =>
  ({ node: { activityType: type, activityName: key, occurredAt: Date.UTC(2026, 10, 10), quote: null, responsePost: null, post: p, ...extra } })

const edges = [
  node('post_recommended', 'a1', post('p1', 'Ukraine Update', 'w1', ['ukraine-war', 'news'])),
  node('post_recommended', 'a2', post('p2', 'Before ENIAC', VIEWER, ['computer-history', 'programming'], "Programmer's Career")),
  node('response_created', 'a3', post('p2', 'Before ENIAC', VIEWER, ['computer-history', 'programming'], "Programmer's Career"), {
    responsePost: { creator: { id: READER, username: 'Reader1' }, content: { bodyModel: { paragraphs: [{ text: 'Great story!' }] } } },
  }),
  node('quote', 'a4', post('p3', 'Black Hole Stars', 'w2', ['physics', 'space']), {
    quote: { startOffset: 4, endOffset: 14, paragraphs: [{ text: 'Red dwarfs are small.' }] },
  }),
  node('something_new', 'a5', post('p4', 'Unknown', 'w3', ['x'])),
]
const actOp = (after = '') => ({ name: 'UserActivitiesQuery', variables: { input: { userId: READER, first: 20, after } } })
const actResult = (hasNextPage: boolean) => ({ data: { userActivitiesConnection: { edges, pageInfo: { hasNextPage } } } });

{
  const body = JSON.stringify([{ operationName: 'NavBarQuery', variables: {} }, { operationName: 'UserActivitiesQuery', variables: { input: { userId: READER } } }])
  const ops = JSON.parse(JSON.stringify(ri.operationsInBody(body)))
  assert.deepEqual(ops.map((o: any) => o.name), ['NavBarQuery', 'UserActivitiesQuery'])
  assert.equal(ri.isWatched(ops), true)
  assert.deepEqual(JSON.parse(JSON.stringify(ri.operationsInBody('not json operationName'))), [])
  assert.equal(ri.isWatched(ri.operationsInBody(JSON.stringify({ operationName: 'ClapCountQuery' }))), false, 'other queries are left alone')
  console.log('PASS Reader Interests picks only the watched operations out of a batched body')
}

{
  const page = ri.activityPage(actOp(), actResult(true))
  assert.equal(page.userId, READER)
  assert.equal(page.first, true)
  assert.equal(page.hasMore, true)
  assert.equal(page.username, 'Reader1', 'username learned from their own response')
  assert.deepEqual(page.activities.map((a: any) => a.kind), ['clap', 'clap', 'response', 'highlight'], 'unknown activity types are skipped')
  assert.equal(page.activities[3].quote, 'dwarfs are', 'highlight is the selected words, not the whole paragraph')
  assert.equal(ri.quoteText({ startOffset: 6, endOffset: 14, paragraphs: [{ text: 'known as protium here' }] }), 'as protium',
    'offsets that cut a word ("as proti") widen to whole words')
  assert.equal(page.activities[2].response, 'Great story!')
  assert.equal(page.activities[1].publication, "Programmer's Career")
  assert.equal(ri.activityPage(actOp(), { data: null }), null, 'unrecognised answer is reported, not read as empty')
  console.log('PASS Reader Interests parses claps, responses and highlights')
}

{
  const profile = ri.emptyProfile(READER)
  ri.addActivityPage(profile, ri.activityPage(actOp(), actResult(true)))
  ri.addActivityPage(profile, ri.activityPage(actOp('c1'), actResult(false)))
  assert.equal(profile.activities.size, 4, 'the same activity seen twice (replay + live) counts once')
  assert.equal(profile.hasMore, false)
  const s = ri.summarize(profile.activities.values(), VIEWER)
  assert.deepEqual({ ...s.counts }, { clap: 2, response: 1, highlight: 1 })
  // computer-history: clap 1 + response 2 = 3, physics: highlight 3, ukraine-war: clap 1
  assert.equal(s.tags[0].score, 3)
  assert.ok(['Computer-history', 'Physics'].includes(s.tags[0].name))
  assert.equal(s.tags.find((t: any) => t.name === 'Physics').score, 3, 'one highlight weighs 3')
  assert.equal(s.tags.find((t: any) => t.name === 'Computer-history').score, 3, 'a clap (1) plus a response (2)')
  assert.equal(s.tags.find((t: any) => t.name === 'Ukraine-war').score, 1)
  assert.equal(s.yourStories.length, 1, 'one row per story of yours')
  assert.equal(s.yourStories[0].kind, 'response', 'strongest signal wins')
  assert.equal(ri.summarize(profile.activities.values(), '').yourStories.length, 0, 'signed out: no "your stories"')
  const md = ri.summaryMarkdown('Reader1', s, [{ name: 'math', count: 2 }])
  assert.ok(md.includes('# Reader interests: @Reader1') && md.includes('> dwarfs are') && md.includes('math (2)'))
  assert.equal(ri.countsLine(s), '4 activities (2 claps, 1 response, 1 highlight)')
  console.log('PASS Reader Interests weights highlights 3, responses 2, claps 1 and finds your stories')
}

{
  const lists = ri.listsPage({ name: 'UserCatalogsListQuery', variables: { id: READER } }, { data: { userResult: { id: READER, viewerEdge: { catalogsConnection: { catalogs: [
    { name: 'math', postItemsCount: 2, visibility: 'PUBLIC', creator: { id: READER, username: 'Reader1' } },
    { name: 'secret', postItemsCount: 9, visibility: 'PRIVATE', creator: { id: READER, username: 'Reader1' } },
  ] } } } } })
  assert.deepEqual(JSON.parse(JSON.stringify(lists)), { userId: READER, lists: [{ name: 'math', count: 2 }], username: 'Reader1' })
  assert.equal(ri.viewerIdFrom({ data: { viewer: { id: VIEWER } } }), VIEWER)
  console.log('PASS Reader Interests reads public lists and the viewer id')
}

{
  const u = ri.profileUsernameFromUrl
  assert.equal(u('https://medium.com/@DanielP/activity'), 'danielp')
  assert.equal(u('https://medium.com/@danielp'), 'danielp')
  assert.equal(u('https://medium.com/@danielp/some-story-0123456789ab'), '', 'a story is not a profile')
  assert.equal(u('https://someone.medium.com/activity'), 'someone')
  assert.equal(u('https://someone.medium.com/some-story-0123456789ab'), '')
  assert.equal(u('https://medium.com/programmers-career'), '')
  assert.equal(ri.isActivityUrl('https://medium.com/@danielp/activity'), true)
  console.log('PASS Reader Interests shows its button only on profile pages')
}

{
  // The tap copies Medium's own answer and never makes a request of its own.
  const posted: any[] = []
  const listeners: ((e: any) => void)[] = []
  let calls = 0
  const json = [{ data: { viewer: { id: VIEWER } } }]
  const win: any = {
    location: { origin: 'https://medium.com' },
    fetch: async () => { calls++; return { ok: true, clone: () => ({ json: async () => json }), marker: 'original' } },
    postMessage: (m: any) => posted.push(m),
    addEventListener: (_: string, fn: any) => listeners.push(fn),
  }
  const tap = loadSource('src/page/reader-interest-tap.ts', {})
  tap.installReaderInterestTap(win)
  tap.installReaderInterestTap(win) // a second copy must not double-wrap
  const res = await win.fetch('/_/graphql', { body: JSON.stringify([{ operationName: 'NavBarQuery', variables: {} }]) })
  assert.equal(res.marker, 'original', "Medium gets its own response back")
  await win.fetch('/_/graphql', { body: JSON.stringify([{ operationName: 'ClapCountQuery' }]) })
  await new Promise(r => setTimeout(r, 0))
  assert.equal(calls, 2, 'one network call per Medium call, none extra')
  assert.equal(posted.length, 1, 'only watched operations are copied')
  assert.equal(posted[0].kind, 'data')
  assert.deepEqual(posted[0].json, json)
  listeners.forEach(fn => fn({ source: win, data: { source: ri.TAP_SOURCE, kind: 'replay' } }))
  assert.equal(posted.length, 2, 'replays what it saw before the content script loaded')
  listeners.forEach(fn => fn({ source: {}, data: { source: ri.TAP_SOURCE, kind: 'replay' } }))
  assert.equal(posted.length, 2, 'ignores replay requests from other windows')
  console.log('PASS Reader Interests tap copies only watched answers and adds no requests')
}

// Release notes live in the Medium article; its comments are the feedback channel.
export const ARTICLE_URL =
  "https://medium.com/programmers-career/display-medium-toc-and-rss-feeds-medium-enhancer-f06012a2780c"

const minorOf = (version?: string): string =>
  String(version || "").split(".").slice(0, 2).join(".")

// Open the article after an update only when major.minor changes (0.7.x -> 0.8.0),
// not on patch releases: a new tab on every small fix is a nuisance.
// A fresh install opens the settings page instead (handled by the caller).
export const shouldOpenArticleOnUpdate = (
  details: { reason: string; previousVersion?: string },
  currentVersion: string
): boolean =>
  details.reason === "update" &&
  !!details.previousVersion &&
  minorOf(details.previousVersion) !== minorOf(currentVersion)

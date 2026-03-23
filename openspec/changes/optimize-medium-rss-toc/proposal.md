## Why

The current Table of Contents (TOC) and RSS features for the Medium platform need optimization to improve performance, usability, and code maintainability.

## What Changes

- Optimize the Table of Contents (TOC) generation logic for better performance.
- Refactor the TOC display and user interaction code for a smoother experience.
- Investigate and improve the RSS feed functionality for Medium articles.
- Restructure the related code modules for improved maintainability.

## Capabilities

### New Capabilities
- `medium-toc-optimization`: Covers the work to analyze and improve the performance and user experience of the TOC feature.
- `medium-rss-enhancements`: Covers the work to investigate, implement, or enhance the RSS feature for Medium.

### Modified Capabilities
- None

## Impact

- The changes will primarily affect the content script files located in `src/contents/`.
- Key files for the TOC feature like `src/contents/toc.ts`, `src/contents/ui/toc_content.ts`, and `src/contents/lib/extract.ts` will be modified.
- The impact on RSS functionality is less clear and will be determined during the implementation of the `medium-rss-enhancements` capability.

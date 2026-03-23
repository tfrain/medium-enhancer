## 1. TOC Optimization: Core Logic

- [ ] 1.1 Refactor heading extraction from `src/contents/lib/extract.ts` into a new `TocService` module.
- [ ] 1.2 Implement `IntersectionObserver` logic within the `TocService` to efficiently track the currently visible article heading.
- [ ] 1.3 Ensure the `TocService` is optimized to handle articles with a large number of headings (e.g., >50) without performance degradation.
- [ ] 1.4 Add unit tests for the `TocService` to verify the correctness of heading extraction and active heading detection logic.

## 2. TOC Optimization: UI

- [ ] 2.1 Refactor the main TOC UI component (currently in `src/contents/ui/toc_content.ts`) to be a more modern, reactive component (e.g., using Preact/React if not already the case).
- [ ] 2.2 Connect the refactored TOC UI component to the `TocService` to receive real-time updates about the active heading.
- [ ] 2.3 Implement the visual highlighting effect for the active TOC entry based on the data provided by the `TocService`.
- [ ] 2.4 Implement the smooth-scrolling functionality that activates when a user clicks on an entry in the TOC.
- [ ] 2.5 Conduct thorough testing of the TOC UI for responsiveness, performance, and visual fidelity on various Medium article layouts.

## 3. RSS Enhancement: Core Logic

- [ ] 3.1 Create a new, dedicated `RssService` module responsible for all RSS/Atom feed detection and processing.
- [ ] 3.2 Implement the primary feed detection strategy within `RssService` by parsing `<link>` tags from the document's `<head>`.
- [ ] 3.3 Implement the fallback feed detection mechanism to check for common URL patterns (e.g., `/feed`, `/@username/feed`) if no `<link>` tag is found.
- [ ] 3.4 Add comprehensive unit tests for the `RssService` to validate both primary and fallback detection scenarios.

## 4. RSS Enhancement: UI

- [ ] 4.1 Design and implement a user interface element within the extension's popup or as a subtle on-page indicator to signal when an RSS feed has been successfully detected.
- [ ] 4.2 Implement the UI component that displays the found RSS feed URL to the user.
- [ ] 4.3 Add a "Copy URL" button or a similar single-click mechanism to allow users to easily copy the detected feed link to their clipboard.
- [ ] 4.4 Test the RSS UI feature across a variety of Medium author and publication pages to ensure it appears reliably and correctly.

## 5. Code Refactoring and Cleanup

- [ ] 5.1 Perform a review of the codebase and remove any old, now-unused code related to the previous TOC implementation.
- [ ] 5.2 Ensure all new modules (`TocService`, `RssService`) and UI components strictly adhere to the project's existing coding style, formatting, and conventions.
- [ ] 5.3 Update the `README.md` or any other relevant project documentation if the changes introduce new behaviors or configurations that users or developers should be aware of.

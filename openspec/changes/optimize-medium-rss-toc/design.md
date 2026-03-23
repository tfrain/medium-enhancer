## Context

The current implementation of Table of Contents (TOC) and RSS features for Medium articles in this project requires significant optimization. The goal is to enhance performance, improve user experience, and increase code maintainability. The project is built using Plasmo with React and TypeScript, operating within a browser extension environment. Existing TOC logic is primarily located within the `src/contents/` directory and its related `lib/` and `ui/` subdirectories. The RSS functionality is not explicitly identified or robustly implemented in the existing codebase, suggesting a need for foundational development or significant enhancement.

## Goals / Non-Goals

**Goals:**
-   Significantly improve the performance of TOC generation and rendering on Medium articles, reducing lag and resource consumption.
-   Enhance the user experience of the TOC feature, including smoother scroll-based highlighting and more accurate navigation.
-   Establish a robust and reliable mechanism for detecting, fetching, and processing RSS feeds for Medium articles.
-   Ensure the codebase for both TOC and RSS features is modular, well-structured, maintainable, and adheres to project's TypeScript and React conventions.

**Non-Goals:**
-   Re-architecting the entire browser extension's core framework or fundamental technologies.
-   Introducing entirely new features that are not directly related to the optimization or enhancement of the existing TOC and RSS functionalities.
-   Extending support for these specific TOC and RSS features to platforms other than Medium.
-   Implementing a full-fledged RSS reader or management system; the focus is on feed detection and basic article data extraction.

## Decisions

-   **TOC Performance Optimization Strategy**:
    -   **Decision**: To optimize scroll-based TOC item highlighting, the `IntersectionObserver` API will be leveraged. This modern browser API provides an efficient way to asynchronously observe changes in the intersection of a target element with an ancestor scroll container or with the document's viewport. It significantly reduces the performance overhead compared to traditional scroll event listeners, which often involve expensive DOM measurements on every scroll tick.
    -   **Alternative Considered**: Continuously polling the scroll position and performing DOM measurements within a `requestAnimationFrame` loop.
    -   **Rationale for Rejection**: While `requestAnimationFrame` ensures animations run smoothly, a polling approach for intersection detection still requires frequent layout recalculations if not carefully managed, potentially leading to "jank" on complex pages. `IntersectionObserver` offloads this work to the browser's rendering engine, making it inherently more performant for this specific use case.
    -   **Decision**: Decouple the TOC data extraction/processing logic from the UI rendering logic. The extraction of headings and their structure will occur once (or upon significant DOM changes), storing the data in a normalized format. The UI component will then reactively render this data.
    -   **Alternative Considered**: Tightly coupling extraction and rendering, where UI components directly query the DOM for TOC information during their render cycle.
    -   **Rationale for Rejection**: This tight coupling can lead to redundant DOM traversals and makes it harder to test and maintain components independently. Decoupling improves performance by separating computational work from presentation.

-   **RSS Feed Detection and Processing**:
    -   **Decision**: The primary method for detecting RSS/Atom feeds on a Medium article page will be to parse `<link>` tags in the HTML `<head>` section, specifically looking for `type="application/rss+xml"` or `type="application/atom+xml"`. This is the standard and most reliable method for discovering feeds.
    -   **Alternative Considered**: Heuristic-based scanning of common RSS URL paths (e.g., `/rss`, `/feed`, `/<username>/feed`).
    -   **Rationale for Rejection (as primary)**: While useful as a fallback, heuristic scanning is prone to false positives and is less reliable than explicit `<link>` tags. It will be considered a secondary, lower-priority detection method.
    -   **Decision**: Implement a dedicated `RssService` module. This service will encapsulate all logic related to RSS feed detection, fetching (using `fetch` API), parsing (potentially using a lightweight XML parser or DOMParser), and exposing structured feed data.
    -   **Alternative Considered**: Distributing RSS logic directly within content scripts or background scripts without a centralized service.
    -   **Rationale for Rejection**: A dedicated service promotes modularity, separation of concerns, and simplifies testing. It also makes the RSS functionality more reusable and easier to maintain.

## Risks / Trade-offs

-   **[Risk] Medium.com DOM Structure Volatility**: Medium's website structure and class names are dynamic and can change without notice, potentially breaking TOC heading selectors or RSS link detection.
    -   **Mitigation**: Implement robust and resilient CSS selectors (e.g., using semantic attributes or `aria` roles where possible, rather than fragile class names). Introduce unit and integration tests specifically targeting selector stability. Consider adding a mechanism for remote updates of selectors if breakage occurs. Regularly monitor Medium's site for structural changes.
-   **[Risk] Performance Impact of Multiple Observers/Dynamic Content**: While `IntersectionObserver` is efficient, if Medium dynamically loads significant content or uses complex shadow DOM structures, managing multiple observers or ensuring comprehensive content parsing could still introduce performance overhead.
    -   **Mitigation**: Carefully manage the number of observed elements and optimize the logic within observer callbacks. Debounce or throttle updates where appropriate to prevent excessive recalculations. Investigate the use of `MutationObserver` sparingly for specific dynamic content loading scenarios, always prioritizing performance.
-   **[Risk] RSS Feed Parsing Complexity**: RSS and Atom specifications allow for considerable variability, making robust parsing challenging. Malformed feeds or unusual structures could lead to parsing errors.
    -   **Mitigation**: Utilize a well-tested, lightweight XML/RSS parsing library if one can be integrated without significant bundle size increase. Alternatively, develop a flexible parsing logic that handles common RSS/Atom elements and provides clear error reporting for unrecognized structures. Implement comprehensive unit tests for the parser against various valid and malformed feed samples.


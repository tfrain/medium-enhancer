## ADDED Requirements

### Requirement: Efficient TOC Generation
The system SHALL generate the Table of Contents from the article's headings without causing a noticeable delay in page interaction.

#### Scenario: Fast TOC Generation
- **WHEN** a user loads a Medium article page with more than 10 headings
- **THEN** the TOC generation process MUST complete within 500 milliseconds.

### Requirement: Scroll-based Highlighting
The system SHALL highlight the corresponding entry in the Table of Contents as the user scrolls through the article.

#### Scenario: Highlight on Scroll
- **WHEN** a user scrolls the page so that a new heading section is the primary one in the viewport
- **THEN** the corresponding TOC entry MUST be visually highlighted within 100 milliseconds.

### Requirement: Smooth Scrolling Navigation
The system SHALL provide a smooth scrolling experience when a user clicks on a TOC entry.

#### Scenario: Click to Scroll
- **WHEN** a user clicks on a TOC entry
- **THEN** the page MUST smoothly scroll to the corresponding section of the article.

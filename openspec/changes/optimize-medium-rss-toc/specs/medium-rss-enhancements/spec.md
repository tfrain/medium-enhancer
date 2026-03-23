## ADDED Requirements

### Requirement: RSS/Atom Feed Detection
The system SHALL detect RSS or Atom feeds available for a Medium publication or author.

#### Scenario: Detect feed from link tag
- **WHEN** a user visits a Medium page that contains a `<link>` tag with `type="application/rss+xml"` or `type="application/atom+xml"` in the document head
- **THEN** the system MUST extract the feed URL from the `href` attribute of that tag.

#### Scenario: Fallback detection via common paths
- **WHEN** a user visits a Medium page where no feed `<link>` tag is present
- **THEN** the system SHALL attempt to fetch and validate feeds from common URL paths (e.g., `/feed`, `/@username/feed`) as a fallback.

### Requirement: Expose Detected Feed URL
The system SHALL provide a mechanism for the user to access the detected feed URL.

#### Scenario: User can copy feed URL
- **WHEN** an RSS/Atom feed has been successfully detected
- **THEN** the user MUST be able to easily view and copy the feed URL through the extension's user interface (e.g., popup).

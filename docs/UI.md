# Kaul User Interface

Version: 0.1

---

## Purpose

This document defines the user-interface direction and interaction principles for Kaul.

Its purpose is to ensure that Kaul remains:

- Calm
- Professional
- Predictable
- Accessible
- Easy to learn
- Appropriate for Swedish social documentation
- Consistent across the application

The interface should support users who may be tired, stressed, visually impaired, interrupted, or working under time pressure.

The interface is not intended to impress users with visual effects.

Its purpose is to help them document work accurately and efficiently.

---

## Core Interface Principle

Kaul should feel like a professional Swedish municipal records system.

It should not feel like:

- A startup dashboard
- A CRM
- A social-media application
- A consumer wellness application
- A gamified productivity tool
- A generic admin template

The interface should feel closer to:

- Outlook
- Windows Explorer
- Healthcare record systems
- Municipal administration software
- Professional document-management systems

The interface should disappear into the background and allow users to focus on the client and the documentation.

---

## The 2 AM Test

Every important workflow must pass the 2 AM Test:

> Can a tired staff member understand what to do without training, guesswork, or unnecessary decisions?

A workflow fails the test when it:

- Presents too many choices at once
- Uses unclear labels
- Hides important actions
- Requires users to remember where information is stored
- Uses colour without text
- Requires unnecessary navigation
- Uses unfamiliar startup language
- Makes common actions feel risky or complicated
- Interrupts the user with excessive dialogs
- Forces users to understand the application's internal structure

When two designs are equally valid, choose the one requiring less thought.

---

## Language

Everything visible to end users must be written in Swedish.

This includes:

- Navigation
- Headings
- Form labels
- Buttons
- Validation messages
- Empty states
- Error messages
- Documents
- Reports
- Print views
- Confirmation dialogs
- Help text
- Status labels

Developer-facing code and internal identifiers use English.

### Swedish Writing Style

User-facing Swedish should be:

- Clear
- Neutral
- Professional
- Direct
- Consistent

Prefer familiar language over administrative jargon unless the term is required by the organisation.

Prefer:

- Spara anteckning
- Ny anteckning
- Tilldela pedagog
- Arkivera klient
- Skapa veckorapport
- Försök igen
- Du har inte behörighet att visa den här klienten

Avoid:

- Submit
- Execute
- Process
- Awesome
- Något gick fel!
- Otydliga abbreviations
- Technical database or framework terminology

Use sentence case rather than title case for Swedish headings and actions.

---

## Product Name

The working product name is:

- Kaul

The name may later change without affecting the application architecture.

Until a final name is selected, Kaul should appear as a restrained wordmark rather than a decorative logo.

Suggested presentation:

```text
Kaul
Social dokumentation
```

or:

```text
Kaul
Journal- och dokumentationssystem
```

The product name should not dominate working screens.

---

## Visual Identity

Kaul uses a restrained clinical and municipal visual language.

### Typography

Approved fonts:

- IBM Plex Sans
- IBM Plex Serif
- IBM Plex Mono

Recommended use:

- IBM Plex Sans for interface text
- IBM Plex Serif for restrained page titles and the wordmark
- IBM Plex Mono for identifiers, timestamps, references, and selected metadata

Typography must remain readable at browser zoom levels above 100%.

The application must not depend on very small text to fit information on screen.

### Colour Direction

Primary visual direction:

- Steel-blue navigation
- Warm off-white or light-grey page background
- White content surfaces
- Dark neutral text
- Grey one-pixel borders
- Limited red for incidents and destructive actions
- Limited green or teal for confirmed or normal status
- Limited amber for attention or upcoming deadlines

Colour should communicate hierarchy and status, not decorate the page.

### Colour Rules

- Do not use colour as the only status indicator.
- Incident status requires text or an icon in addition to red.
- Links must remain recognisable without relying only on colour where possible.
- Focus indicators must be visible.
- Text contrast must remain sufficient.
- Avoid large areas of saturated colour.
- Avoid multicoloured tag systems unless each colour has a clear and consistent meaning.
- Avoid gradients.

### Shapes and Surfaces

The interface should use:

- Flat surfaces
- One-pixel borders
- Square or nearly square corners
- Little or no shadow
- Clear spacing
- Restrained separators

Avoid:

- Large rounded cards
- Floating glass effects
- Heavy shadows
- Decorative gradients
- Animated backgrounds
- Pill-shaped controls everywhere
- Large colourful statistic cards

---

## Layout

Kaul should use a consistent application shell.

The desktop layout consists of:

- Left sidebar
- Top bar or compact page header
- Main content area
- Optional side panel for focused forms
- Print-specific layouts where required

### Sidebar

The sidebar should remain simple.

Primary navigation:

- Hem
- Klienter
  - Ungdomar
  - Vuxna
- Sök journal
- Dokument

Administrator-only navigation:

- Personal
- Inställningar

The exact presentation may use nested navigation or separate links, but it must remain easy to scan.

The sidebar should also show:

- Signed-in user
- Professional title or role
- Logga ut

Avoid adding:

- Dashboard counters
- Promotional content
- Large user avatars
- Decorative icons on every item
- Features from future milestones

Icons may be used sparingly but should not replace text labels.

### Top Area

The top area may contain:

- Breadcrumbs
- Global search
- Current page context
- Primary action

It should not contain:

- Multiple unrelated action buttons
- Alerts unrelated to the current workflow
- Decorative status widgets
- Large user menus

---

## Navigation Philosophy

Kaul is client-centred rather than feature-centred.

The primary mental model is:

```text
Client
├── Overview
├── Journal
├── Documents
├── Goals
├── Follow-ups
├── Weekly reports
└── History
```

Users should normally access notes, documents, goals, and reports through the relevant client.

Global pages exist only when they serve a genuine cross-client need.

Examples:

- Hem
- Ungdomar
- Vuxna
- Sök journal
- Dokument
- Personal
- Inställningar

### Navigation Rules

- The current location must be clear.
- Returning to the client workspace must be easy.
- Breadcrumbs may be used for deeper views.
- Users should not lose context when opening a document or journal record.
- Important workflows should require as few page changes as practical.
- Browser Back should behave predictably.
- Direct links must still enforce permissions.
- Navigation must not expose inaccessible clients.

---

## Home View

The home view should be calm and operational.

It should answer:

- What needs my attention today?
- What is planned this week?
- Which clients do I work with?
- Are there unfinished or upcoming follow-ups?
- What recent activity matters?

It should not be a statistical dashboard.

### Staff Home View

A staff member may see:

- Greeting or simple page title
- Today's date
- Weekly activity overview
- Upcoming follow-ups
- Assigned clients
- Recent authorised activity
- Draft notes where applicable

The home view must not show organisation-wide information that the staff member cannot access.

### Administrator Home View

An administrator may see:

- Today's date
- Upcoming follow-ups
- Recent organisation activity
- Items requiring administrative attention
- Quick access to clients and personnel

Avoid large statistics unless a demonstrated customer need exists.

### Weekly Activity View

The weekly view may display:

- Monday through Sunday
- Days with documented activity
- Number of entries per day
- Current day
- Selected week

It should not become a performance leaderboard.

Activity counts should support orientation, not employee measurement.

---

## Client Lists

Youth and adult clients should use the same list structure.

The interface may separate them through:

- Ungdomar
- Vuxna

Each list item or row should clearly show:

- Name
- Stable person identifier
- Client category where relevant
- Responsible staff member for administrators
- Latest documentation date
- Upcoming follow-up where useful
- Incident or attention status where applicable
- Archived status where applicable

### Client List Rules

- The entire row may be clickable if keyboard access remains correct.
- Important metadata should remain readable without opening the client.
- Large click targets are preferred.
- Search and filtering should remain simple.
- Staff members see only assigned clients.
- Administrators may filter by responsible staff member.
- Archived clients should not dominate active lists.
- Empty states should explain the next available action.

Avoid presenting clients as decorative profile cards.

A compact professional list or table is preferred.

---

## Client Workspace

The client workspace is the centre of Kaul.

The page header should clearly show:

- Client name
- Person identifier
- Category
- Current status
- Primary responsible staff member
- Secondary staff members where applicable
- Primary action: Ny anteckning

Possible sections:

- Översikt
- Anteckningar
- Dokument
- Mål
- Uppföljningar
- Veckorapporter
- Historik

Only implemented sections should be displayed as active navigation.

### Client Overview

The overview may contain:

- Basic registered information
- Responsible staff
- Active goals
- Upcoming follow-ups
- Latest journal entries
- Recent documents
- Important incident notice
- Archive status

The overview should not duplicate every detail from the other sections.

Its purpose is orientation.

### Client Header Rules

- The client name must remain prominent.
- The person identifier should use monospace styling.
- The primary action should remain easy to find.
- Administrator-only actions should be visually secondary.
- Destructive actions should not be placed beside the primary action without separation.
- Assignment information should be visible but not visually dominant.

---

## New Journal Entry

The primary documentation action is:

- Ny anteckning

Users should not be forced to choose a complex workflow before beginning.

A journal-entry form may include:

- Client
- Anteckningstyp
- Datum
- Tid
- Anteckning
- Optional structured sections
- Related goals
- Incident indicator
- Save draft
- Sign

### Form Layout

The form should prioritise the note itself.

Suggested order:

1. Client context
2. Event date and time
3. Note type
4. Main text
5. Optional related goals
6. Incident indicator
7. Save or sign actions

The form may open:

- In the client workspace
- As a dedicated page
- In a wide slide-in panel

The final decision should prioritise accessibility and preservation of user input.

### Journal Form Rules

- The client must always be obvious.
- Important text areas should be large.
- Optional sections should not make the form feel mandatory or crowded.
- The incident control must be clear and serious.
- Signing must be distinct from saving a draft.
- Users must understand when a record becomes immutable.
- Significant unsaved work requires a warning before dismissal.
- Sensitive drafts must not be stored in browser storage.
- Validation errors must appear near the relevant field.
- Keyboard navigation must follow the visual order.

---

## Signing Experience

Signing transforms a draft into an immutable professional record.

The interface must make this consequence clear.

Before signing, show:

- Client
- Event date and time
- Note type
- Author
- Confirmation that the record cannot be edited after signing
- Correction workflow explanation where appropriate

Suggested action:

- Signera anteckning

Suggested confirmation text:

> När anteckningen har signerats kan den inte redigeras. Eventuella rättelser görs som en ny signerad anteckning.

Avoid vague labels such as:

- Slutför
- Publicera
- Bekräfta

### Signed Record Presentation

A signed record should visibly show:

- Signerad
- Signer's name
- Professional title
- Role
- Signing date and time
- Stable journal reference

Example:

```text
Signerad av

Anna Lindberg
Pedagog
2026-08-01 14:22
LOG-2026-000143
```

Signing information should resemble an official record rather than a social-media author footer.

---

## Journal Presentation

Journal entries should resemble professional records.

Each entry should clearly separate:

- Metadata
- Record content
- Related goals
- Incident status
- Correction relationship
- Signature information
- Stable reference

Avoid card designs that resemble social feeds.

### Journal List

A journal list should show:

- Event date and time
- Entry type
- Short preview where appropriate
- Author
- Signed or draft status
- Incident status
- Stable reference

### Journal Detail

The detailed view should prioritise readability.

Journal text should:

- Use comfortable line length
- Preserve meaningful paragraphs
- Avoid cramped metadata
- Remain printable
- Remain understandable outside its original screen

Signed entries should not display edit actions.

Correction actions should be clearly labelled:

- Skapa rättelse

---

## Incident Presentation

An incident is a journal entry with elevated visibility.

Incident presentation may use:

- Red border or marker
- Incident label
- Warning icon
- Clear explanatory text

It must not use red alone.

Suggested label:

- Incident

Suggested notice:

> En incident har dokumenterats för klienten.

Incident styling should remain serious but not visually overwhelming.

The interface must not imply that an incident is unresolved unless the domain contains an actual resolution workflow.

---

## Goals

Goals should be presented as meaningful areas of focus.

Possible information:

- Title
- Description
- Status
- Start date
- Review date
- Related journal entries

Avoid artificial progress bars or percentages unless the organisation has a genuine measurement method.

Preferred statuses:

- Aktivt
- Pausat
- Slutfört
- Arkiverat

Goals should remain optional and should not block ordinary documentation.

---

## Follow-ups

Follow-ups are planning items.

Each follow-up should show:

- Title
- Client
- Due date
- Optional time
- Responsible staff member
- Status

Preferred statuses:

- Planerad
- Slutförd
- Avbruten
- Försenad

Actions may include:

- Markera som slutförd
- Redigera
- Avbryt
- Skriv anteckning

Completing a follow-up must not imply that documentation has automatically been created.

---

## Documents

Documents should appear like a professional document library.

Each document should show:

- Title
- Document type
- Date
- Uploaded or generated by
- File format
- Version or status where relevant
- Open or download action

Avoid decorative document cards.

A compact list or table is preferred.

### Document Actions

Possible actions:

- Öppna
- Hämta
- Skapa ny version
- Skriv ut
- Skapa dokument

Important document actions must use text labels.

File-type icons may support recognition but should remain secondary.

---

## Weekly Reports

Weekly reports should use a clear report workflow.

Possible steps:

1. Select calendar week.
2. Review included journal entries.
3. Add optional manual summary.
4. Review incidents and goals.
5. Save draft.
6. Finalise report.
7. Print or export.

### Report View

The report should look like an official printable document.

It may include:

- Kaul or organisation heading
- Client name
- Person identifier
- Calendar week
- Date range
- Chronological entries
- Goal overview
- Incident overview
- Manual summary
- Generated-by information
- Finalisation information
- Stable report reference

Final reports should clearly show that they are preserved versions.

---

## Search

Search should be simple and permission-aware.

Global search may return:

- Clients
- Journal entries
- Documents
- Weekly reports

Results should be grouped by type.

Each result should show enough context to identify it without exposing unnecessary content.

### Search Rules

- Search results must never reveal inaccessible clients.
- Journal previews should be brief.
- Sensitive content should not appear in browser URLs.
- Empty results should be clear.
- Filters should be added only when they solve a real problem.
- The search field should support keyboard use.
- Search should not become a complex query-building tool in Version 1.

The navigation label should preferably be:

- Sök journal

rather than simply:

- Anteckningar

This makes its cross-client purpose clearer.

---

## User Administration

Administrator user management should remain simple.

The personnel list may show:

- Name
- Professional title
- Role
- Account status
- Number of active client assignments
- Last login
- Manage action

The administrator should be able to:

- Create account
- Deactivate account
- Review assignments
- Change professional title
- Change role where permitted

Avoid complex permission matrices in Version 1.

### Assignment Interface

Assignment management should make the relationship clear.

For each client:

- Primär pedagog
- Sekundära pedagoger

For each staff member:

- Tilldelade klienter

Possible controls:

- Search staff
- Select primary assignment
- Add secondary assignment
- End assignment
- Save changes

Staff members must not see controls for assigning themselves.

---

## Administrator and Staff Differences

The interface should show only actions relevant to the current user's authority.

### Administrator

May see:

- All clients
- Personnel
- Assignment controls
- Organisation export
- Administrative settings
- Audit access where implemented

### Staff Member

May see:

- Assigned clients
- Their authorised journal records
- Their authorised documents
- Their authorised follow-ups
- Their authorised reports

Staff members must not see empty administrative navigation or disabled controls for actions they can never perform.

However, hidden navigation must not replace server-side permission enforcement.

---

## Forms

Forms should be calm and predictable.

### Form Rules

- Labels appear above or clearly beside fields.
- Required fields are identified consistently.
- Help text is brief.
- Validation appears near the field.
- Submitted values remain visible after validation failure.
- Primary and secondary actions are clearly separated.
- Destructive actions are not styled like normal save actions.
- Long forms should be divided into meaningful sections.
- Do not place several unrelated fields on one line merely to save space.
- Tab order follows the visual order.
- Controls remain usable at high browser zoom.
- Placeholder text must not replace labels.

### Buttons

Preferred hierarchy:

- Primary action
- Secondary action
- Destructive action
- Text or link action

Examples:

Primary:

- Spara
- Signera anteckning
- Skapa klient

Secondary:

- Avbryt
- Spara utkast
- Stäng

Destructive:

- Arkivera klient
- Inaktivera konto

Do not use colour alone to distinguish destructive actions.

---

## Confirmation Dialogs

Confirmation dialogs should be used only when an action has meaningful consequences.

Appropriate uses:

- Signing a journal entry
- Archiving a client
- Deactivating a user
- Ending an assignment
- Replacing a document
- Finalising a weekly report
- Starting a full organisation export

Avoid confirmation dialogs for:

- Opening a page
- Applying a harmless filter
- Closing an empty panel
- Routine navigation
- Saving ordinary editable information

A confirmation must state what will happen.

Avoid generic wording such as:

> Är du säker?

Prefer:

> Vill du arkivera klienten? Klienten tas bort från aktiva listor men historiken bevaras.

---

## Empty States

Empty states should explain:

- What is empty
- Why that may be expected
- What the user can do next

Examples:

```text
Inga anteckningar har registrerats för klienten.
```

```text
Du har inga kommande uppföljningar.
```

```text
Inga klienter är tilldelade till dig ännu.
Kontakta en administratör om du tror att detta är fel.
```

Avoid cheerful illustrations or promotional language.

---

## Loading States

Loading indicators should be restrained.

Use:

- Inline status text
- Simple progress indicators
- Skeleton layouts only when they genuinely reduce perceived confusion

Avoid:

- Large animated spinners
- Full-screen loading overlays for small operations
- Decorative loading animations

The user must receive feedback when an operation may take noticeable time.

Prevent duplicate submission while saving.

---

## Success Feedback

Success feedback should be brief and specific.

Examples:

- Anteckningen har sparats.
- Anteckningen har signerats.
- Klienten har skapats.
- Tilldelningen har uppdaterats.
- Dokumentet har laddats upp.

Avoid celebratory or overly casual language.

Success messages should not contain sensitive details unnecessarily.

---

## Error Feedback

Errors should be calm, clear, and actionable.

Examples:

```text
Anteckningen kunde inte sparas. Försök igen.
```

```text
Du har inte behörighet att visa den här klienten.
```

```text
Filen kunde inte laddas upp. Kontrollera filformatet och försök igen.
```

Avoid:

- Stack traces
- Error codes without explanation
- Technical library names
- Blaming the user
- Casual wording
- Revealing whether an inaccessible record exists

A correlation identifier may be shown for unexpected errors where support needs it.

---

## Tables and Lists

Tables are appropriate for:

- Personnel
- Clients
- Documents
- Audit events
- Administrative records

Lists may be more appropriate for:

- Journal entries
- Follow-ups
- Recent activity
- Search results

### Table Rules

- Use clear Swedish headings.
- Keep important columns visible.
- Avoid horizontal scrolling where possible.
- Support keyboard navigation.
- Do not make every cell interactive.
- Use text labels for status.
- Actions should remain easy to identify.
- At high zoom, tables may transform into stacked rows where necessary.

---

## Dates, Times, and Identifiers

User-facing dates use Swedish formatting.

Examples:

```text
1 augusti 2026
2026-08-01
1 aug. 2026
```

The selected format should match the context.

Times use:

```text
14:22
```

Operational timezone:

```text
Europe/Stockholm
```

Calendar weeks use ISO week conventions.

Stable references and person identifiers use IBM Plex Mono.

Examples:

```text
SE-080314
LOG-2026-000143
RPT-2026-000021
```

The interface must distinguish:

- Event time
- Created time
- Updated time
- Signed time
- Finalised time

---

## Accessibility

Accessibility is part of product correctness.

Kaul must support:

- Keyboard navigation
- Browser zoom
- Screen magnification
- Screen readers
- High text scaling
- Visible focus
- Clear labels
- Predictable structure
- Sufficient contrast
- Reduced motion
- Large click targets

### Keyboard Requirements

Critical workflows must be usable without a mouse.

This includes:

- Login
- Client search
- Opening a client
- Creating a note
- Saving a draft
- Signing
- Uploading a document
- Completing a follow-up
- Navigating dialogs

### Focus Management

Dialogs and panels must:

- Move focus into the opened region
- Keep focus inside where appropriate
- Return focus to the triggering control on close
- Support Escape where safe
- Not discard user work without warning

### Zoom and Magnification

The interface must remain functional at:

- 200% browser zoom
- Higher zoom where practical
- Increased operating-system text size

Layouts should reflow rather than hide controls.

Critical information must not rely on hover.

### Motion

Respect reduced-motion preferences.

Animations should be:

- Minimal
- Short
- Functional
- Non-essential

The application should remain fully understandable without animation.

---

## Responsive Behaviour

Kaul is primarily a desktop web application.

It should also remain usable on:

- Laptops
- Tablets
- Narrow browser windows

Full mobile optimisation is not required for Version 1.

### Responsive Priorities

- Preserve client identity
- Preserve primary actions
- Preserve readable forms
- Preserve keyboard use
- Avoid hidden critical controls
- Allow sidebar collapse where needed
- Stack metadata rather than compressing it excessively
- Avoid horizontal scrolling for primary workflows

Native mobile applications are outside Version 1.

---

## Print Design

Journal entries, weekly reports, and selected documents require print-friendly layouts.

Print views should:

- Remove navigation
- Remove interactive controls
- Use white background
- Preserve clear typography
- Include relevant references
- Include page breaks intentionally
- Include signer or finalisation information
- Support Swedish characters
- Avoid splitting important record sections unnecessarily

Printed documents should remain understandable without the Kaul interface.

---

## Pilot Interface

The pilot environment must display a persistent warning:

> Pilotmiljö – använd inte verkliga personuppgifter eller känslig information.

The warning should:

- Remain visible
- Use clear text
- Not rely only on colour
- Appear on authenticated screens
- Not prevent normal use
- Be absent from approved production environments

The login screen should also display the pilot limitation.

---

## Initial Navigation by Role

### Administrator

```text
Hem

Klienter
├── Ungdomar
└── Vuxna

Sök journal
Dokument

Administration
├── Personal
└── Inställningar
```

### Staff Member

```text
Hem

Klienter
├── Ungdomar
└── Vuxna

Sök journal
Dokument
```

The exact nesting may be adjusted after implementation testing.

No navigation item should be included merely because the domain contains an entity.

---

## Initial Screen Inventory

Version 1 is expected to require the following primary screens.

### Public or Authentication

- Logga in
- Lösenordsbyte or controlled password setup
- Authentication error state

### Shared

- Hem
- Ungdomar
- Vuxna
- Client workspace
- Sök journal
- Document list
- Account menu

### Client Workspace

- Översikt
- Anteckningar
- New journal entry
- Journal-entry detail
- Documents
- Goals
- Follow-ups
- Weekly reports
- History

### Administrator

- Personnel list
- Create user
- User detail
- Client creation
- Assignment management
- Organisation export
- Settings where required

Only screens required by the current milestone should be implemented.

---

## Reusable Interface Components

Likely reusable components include:

- Application shell
- Sidebar
- Breadcrumbs
- Page header
- Primary button
- Secondary button
- Destructive button
- Text field
- Text area
- Select field
- Checkbox
- Radio group
- Status label
- Notice
- Confirmation dialog
- Table
- Empty state
- Search field
- Tabs
- Journal record
- Signature block
- Client identifier
- Date and time display
- Pilot warning

Components should be created when a repeated pattern exists.

Do not create a large generic component library before actual screens demonstrate the need.

---

## Design Tokens

The design system should define reusable tokens for:

- Background colours
- Text colours
- Border colours
- Status colours
- Typography
- Font sizes
- Line heights
- Spacing
- Maximum content widths
- Focus rings
- Control heights
- Z-index layers

Avoid arbitrary values scattered throughout components.

Exact token values will be selected during Milestone 0.

---

## Interface Decision Test

Before adding or changing an interface element, ask:

1. What task is the user trying to complete?
2. Is the control needed for the current milestone?
3. Is the Swedish label immediately understandable?
4. Is the primary action obvious?
5. Can it be used with a keyboard?
6. Does it work with magnification and high zoom?
7. Does it expose information the user should not see?
8. Does it use unnecessary colour, animation, or decoration?
9. Does it preserve client context?
10. Does it pass the 2 AM Test?

When uncertain, choose the calmer and more explicit option.

---

## Explicitly Rejected for Version 1

The following interface patterns are not approved for Version 1:

- Large metric dashboards
- Gamification
- Achievement systems
- Employee leaderboards
- Decorative charts without a validated need
- Excessive card layouts
- Excessive rounded corners
- Heavy shadows
- Gradient backgrounds
- Animated navigation
- Chat-style journal records
- Social-feed presentation
- Colour-only statuses
- Icon-only important actions
- Hidden critical controls
- Custom drag-and-drop workflows
- Kanban boards
- Real-time collaborative cursors
- AI writing panels
- Public client portals
- Native mobile navigation patterns
- Multiple competing design systems

---

## Current Status

The user-interface direction is approved for project bootstrapping.

Exact visual tokens and initial reusable components will be defined during Milestone 0.

The interface should be reviewed with the initial users during pilot preparation and adjusted based on real workflow feedback without abandoning the principles in this document.
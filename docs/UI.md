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
- Skapa månadsrapport
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
├── Monthly reports
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

Milestone 4 adds a restrained section in this order:

1. **Att göra**
2. **Mina klienter**

**Att göra** shows only `PLANNED` Follow-ups for which the signed-in user is
responsible and still has current Client access. It groups them as:

1. **Försenade**
2. **Idag**
3. **Kommande**, after today through the seventh following calendar day

The non-overdue Home window therefore covers today plus the next seven calendar
days. Within each group, the nearest due date and time appears first. Each row
shows only the Follow-up title, Client, due state and date/time, and optional
concise Goal context when it helps orientation. Rows, links, counts, and future
badges must not expose inaccessible Client information.

A staff member may otherwise see:

- Greeting or simple page title
- Today's date
- Weekly activity overview
- Assigned clients
- Recent authorised activity
- The current user's own draft notes where applicable

The home view must not show organisation-wide information that the staff member
cannot access. Losing Client access removes a responsible Follow-up from Home
immediately; responsibility does not preserve visibility. No home view may
reveal another user's unfinished draft through a row, preview, count, or
activity item, including to an Administrator. Adding own unfinished Journal
drafts to Home is not part of Milestone 4.

### Administrator Home View

An Administrator who is responsible for Follow-ups uses the same **Att göra**
own-items concept and current Client re-authorisation. An administrator may
otherwise see:

- Today's date
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
- Ordinary Client lists exclude archived Clients. Administrators use the
  separate **Arkiverade klienter** view for historical access; Staff Members do
  not have access to that view.
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
- Månadsrapporter
- Historik

Only implemented sections should be displayed as active navigation.

Milestone 4 implements separate, real workspace destinations in this order:

- Översikt
- Anteckningar
- Mål
- Uppföljningar

Mål and Uppföljningar must not be hidden inside a generic **Planering** area.

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

A **Nästa för klienten** planning summary is possible future polish and is not
required for Milestone 4 completion.

### Client Header Rules

- The client name must remain prominent.
- The person identifier should use monospace styling.
- The primary action should remain easy to find.
- Administrator-only actions should be visually secondary.
- Destructive actions should not be placed beside the primary action without separation.
- Assignment information should be visible but not visually dominant.

Archived Client detail is an Administrator-only historical view. It clearly
shows archive status and date, identity, category, and Assignment history. It
does not show Client editing, Assignment management, archive, or restore
controls. **Mål** and **Uppföljningar** remain available as read-only planning
history and show no create, edit, assignment, or lifecycle controls.

---

## New Journal Entry

The primary documentation action is:

- Ny anteckning

The Version 1 workflow is:

1. Open the Client workspace and choose **Anteckningar**.
2. Open the current user's draft when one exists, or choose **Ny
   anteckning** to create one.
3. Write the Anteckning and choose **Spara utkast** when it should remain a
   draft.
4. Choose **Signera** as a separate explicit action when the record is ready.
5. Return to the signed history or start a visibly separate correction when a
   signed entry needs correction.

Version 1 permits at most one open draft for each author and Client. Only that
author may see, reopen, edit, save, discard, or sign the draft. Another Staff
Member or Administrator must not see the draft or learn that it exists through
lists, counts, previews, direct links, or other interface surfaces.

The author must still have current Client access. A draft does not preserve
access after an Assignment or other Client authorisation ends.

A journal-entry form includes:

- Clear Client context
- Anteckningstyp
- Datum
- Tid
- Anteckning
- Mål (valfritt)
- Spara utkast
- Signera
- Discard action for the author's own draft

### Form Layout

The form should prioritise the note itself.

Suggested order:

1. Client context
2. Event date and time
3. Entry type
4. Main text
5. Optional Goal selection
6. Save-draft, sign, and discard actions

The form may open:

- In the client workspace
- As a dedicated page
- In a wide slide-in panel

The final decision should prioritise accessibility and preservation of user input.

### Journal Form Rules

- The client must always be obvious.
- Important text areas should be large.
- Opening **Ny anteckning** must reopen the author's existing draft for that
  Client rather than creating a parallel draft.
- Saving must be a deliberate action; Version 1 does not imply autosave.
- Signing must be distinct from saving a draft.
- Users must understand when a record becomes immutable.
- Significant unsaved work requires a warning before dismissal.
- Sensitive drafts must not be stored in browser storage.
- Goal selection remains optional and is editable only while the entry remains
  the author's draft. It must list only Goals from the same Client.
- Validation errors must appear near the relevant field.
- Keyboard navigation must follow the visual order.

---

## Signing Experience

Signing transforms a draft into an immutable professional record.

The interface must make this consequence clear.

Before signing, show:

- Client
- Event date and time
- Entry type
- Author
- Anteckning content
- Selected Goal titles, when any
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
- Event date and time
- Entry type
- Signer's name
- Professional title
- Role
- Signing date and time
- Stable journal reference

Example:

```text
Händelse
1 augusti 2026 13:30

Anteckningstyp
Samtal

Signerad av

Anna Lindberg
Pedagog
1 augusti 2026 14:22
LOG-2026-000143
```

Signing information should resemble an official record rather than a social-media author footer. In Version 1 the draft author performs the signing action and becomes the signer. **Signera** is an authenticated Kaul action, not a cryptographic signature, BankID, or external electronic signature.

---

## Journal Presentation

Journal entries should resemble professional records.

Each entry should clearly separate:

- Metadata
- Record content
- Correction relationship
- Signature information
- Stable reference

Avoid card designs that resemble social feeds.

### Journal List

A Client's **Anteckningar** view should separate:

- The current user's own open draft, when one exists
- Signed entries available through current Client authorisation

Another user's draft must not appear as a row, status, preview, count, empty
state, or search result. This applies equally to Administrators. Once signed,
an entry may appear for currently authorised users according to normal Client
access rules; historical authorship does not preserve access.

A signed-entry row may show:

- Event date and time
- Entry type
- Signing date and time
- Author
- Short preview where appropriate
- Signed status
- Stable reference

### Journal Detail

The detailed view should prioritise readability.

Journal text should:

- Use comfortable line length
- Preserve meaningful paragraphs
- Avoid cramped metadata
- Remain printable
- Remain understandable outside its original screen

Signed entries must not display edit or delete actions, including for an Administrator.

Signed entries display each selected Goal using the title frozen at signing
time. The UI must not suggest that later Goal edits, completion, or archiving
changed the signed record. Signed entries have no action for adding, removing,
or replacing Goal references retrospectively.

Correction actions should be clearly labelled:

- Skapa rättelse

A correction is displayed as a separate signed record linked to the original.
The original remains visible and unchanged. The correction has its own author,
content, signing information, and stable reference; the interface must not
suggest that it replaced or rewrote the original.

**Skapa rättelse** is available only to a currently authorised assigned Staff
Member or an Administrator with Organisation and Client access. The correction
author saves or signs their own correction draft through the same explicit
draft and signing actions. Version 1 links corrections directly to the
original signed entry rather than presenting an arbitrary correction tree.

---

## Goals

Goals should be presented as meaningful areas of focus.

The **Mål** destination contains:

- Current active and paused Goals
- Historical completed and archived Goals
- Create, detail, edit, pause/resume, complete, and archive workflows

Each Goal shows:

- Title
- Optional description
- Status
- Start date
- Optional target or review date

The new-Goal form initially prefills **Startdatum** with the current
`Europe/Stockholm` calendar date. The user may change it before saving, and the
form submits an explicit required value for server validation.

Do not use progress bars or percentage progress for Goals in Version 1.

Status labels are:

- Aktivt
- Pausat
- Slutfört
- Arkiverat

Goals should remain optional and should not block ordinary documentation.
Goals have no responsible owner in Version 1. Active and paused Goals are
editable. No Goal in any state shows a delete action. **Slutfört** and
**Arkiverat** are terminal historical states and must not show edit or reopen
actions.

---

## Follow-ups

Follow-ups are concrete future Client actions or checks. They are shared Client
planning items rather than private tasks or Journal records.

The **Uppföljningar** destination contains:

- Overdue and current planned Follow-ups
- Completed and cancelled history
- Create, detail, edit, assign, reassign, complete, and cancel workflows

Each follow-up should show:

- Title
- Client
- Due date
- Optional time
- Responsible user
- Optional related Goal
- Status

Persisted status labels are:

- Planerad
- Slutförd
- Avbruten

**Försenad**, **Idag**, and **Kommande** are text presentation states derived
from the Planerad item's due date and optional time; they are not stored
lifecycle statuses. A timed Follow-up becomes overdue after its stated
Stockholm-local time. A date-only item becomes overdue on the following
Stockholm calendar day.

Actions may include:

- Markera som slutförd
- Redigera
- Byt ansvarig
- Avbryt

Completing a Follow-up never implies that documentation was created
automatically.

Only planned Follow-ups show edit, reassignment, completion, or cancellation
actions. No Follow-up in any state shows a delete action. Completed and
cancelled items are terminal and show no edit, reassignment, or reopen action.
When the recorded responsible user no longer has Client access, currently
authorised users receive clear text that responsibility must be reassigned; the
stored responsible user remains until explicit reassignment and the item is not
reassigned automatically.

A post-completion **Skapa/Skriv anteckning** shortcut is future usability
polish and is not required for Milestone 4.

---

## Documents

Documents should appear like a professional document library.

Each document should show:

- Title
- Optional description
- Uploaded by and upload date
- File format
- Filename, file size, version, and status
- Download action and version-history link

Avoid decorative document cards.

A stacked compact list is used so metadata reflows at 200% text size and high
zoom without horizontal page overflow. The standard labelled file picker is
the primary upload control; drag-and-drop is not required.

### Document Actions

Possible actions:

- Hämta
- Ladda upp dokument
- Ladda upp ny version
- Arkivera dokument (Administrator only)

Important document actions must use text labels.

File-type icons may support recognition but should remain secondary.

---

## Monthly Reports

Monthly Reports use a clear Client-scoped workflow.

Possible steps:

1. Select calendar month and year.
2. Create or reopen the shared draft for that Client and month.
3. Enter the six visible structured sections.
4. Save the draft with optimistic concurrency protection.
5. Review and sign the report.
6. If needed, create a directly linked replacement without changing the
   signed original.

### Report View

The report should look like an official printable document.

It may include:

- Kaul or organisation heading
- Client name
- Person identifier
- Calendar month and year
- The six manually authored structured sections
- Created- and last-updated information for drafts
- Signer snapshot and signing time for signed reports
- Direct replacement link where applicable
- Stable report reference

Signed reports should clearly show that they are immutable preserved versions.

---

## Search

Search should be simple and permission-aware.

Global search may return:

- Clients
- Journal entries
- Documents
- Monthly reports

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
- Signed journal entries for Clients in their Organisation
- Only their own unfinished Anteckning drafts
- Personnel
- Assignment controls
- Organisation export
- Administrative settings
- Audit access where implemented

### Staff Member

May see:

- Assigned clients
- Signed journal entries for currently assigned Clients
- Only their own unfinished Anteckning draft for each assigned Client
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
- Signing a monthly report
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

Kaul is laptop-first, but mobile-functional. Core workflows must remain usable
on phones as well as on laptops, tablets, and narrow browser windows. Kaul is
not mobile-first, and native mobile applications are outside Version 1.

### Responsive Requirements

- Navigation must work on narrow screens.
- No important functionality may depend on hover alone.
- Forms must use a one-column layout where necessary.
- Ordinary content must not require page-wide horizontal scrolling.
- Client workflows must remain usable on mobile.
- Future Utkast, Signera, and document workflows must remain usable on
  mobile.
- Browser zoom and accessibility remain first-class requirements at every
  supported viewport width.

### Responsive Priorities

- Preserve client identity
- Preserve primary actions
- Preserve readable forms
- Preserve keyboard use
- Avoid hidden critical controls
- Allow sidebar collapse where needed
- Stack metadata rather than compressing it excessively
- Avoid horizontal scrolling for primary workflows

---

## Print Design

Journal entries, monthly reports, and selected documents require print-friendly layouts.

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
- Monthly reports
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

The user-interface direction is approved. Milestone 0 established the initial
reusable components and visual foundation. Milestone 2 Client workflows are
complete: Staff Home provides an immediate assigned-Client overview with clear
Primär/Sekundär responsibility, Administrator Client rows show current primary
responsibility, and Client workspaces show compact current primary and secondary
responsibility before management controls. Focused desktop and 375×812 browser
evidence confirms that the current authenticated Client workflows are
laptop-first, mobile-functional, keyboard-operable, and free from page-wide
horizontal overflow. Only implemented workspace sections are shown.

The Milestone 3 interactive **Anteckningar** workflow is implemented in the
Client workspace. It includes **Översikt**/**Anteckningar** navigation, the
current actor's own draft, explicit save/discard, dedicated signing review,
signed stacked history without body previews, immutable signed detail, and
flat correction workflow. The form uses the exact eight approved types and
separate Swedish-local event date/time fields. Focused browser evidence covers
keyboard-labelled controls, 375×812 use, high-text reflow, private-draft
non-disclosure, stale saves, and repeated signing. Printable Journal views are
deferred work and do not block Milestone 3. Milestone 3 is complete: security
and domain reviews, final focused race and UI reviews, and pull-request CI
passed; the final UI was squash-merged to main in #34. Journal search,
attachments, autosave, rich text, templates, incident classification,
notifications, offline/PWA behaviour, and external or cryptographic signing
remain deferred.

The Milestone 4 interface is complete. The Client workspace now provides real
**Mål** and **Uppföljningar** destinations with shared create, detail, edit,
lifecycle, responsibility, and retained-history workflows. Staff Home keeps
**Att göra** ahead of **Mina klienter** and shows only the current user's own
authorised planned Follow-ups in the approved **Försenade**/**Idag**/**Kommande**
order. Journal drafting supports zero or more optional Goal selections, the
signing review shows their context, and signed detail displays immutable
signing-time titles. Archived Client planning is read-only, access loss fails
closed, responsibility problems remain explicit, and terminal dates are shown.

Permanent browser evidence covers the complete M4 workflow, keyboard-visible
focus, semantic labels and navigation, text status, long-content wrapping,
375×812 use, 200% text reflow, and absence of page-wide horizontal overflow.
The Milestone 4 Playwright suite passed 6/6 and the overlapping Client/Journal
suite passed 12/12 before the UI was squash-merged in #39.

The separate product integration candidate adds the approved expanded Client
forms, six-section **Anteckningar**, manually authored **Månadsrapporter**, and
Client-scoped **Dokument** with upload, version history, download, and archive
workflows. Legacy signed Journal presentation remains available. These
additions follow the existing Swedish, calm, accessible Client-workspace
principles; they do not select a new visual design. The three mock-only visual
concepts remain separate explorations.

The earlier M3/M4 browser results above describe their reviewed baseline, not
acceptance of the combined product/Documents candidate. Its current Client
access, draft/signing, Documents, keyboard, narrow-screen, and magnification
workflows still need appropriate combined validation and owner acceptance.
**Pilot Readiness** remains open, with a later fictional or sanitised-data
feedback trial subject to its release gates. Notifications, global task
management, charts, PWA/offline behaviour, and other unapproved interfaces
remain deferred. See [PROJECT_STATE.md](PROJECT_STATE.md) for the dated
candidate status. Kaul is not approved for sensitive production use.

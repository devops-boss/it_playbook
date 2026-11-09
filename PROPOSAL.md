# BOS Playbook — design system and wireframes

**Status:** proposed, for approval
**Applies to:** §10 (UI/UX) of the specification, and step 2 of the build order.

This document is the design that the code implements. It is here so the
design can be argued with before it is buried in components: if a screen
does not match this document, one of the two is wrong and the difference
should be settled deliberately rather than discovered by a user.

---

## 1. What this is for, and what it is not

BOS Playbook is used by people who are already in the middle of an
incident. The person opening it has a customer on the line, a supervisor
waiting, and maybe four minutes before the next ticket arrives. The
question the software answers is narrow and urgent:

> *What do I do right now, and how do I know it worked?*

That single question drives every decision below.

### Borrowed from learning platforms, and what was deliberately left out

The interface borrows one idea from platforms like Udemy: a course is a
**curriculum**, not a pile of documents. A playbook has a left-hand
outline, a sense of order, a progress bar through the steps, and the
ability to stop and come back to the same place. Reading a playbook feels
like working through a lesson.

Everything else about a marketplace was left out, on purpose:

| Not included | Why |
| --- | --- |
| Star ratings and reviews | A scenario is not an opinion. It is either the fix or it is not. Feedback is a "was this helpful" tick that feeds the analytics, not a public score. |
| Price cards, enrolment, cart | There is nothing to buy and nobody enrols. |
| Instructor bios, hero carousels, promo banners | Marketing furniture. It would push the actual fix below the fold. |
| Course certificates, progress gamification | Progress is tracked for *competency* only — "have the support team covered the VPN topic" — never as a score, a badge or a leaderboard. |
| Discussions and Q&A threads | The knowledge is curated, not crowdsourced. Comments would compete with the fix for attention. |

The visual language sits closer to Notion, Linear and GitHub: quiet,
dense, keyboard-friendly, and confident about typography. A calm tool for
working under pressure.

---

## 2. Design principles

The seven principles from the specification, with what each one means
concretely here.

**1 — Search first, answer fast, problem → fix under 30 seconds.**
The command palette (`Ctrl+K` / `⌘K`) is the primary entry point and is
always one keystroke away. Search is typo-tolerant, understands ticket
numbers, and searches the text *inside* flowcharts and workarounds, not
just titles. The landing page of an account is "your most frequent
problems", not a welcome banner. The first screen of a scenario shows the
**Quick Fix** box before the description.

**2 — Scannable under pressure.**
Chips carry the criteria so a list can be read in one pass. Severity is
colour *and* text, never colour alone. A scenario card is designed to be
read at arm's length on a second monitor: title, one-line symptom,
criteria chips, occurrence count.

**3 — Criteria everywhere, and every chip is a filter.**
The same criterion appears as a chip on a card, as a row in the filter
rail, as a column in the coverage matrix and as a field in the editor.
Clicking a chip anywhere filters the current list by that value. This is
why criteria are data, not code: a new criterion appears in all four
places without a line of TypeScript changing.

**4 — Context always visible.**
The account and the category are in the top bar on every screen, not
only on the account page. It is always obvious which client's playbook
you are reading, because reading the wrong one wastes the time you do
not have.

**5 — Keyboard first.**
`Ctrl+K` opens the palette. `/` focuses the search box. `Esc` closes
anything. Arrow keys walk the filter rail. `j`/`k` move through results.
Every action has a keyboard path, and the focus ring is always visible.

**6 — Calm, professional, dense but readable.**
One neutral base, one accent, semantic colours only where they carry
meaning. No gradients, no shadows deeper than a hairline, no motion
longer than 200 ms. Information density is high but every row is
single-height and aligned to a grid, so a long list scans fast.

**7 — The admin tools are as polished as the reader experience.**
An administrator configuring a criterion spends their working day inside
this product too. The criteria builder, the category tree and the account
wizard use the same components, the same spacing and the same keyboard
shortcuts as the reading screens. Nothing about the admin area looks like
a second, older product.

---

## 3. The design system

### 3.1 Colour

One neutral ramp and one accent. Everything else is semantic.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--background` | `0 0% 100%` | `222 47% 8%` | Page |
| `--foreground` | `222 47% 11%` | `210 40% 96%` | Body text |
| `--card` | `0 0% 100%` | `222 44% 11%` | Cards, panels, popovers |
| `--muted` / `--muted-foreground` | `210 40% 96%` / `215 16% 47%` | `217 33% 17%` / `215 20% 65%` | Secondary surfaces, meta text |
| `--border` | `214 32% 91%` | `217 33% 20%` | Hairlines |
| `--primary` | `210 100% 40%` | `210 100% 55%` | **The single accent** |
| `--destructive` | `0 72% 51%` | `0 72% 58%` | Delete, critical severity |

The accent is **not** hard-coded. It is read from `pb_settings` at runtime
and written into `--primary` / `--ring` by the theme provider, so an
administrator can re-brand the application from **Admin → Settings** with
no rebuild. The default is `#2563eb`.

**Semantic colours are data.** Severity, issue type, impact scope and
every custom field that has colours attached live in the database as hex
values on the option rows. The frontend reads them at request time. That
is why a new severity can be added in the admin area and it appears with
the right colour on the cards, in the matrix, in the editor and in the
search filters on the next page load.

Colours that an administrator enters are checked for contrast against the
surface they will be used on; the admin UI refuses a combination that
falls below WCAG AA and says which of the two needs to change. Severity
colours are also always paired with their label, so the interface still
works for a colour-blind reader and in a monochrome printout.

### 3.2 Typography

| Role | Face | Size / weight | Notes |
| --- | --- | --- | --- |
| Page title | Inter | 24 / 600 | |
| Section heading | Inter | 17 / 600 | |
| Body | Inter | 14 / 400, 1.6 line height | The workhorse |
| Card title | Inter | 15 / 600 | |
| Meta, chip text | Inter | 12 / 500 | |
| Code, ticket id, IP, path | JetBrains Mono | 13 / 400 | With a copy button |

Both faces are **bundled locally** as WOFF2 under `public/fonts/`. There
is no request to Google Fonts or any other CDN at runtime, because the
application is installed on a server that may have no route to the
internet at all.

The type scale is small on purpose. A dense list is easier to scan at
14 px than at 16 px, and the people using this are looking at lists of
forty rows, not reading an article.

### 3.3 Spacing, radius, elevation

A 4 px base grid: `4 8 12 16 24 32 48`. Card padding 16, panel padding
24, page gutter 24 (32 on wide screens). Corner radius 8 px for cards
and controls, 6 px for chips, 4 px for badges. Elevation is a single
hairline border plus, for popovers only, `0 4px 12px rgba(0,0,0,.08)`.
No cards float above other cards.

### 3.4 Components

shadcn/ui (Radix primitives, Tailwind tokens) for the mechanical parts —
button, input, select, checkbox, switch, tabs, dialog, popover,
tooltip, dropdown, scroll area, separator, skeleton, badge, card, label,
textarea — and hand-written components for the domain parts:

`ScenarioCard` · `CriteriaChip` · `FilterRail` · `FacetGroup` ·
`FlowchartViewer` (guided and full) · `FlowchartEditor` ·
`ClassificationStep` · `CoverageMatrix` · `CommandPalette` ·
`QuickFixBox` · `StepList` · `VersionHistoryDrawer` ·
`AccountWizard` · `CategoryTree` · `CriteriaBuilder`

A **criteria chip** is the piece that makes the whole system cohere: one
component, used on cards, in the reader, in the matrix and in the editor.
It renders a value in the criterion's own colour when it has one, and
clicking it filters by that value. Because criteria are data, the chip
is generated — there is no hand-written "severity chip" or "platform chip"
anywhere in the codebase.

### 3.5 Light and dark

Both themes are first-class. The accent is lightness-adjusted in dark
mode so it stays legible without changing the hue the administrator
chose. A person's theme is a personal setting, stored in their profile
and applied before the first paint, so there is no flash of the wrong
theme. The default follows the operating system.

### 3.6 Accessibility

WCAG 2.1 AA is the floor, not the ambition.

- Every control is reachable and operable by keyboard, with a visible
  focus ring (`--ring`, 2 px, 2 px offset) that is never removed.
- Flowcharts are given a text alternative: the node list is always
  reachable as a list, and a "read as text" toggle presents the flow as
  ordered steps. A flow is information; it cannot be image-only.
- Colour is never the only carrier of meaning — severity, status and
  outcome are colour **and** label.
- Live regions announce the result count after a filter changes and the
  save state in the editor.
- Landmarks and headings are correct: one `h1` per page, sections
  headed, the sidebar is a `nav`, the filter rail is an `aside`.
- The palette is a proper combobox: `aria-activedescendant`, `aria-expanded`,
  and a live region that announces the number of results.
- Text can be scaled to 200 % without loss of content or function.

### 3.7 Performance

- Searches and filter changes are server round-trips with a 300 ms
  budget; the list is paginated and the count comes from a live facet
  query, not from the page.
- Images in rich text are lazy, sized, and served through the image
  transformer so a phone photo does not arrive at full resolution.
- A flowchart is only loaded when its panel is opened; the diagram is
  drawn on the client and the guided mode renders one step at a time.
- Skeletons, not spinners. The layout does not shift when data arrives —
  every list reserves the height it will use.

---

## 4. The shell

Every screen inside the application sits in the same shell.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   [ Account ▾ ]  [ Category ▾ ]        ⌘K Search   ☾  ◔   │  56px
├──────────────────┬────────────────────────────────────────────────────────┤
│                  │                                                        │
│  SIDEBAR 264px   │                    PAGE                                 │
│                  │                                                        │
│  Home            │                                                        │
│  Accounts ▾      │                                                        │
│    Acme Corp     │                                                        │
│    Northwind     │                                                        │
│  Categories ▾    │                                                        │
│  Coverage        │                                                        │
│  My drafts       │                                                        │
│                  │                                                        │
│  ─────────────   │                                                        │
│  Admin ▾         │                                                        │
│    Accounts      │                                                        │
│    Categories    │                                                        │
│    Criteria      │                                                        │
│    Playbooks     │                                                        │
│    Scenarios     │                                                        │
│    Analytics     │                                                        │
│    Users         │                                                        │
│    Settings      │                                                        │
└──────────────────┴────────────────────────────────────────────────────────┘
```

The sidebar is **generated from the database**: the account list is the
accounts the signed-in person may see, the category tree is the category
tree, and the admin section appears only if the person holds the
permission. Adding an account or a category makes it appear in the
sidebar with no code change.

The top bar carries the two context controls that must never be
ambiguous — the current account and the current category — plus the
search entry point, the theme toggle and the account menu. The search
field in the top bar opens the same command palette as `Ctrl+K`; the
palette is the richer version, with grouped results and recent searches.

---

## 5. Wireframes

### 5.1 Home

The home page answers "what should I look at?" — for this person, in
this account.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   [ Acme Corp ▾ ]  [ All categories ▾ ]      ⌘K   ☾  ◔   │
├──────────────────┬────────────────────────────────────────────────────────┤
│  Home            │  Acme Corp                                    [📋][⚙]  │
│  Accounts ▾      │  ──────────────────────────────────────────────────    │
│  Categories ▾    │  Quick answers                                                  │
│  Coverage        │  ┌───────────────────────┬───────────────────────┐        │
│  My drafts       │  │ 🔍 Search the playbook│  Most frequent         │        │
│                  │  │                       │  ───────────────────── │        │
│  Admin ▾         │  │  e.g. "VPN drops at  │  1. Internet down      │        │
│                  │  │  9am"                │  2. Wi-Fi / VPN        │        │
│                  │  │                       │  3. Softphone no reg.  │        │
│                  │  └───────────────────────┴───────────────────────┘        │
│                  │  ┌──────────────────────────────────────────────────┐     │
│                  │  │ Pinned by you                                     │     │
│                  │  │  ▸ Internet down — Quick fix, 12 steps            │     │
│                  │  │  ▸ VPN drops at 9am — 8 steps                    │     │
│                  │  └──────────────────────────────────────────────────┘     │
│                  │  Recently updated · Anticipated · Curated playbooks       │
└──────────────────┴────────────────────────────────────────────────────────┘
```

The account page (§5.2) is the same layout with account-specific tabs.

**Decision.** Home is *not* a dashboard of vanity numbers. There is no
"total scenarios" tile, because nobody in an incident needs that number.
The first screen holds a search box, the most frequent problems, and the
playbooks the person has pinned. "Continue where you left off" appears
here for editors, not for readers — a reader who left halfway through a
flowchart is in the middle of an incident, and the incident is not over.

### 5.2 Account page

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   [ Acme Corp ▾ ]  [ All categories ▾ ]      ⌘K   ☾  ◔   │
├──────────────────┬────────────────────────────────────────────────────────┤
│                  │  Acme Corp                             [Edit] [Settings] │
│  Home            │  Client since 2019 · 42 scenarios · 3 categories        │
│  Accounts ▾      │  ──────────────────────────────────────────────────    │
│   ● Acme Corp    │  [Frequent] [Anticipated] [By category] [Updated]      │
│   ○ Northwind    │  [Critical] [Curated]                                     │
│   ○ Globex       │  ──────────────────────────────────────────────────    │
│  Categories ▾    │  Search within this account…            ⌘K              │
│   Network ▾      │  ──────────────────────────────────────────────────    │
│    ● Connectivity │  ▸ Internet down                       Sev:Critical      │
│    ○ Hardware     ││    ISP fibre ONT shows LOS              142×  · Network  │
│   Software ▾     │  │    Quick fix · 12 steps · updated 2d ago             │
│                  │  ▸ Wi-Fi / VPN unstable                 Sev:High        │
│                  │  │    Guests drop after 20 min           96×   · Network  │
│                  │  │    Quick fix · 8 steps · updated 5d ago              │
│                  │  ▸ Softphone not registering             Sev:Medium      │
│                  │  │    Registration times out              41×   · Voice   │
│                  │  └──────────────────────────────────────────────────┘     │
│                  │  Showing 3 of 42 · [Load more]                            │
└──────────────────┴────────────────────────────────────────────────────────┘
```

The tabs are **configurable per account** (Frequent Problems, Anticipated
Problems, By Category, Recently Updated, Critical Issues, Curated
Playbooks) — the account record says which tabs exist and in what order,
and the tabs are rendered from that list.

Frequent Problems is ranked by **occurrence count**, not by date, because
the most common problem is the one most likely to be in front of you.

### 5.3 Category playbook view, with the filter rail

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   [ Acme Corp ▾ ]  [ Connectivity ▾ ]      ⌘K   ☾  ◔   │
├──────────────────┬──────────────────────────────┬────────────────────────┤
│  SIDEBAR         │  Connectivity — Acme Corp    │  FILTERS               │
│                  │  ──────────────────────────── │  ─────────────────────  │
│  Home            │  14 scenarios                │  Account               │
│  Accounts ▾      │                              │  [Acme Corp ×] [North…]│
│  Categories ▾    │  ┌──────────────────────────┐│  Any / All / Only ▸    │
│   Network ▾      │  │ ▸ Internet down          ││                        │
│    ● Connectivity │  │   ISP fibre ONT shows LOS││  Severity              │
│      14          │  │   [Critical] [Network]   ││  ● Critical      3     │
│      Hardware 9  │  │   142× · 2d ago          ││  ○ High          5     │
│   Software ▾     │  └──────────────────────────┘│  ○ Medium        6     │
│    Voice 7        │  ┌──────────────────────────┐│                        │
│                  │  │ ▸ Wi-Fi / VPN unstable   ││  Platform              │
│                  │  │   Guests drop after 20min││  ● Windows      8     │
│                  │  │   [High] [Network]        ││  ○ Linux        4     │
│                  │  │   96× · 5d ago            ││  ○ macOS        2     │
│                  │  └──────────────────────────┘│                        │
│                  │  [Search in this category…]  │  Vendor / ISP          │
│                  │                              │  ○ Acme ISP     5     │
│                  │                              │  ○ Beta ISP     3     │
│                  │                              │                        │
│                  │                              │  [Clear all]           │
│                  │                              │  [Save this filter]    │
└──────────────────┴──────────────────────────────┴────────────────────────┘
```

Every facet group, every option and every count is **generated from the
criteria field definitions in the database**. A criterion that an
administrator adds in the Criteria Builder appears here as a new facet
group with live counts, without a code change. Counts are computed
against the *other* active filters, so they tell the truth about what
would happen if you clicked.

The account filter offers the three overlap modes from the
specification: **Any selected account**, **Common to all selected
accounts**, **Unique to one account**.

### 5.4 Coverage matrix

The documentation-gap view. The two axes are chosen by the administrator;
the default is Category × Account.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Coverage matrix                                     Axes: [Category ▾]   │
│                                                      [Account ▾]          │
├──────────────┬─────────┬─────────┬─────────┬─────────┬──────────────────┤
│              │ Acme    │Northwind│ Globex  │ Global  │ Total            │
├──────────────┼─────────┼─────────┼─────────┼─────────┼──────────────────┤
│ Connectivity │    7    │    4    │    2    │    1    │ 14               │
│ Hardware     │    9    │    3    │    0    │    0    │ 12               │
│ Software     │    6    │    2    │    5    │    1    │ 14               │
│ Voice        │    4    │    1    │    3    │    0    │  8               │
├──────────────┼─────────┼─────────┼─────────┼─────────┼──────────────────┤
│ Total        │   26    │   10    │   10    │    2    │ 48               │
└──────────────┴─────────┴─────────┴─────────┴─────────┴──────────────────┘
```

Each cell shows the number of scenarios. Clicking a cell opens the
filtered list behind it. **Empty cells are highlighted** — a gap in the
documentation is a finding, and it should be visible at a glance rather
than read as a zero. A legend under the matrix explains the highlight.

**Decision.** The matrix is deliberately plain — a table, not a heat map
with a colour scale. The reader is looking for *holes*, and a table with
one highlighted colour is the fastest way to find them.

### 5.5 Search results

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   [ Acme Corp ▾ ]  [ All categories ▾ ]      ⌘K   ☾  ◔   │
├──────────────────┬────────────────────────────────────────────────────────┤
│  SIDEBAR         │  ┌──────────────────────────────────────────────────┐   │
│                  │  │ 🔍 VPN drops at 9am                              │   │
│                  │  └──────────────────────────────────────────────────┘   │
│                  │  12 results · 0.09 s   [Sort: Relevance ▾]             │
│                  │  [Acme Corp] [Connectivity] [High] [Windows]  [×]      │
│                  │  ────────────────────────────────────────────────────  │
│                  │  ▸ Wi-Fi / VPN unstable after 20 minutes               │
│                  ││  Guests drop when the router reboots…               │
│                  ││  [Acme Corp] [Connectivity] [High] [Windows]        │
│                  ││  › in title  › in causes                              │
│                  │  ▸ VPN drops at 9am on the 4th floor                 │
│                  ││  ...                                               │
│                  │  ────────────────────────────────────────────────────  │
│                  │  Saved filters: [Frequent critical] [Windows 10]      │
└──────────────────┴────────────────────────────────────────────────────────┘
```

Matching text is **highlighted** in the title and the snippet, and the
snippet is drawn from the passage that matched — including text inside a
flowchart node or a workaround, with the section it came from named.
Active filters appear as removable chips. "Save this filter" stores the
query plus every active filter and the sort order, and the saved filter
appears in the list for that person.

Zero-result searches are logged and shown to the administrator in the
analytics dashboard — an unanswered question is a hole in the
documentation.

### 5.6 Scenario view

The screen that matters most. Three zones, and the reading modes.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   [ Acme Corp ▾ ]  [ Connectivity ▾ ]      ⌘K   ☾  ◔   │
├──────────────┬──────────────────────────────────────────┬─────────────────┤
│ ON THIS PAGE │  Internet down                           │ ON THIS PAGE    │
│              │  Acme Corp · Connectivity · Critical 142× │ Quick fix       │
│ ▸ Quick fix  │  ─────────────────────────────────────── │ Symptoms        │
│ ▸ Symptoms   │  ┌────────────────────────────────────┐  │ Flowchart       │
│ ▸ Flowchart  │  │ ⚡ QUICK FIX                        │  │ Sample tickets  │
│ ▸ Tickets    │  │ 1. Check the ONT power light.      │  │ Causes          │
│ ▸ Causes     │  │    Red or off → it has no power.   │  │ Workarounds     │
│ ▸ Workarounds│  │ 2. If green, ask the customer to    │  │ Resolutions     │
│ ▸ Resolutions│  │    power-cycle the ONT.             │  │ Escalation     │
│ ▸ Escalation │  │ 3. If it comes back, the fault is   │  │ Attachments     │
│ ▸ Attachments│  │    upstream — raise with the ISP.   │  │ Related         │
│              │  │ [copy] [start flowchart]           │  │ ───────────────  │
│  1.2k views   │  └────────────────────────────────────┘  │ [Edit] [History]│
│  128 helpful  │  Symptoms                                │ [Share]         │
│              │  The ONT shows LOS…                     │                 │
│              │  [image]                                │                 │
│              │  Troubleshooting flow                   │                 │
│              │  ┌────────────────────────────────────┐  │                 │
│              │  │ ▶ Start  →  Check ONT  →  ?        │  │                 │
│              │  │      │                    └ Yes → Escalate│
│              │  │      └ No → Power cycle ─→ Fixed?   │  │                 │
│              │  │ [Guided] [Full diagram] [Export]    │  │                 │
│              │  └────────────────────────────────────┘  │                 │
│              │  Sample tickets  INC-48115  INC-49002   │                 │
└──────────────┴──────────────────────────────────────────┴─────────────────┘
```

**Reading modes.** The scenario opens in **Quick Fix** mode: the Quick
Fix box, the symptoms, and the top of the flow. "Full" mode shows
everything in one scroll, for the reader who wants the whole picture
before acting. The choice is remembered per person.

**The flowchart opens in Guided mode** — one step at a time, with Yes/No
buttons, a breadcrumb of the path taken, a back button, and a
"Did this work? No → escalate" exit. Someone on a call cannot read a
diagram and follow it at the same time. "Full diagram" gives the
React Flow canvas with zoom, pan, a minimap, and export to PNG or PDF.
The same data serves both: the guided mode is a walk over the node
graph, not a second copy of it.

**Decision.** The left rail is the outline of *this* scenario, and the
right rail is "on this page" with a scroll spy plus the actions (Edit,
History, Share, Pin). The two rails are different things and are not
merged: the left rail is navigation between sections, the right rail is
where you are and what you can do.

### 5.7 Editor — the Classification step

The editor's **first** step is always Classification, because the
classification is what everything else in the system is indexed by.

```
┌───────────────────────────────────────────────────────────────────────────┐
│  New scenario                          ● All changes saved   [Preview][Publish]│
├──────────────────┬────────────────────────────────────────────────────────┤
│ STEPS            │  ① Classification                                         │
│                  │  ──────────────────────────────────────────────────      │
│ ① Classification │  Every scenario is classified so it can be found.         │
│ ② Basics        │                                                         │
│ ③ Problem       │  Account *                                                │
│ ④ Flowchart     │  [ Acme Corp ▾ ] [+ Northwind] [+ Global]                 │
│ ⑤ Tickets       │  (one or more; Global applies to every account)           │
│ ⑥ Causes        │                                                         │
│ ⑦ Workarounds   │  Problem category *                                       │
│ ⑧ Resolutions   │  [ Network ▾ > Connectivity ▾ ]  + add                    │
│ ⑨ Escalation    │                                                         │
│ ⑩ Attachments   │  Issue type *        Severity *     Impact scope *         │
│ ⑪ Custom…       │  [ Access ▾ ]        [ Critical ▾ ] [ Site ▾ ]           │
│ ⑫ Review        │                                                         │
│                  │  Platform        Vendor / ISP     Shift                   │
│                  │  [ Windows ]     [ Acme ISP ]     [ Night ]               │
│                  │  (optional - the fields below come from the criteria     │
│                  │   builder and change when the administrator changes them) │
│                  │                                                         │
│                  │  Tags  [ vpn ][ fibre ][ 3am ]  +                         │
│                  │  Last occurred  [2026-10-18]   Occurrences [ 142 ]        │
│                  │                                                         │
│                  │  ⚠ Missing: Impact scope, Vendor / ISP                  │
│                  │  [Continue to Basics →]                                  │
└──────────────────┴────────────────────────────────────────────────────────┘
```

The required/optional split, the field list, the conditional
"required only when" rules and the help text all come from the criteria
field definitions. A missing required criterion produces a specific
message — "Missing: Impact scope, Vendor / ISP" — and blocks Continue
and Publish. Nothing is hard-coded: the labels, the order, whether a
field is required, and when it is required are all data.

The step navigator on the left is a progress list; completed steps carry
a tick, the current step is highlighted, and the whole list is
clickable. An autosave indicator sits in the top bar, and a live preview
of the scenario is available in a side panel throughout.

### 5.8 Admin — the Criteria Builder

The screen that makes the rest of the application configurable.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   Admin ▸ Criteria                    [Import] [Export]     │
├──────────────────┬────────────────────────────────────────────────────────┤
│ FIELDS           │  Severity                              [Edit] [Deactivate] │
│ (scenarios)      │  ──────────────────────────────────────────────────     │
│                  │  Type        single-select            Required ✓         │
│  ● Severity      │  Applies to  scenarios                                    │
│  ○ Issue type    │  Facet       ✓   Chip on cards  ✓                        │
│  ○ Impact scope  │  Options                                                         │
│  ○ Platform      │  ┌────────────┬────────┬──────────┬────────┬─────┐        │
│  ○ Vendor / ISP  │  │ Critical   │ ● red  │ #dc2626  │ ↑ 1    │ ✎ ✕ │        │
│  ○ Shift         │  │ High       │ ● orange│#ea580c  │ 2     │ ✎ ✕ │        │
│  ○ Tags          │  │ Medium     │ ● amber│#f59e0b  │ 3     │ ✎ ✕ │        │
│                  │  │ Low        | ● green│#16a34a  │ 4     │ ✎ ✕ │        │
│ [+ New field]    │  └────────────┴────────┴──────────┴────────┴─────┘        │
│                  │  Colour          Sort                                     │
│                  │  [ #dc2626 ▾ ]  ↑ ↓                                     │
│                  │                                                         │
│  ▸ Required only when                                                   │
│    [Issue type] is [Hardware]                                           │
│                  │  Renaming an option keeps its ID, so saved filters and   │
│                  │  links keep working.                                     │
└──────────────────┴────────────────────────────────────────────────────────┘
```

A field has: type, label, help text, applies to (scenarios, playbooks,
both), required or optional, required only when (a condition on another
field), allowed options, show as search facet, show as chip on cards,
default value, sort order, scope, active or inactive.

**System fields** — Account, Category, Issue type, Severity, Impact
scope — can be renamed, relabelled, reordered and made optional, but
**cannot be deleted**, because the search indexes, the coverage matrix
and the RLS policies are written against them. The UI says so rather
than showing a delete button that does nothing.

**Renaming and merging are previewed.** Before a rename that would touch
twelve scenarios, or a merge that would combine two options, the
administrator sees exactly what will change, and the change is written to
the audit log.

### 5.9 Admin — the Account Setup Wizard

```
┌───────────────────────────────────────────────────────────────────────────┐
│  New account                                                  Step 2 of 4  │
│  ●━━━━━━●━━━━━━○━━━━━━○                                            [X] │
│  Details   Setup   Content   Confirm                                     │
├───────────────────────────────────────────────────────────────────────────┤
│  Name *                [ Northwind Telecom                        ]        │
│  Code *                [ NWT                                    ]        │
│  Description           [ Client since 2019. Voice and mobile fleet. ]      │
│  Owner                 [ Jane Ruiz ▾ ]                                     │
│  Status                [ Active ▾ ]                                       │
│  Logo / colour         [ (N) ] [ #2563eb ▾ ]  [Upload]                     │
│                                                                             │
│  ┌── Clone from an existing account ────────────────────────────────┐    │
│  │ [ Acme Corp ▾ ]  [Clone setup]  Brings across categories,         │    │
│  │                   platforms, sites and criteria settings.         │    │
│  │                   The scenarios are NOT copied.                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Assign users         [x] Ana Diaz   [x] Leo Park   [ ] Sam Reed          │
│                                                                             │
│  Categories to use    [x] Network  [x] Hardware  [ ] Voice                │
│  Platforms            [x] Windows  [x] Linux  [ ] macOS                   │
│  Sites                [x] Manila  [x] Cebu                                 │
│                                                                             │
│                        [← Back]                    [Continue →]           │
└───────────────────────────────────────────────────────────────────────────┘
```

Four steps: Details → Setup → Content → Confirm. The wizard never
assumes a fixed set of categories, platforms or sites — it offers the
ones the administrator has already defined, and the account can be given
a set of its own. "Clone setup from an existing account" copies the
*configuration* (categories enabled, platforms, sites, criteria settings,
tabs) and explicitly not the scenarios.

### 5.10 Admin — the Category tree manager

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ BOS Playbook   Admin ▸ Categories                      [+ New category]  │
├──────────────────┬────────────────────────────────────────────────────────┤
│ TREE             │  Connectivity                              [Edit][⋯]     │
│                  │  ──────────────────────────────────────────────────     │
│ ▾ Network        │  Parent      [ Network ▾ ]                              │
│   ● Connectivity │  Name        [ Connectivity ]                          │
│   ○ Hardware     │  Slug        [ connectivity ]  (kept after rename)      │
│ ▾ Software       │  Icon        [ ( ⚡ ) ▾ ]    Colour [ #2563eb ▾ ]       │
│   ● Voice        │  Status      [ Active ▾ ]                              │
│   ○ Email        │  Accounts    [x] Acme  [x] Northwind  [ ] Globex        │
│                  │  ──────────────────────────────────────────────────    │
│ [+ Add child]    │  14 scenarios use this category                          │
│                  │  Impact of changes:                                      │
│  Drag to reorder │   Rename → 14 scenarios, 3 saved filters, 1 shared link │
│  Drag to reparent│   Deactivate → hidden from new scenarios, still readable│
│                  │  [Preview impact]                    [Save changes]    │
└──────────────────┴────────────────────────────────────────────────────────┘
```

The tree is drag-and-drop for both reordering and re-parenting, with
drop targets shown. Categories can be nested to any depth, renamed,
recoloured, deactivated, merged, and deleted **only if unused** — the
delete button explains why it is unavailable when a category still has
scenarios. The stable ID and slug are kept across a rename so that URLs
and saved filters keep working.

---

## 6. Motion and feedback

Motion is functional and brief: 120–200 ms, `ease-out`, and only for
things that appeared, moved or changed. The palette fades in and
scales from 0.98. Chips cross-fade when a filter is applied. Nothing
animates on page load, and nothing loops.

Feedback states, all of them:

- **Loading** — skeletons in the shape of the content that is coming.
- **Saving** — the autosave indicator in the editor, quiet, always in the
  same place.
- **Saved** — the same indicator, briefly green.
- **Failed** — the same indicator turns red and the message says what to
  do, not just that something went wrong.
- **Empty** — every empty state says what would fill it and offers the
  button that does it. "No scenarios match these filters — clear the
  filters" is a button, not a sentence.
- **Blocked** — publishing with a missing criterion says which criterion
  is missing, in the editor and in a dialog.

---

## 7. What is deliberately absent

- No modal dialogs for anything that could be a page. Dialogs are for
  confirmations and small pickers.
- No hidden gestures. Everything can be done with a pointer.
- No infinite scroll in the admin tables — they are paginated, because
  an administrator needs to know where they are.
- No tooltips carrying information that exists nowhere else.
- No notification badges that require a click to clear.

---

## 8. Approval

This document covers the design system and the ten wireframes the
specification asks for. Approval of this document means:

1. The visual language (one neutral base, one configurable accent,
   semantic colours from the database, Inter and JetBrains Mono bundled
   locally, 8 px radius, hairline borders) is the target.
2. The ten screens above are the target, and any difference in the built
   application is a defect rather than a design decision.
3. The reading modes, the guided-first flowchart, and the
   classification-first editor are settled.

Changes to anything above after approval are deliberate and get a
versioned note in this document, so the code and the document stay
together.

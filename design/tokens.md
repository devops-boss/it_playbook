# IT Operations Playbook — Design Tokens & Direction
**Client:** Big Outsource (BPO)  
**Version:** 1.0.0 (Section 2: Design Foundation)

---

## 1. Color Palette

### 1.1 Brand Colors (Big Outsource)
These colors define the corporate identity and are never mixed with severity states.

| Token | Hex | HSL | Role / Usage |
|---|---|---|---|
| `--brand-dark-blue` | `#233B74` | `223, 54%, 30%` | **Primary:** Top bar, section headings, primary action buttons, key borders |
| `--brand-light-blue`| `#288FC2` | `200, 66%, 46%` | **Interactive:** Text links, active tab underlines, focus rings, hover fills |
| `--brand-orange`    | `#E07E3C` | `24, 73%, 56%`  | **Highlight & Action:** Quick Fix callout box, urgent action triggers, featured CTA |
| `--brand-purple`    | `#794183` | `291, 33%, 38%` | **Secondary Accent:** Metadata chips, category tags, diagram nodes, chart fills |

### 1.2 Severity Levels (Functional & Distinct from Brand)
Severity indicators use unambiguous traffic-light conventions with high WCAG contrast:

| Level | Badge / Border Hex | Background Tint (Light) | Background Tint (Dark) | Meaning |
|---|---|---|---|---|
| **Critical** | `#DC2626` (Red 600) | `#FEF2F2` (Red 50) | `#450A0A` | Total outage, company-wide or multi-account halt |
| **High**     | `#EA580C` (Orange-Red 600) | `#FFF7ED` (Orange 50) | `#431407` | Significant team/site impact, no workaround |
| **Medium**   | `#D97706` (Amber 600) | `#FFFBEB` (Amber 50) | `#451A03` | Single user or degraded performance with workaround |
| **Low**      | `#4B5563` (Gray 600) | `#F3F4F6` (Gray 100) | `#1F2937` | Minor inconvenience, cosmetic, general request |

### 1.3 Issue Types & Status
- **Frequent / Known:** `#2563EB` (Blue badge)
- **Anticipated / Potential:** `#7C3AED` (Purple badge)
- **One-off / Resolved:** `#059669` (Emerald badge)
- **Status (Active):** `#16A34A` (Green)
- **Status (Archived / Deactivated):** `#9CA3AF` (Muted gray)

### 1.4 Light and Dark Themes (WCAG AA Compliant)
- **Light Theme:**
  - Background: `#FFFFFF` (Surface) / `#F8FAFC` (Canvas background)
  - Card / Popover: `#FFFFFF` with border `#E2E8F0`
  - Body Text: `#0F172A` (Slate 900 — Contrast 14.8:1 against white)
  - Muted Text: `#64748B` (Slate 500 — Contrast 4.6:1 against white)
- **Dark Theme:**
  - Background: `#0B1220` (Deep navy midnight) / `#111A2E` (Surface card)
  - Card / Popover: `#162238` with border `#233B74` (Dark blue border)
  - Body Text: `#F8FAFC` (Slate 50 — Contrast 15.2:1 against canvas)
  - Muted Text: `#94A3B8` (Slate 400 — Contrast 5.1:1 against canvas)

---

## 2. Typography & Hierarchy
All fonts are strictly self-hosted (zero external CDN or Google Fonts connections).
- **Primary Body & Interface:** `Inter` (WOFF2 locally bundled in `/public/fonts/inter/`)
- **Code, Script & Tracking IDs:** `JetBrains Mono` (WOFF2 bundled in `/public/fonts/jetbrains-mono/`)

### Type Scale
- `Display / Page Title:` 24px (1.5rem) / Line-height: 32px / Weight: 700 / `#233B74` (Dark Blue)
- `Section Heading (H2):` 18px (1.125rem) / Line-height: 24px / Weight: 600
- `Subsection (H3):` 14px (0.875rem) / Line-height: 20px / Weight: 600
- `Body Text:` 14px (0.875rem) / Line-height: 20px / Weight: 400
- `Meta / Caption / Badges:` 11px (0.6875rem) / Line-height: 16px / Weight: 500 (Uppercase tracking +0.05em)
- `Code & Hesk Tracking IDs:` 13px (0.8125rem) / Monospace / Weight: 500

---

## 3. UI Component Specifications

1. **Top Bar Header (Height: 56px):**
   - Left: Big Outsource IT Operations Playbook Logo & Mark.
   - Center-Left: Multi-select Account Switcher dropdown (Defaults to `All 26 Accounts`, remembered in browser storage).
   - Center-Right: Global Search bar triggering `Ctrl + K` Command Palette.
   - Right: Theme toggle (Light/Dark), User avatar & profile menu (Role badge: `IT Support` or `Admin`, Sign Out).
2. **Collapsible Left Sidebar (Width: 260px expanded / 64px collapsed):**
   - Navigation Items:
     - `Home` (Dashboard overview & continue where you left off)
     - `Accounts` (Expandable tree listing all 26 client accounts)
     - `Categories` (Hierarchical tree: Network, Apps, Hardware, Access/Login)
     - `Favorites` (Starred scenarios)
     - `Recently Viewed` (History trail)
     - `My Drafts` (Work-in-progress scenarios)
     - `Manage` (Accounts, Categories, Classification Options, Settings)
     - `Users` (*Admin only* — strictly hidden from IT Support)
3. **Quick Fix Box (Orange Accent `#E07E3C`):**
   - Prominently positioned at the top of the scenario reading view.
   - Orange left border (4px solid `#E07E3C`), subtle amber/orange background tint (`#FFF7ED` light / `#2A1B0E` dark).
   - Contains actionable 1-2 sentence immediate workaround, copyable command or setting.
4. **HESK Ticket Integration:**
   - Sample tickets show only the **HESK Tracking ID** (e.g. `BOS-49281`, `NET-10923`).
   - Formatted as clickable monospace badge linking directly to the Hesk ticket URL configured in settings (`https://helpdesk.bigoutsource.com/ticket.php?track={ID}`).
5. **Scenario Viewing Modes:**
   - **Quick Fix Mode:** Strips out causes, background notes, and sample tickets; displays only Quick Fix, Flowchart, and Numbered Resolution steps for high-pressure incident triage.
   - **Full Mode:** Shows complete root causes, sample tickets, escalation contacts, and prevention notes.

---

## 4. Keyboard Shortcuts & Accessibility

- `Ctrl + K` or `Cmd + K`: Open Command Palette / Global Search.
- `[` or `Ctrl + B`: Toggle Sidebar expanded/collapsed.
- `Alt + Q`: Toggle Quick Fix mode vs. Full mode on scenario page.
- `Alt + C`: Copy resolution steps for Hesk ticket notes.
- `Tab` / `Shift + Tab`: Predictable focus ring (`2px solid #288FC2` with `2px offset`).
- `Esc`: Close drawers, modals, and command palette.
- Skip to content link (`#main-content`) provided for screen readers.

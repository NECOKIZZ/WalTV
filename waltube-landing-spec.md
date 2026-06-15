# WalTube Landing Page — Design Spec
> Reference document for converting the landing page prototype into production React + Tailwind code.

---

## Brand Identity

| Attribute | Value |
|-----------|-------|
| Vibe | Dark. Premium. Ethereal. |
| Mood | Cinematic, creator-first, crypto-native without the noise |
| Shape language | Zero sharp edges — everything pill-shaped or heavily rounded |
| Effects | Glassmorphism + indigo ambient glow |

---

## Design Tokens

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--black` | `#0A0A0F` | Page background |
| `--navy` | `#0D1B2A` | Section backgrounds |
| `--indigo` | `#6F00FF` | Primary accent, CTAs, glows |
| `--indigo-soft` | `#8B2FFF` | Hover states |
| `--indigo-mid` | `rgba(111,0,255,0.35)` | Glow overlays |
| `--indigo-border` | `rgba(111,0,255,0.4)` | Hover borders |
| `--lilac` | `#C084FC` | Secondary accent, earn badges, step numbers |
| `--glass-bg` | `rgba(255,255,255,0.04)` | Card backgrounds |
| `--glass-border` | `rgba(255,255,255,0.08)` | Card borders, dividers |
| `--text` | `#F0EEFF` | Primary text |
| `--muted` | `rgba(240,238,255,0.48)` | Secondary text, labels |

### Typography

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display | Bricolage Grotesque | 800 | Hero headline, section titles, CTA headings |
| UI / Body | Inter | 400–600 | Body copy, nav links, labels, metadata |

**Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap');
```

**Type scale:**
| Element | Size | Weight | Letter Spacing |
|---------|------|--------|----------------|
| Hero H1 | `clamp(42px, 7.5vw, 92px)` | 800 | `-2.5px` |
| Section H2 | `clamp(30px, 4vw, 52px)` | 800 | `-1.5px` |
| CTA Box H2 | `clamp(26px, 3.2vw, 42px)` | 800 | `-1.5px` |
| Card title | `17–18px` | 700 | `-0.3px` |
| Body / desc | `14–16px` | 400 | `normal` |
| Eyebrow label | `11px` | 600 | `0.16em` (uppercase) |
| Nav links | `14px` | 500 | `normal` |

---

## Global Effects

### Glassmorphism Recipe
```css
background: rgba(255, 255, 255, 0.04);
border: 1px solid rgba(255, 255, 255, 0.08);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border-radius: 24px; /* cards */
```

### Indigo Glow (buttons)
```css
box-shadow: 0 0 32px rgba(111, 0, 255, 0.45);
/* hover */
box-shadow: 0 0 52px rgba(111, 0, 255, 0.72);
```

### Radial Background Glow
```css
background: radial-gradient(ellipse at center,
  rgba(111,0,255,0.26) 0%,
  rgba(111,0,255,0.08) 42%,
  transparent 68%);
```

### Film Grain Texture Overlay
```css
/* Fixed pseudo-element on body::after, pointer-events: none, z-index: 9999 */
background-image: url("data:image/svg+xml,..."); /* SVG feTurbulence noise */
opacity: 0.5;
```

### Scroll Reveal Animation
```css
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.72s ease, transform 0.72s ease;
}
.reveal.visible {
  opacity: 1;
  transform: none;
}
/* Stagger delays: .d1 = 0.08s, .d2 = 0.18s, .d3 = 0.28s, .d4 = 0.38s */
```
Trigger with `IntersectionObserver` at `threshold: 0.1`.

### Hero Entrance Animation
Badge → H1 → Subline → CTAs animate in sequentially on page load.
Delays: `150ms`, `330ms`, `510ms`, `690ms`. Each fades up from `translateY(20px)`.

---

## Page Structure

### 1. Navbar
- **Position:** Fixed, floating, `top: 16px`, centered
- **Width:** `calc(100% - 48px)`, max `1160px`
- **Layout:** Logo left · Nav links center · CTA button right
- **Shape:** `border-radius: 999px` (full pill)
- **Glass:** `backdrop-filter: blur(24px)`, `background: rgba(10,10,15,0.5)`
- **Scroll behavior:** Background deepens to `rgba(10,10,15,0.82)` + stronger glow on scroll
- **CTA button:** `#6F00FF` fill, pill-shaped, `box-shadow: 0 0 22px rgba(111,0,255,0.42)`
- **Hover glow CTA:** `box-shadow: 0 0 40px rgba(111,0,255,0.68)` + `translateY(-1px)`

---

### 2. Hero Section
- **Height:** `min-height: 100vh`
- **Layout:** Column, centered, `text-align: center`
- **Padding:** `160px 24px 100px`

**Background layers (bottom to top):**
1. Page base `#0A0A0F`
2. Indigo radial glow — centered, `800×800px`, peaks at `26%` opacity
3. Lilac radial glow — bottom right, `460×460px`, `10%` opacity
4. Film grain texture overlay (body::after)

**Elements (top to bottom):**

| Element | Spec |
|---------|------|
| Live badge | Pill chip, indigo border, lilac text, pulsing dot (`animation: blink 2.2s`) |
| Badge copy | `"Now live on Sui × Walrus"` — uppercase, `11px`, `0.06em` tracking |
| H1 | `"Monetize Your AI Media Skills."` — Bricolage Grotesque 800, gradient fill (white → lilac → indigo-soft) |
| Subline | `"Transparent. Forever. Onchain."` — Bricolage Grotesque 400, muted color, `0.12em` tracking, key words bolded white |
| CTAs | Primary: `"Start Creating"` (indigo pill + shimmer on hover) · Ghost: `"See How It Works"` |
| Mockup | Browser-frame mockup showing creator feed cards. Reveal on scroll. Indigo glow underneath. |

**Mockup frame:**
- `border-radius: 20px`, glass background, indigo ring shadow
- Top bar: traffic light dots + URL bar (`waltube.xyz/feed`)
- Content: 3-column grid of video cards (thumb + title + creator handle + earn amount in lilac)
- Thumb gradients: indigo range for card 1, blue range for card 2, purple range for card 3

---

### 3. Features Section
- **Padding:** `128px 24px`
- **Max-width:** `1160px`, centered
- **Grid:** `repeat(3, 1fr)`, `gap: 18px`
- **Responsive:** 2-col at ≤900px, 1-col at ≤600px

**Section header:**
- Eyebrow: `"Features"` — uppercase, indigo-soft, left line decoration
- H2: `"Everything you need. Nothing you don't."`
- Subtext: `"Built for creators who take their work seriously enough to own it — permanently."`

**6 Feature Cards:**

| # | Icon | Title | Description |
|---|------|-------|-------------|
| 1 | ♾️ | Permanent Storage | Walrus decentralized storage. Upload once, exist forever. No takedowns, no expiry. |
| 2 | 🔀 | Fork Royalties | Earn automatically when someone remixes. Terms set onchain, enforced by protocol. |
| 3 | 🤖 | AI-Powered Creation | Generate, edit, publish AI video. Timestamped and permanently owned. |
| 4 | 🔍 | Onchain Transparency | Every view, fork, payment recorded onchain. Verifiable earnings, no black box. |
| 5 | 🔐 | zkLogin via Enoki | Sign in with Google. No seed phrases. Web2 UX, Web3 ownership. |
| 6 | 💸 | Paid Likes | Fans back content with real value. 98% to creator, 2% platform fee. |

**Card hover state:** `translateY(-5px)` + `border-color: rgba(111,0,255,0.4)` + `box-shadow: 0 24px 64px rgba(111,0,255,0.14)` + radial glow from top-left corner fades in.

**Card icon container:** `46×46px`, `border-radius: 13px`, `background: rgba(111,0,255,0.14)`, `border: 1px solid rgba(111,0,255,0.28)`

---

### 4. Stack & Partners Marquee
- **Padding:** `80px 0`
- **Border:** Top + bottom `1px solid rgba(255,255,255,0.08)`
- **Background:** Subtle indigo gradient strip
- **Fade edges:** Left + right `120px` linear-gradient fade to `#0A0A0F` (pseudo-elements)

**Two rows, opposite directions:**

| Row | Direction | Speed | Items |
|-----|-----------|-------|-------|
| Row 1 (→ left) | `translateX(0 → -50%)` | `26s` | Sui, Walrus, Mysten Labs, zkLogin, Enoki, Next.js, Supabase |
| Row 2 (← right) | `translateX(-50% → 0)` | `32s` | Superteam Nigeria, Vercel, TypeScript, Tailwind CSS, Move Language, Walrus SDK, Circle |

**Chip style:** Pill shape, glass bg, glass border, `14px` Inter 500, emoji icon left. Hover: indigo border + white text.

Each row duplicated (`×2`) for seamless infinite loop.

---

### 5. How It Works + CTA
- **Padding:** `128px 24px`
- **Layout:** 2-column grid, `gap: 80px`, aligned center
- **Responsive:** Stack to 1-col at ≤900px

**Left — Steps:**
- Eyebrow: `"How it works"`
- H2: `"Three steps to owning your content forever."`
- 3 steps, each in a hoverable glass container

| # | Title | Body |
|---|-------|------|
| 1 | Upload your AI content | Publish to WalTube → stored permanently on Walrus, decentralized and immutable. |
| 2 | Set your royalty terms | Define fork/remix terms, publish onchain — enforcement is automatic. |
| 3 | Earn forever | Every fork, paid like, remix → income, transparently, directly to wallet. |

**Step number chip:** `38×38px`, `border-radius: 11px`, indigo bg + border, lilac text, Bricolage Grotesque 800.

**Step hover:** Glass bg + glass border fade in on hover.

**Right — CTA Box:**
- Glass card, `border-radius: 30px`, `padding: 52px 44px`
- Indigo radial glow top-center (inside card, `::before` pseudo)
- Headline: `"Your content. Your rules. Forever."` — 3 lines, Bricolage 800
- Subtext: waitlist / early access copy
- Button: `"Get Early Access"` — full width, indigo pill
- Note: `"No seed phrase required · zkLogin via Google"` — 12px muted

---

### 6. Footer
- **Border-top:** `1px solid rgba(255,255,255,0.08)`
- **Padding:** `72px 24px 36px`
- **Max-width:** `1160px`, centered
- **Grid:** `2fr 1fr 1fr 1fr 1fr` → collapses at ≤900px

**Columns:**

| Column | Links |
|--------|-------|
| Brand (2fr) | Logo + tagline description |
| Product | Features, Pricing, Roadmap, Changelog |
| Developers | Docs, SDK, API, GitHub |
| Community | X/Twitter, Discord, Telegram, Blog |
| Legal | Privacy Policy, Terms of Use, Cookie Policy |

**Footer bottom bar:**
- Left: `"© 2025 WalTube. All rights reserved."` — 13px muted
- Right: `"🔵 Built on Sui & Walrus"` — pill badge, glass style

---

## Responsive Breakpoints

| Breakpoint | Changes |
|------------|---------|
| ≤900px | Hide nav links · Features → 2-col · How It Works → 1-col · Mockup → 2-col (hide 3rd card) · Footer → 2-col |
| ≤600px | Features → 1-col · Footer → 1-col · Hero mockup hidden |

---

## Button Specs

### Primary (Indigo)
```css
background: #6F00FF;
color: #fff;
padding: 15px 36px;
border-radius: 999px;
font-size: 15px;
font-weight: 600;
box-shadow: 0 0 32px rgba(111,0,255,0.45);
/* Shimmer: ::after pseudo with translateX slide on hover */
/* Hover: background #8B2FFF, shadow 0 0 52px rgba(111,0,255,0.72), translateY(-2px) */
```

### Ghost
```css
background: transparent;
border: 1px solid rgba(255,255,255,0.08);
color: #F0EEFF;
padding: 15px 36px;
border-radius: 999px;
backdrop-filter: blur(10px);
/* Hover: border rgba(111,0,255,0.5), background rgba(111,0,255,0.08), translateY(-2px) */
```

---

## Conversion Notes for Builder

- All glassmorphism needs `backdrop-filter` + `-webkit-backdrop-filter` for Safari support
- Marquee: duplicate each row's items exactly once for seamless CSS animation loop
- `IntersectionObserver` drives all `.reveal` → `.reveal.visible` transitions
- Nav scroll class toggled at `window.scrollY > 50`
- Hero elements animate in via JS `setTimeout` chain on page load (not IntersectionObserver)
- Film grain: SVG `feTurbulence` data URI as `body::after`, `position: fixed`, `z-index: 9999`, `pointer-events: none`
- The full working prototype is in `waltube-landing.html` — use it as pixel reference

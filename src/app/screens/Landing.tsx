import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Heart, Bookmark, GitFork, Copy } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

/* ─── Partners ─── */
const PARTNERS = [
  { src: '/supabase.png', name: 'Supabase' },
  { src: '/walruslogo.png', name: 'Walrus' },
  { src: '/Enoki.png', name: 'Enoki' },
  { src: '/suilogo.png', name: 'Sui' },
  { src: '/move.png', name: 'Move' },
];

/* ─── Feature data ─── */
const FEATURES = [
  {
    icon: '/likes.png',
    title: 'Per-Like Tipping',
    desc: 'Every like sends 0.01 SUI directly to the creator\'s wallet. Same tap, instant micropayment. No platform cut, no minimum, no payout cycle.',
  },
  {
    icon: '/workflow.png',
    title: 'Workflow Cards',
    desc: 'Interactive step-by-step AI tutorials. Prompt, model, input and output at each stage. Fork a workflow like you fork a prompt — owned onchain.',
  },
  {
    icon: '/forks.png',
    title: 'Fork Attribution',
    desc: 'Every fork writes an immutable record to Sui. The full remix tree is public and permanent. Cryptographic, not courtesy — it never expires.',
  },
  {
    icon: '/royalties.png',
    title: 'Smart Royalties',
    desc: 'Forked prompts automatically route earnings back through the attribution chain. Enforced by a Move contract, not a platform policy.',
  },
  {
    icon: '/storage.png',
    title: 'Decentralized Storage',
    desc: 'Media lives on Walrus — sharded across 100+ nodes. No single entity can delete it. Active creators keep content alive from $0.99/year.',
  },
  {
    icon: '/zk.png',
    title: 'zkLogin Onboarding',
    desc: 'Sign in with Google. A zero-knowledge proof derives a real Sui wallet in 45 seconds. No seed phrase, no extension, no crypto knowledge needed.',
  },
];

/* ─── Step data ─── */
const STEPS = [
  {
    n: '1',
    title: 'Sign up in seconds',
    body: 'Connect with Google via zkLogin — no seed phrases, no extensions. A real Sui wallet is derived behind the scenes. You\'re ready to post in under a minute.',
  },
  {
    n: '2',
    title: 'Post your AI content',
    body: 'Upload videos, prompts, or workflows. Everything is stored on Walrus — sharded across 100+ nodes, permanently onchain. No takedowns. No expiry.',
  },
  {
    n: '3',
    title: 'Earn forever',
    body: 'Every like is a micropayment. Every fork routes royalties back to you automatically via Move contract. Transparent, instant, and directly to your wallet.',
  },
];

/* ─── Footer columns ─── */
const FOOTER_LINKS = [
  {
    title: 'Product',
    links: ['Features', 'Pricing', 'Roadmap', 'Changelog'],
  },
  {
    title: 'Developers',
    links: ['Docs', 'SDK', 'API', 'GitHub'],
  },
  {
    title: 'Community',
    links: ['X / Twitter', 'Discord', 'Telegram', 'Blog'],
  },
  {
    title: 'Legal',
    links: ['Privacy Policy', 'Terms of Use', 'Cookie Policy'],
  },
];

/* ─── Scroll reveal hook ─── */
function useScrollReveal() {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.1 }
    );

    const els = document.querySelectorAll('.lp-reveal');
    els.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, []);
}

/* ─── Main Landing Component ─── */
export function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [navScrolled, setNavScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [activeVideo, setActiveVideo] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const video0Ref = useRef<HTMLVideoElement>(null);
  const video1Ref = useRef<HTMLVideoElement>(null);

  const ctaTarget = user ? '/feed' : '/auth';

  useScrollReveal();

  /* Nav scroll listener */
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Hero entrance animation */
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleVideoEnded = (idx: number) => {
    const next = idx === 0 ? 1 : 0;
    setActiveVideo(next);
    const nextRef = next === 0 ? video0Ref : video1Ref;
    void nextRef.current?.play();
  };

  return (
    <div className="landing-page">
      {/* Grain overlay */}
      <div className="lp-grain" aria-hidden="true" />

      {/* ── NAV ── */}
      <nav ref={navRef} className={`lp-nav ${navScrolled ? 'scrolled' : ''}`}>
        <div className="lp-nav-logo" onClick={() => scrollTo('hero')}>
          WalTube
        </div>
        <ul className="lp-nav-links">
          <li><a onClick={() => scrollTo('features')}>Features</a></li>
          <li><a onClick={() => scrollTo('stack')}>Stack</a></li>
          <li><a onClick={() => scrollTo('how')}>How it works</a></li>
        </ul>
        <button className="lp-nav-cta" onClick={() => navigate(ctaTarget)}>
          {user ? 'Go to Feed' : 'Get Started'}
        </button>
      </nav>

      {/* ── HERO ── */}
      <section id="hero" className="lp-hero">
        <div className="lp-glow-center" aria-hidden="true" />
        <div className="lp-glow-lilac" aria-hidden="true" />
        <div className="lp-glow-mesh" aria-hidden="true" />

        <div className={`lp-hero-entrance ${heroVisible ? 'visible' : ''}`}>
          <div className="lp-hero-badge">
            <span className="lp-badge-dot" />
            Now live on Sui × Walrus
          </div>
        </div>

        <h1 className={`lp-hero-h1 lp-hero-entrance ${heroVisible ? 'visible' : ''}`} style={{ transitionDelay: '180ms' }}>
          Monetize Your<br />AI Media Skills.
        </h1>

        <p className={`lp-hero-sub lp-hero-entrance ${heroVisible ? 'visible' : ''}`} style={{ transitionDelay: '360ms' }}>
          <b>Transparent.</b>&nbsp;&nbsp;Forever.&nbsp;&nbsp;<b>Onchain.</b>
        </p>

        <div className={`lp-hero-ctas lp-hero-entrance ${heroVisible ? 'visible' : ''}`} style={{ transitionDelay: '540ms' }}>
          <button className="lp-btn-primary" onClick={() => navigate(ctaTarget)}>
            {user ? 'Go to Feed' : 'Start Creating'}
          </button>
          <button className="lp-btn-ghost" onClick={() => scrollTo('features')}>
            See How It Works
          </button>
        </div>

        {/* TV with looping video */}
        <div className="lp-mockup lp-reveal">
          <div className="lp-tv-wrapper">
            <video
              ref={video0Ref}
              className={`lp-tv-video ${activeVideo === 0 ? 'lp-tv-active' : ''}`}
              autoPlay
              muted
              playsInline
              preload="auto"
              onEnded={() => handleVideoEnded(0)}
            >
              <source src="/landing-video.mp4" type="video/mp4" />
            </video>
            <video
              ref={video1Ref}
              className={`lp-tv-video ${activeVideo === 1 ? 'lp-tv-active' : ''}`}
              muted
              playsInline
              preload="auto"
              onEnded={() => handleVideoEnded(1)}
            >
              <source src="/landing-video-2.mp4" type="video/mp4" />
            </video>
            <img
              src="/hello.png"
              alt="WalTube TV"
              className="lp-tv-frame"
            />
          </div>
          <img
            src="/couch.png"
            alt="Walrus and Yeti watching TV"
            className="lp-couch-img"
          />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="lp-features">
        <div className="lp-features-inner">
          <div className="lp-eyebrow lp-reveal">Features</div>
          <h2 className="lp-section-h lp-reveal lp-d1">
            Everything you need.<br />Nothing you don't.
          </h2>
          <p className="lp-section-p lp-reveal lp-d2">
            Built for creators who take their work seriously enough to own it — permanently.
          </p>

          <div className="lp-feat-grid">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`lp-feat-card lp-reveal lp-d${(i % 3) + 1}`}
              >
                <div className="lp-feat-icon"><img src={f.icon} alt={f.title} /></div>
                <div className="lp-feat-title">{f.title}</div>
                <p className="lp-feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PARTNERS ── */}
      <section id="stack" className="lp-stack">
        <div className="lp-stack-label">Built On</div>
        <div className="lp-partner-track-wrap">
          <div className="lp-partner-track">
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <div key={`${p.name}-${i}`} className="lp-partner-card">
                <img src={p.src} alt={p.name} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS + CTA ── */}
      <section id="how" className="lp-how">
        <div className="lp-how-grid">
          <div>
            <div className="lp-eyebrow lp-reveal">How it works</div>
            <h2 className="lp-section-h lp-reveal lp-d1">
              Three steps to owning your content forever.
            </h2>
            <div className="lp-steps">
              {STEPS.map((step, i) => (
                <div key={step.n} className={`lp-step lp-reveal lp-d${i + 1}`}>
                  <div className="lp-step-n">{step.n}</div>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-prompt-card lp-reveal lp-d2">
            {/* Header */}
            <div className="lp-prompt-header">
              <div className="lp-prompt-user">
                <img src="/walrus.png" alt="@walrus.vid" className="lp-prompt-avatar" />
                <div>
                  <div className="lp-prompt-handle">@walrus.vid</div>
                  <div className="lp-prompt-time">2 hours ago</div>
                </div>
              </div>
              <button className="lp-prompt-follow">Follow</button>
            </div>

            {/* Media */}
            <div className="lp-prompt-media">
              <img src="/walrus.png" alt="Walrus mascot" />
              <div className="lp-prompt-model-badge">Walrus</div>
            </div>

            {/* Prompt Text */}
            <div className="lp-prompt-text-box">
              <p>Walrus Mascot wearing a television box that has two antennas. only the upperbody is visible</p>
            </div>

            {/* Tags */}
            <div className="lp-prompt-tags">
              <span>#aiart</span>
              <span>#mascot</span>
            </div>

            {/* Actions */}
            <div className="lp-prompt-actions">
              <button><Heart className="w-4 h-4" /> <span>42</span></button>
              <button><Bookmark className="w-4 h-4" /> <span>Save</span></button>
              <button><GitFork className="w-4 h-4" /> <span>Fork</span></button>
              <button className="lp-prompt-copy"><Copy className="w-4 h-4" /> <span>Copy</span></button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer-wrap">
        <div className="lp-footer-grid">
          <div className="lp-f-brand">
            <div className="lp-nav-logo" style={{ fontSize: 22 }}>WalTube</div>
            <p>
              Permanent AI video creation and monetization. Built on Sui and Walrus. Owned by creators, forever.
            </p>
          </div>
          {FOOTER_LINKS.map((col) => (
            <div key={col.title} className="lp-f-col">
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" onClick={(e) => e.preventDefault()}>{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="lp-footer-bottom">
          <p>© 2025 WalTube. All rights reserved.</p>
          <div className="lp-sui-badge">🔵 Built on Sui & Walrus</div>
        </div>
      </footer>
    </div>
  );
}

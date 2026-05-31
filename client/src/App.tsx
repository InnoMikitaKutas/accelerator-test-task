import { useState } from 'react';

/**
 * TEMPORARY design-token swatch page (Phase 0.2 verify: "renders the palette in
 * light + dark"). Replaced by the router + App Shell in Phase 2. Kept intentionally
 * dependency-free (no store yet — that arrives in 1.7).
 */

type Theme = 'light' | 'dark';

const NEUTRALS = [
  '--bg',
  '--surface',
  '--surface-sunken',
  '--line',
  '--line-strong',
  '--ink',
  '--ink-2',
  '--ink-3',
] as const;

const SEMANTICS = ['--go', '--pending', '--foul', '--info', '--hazard'] as const;
const BRAND = ['--brand', '--brand-text', '--brand-line'] as const;

function Swatch({ token }: { token: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' }}>
      <div
        style={{
          width: 80,
          height: 48,
          background: `var(${token})`,
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
        }}
      />
      <span className="u-mono" style={{ color: 'var(--ink-3)', fontSize: 11 }}>
        {token}
      </span>
    </div>
  );
}

function Row({ title, tokens }: { title: string; tokens: readonly string[] }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <h2 className="u-label">{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        {tokens.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('light');

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
  };

  return (
    <main
      style={{
        maxWidth: 'var(--content-max)',
        margin: '0 auto',
        padding: 'var(--sp-9) var(--sp-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-9)',
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        <p className="u-label" style={{ color: 'var(--brand-text)' }}>
          Cinder &amp; Chalk · Design Tokens
        </p>
        <h1 className="u-display-xl">Training Platform</h1>
        <p style={{ color: 'var(--ink-2)', maxWidth: '52ch' }}>
          Athletic performance editorial. Fixed graphite/chalk neutrals; the brand accent is a runtime
          variable (per-trainer theming, FR-037).
        </p>
        <button
          type="button"
          onClick={toggle}
          style={{
            alignSelf: 'flex-start',
            marginTop: 'var(--sp-2)',
            padding: 'var(--sp-2) var(--sp-4)',
            background: 'var(--brand)',
            color: 'var(--brand-ink)',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontWeight: 600,
          }}
        >
          Theme: {theme} — toggle
        </button>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        <h2 className="u-label">Type scale</h2>
        <div className="u-display-xl">Display XL — masthead</div>
        <div className="u-display-l">Display L — section header</div>
        <div className="u-stat">48:00</div>
        <h1>Heading 1</h1>
        <h2>Heading 2</h2>
        <h3>Heading 3</h3>
        <p className="u-body">Body — the UI default at 15px, set in Archivo.</p>
        <p className="u-mono">MONO · 7H3K-9F2A · 2026-05-31T14:00:00Z</p>
      </section>

      <Row title="Neutrals" tokens={NEUTRALS} />
      <Row title="Semantic" tokens={SEMANTICS} />
      <Row title="Brand (Cinder default)" tokens={BRAND} />
    </main>
  );
}

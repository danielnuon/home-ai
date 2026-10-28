/**
 * @file The frame every page shares: a title, an optional line under it, and its sections.
 */
import type { ReactNode } from "react";
import { useEffect } from "react";

interface PageProps {
  title: string;
  subtitle?: ReactNode;
  /** Controls on the right of the title, such as a filter. */
  actions?: ReactNode;
  children: ReactNode;
}

/** A page with its heading. Also sets the document title so tabs and history read well. */
export function Page({ title, subtitle, actions, children }: PageProps) {
  useEffect(() => {
    document.title = `${title} · Brain`;
  }, [title]);
  return (
    <div className="page stack" style={{ ["--gap" as string]: "var(--space-6)" }}>
      <header className="page-head">
        <div className="grow stack" style={{ ["--gap" as string]: "var(--space-1)" }}>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

interface SectionProps {
  title: string;
  /** Short text on the right of the heading, such as a count. */
  aside?: ReactNode;
  children: ReactNode;
}

/** A titled group of content within a page. */
export function Section({ title, aside, children }: SectionProps) {
  return (
    <section className="stack" aria-label={title}>
      <div className="section-head">
        <h2>{title}</h2>
        {aside && <span className="muted small">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

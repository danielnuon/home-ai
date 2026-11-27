/**
 * @file The frame every page shares: a title, an optional line under it, and its sections.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBackTarget } from "../shell/trail";

interface PageProps {
  title: string;
  subtitle?: ReactNode;
  /** Controls on the right of the title, such as a filter. */
  actions?: ReactNode;
  children: ReactNode;
}

/** Back to the page this one was opened from, named after it; nothing when there is none. */
function BackButton() {
  const target = useBackTarget();
  const navigate = useNavigate();
  if (!target) return null;
  return (
    <div className="back-row">
      <button type="button" className="back-button" onClick={() => navigate(-target.steps)}>
        <ChevronLeft size={20} aria-hidden="true" />
        <span className="visually-hidden">Back to</span> {target.label}
      </button>
    </div>
  );
}

/** A page with its heading. Also sets the document title so tabs and history read well. */
export function Page({ title, subtitle, actions, children }: PageProps) {
  useEffect(() => {
    document.title = `${title} · Brain`;
  }, [title]);
  return (
    <div className="page stack" style={{ ["--gap" as string]: "var(--space-6)" }}>
      <header className="page-head">
        <BackButton />
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
  /**
   * Where the whole heading goes when pressed, with the page's name as its cue. A heading that
   * leads somewhere is one pressable bar, never a small text link beside it (spec 7.16, rule 13).
   */
  to?: { path: string; label: string };
  children: ReactNode;
}

/** A titled group of content within a page. */
export function Section({ title, aside, to, children }: SectionProps) {
  const head = to ? (
    <Link to={to.path} className="section-head section-link">
      <h2>{title}</h2>
      <span className="section-cue">
        {to.label}
        <ChevronRight size={16} aria-hidden="true" />
      </span>
    </Link>
  ) : (
    <div className="section-head">
      <h2>{title}</h2>
      {aside && <span className="muted small">{aside}</span>}
    </div>
  );
  return (
    <section className="stack" aria-label={title}>
      {head}
      {children}
    </section>
  );
}

/**
 * @file Personal: the household's cases, what falls due, the domains and their records, the
 * rules made from corrections, past briefs, connector sync and the onboarding checklist
 * (spec 7.2, Personal; design: Personal).
 *
 * Each section is its own module under `personal/`; this page only puts them in order.
 */
import { usePersonal } from "../api/queries";
import { Page } from "../components/Page";
import { QueryState } from "../components/QueryState";
import {
  BriefsSection,
  ChangesSection,
  ChecklistSection,
  DomainsSection,
  SyncSection,
} from "./personal/Archive";
import { CalendarSection } from "./personal/Calendar";
import { CasesSection } from "./personal/Cases";
import { RulesSection } from "./personal/Rules";

/** The Personal page. */
export default function Personal() {
  const query = usePersonal();
  return (
    <Page title="Personal" subtitle="Your household's errands, appointments and paperwork.">
      <QueryState query={query}>
        {(overview) => (
          <>
            <ChecklistSection items={overview.checklist} />
            <CasesSection overview={overview} />
            <CalendarSection overview={overview} />
            <DomainsSection overview={overview} />
            <BriefsSection overview={overview} />
            <RulesSection rules={overview.rules} />
            <SyncSection overview={overview} />
            <ChangesSection overview={overview} />
          </>
        )}
      </QueryState>
    </Page>
  );
}

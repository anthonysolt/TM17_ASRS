import { notFound } from 'next/navigation';
import { isInitiativeReportsSlug } from '@/lib/initiative-slug';
import InitiativeReportsView from './InitiativeReportsView';

// Public report page for a single initiative, e.g. /youth-mentoring_reports.
// The initiative is resolved on the client against the live initiative list.
export default async function InitiativeReportsPage({ params }) {
  const { initiativeReports } = await params;
  const slug = decodeURIComponent(initiativeReports || '');
  if (!isInitiativeReportsSlug(slug)) notFound();

  return <InitiativeReportsView slug={slug} />;
}

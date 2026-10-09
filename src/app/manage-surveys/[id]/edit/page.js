import { redirect } from 'next/navigation';

/**
 * Keep a stable, survey-specific edit URL while rendering the same builder used
 * for form creation. The builder switches to edit mode from the query value.
 */
export default async function EditSurveyPage({ params }) {
  const { id } = await params;
  redirect(`/form-creation?edit=${encodeURIComponent(id)}`);
}

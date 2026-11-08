import { redirect } from 'next/navigation';
import { getFormBuilderEditPath } from '@/lib/forms/form-editing-client';

/**
 * Keep a stable, survey-specific edit URL (bookmarks, old links) by redirecting
 * to the form builder in edit mode. In-app buttons link to the builder
 * directly via getFormBuilderEditPath to avoid this redirect hop.
 */
export default async function EditSurveyPage({ params }) {
  const { id } = await params;
  redirect(getFormBuilderEditPath(id));
}

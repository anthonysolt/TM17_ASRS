import { describe, expect, test } from 'vitest';
import { getEditTemplateUrl, templateToEditableForm } from './form-editing-client';

describe('form editing client mapping', () => {
  test('maps a versioned template into the form builder model', () => {
    const model = templateToEditableForm({
      title: 'Feedback',
      description: 'Description',
      initiative_id: 4,
      questions: [{
        id: 12,
        text: {
          field_key: 'first_name',
          question: 'First Name',
          type: 'text',
          required: true,
        },
      }],
    }, [{ field_key: 'first_name' }]);

    expect(model).toMatchObject({
      title: 'Feedback',
      description: 'Description',
      initiativeId: '4',
    });
    expect(model.questions[0]).toMatchObject({
      field_id: 12,
      field_key: 'first_name',
      field_label: 'First Name',
      _locked: true,
    });
  });

  test('encodes the template identifier in the API URL', () => {
    expect(getEditTemplateUrl('12/3')).toBe('/api/surveys/templates/12%2F3');
  });
});

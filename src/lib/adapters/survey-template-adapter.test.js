import { toSurveyTemplateViewModel } from '@/lib/adapters/survey-template-adapter';

describe('survey-template-adapter', () => {
  test('normalizes nested template question format', () => {
    const vm = toSurveyTemplateViewModel({
      id: 5,
      title: 'Template',
      description: 'desc',
      published: 1,
      questions: [
        {
          id: 9,
          text: {
            question: 'How are you?',
            type: 'choice',
            required: false,
            options: ['Good', 'Bad'],
            help_text: 'Pick one',
          },
        },
      ],
    });

    expect(vm.questions[0]).toEqual({
      id: 9,
      label: 'How are you?',
      type: 'choice',
      required: false,
      options: ['Good', 'Bad'],
      helpText: 'Pick one',
      scope: null,
      initiative_id: null,
      validation_rules: null,
    });
  });
});

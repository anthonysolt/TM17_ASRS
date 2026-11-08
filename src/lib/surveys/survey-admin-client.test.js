const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch: (...args) => apiFetchMock(...args) }));

import {
  deleteSubmissions,
  fetchResponseCounts,
  responseCountFor,
  deleteSurveyTemplate,
  getSurveyPreviewUrl,
} from '@/lib/surveys/survey-admin-client';

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
const htmlResponse = (status) => ({ ok: false, status, json: () => Promise.reject(new SyntaxError('Unexpected token <')) });

describe('survey-admin-client', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  test('deleteSubmissions splits successes from failures and never throws', async () => {
    apiFetchMock.mockImplementation((url) => {
      if (url.endsWith('=1')) return Promise.resolve(jsonResponse(200, { success: true }));
      if (url.endsWith('=2')) return Promise.resolve(jsonResponse(500, { error: 'database is down' }));
      if (url.endsWith('=3')) return Promise.resolve(htmlResponse(404));
      return Promise.reject(new Error('network unreachable'));
    });

    const result = await deleteSubmissions([1, 2, 3, 4]);

    expect(result.deleted).toEqual([1]);
    expect(result.failed).toEqual([
      { id: 2, error: 'database is down' },
      { id: 3, error: 'Failed to delete submission' },
      { id: 4, error: 'network unreachable' },
    ]);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/surveys?surveyId=1', { method: 'DELETE' });
  });

  test('deleteSurveyTemplate throws with the server message', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Forbidden' }));
    await expect(deleteSurveyTemplate(5)).rejects.toThrow('Forbidden');
    apiFetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
    await expect(deleteSurveyTemplate(5)).resolves.toEqual({ success: true });
  });

  test('getSurveyPreviewUrl uses the survey QR code link, else the plain survey link', () => {
    const qrCodes = [
      { qrType: 'report', targetId: 7, targetUrl: '/wrong' },
      { qrType: 'survey_template', targetId: '7', targetUrl: '/survey?qr=abc&template=7' },
    ];
    expect(getSurveyPreviewUrl(qrCodes, 7)).toBe('/survey?qr=abc&template=7');
    expect(getSurveyPreviewUrl(qrCodes, 8)).toBe('/survey?template=8');
    expect(getSurveyPreviewUrl(null, 'a b')).toBe('/survey?template=a%20b');
  });

  test('responseCountFor reads a counts map by string or number id', () => {
    const counts = { 7: 3, 8: 0 };
    expect(responseCountFor(counts, '7')).toBe(3);
    expect(responseCountFor(counts, 7)).toBe(3);
    expect(responseCountFor(counts, 9)).toBe(0);
    expect(responseCountFor(undefined, 7)).toBe(0);
  });

  test('fetchResponseCounts calls the counts endpoint and surfaces server errors', async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(200, { counts: { 7: 3 }, total: 3 }));
    await expect(fetchResponseCounts()).resolves.toEqual({ counts: { 7: 3 }, total: 3 });
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/surveys/counts');

    apiFetchMock.mockResolvedValueOnce(jsonResponse(200, { counts: {}, total: 0 }));
    await fetchResponseCounts(12);
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/surveys/counts?initiativeId=12');

    apiFetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Forbidden' }));
    await expect(fetchResponseCounts()).rejects.toThrow('Forbidden');
  });
});

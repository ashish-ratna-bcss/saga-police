import { AlertService } from './alertService';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

describe('AlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('list forwards params and axios config', () => {
    const signal = {};
    AlertService.list({ status: 'active', limit: 20 }, { signal });
    expect(api.get).toHaveBeenCalledWith('/alerts', {
      params: { status: 'active', limit: 20 },
      signal,
    });
  });

  test('update hits /alerts/:id', () => {
    AlertService.update('abc', { status: 'escalated' });
    expect(api.put).toHaveBeenCalledWith('/alerts/abc', { status: 'escalated' });
  });

  test('changeCategory uses change-category endpoint', () => {
    AlertService.changeCategory('abc', 'Hate_Speech');
    expect(api.put).toHaveBeenCalledWith('/alerts/abc/change-category', {
      category: 'Hate_Speech',
    });
  });

  test('bulk / investigate / translate preserve bodies', () => {
    AlertService.bulk(['a', 'b']);
    expect(api.post).toHaveBeenCalledWith('/alerts/bulk', { ids: ['a', 'b'] });

    AlertService.investigate('https://x.com/a/1');
    expect(api.post).toHaveBeenCalledWith('/alerts/investigate', {
      url: 'https://x.com/a/1',
    });

    AlertService.translate('hello');
    expect(api.post).toHaveBeenCalledWith('/alerts/translate', { text: 'hello' });
  });

  test('getWorkflowKpi forwards axios config for csv export', () => {
    AlertService.getWorkflowKpi(
      { start: '2026-01-01', end: '2026-01-02', format: 'csv' },
      { responseType: 'blob' }
    );
    expect(api.get).toHaveBeenCalledWith('/alerts/workflow-kpi', {
      params: { start: '2026-01-01', end: '2026-01-02', format: 'csv' },
      responseType: 'blob',
    });
  });
});

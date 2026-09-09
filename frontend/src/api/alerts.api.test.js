import { AlertService } from './alerts.api';
import apiHandler from './apiHandler';

jest.mock('./apiHandler', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('AlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('list forwards params and axios config', () => {
    const signal = {};
    AlertService.list({ status: 'active', limit: 20 }, { signal });
    expect(apiHandler.get).toHaveBeenCalledWith('/alerts', {
      params: { store: 'catalog', status: 'active', limit: 20 },
      signal,
    });
  });

  test('update hits /alerts/:id', () => {
    AlertService.update('abc', { status: 'escalated' });
    expect(apiHandler.put).toHaveBeenCalledWith(
      '/alerts/abc',
      { store: 'catalog', status: 'escalated' },
      { params: { store: 'catalog' } }
    );
  });

  test('changeCategory uses change-category endpoint', () => {
    AlertService.changeCategory('abc', 'Hate_Speech');
    expect(apiHandler.put).toHaveBeenCalledWith('/alerts/abc/change-category', {
      category: 'Hate_Speech',
    });
  });

  test('bulk / investigate / translate preserve bodies', () => {
    AlertService.bulk(['a', 'b']);
    expect(apiHandler.post).toHaveBeenCalledWith(
      '/alerts/bulk',
      { store: 'catalog', ids: ['a', 'b'] },
      { params: { store: 'catalog' } }
    );

    AlertService.investigate('https://x.com/a/1');
    expect(apiHandler.post).toHaveBeenCalledWith('/alerts/investigate', {
      url: 'https://x.com/a/1',
    });

    AlertService.translate('hello');
    expect(apiHandler.post).toHaveBeenCalledWith('/alerts/translate', { text: 'hello' });
  });

  test('getWorkflowKpi forwards axios config for csv export', () => {
    AlertService.getWorkflowKpi(
      { start: '2026-01-01', end: '2026-01-02', format: 'csv' },
      { responseType: 'blob' }
    );
    expect(apiHandler.get).toHaveBeenCalledWith('/alerts/workflow-kpi', {
      params: { store: 'catalog', start: '2026-01-01', end: '2026-01-02', format: 'csv' },
      responseType: 'blob',
    });
  });
});

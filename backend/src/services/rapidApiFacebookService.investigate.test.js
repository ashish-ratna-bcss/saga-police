const assert = require('assert');
const {
  postMatchesTarget
} = require('./rapidApiFacebookService');

const targetUrl = 'https://www.facebook.com/Sreenivastekumatla/posts/pfbid02LnRd8kKFNy4iYMyrkC1bLbVvX12UTQvWx4KWCYGEDnNWbdpSW2bKTT2sio5fyCvRl';

assert.strictEqual(
  postMatchesTarget(
    { id: 'pfbid02LnRd8kKFNy4iYMyrkC1bLbVvX12UTQvWx4KWCYGEDnNWbdpSW2bKTT2sio5fyCvRl', url: targetUrl, text: 'Telugu caption' },
    targetUrl,
    'pfbid02LnRd8kKFNy4iYMyrkC1bLbVvX12UTQvWx4KWCYGEDnNWbdpSW2bKTT2sio5fyCvRl'
  ),
  true,
  'matching pfbid post should be accepted'
);

assert.strictEqual(
  postMatchesTarget(
    { id: '999', url: 'https://www.facebook.com/other/posts/pfbidOTHERPOST', text: 'wrong post' },
    'https://www.facebook.com/share/p/1EaP2MtgCS/',
    '1EaP2MtgCS'
  ),
  false,
  'unrelated post must not match share URL investigation'
);

assert.strictEqual(
  postMatchesTarget(
    { id: '123456789012345', url: 'https://www.facebook.com/page/posts/123456789012345', text: 'ok' },
    'https://www.facebook.com/page/posts/123456789012345',
    '123456789012345'
  ),
  true,
  'numeric post id should match'
);

assert.strictEqual(
  postMatchesTarget(
    { id: '1EaP2MtgCS', url: 'https://www.facebook.com/other/posts/1EaP2MtgCS', text: 'wrong post' },
    'https://www.facebook.com/share/p/1EaP2MtgCS/',
    '1EaP2MtgCS'
  ),
  false,
  'share token id alone must not match unrelated post URL'
);

console.log('rapidApiFacebookService.investigate.test.js: all tests passed');

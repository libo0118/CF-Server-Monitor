import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNotificationSummary, buildNotificationHtmlCard } from '../src/services/notificationCard.js';
import { buildResourceAlertNotificationPayloads, sendNotification } from '../src/services/notification.js';

test('buildNotificationSummary generates concise, non-emoji preview titles for all 8 events', () => {
  assert.equal(
    buildNotificationSummary({ eventKind: 'offline', items: [{ name: '极空间-虚拟机' }], count: 1 }),
    '极空间-虚拟机 已离线'
  );
  assert.equal(
    buildNotificationSummary({ eventKind: 'offline', items: [{ name: '极空间-虚拟机' }, { name: 'Oci-春城' }], count: 2 }),
    '极空间-虚拟机 等2台离线'
  );
  assert.equal(
    buildNotificationSummary({ eventKind: 'recovered', items: [{ name: '极空间-虚拟机' }], count: 1 }),
    '极空间-虚拟机 已上线'
  );
  assert.equal(
    buildNotificationSummary({
      eventKind: 'resource_alert',
      items: [{ name: '阿里云-北京', metrics: [{ metric: 'ram', rawValue: 92.4, valueText: '92.4%' }] }],
      count: 1
    }),
    '阿里云-北京 内存92%'
  );
  assert.equal(
    buildNotificationSummary({
      eventKind: 'resource_alert',
      items: [{
        name: 'Oci-春城',
        metrics: [
          { metric: 'cpu', rawValue: 91.2, valueText: '91.2%' },
          { metric: 'ram', rawValue: 88.1, valueText: '88.1%' }
        ]
      }],
      count: 1
    }),
    'Oci-春城 CPU91%/内存88%'
  );
  assert.equal(
    buildNotificationSummary({
      eventKind: 'resource_recovered',
      items: [{ name: '阿里云-北京', metrics: [{ metric: 'ram', rawValue: 68.2, valueText: '68.2%' }] }],
      count: 1
    }),
    '阿里云-北京 内存恢复68%'
  );
  assert.equal(
    buildNotificationSummary({
      eventKind: 'traffic_alert',
      items: [{ name: 'Oci-春城', metrics: [{ metric: 'traffic', rawValue: 85.4, valueText: '85.4%' }] }],
      count: 1
    }),
    'Oci-春城 月流量85%'
  );
  assert.equal(
    buildNotificationSummary({ eventKind: 'expiring', items: [{ name: '阿里云-北京', days: 3 }], count: 1 }),
    '阿里云-北京 剩3天到期'
  );
  assert.equal(
    buildNotificationSummary({ eventKind: 'renewed', items: [{ name: '阿里云-北京' }], count: 1 }),
    '阿里云-北京 已自动续费'
  );
  assert.equal(
    buildNotificationSummary({ eventKind: 'test', items: [{ name: '推送通道连通测试' }], count: 1 }),
    '告警通知测试正常'
  );
});

test('buildNotificationHtmlCard renders inline progress bars and escapes HTML safely', () => {
  const html = buildNotificationHtmlCard({
    eventKind: 'resource_alert',
    event: '资源负载告警',
    count: 1,
    time: '2026/11/24 18:10:00',
    items: [{
      name: '<script>alert(1)</script>',
      group: 'Home',
      region: 'CN',
      statusLabel: '超阈值',
      metrics: [{
        metric: 'disk',
        label: '磁盘',
        rawValue: 88.2,
        valueText: '88.2%',
        percent: 88.2,
        thresholdText: '阈值 ≥ 85%（5分钟均值）'
      }]
    }]
  });
  assert.doesNotMatch(html, /\n/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Home · CN/);
  assert.match(html, /width:88%/);
  assert.match(html, /阈值 ≥ 85%（5分钟均值）/);
  assert.match(html, /超阈值/);
});

test('sendNotification renders valid JSON webhook payload with {{summary}} and {{html_card}}', async t => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response('{"code":200}', { status: 200 });
  });

  const [payload] = buildResourceAlertNotificationPayloads(
    [{
      rule: { intervalMinutes: 5, mode: 'average' },
      server: { name: '阿里云-北京', server_group: 'Aliyun', region: 'CN' },
      alert: { metrics: [{ metric: 'ram', threshold: 90, current: 92.4, triggerValue: 92.4 }] }
    }],
    [],
    { notification_language: 'zh', notification_timezone: 'Asia/Shanghai' }
  );

  const err = await sendNotification({
    notification_webhook_enabled: 'true',
    notification_webhook_url: 'https://www.pushplus.plus/send',
    notification_webhook_method: 'POST',
    notification_webhook_format: 'json',
    notification_timezone: 'Asia/Shanghai',
    notification_language: 'zh',
    notification_webhook_body: JSON.stringify({
      token: 'demo-token',
      title: '{{summary}}',
      content: "<div style='max-width:560px'>{{html_card}}</div>",
      template: 'html'
    })
  }, payload.msg, payload.context);

  assert.equal(err, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].title, '阿里云-北京 内存92%');
  assert.equal(requests[0].template, 'html');
  assert.match(requests[0].content, /Aliyun · CN/);
  assert.match(requests[0].content, /width:92%/);
});

test('buildNotificationSummary falls back cleanly when eventKind is absent', () => {
  assert.equal(
    buildNotificationSummary({ event: '节点离线告警', clients: 'Fedora-8.102', count: 1 }),
    'Fedora-8.102 节点离线告警'
  );
  const html = buildNotificationHtmlCard({
    event: '系统提醒',
    client: 'CF Server Monitor',
    message: '测试第一行\n测试第二行',
    time: '2026/11/24 18:10:00'
  });
  assert.match(html, /测试第一行/);
  assert.match(html, /测试第二行/);
});

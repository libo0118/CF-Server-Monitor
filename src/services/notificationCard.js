const COMPACT_METRIC_LABELS = {
  cpu: 'CPU',
  ram: '内存',
  disk: '磁盘',
  netIn: '下行',
  netOut: '上行',
  netTotal: '总网速',
  tcpConn: 'TCP',
  udpConn: 'UDP',
  traffic: '流量'
};

const FULL_METRIC_LABELS = {
  cpu: 'CPU 使用率',
  ram: '内存使用率',
  disk: '磁盘使用率',
  netIn: '下行网速',
  netOut: '上行网速',
  netTotal: '总网速',
  tcpConn: 'TCP 连接数',
  udpConn: 'UDP 连接数',
  traffic: '月流量使用'
};

const PALETTES = {
  danger: { color: '#dc2626' },
  success: { color: '#16a34a' },
  warning: { color: '#d97706' },
  info: { color: '#374151' }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compactMetricLabel(metric) {
  return COMPACT_METRIC_LABELS[metric] || String(metric || '负载');
}

function fullMetricLabel(metric, fallback) {
  return FULL_METRIC_LABELS[metric] || fallback || compactMetricLabel(metric);
}

function compactMetricValue(metric, rawValue, fallbackText) {
  const num = Number(rawValue);
  if (metric === 'cpu' || metric === 'ram' || metric === 'disk' || metric === 'traffic') {
    if (Number.isFinite(num)) {
      return `${num >= 10 ? Math.round(num) : Number(num.toFixed(1))}%`;
    }
  } else if (metric === 'netIn' || metric === 'netOut' || metric === 'netTotal') {
    if (Number.isFinite(num)) {
      const mbps = (num * 8) / 1000 / 1000;
      if (mbps <= 0) return '0M';
      return `${mbps >= 10 ? Math.round(mbps) : Number(mbps.toFixed(1))}M`;
    }
  } else if (metric === 'tcpConn' || metric === 'udpConn') {
    if (Number.isFinite(num)) return String(Math.round(num));
  }
  return String(fallbackText || '').replace(/\s+/g, '').trim();
}

function getEventPalette(eventKind) {
  if (eventKind === 'offline' || eventKind === 'resource_alert') {
    return {
      ...PALETTES.danger,
      statusBadge: eventKind === 'offline' ? '已离线' : '资源告警'
    };
  }
  if (eventKind === 'recovered' || eventKind === 'resource_recovered' || eventKind === 'renewed') {
    const statusBadge = eventKind === 'recovered'
      ? '已上线'
      : (eventKind === 'renewed' ? '已自动续费' : '已恢复');
    return { ...PALETTES.success, statusBadge };
  }
  if (eventKind === 'traffic_alert' || eventKind === 'expiring') {
    return {
      ...PALETTES.warning,
      statusBadge: eventKind === 'traffic_alert' ? '流量超限' : '即将到期'
    };
  }
  return {
    ...PALETTES.info,
    statusBadge: eventKind === 'test' ? '正常' : '状态通知'
  };
}

function normalizeClientNames(context = {}) {
  const items = Array.isArray(context.items) ? context.items : [];
  const fromItems = items.map(item => String(item?.name || '').trim()).filter(Boolean);
  if (fromItems.length > 0) return fromItems;
  const raw = Array.isArray(context.clients) ? context.clients.join(',') : (context.clients || context.client || '');
  return String(raw).split(',').map(item => item.trim()).filter(Boolean);
}

export function buildNotificationSummary(context = {}, _settings = {}) {
  const eventKind = String(context.eventKind || context.event_kind || '').trim();
  const items = Array.isArray(context.items) ? context.items : [];
  const clients = normalizeClientNames(context);
  const first = clients[0] || '服务器';
  const count = Number(context.count) > 0 ? Number(context.count) : (clients.length || 1);

  if (eventKind === 'offline') {
    return count > 1 ? `${first} 等${count}台离线` : `${first} 已离线`;
  }
  if (eventKind === 'recovered') {
    return count > 1 ? `${first} 等${count}台上线` : `${first} 已上线`;
  }
  if (eventKind === 'resource_alert') {
    if (count > 1 || items.length > 1) return `${first} 等${count}台负载高`;
    const metrics = Array.isArray(items[0]?.metrics) ? items[0].metrics : [];
    if (metrics.length === 0) return `${first} 资源负载高`;
    if (metrics.length === 1) {
      const m = metrics[0];
      return `${first} ${compactMetricLabel(m.metric)}${compactMetricValue(m.metric, m.rawValue, m.valueText)}`;
    }
    const pair = metrics.slice(0, 2)
      .map(m => `${compactMetricLabel(m.metric)}${compactMetricValue(m.metric, m.rawValue, m.valueText)}`)
      .join('/');
    const candidate = `${first} ${pair}`;
    return metrics.length === 2 && candidate.length <= 20 ? candidate : `${first} ${metrics.length}项负载高`;
  }
  if (eventKind === 'resource_recovered') {
    if (count > 1 || items.length > 1) return `${first} 等${count}台已恢复`;
    const metrics = Array.isArray(items[0]?.metrics) ? items[0].metrics : [];
    if (metrics.length === 1) {
      const m = metrics[0];
      const lbl = compactMetricLabel(m.metric);
      const cand = `${first} ${lbl}恢复${compactMetricValue(m.metric, m.rawValue, m.valueText)}`;
      return cand.length <= 18 ? cand : `${first} ${lbl}已恢复`;
    }
    return `${first} 负载已恢复`;
  }
  if (eventKind === 'traffic_alert') {
    if (count > 1 || items.length > 1) return `${first} 等${count}台流量高`;
    const m = items[0]?.metrics?.[0];
    const val = m ? compactMetricValue('traffic', m.rawValue, m.valueText) : '';
    return val ? `${first} 月流量${val}` : `${first} 月流量超限`;
  }
  if (eventKind === 'expiring') {
    if (count > 1 || items.length > 1) return `${first} 等${count}台即将到期`;
    const days = Number(items[0]?.days);
    return Number.isFinite(days) && days > 0 ? `${first} 剩${days}天到期` : `${first} 即将到期`;
  }
  if (eventKind === 'renewed') {
    return count > 1 || items.length > 1 ? `${first} 等${count}台已续费` : `${first} 已自动续费`;
  }
  if (eventKind === 'test') return '告警通知测试正常';
  const cleanEvent = String(context.event || '').replace(/【[^】]*】/g, '').replace(/^[\s✅⚠️❌ℹ️📈•-]+/u, '').trim() || '状态通知';
  const hasRealClient = Boolean(first && first !== 'CF Server Monitor' && first !== '服务器');
  if (hasRealClient) return count > 1 ? `${first} 等${count}台${cleanEvent}` : `${first} ${cleanEvent}`;
  return cleanEvent;
}

function renderMetricBlock(metric, palette) {
  const label = escapeHtml(fullMetricLabel(metric.metric, metric.label));
  const valueText = escapeHtml(metric.valueText || '');
  const pct = Number(metric.percent);
  const hasBar = metric.percent !== null && metric.percent !== undefined && Number.isFinite(pct);
  const clamped = hasBar ? Math.max(2, Math.min(100, Math.round(pct))) : 0;
  const barHtml = hasBar
    ? `<div style='height:4px;width:100%;background:#f3f4f6;border-radius:2px;overflow:hidden;margin-top:5px;'><div style='height:4px;width:${clamped}%;background:${palette.color};border-radius:2px;'></div></div>`
    : '';
  const thresholdHtml = metric.thresholdText
    ? `<div style='margin-top:4px;font-size:12px;color:#6b7280;'>${escapeHtml(metric.thresholdText)}</div>`
    : '';
  return `<div style='margin-top:8px;'><table style='width:100%;border-collapse:collapse;'><tr><td style='font-size:13px;color:#374151;padding:0;'>${label}</td><td style='font-size:14px;font-weight:600;color:${palette.color};text-align:right;padding:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'>${valueText}</td></tr></table>${barHtml}${thresholdHtml}</div>`;
}

function renderRowsTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const trs = rows.map(row => `<tr><td style='width:72px;font-size:13px;color:#6b7280;padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap;'>${escapeHtml(row.label)}</td><td style='font-size:13px;color:#111827;padding:2px 0;word-break:break-word;'>${escapeHtml(row.value)}</td></tr>`).join('');
  return `<table style='width:100%;border-collapse:collapse;margin-top:6px;'>${trs}</table>`;
}

function fallbackCardItems(context, palette) {
  const lines = String(context.message || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [{ name: context.client || '服务器状态通知', statusLabel: palette.statusBadge, rows: [{ label: '详情', value: context.event || '通知' }] }];
  }
  return lines.map(line => ({ name: context.event || '通知明细', statusLabel: palette.statusBadge, rows: [{ label: '内容', value: line }] }));
}

export function buildNotificationHtmlCard(context = {}, _settings = {}) {
  const eventKind = String(context.eventKind || context.event_kind || '').trim();
  const palette = getEventPalette(eventKind);
  const event = String(context.event || '状态通知');
  const time = String(context.time || '');
  const rawItems = Array.isArray(context.items) && context.items.length > 0 ? context.items : fallbackCardItems(context, palette);
  const count = Number(context.count) > 0 ? Number(context.count) : rawItems.length;
  const countText = count > 1 ? `<span style='color:#6b7280;font-weight:400;'> · ${count} 台</span>` : '';

  const headerRow = `<table style='width:100%;border-collapse:collapse;border-bottom:1px solid #e5e7eb;'><tr><td style='padding:0 0 8px 0;font-size:13px;color:#374151;vertical-align:middle;'><span style='display:inline-block;width:7px;height:7px;border-radius:50%;background:${palette.color};vertical-align:middle;margin-right:7px;'></span><span style='vertical-align:middle;font-weight:600;'>${escapeHtml(event)}</span>${countText}</td><td style='padding:0 0 8px 0;font-size:12px;color:#6b7280;text-align:right;vertical-align:middle;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;'>${escapeHtml(time)}</td></tr></table>`;

  const itemsHtml = rawItems.map((item, idx) => {
    const meta = [item.group, item.region].filter(Boolean).join(' / ');
    const metaHtml = meta ? `<span style='margin-left:8px;font-size:12px;font-weight:400;color:#6b7280;'>${escapeHtml(meta)}</span>` : '';
    const statusText = escapeHtml(item.statusLabel || palette.statusBadge);
    const metricsHtml = Array.isArray(item.metrics) ? item.metrics.map(m => renderMetricBlock(m, palette)).join('') : '';
    const rowsHtml = renderRowsTable(item.rows);
    const borderBottom = idx === rawItems.length - 1 ? '' : 'border-bottom:1px solid #f3f4f6;';
    return `<div style='padding:12px 0;${borderBottom}'><table style='width:100%;border-collapse:collapse;'><tr><td style='padding:0;vertical-align:baseline;'><span style='font-size:15px;font-weight:600;color:#111827;'>${escapeHtml(item.name || '服务器')}</span>${metaHtml}</td><td style='padding:0;text-align:right;vertical-align:baseline;white-space:nowrap;font-size:12px;font-weight:600;color:${palette.color};'>${statusText}</td></tr></table>${metricsHtml}${rowsHtml}</div>`;
  }).join('');

  return `<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;max-width:640px;color:#111827;font-size:14px;line-height:1.6;'>${headerRow}${itemsHtml}</div>`;
}

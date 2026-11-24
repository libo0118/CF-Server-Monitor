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
  danger: {
    headerBg: 'linear-gradient(135deg,#7f1d1d 0%,#b91c1c 100%)',
    accent: '#dc2626',
    badgeBg: '#fee2e2',
    badgeText: '#b91c1c'
  },
  success: {
    headerBg: 'linear-gradient(135deg,#064e3b 0%,#047857 100%)',
    accent: '#059669',
    badgeBg: '#d1fae5',
    badgeText: '#047857'
  },
  warning: {
    headerBg: 'linear-gradient(135deg,#78350f 0%,#d97706 100%)',
    accent: '#d97706',
    badgeBg: '#fef3c7',
    badgeText: '#b45309'
  },
  info: {
    headerBg: 'linear-gradient(135deg,#071923 0%,#0f766e 100%)',
    accent: '#0f766e',
    badgeBg: '#ccfbf1',
    badgeText: '#0f766e'
  }
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
      statusBadge: eventKind === 'offline' ? '严重离线' : '资源告警'
    };
  }
  if (eventKind === 'recovered' || eventKind === 'resource_recovered' || eventKind === 'renewed') {
    const statusBadge = eventKind === 'recovered'
      ? '恢复上线'
      : (eventKind === 'renewed' ? '已自动续费' : '负载恢复');
    return { ...PALETTES.success, statusBadge };
  }
  if (eventKind === 'traffic_alert' || eventKind === 'expiring') {
    return {
      ...PALETTES.warning,
      statusBadge: eventKind === 'traffic_alert' ? '流量预警' : '到期提醒'
    };
  }
  return {
    ...PALETTES.info,
    statusBadge: eventKind === 'test' ? '测试通过' : '状态通知'
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
    ? `<div style='height:6px;width:100%;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:5px;'><div style='height:6px;width:${clamped}%;background:${palette.accent};border-radius:999px;'></div></div>`
    : '';
  const thresholdHtml = metric.thresholdText
    ? `<div style='margin-top:4px;font-size:11px;color:#64748b;'>${escapeHtml(metric.thresholdText)}</div>`
    : '';
  return `<div style='margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;'><table style='width:100%;border-collapse:collapse;'><tr><td style='font-size:12px;color:#475569;padding:0;'>${label}</td><td style='font-size:13px;font-weight:700;color:${palette.accent};text-align:right;padding:0;'>${valueText}</td></tr></table>${barHtml}${thresholdHtml}</div>`;
}

function renderRowsTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const trs = rows.map(row => `<tr><td style='width:76px;font-size:12px;color:#64748b;padding:3px 8px 3px 0;vertical-align:top;white-space:nowrap;'>${escapeHtml(row.label)}</td><td style='font-size:12px;color:#1e293b;padding:3px 0;word-break:break-word;'>${escapeHtml(row.value)}</td></tr>`).join('');
  return `<table style='width:100%;border-collapse:collapse;margin-top:8px;border-top:1px solid #f1f5f9;padding-top:4px;'>${trs}</table>`;
}

function fallbackCardItems(context, palette) {
  const lines = String(context.message || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [{ name: context.client || '服务器状态通知', statusLabel: palette.statusBadge, rows: [{ label: '事件详情', value: context.event || '通知' }] }];
  }
  return lines.map(line => ({ name: context.event || '通知明细', statusLabel: palette.statusBadge, rows: [{ label: '详细内容', value: line }] }));
}

export function buildNotificationHtmlCard(context = {}, settings = {}) {
  const eventKind = String(context.eventKind || context.event_kind || '').trim();
  const palette = getEventPalette(eventKind);
  const summary = context.summary || buildNotificationSummary(context, settings);
  const event = String(context.event || '状态通知');
  const time = String(context.time || '');
  const rawTitle = String(settings?.site_title || '').trim();
  const brandLabel = rawTitle ? `${rawTitle} MONITOR` : 'SERVER MONITOR';
  const rawItems = Array.isArray(context.items) && context.items.length > 0 ? context.items : fallbackCardItems(context, palette);
  const count = Number(context.count) > 0 ? Number(context.count) : rawItems.length;

  const cardsHtml = rawItems.map((item, idx) => {
    const meta = [item.group, item.region].filter(Boolean).join(' · ');
    const metaHtml = meta ? `<span style='display:inline-block;margin-left:6px;font-size:11px;font-weight:500;color:#64748b;'>${escapeHtml(meta)}</span>` : '';
    const statusText = escapeHtml(item.statusLabel || palette.statusBadge);
    const metricsHtml = Array.isArray(item.metrics) ? item.metrics.map(m => renderMetricBlock(m, palette)).join('') : '';
    const rowsHtml = renderRowsTable(item.rows);
    const marginBottom = idx === rawItems.length - 1 ? '0' : '10px';
    return `<div style='background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid ${palette.accent};border-radius:10px;padding:12px 14px;margin-bottom:${marginBottom};'><table style='width:100%;border-collapse:collapse;'><tr><td style='vertical-align:middle;padding:0;'><span style='font-size:15px;font-weight:700;color:#0f172a;'>${escapeHtml(item.name || '服务器')}</span>${metaHtml}</td><td style='text-align:right;vertical-align:middle;padding:0;white-space:nowrap;'><span style='display:inline-block;background:${palette.badgeBg};color:${palette.badgeText};font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;'>${statusText}</span></td></tr></table>${metricsHtml}${rowsHtml}</div>`;
  }).join('');

  const header = `<div style='background:${palette.headerBg};padding:18px 20px;border-radius:14px 14px 0 0;color:#ffffff;'><table style='width:100%;border-collapse:collapse;'><tr><td style='font-size:11px;font-weight:700;letter-spacing:0.8px;color:rgba(255,255,255,0.8);text-transform:uppercase;padding:0;'>${escapeHtml(brandLabel)}</td><td style='text-align:right;padding:0;'><span style='display:inline-block;background:rgba(255,255,255,0.18);color:#ffffff;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;'>${escapeHtml(palette.statusBadge)}</span></td></tr></table><div style='margin-top:8px;font-size:19px;font-weight:700;line-height:1.35;color:#ffffff;'>${escapeHtml(summary)}</div><div style='margin-top:6px;font-size:12px;color:rgba(255,255,255,0.85);'>${escapeHtml(event)} · 共 ${count} 台节点${time ? ` · ${escapeHtml(time)}` : ''}</div></div>`;
  const body = `<div style='background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:14px;'>${cardsHtml}</div>`;
  return `<div style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;'>${header}${body}</div>`;
}

// Calendar dates and prices as integer kopecks, shared by the views.
const Statistics = (() => {
  const DAY = 86400000;
  const currency = '₽';
  const moneyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });

  function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const parsed = new Date(value);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : '';
  }

  function localDay(date = new Date()) {
    return [String(date.getFullYear()).padStart(4, '0'), String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')].join('-');
  }

  function shiftDay(value, days) {
    return new Date(+new Date(value) + days * DAY).toISOString().slice(0, 10);
  }

  function toCents(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const match = /^(\d*)(?:[.,](\d+))?$/.exec(String(value).trim());
    if (!match || (!match[1] && !match[2])) return null;
    const fraction = (match[2] || '').padEnd(3, '0');
    const amount = Number(match[1]) * 100 + Number(fraction.slice(0, 2)) + Number(fraction[2] >= '5');
    return Number.isSafeInteger(amount) ? amount : null;
  }

  const amount = cents => moneyFormat.format(cents / 100);
  const money = cents => amount(cents) + '\u00a0' + currency;

  function formatDay(value) {
    return value ? dateFormat.format(new Date(value)) : '—';
  }

  function entry(record) {
    const price = toCents(record.price);
    const done = day(record.doneDate);
    const paid = day(record.paidDate);
    const timestamp = typeof record.createdAt === 'string' ? record.createdAt : '';
    const recorded = timestamp.includes('T') ? new Date(timestamp) : null;
    const created = recorded && Number.isFinite(+recorded) ? localDay(recorded) : day(timestamp);
    const firstKnown = [done, paid, created].filter(Boolean).sort()[0] || '';
    const draft = ![record.client, record.subject, record.taskNum, record.notes, record.doneDate, record.paidDate]
      .some(value => String(value ?? '').trim()) && (price === null || price === 0);
    return { record, price, done, paid, firstKnown, draft };
  }

  function getRange(preset, entries, today) {
    const year = today.slice(0, 4);
    const month = Number(today.slice(5, 7));
    let from = today.slice(0, 7) + '-01';
    let to = today;
    if (preset === 'last-month') {
      to = shiftDay(from, -1);
      from = to.slice(0, 7) + '-01';
    }
    if (preset === 'quarter') {
      from = year + '-' + String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0') + '-01';
    }
    if (preset === 'all') {
      from = entries.reduce((earliest, row) =>
        row.firstKnown && row.firstKnown < earliest ? row.firstKnown : earliest, today);
    }
    return { from, to };
  }

  function sum(rows) {
    return rows.reduce((total, row) => total + (row.price ?? 0), 0);
  }

  function summarize(entries, range, today) {
    const active = entries.filter(row => !row.draft);
    const inRange = date => date && date >= range.from && date <= range.to;
    const paidRows = active.filter(row => inRange(row.paid));
    const doneRows = active.filter(row => inRange(row.done));
    const known = active.filter(row => row.firstKnown ? row.firstKnown <= range.to : range.to === today);
    const waiting = known.filter(row => row.done && row.done <= range.to && (!row.paid || row.paid > range.to));
    const open = known.filter(row => !row.done || row.done > range.to);
    return {
      active, paidRows, doneRows, waiting, open,
      advance: open.filter(row => row.paid && row.paid <= range.to),
      undated: range.to === today ? 0 : active.filter(row => !row.firstKnown).length
    };
  }

  function ledgerTotals(records, today = localDay()) {
    const entries = records.map(entry).filter(row => !row.draft);
    return {
      count: entries.length,
      total: sum(entries),
      paid: sum(entries.filter(row => row.paid && row.paid <= today))
    };
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return Math.round((sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2);
  }

  function quality(entries, today) {
    const flags = [
      ['Черновики исключены', []],
      ['Без цены или с некорректной ценой', []],
      ['Некорректные даты', []],
      ['Даты в будущем', []],
      ['Без заказчика', []],
      ['Без предмета', []],
      ['Возможные дубли', []]
    ];
    const identities = new Map();
    entries.forEach(row => {
      const { record } = row;
      if (row.draft) { flags[0][1].push(row); return; }
      if (row.price === null) flags[1][1].push(row);
      if ((record.doneDate && !row.done) || (record.paidDate && !row.paid)) flags[2][1].push(row);
      if (row.done > today || row.paid > today) flags[3][1].push(row);
      const client = String(record.client ?? '').trim().toLowerCase();
      const subject = String(record.subject ?? '').trim().toLowerCase();
      const task = String(record.taskNum ?? '').trim().toLowerCase();
      if (!client) flags[4][1].push(row);
      if (!subject) flags[5][1].push(row);
      if (client && subject && task) {
        const key = JSON.stringify([record.semesterId, client, subject, task]);
        if (!identities.has(key)) identities.set(key, []);
        identities.get(key).push(row);
      }
    });
    identities.forEach(rows => { if (rows.length > 1) flags[6][1].push(...rows); });
    return flags.filter(([, rows]) => rows.length);
  }

  function buckets(range, paidRows) {
    const start = new Date(range.from);
    const end = new Date(range.to);
    const monthIndex = date => date.getUTCFullYear() * 12 + date.getUTCMonth();
    const count = monthIndex(end) - monthIndex(start) + 1;
    if (count === 1) {
      const duration = age(range.from, range.to) + 1;
      const step = duration > 7 ? 7 : 1;
      const groups = Array.from({ length: Math.ceil(duration / step) }, (_, i) => {
        const first = +range.from.slice(8) + i * step;
        const last = Math.min(first + step - 1, +range.to.slice(8));
        const days = first === last ? String(first) : `${first}–${last}`;
        const month = shortMonth.format(start);
        return { label: `${days} ${month} ${start.getUTCFullYear()}`, short: `${days} ${month}`, rows: [] };
      });
      paidRows.forEach(row => groups[Math.floor(age(range.from, row.paid) / step)].rows.push(row));
      return groups;
    }
    const step = count > 180 ? 12 * Math.ceil(count / 180) : count > 60 ? 12 : count > 15 ? 3 : 1;
    const index = value => Math.floor(monthIndex(new Date(value)) / step) * step;
    const byBucket = new Map();
    const first = index(range.from);
    const last = index(range.to);
    for (let i = first; i <= last; i += step) {
      const year = Math.floor(i / 12);
      const month = i % 12;
      const date = new Date(0);
      date.setUTCFullYear(year, month, 1);
      let label = monthFormat.format(date);
      let short = shortMonth.format(date);
      if (step === 3) label = short = `${month / 3 + 1} кв. ${year}`;
      if (step === 12) label = short = String(year);
      if (step > 12) label = short = `${year}–${year + step / 12 - 1}`;
      if (step === 1 && start.getUTCFullYear() !== end.getUTCFullYear()) short += ` ${String(year).slice(-2)}`;
      byBucket.set(i, { label, short, rows: [] });
    }
    paidRows.forEach(row => byBucket.get(index(row.paid)).rows.push(row));
    return [...byBucket.values()];
  }

  const age = (date, asOf) => Math.round((+new Date(asOf) - +new Date(date)) / DAY);

  return { day, localDay, shiftDay, toCents, amount, money, currency, formatDay, entry, getRange, sum, summarize,
    ledgerTotals, median, quality, buckets, age };
})();

import { Op } from 'sequelize';
import { SensorReading, SensorThreshold, WarehouseBin, Device } from '../../models/index.js';
import * as exceptions from './warehouseException.service.js';
import { touch } from './device.service.js';
import { emit, POINTS } from '../platform/extensions.service.js';

/**
 * Temperature and humidity, and the judgement that a place has left its range.
 *
 * The rule that makes this useful rather than noisy is `graceMinutes`: a
 * reading outside the range is not yet a breach. A door held open during a
 * load spikes a chiller for ninety seconds, and a system that raises an
 * exception every time teaches the floor to close them unread — at which point
 * the one that mattered is closed unread too.
 *
 * So a breach requires the range to have been continuously violated for longer
 * than the grace period, evidenced by the readings already stored. And once an
 * exception is open for a place, further breaching readings attach to it
 * rather than opening a second: an eight-hour failure is one incident, not four
 * hundred alerts.
 */

const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

/** Celsius is what thresholds are written in, so a Fahrenheit probe is converted. */
const toCelsius = (value, unit) => (unit === 'F' ? (Number(value) - 32) * (5 / 9) : Number(value));

/**
 * The rule governing a bin: its own if it has one, else the branch default.
 *
 * Most specific wins, and an inactive rule is not a fallback to the general
 * one — standing a bin's own policy down means that bin is unmonitored, not
 * that it silently inherits limits nobody chose for it.
 */
export async function thresholdFor({ branchId, binId }) {
  if (binId) {
    const own = await SensorThreshold.findOne({
      where: { branchId, binId, detstatus: false },
      order: [['id', 'DESC']],
    });
    if (own) return own.isActive ? own : null;
  }
  return SensorThreshold.findOne({
    where: { branchId, binId: null, isActive: true, detstatus: false },
    order: [['id', 'DESC']],
  });
}

/** Which bounds a reading violates, if any. */
export function violations(reading, threshold) {
  if (!threshold) return [];
  const out = [];
  const temperature = reading.temperature === null ? null : toCelsius(reading.temperature, reading.temperatureUnit || 'C');
  const humidity = num(reading.humidity);

  const min = num(threshold.minTemperature);
  const max = num(threshold.maxTemperature);
  const minH = num(threshold.minHumidity);
  const maxH = num(threshold.maxHumidity);

  if (temperature !== null && min !== null && temperature < min) out.push({ measure: 'temperature', bound: 'min', limit: min, value: temperature });
  if (temperature !== null && max !== null && temperature > max) out.push({ measure: 'temperature', bound: 'max', limit: max, value: temperature });
  if (humidity !== null && minH !== null && humidity < minH) out.push({ measure: 'humidity', bound: 'min', limit: minH, value: humidity });
  if (humidity !== null && maxH !== null && humidity > maxH) out.push({ measure: 'humidity', bound: 'max', limit: maxH, value: humidity });

  return out;
}

/**
 * Has this place been out of range for longer than the grace period?
 *
 * Answered from the stored readings rather than from memory, because the
 * server restarts and a cold room does not care. If every reading since the
 * start of the grace window breached, the excursion is real.
 */
async function breachSustained({ branchId, binId, graceMinutes, since }) {
  if (!graceMinutes) return true;
  const windowStart = new Date(since.getTime() - graceMinutes * 60_000);

  const recent = await SensorReading.findAll({
    where: {
      branchId,
      ...(binId ? { binId } : { binId: null }),
      recordedAt: { [Op.gte]: windowStart, [Op.lt]: since },
    },
    order: [['recordedAt', 'ASC']],
  });

  // Nothing to corroborate it yet — a single spike is not an excursion.
  if (!recent.length) return false;
  return recent.every((row) => row.breached);
}

/** An excursion already being dealt with for this place, if there is one. */
async function openExceptionFor({ branchId, binId }) {
  const queue = await exceptions.queue({
    branchId,
    exceptionType: 'ENVIRONMENT_BREACH',
    status: 'OPEN',
    limit: 50,
  });
  const rows = queue?.rows || queue || [];
  return rows.find((row) => Number(row.binId || 0) === Number(binId || 0)) || null;
}

/**
 * Take one reading, judge it, and store the judgement.
 *
 * Returns the stored row plus what was decided, so a gateway gets told whether
 * it just reported a problem — some hardware can sound locally on that.
 */
export async function record({
  deviceId = null, deviceCode = null, branchId, binId = null,
  temperature = null, humidity = null, temperatureUnit = 'C',
  recordedAt = null, source = 'DEVICE', userId = null,
}) {
  if (!branchId) throw Object.assign(new Error('A reading must say which location it came from'), { status: 400 });
  if (temperature === null && humidity === null) {
    throw Object.assign(new Error('A reading needs a temperature, a humidity, or both'), { status: 400 });
  }

  let device = null;
  if (deviceCode) device = await touch(deviceCode);
  const resolvedDeviceId = deviceId || device?.id || null;

  // The sensor's own clock, falling back to arrival. A gateway that buffers
  // through an outage delivers an hour of readings at once, and stamping them
  // all "now" would erase the outage from the record.
  const measuredAt = recordedAt ? new Date(recordedAt) : new Date();

  const threshold = await thresholdFor({ branchId, binId });
  const broken = violations({ temperature, humidity, temperatureUnit }, threshold);

  const reading = await SensorReading.create({
    deviceId: resolvedDeviceId,
    branchId,
    binId,
    temperature: num(temperature),
    humidity: num(humidity),
    temperatureUnit,
    recordedAt: measuredAt,
    source,
    breached: broken.length > 0,
    thresholdId: threshold?.id || null,
    authadd: userId,
  });

  let exception = null;
  if (broken.length) {
    const sustained = await breachSustained({
      branchId, binId, graceMinutes: threshold?.graceMinutes ?? 0, since: measuredAt,
    });

    if (sustained) {
      // One incident, however many readings it spans.
      exception = await openExceptionFor({ branchId, binId });
      if (!exception) {
        const bin = binId ? await WarehouseBin.findByPk(binId) : null;
        const where = bin ? `${bin.code}${bin.name ? ` (${bin.name})` : ''}` : 'the site';
        const detail = broken
          .map((v) => `${v.measure} ${v.value.toFixed(1)} is ${v.bound === 'min' ? 'below' : 'above'} the limit of ${v.limit}`)
          .join('; ');

        exception = await exceptions.raise({
          exceptionType: 'ENVIRONMENT_BREACH',
          branchId,
          binId,
          // A cold-chain excursion is not a routine discrepancy: stock may
          // have to be written off, so it goes to the top of the queue.
          priority: 'CRITICAL',
          referenceType: 'SENSOR_READING',
          referenceId: reading.id,
          description: `${where} out of range for over ${threshold?.graceMinutes ?? 0} minutes — ${detail}`,
          userId,
        });

        // Anything listening — a webhook to a cold-chain provider, say — hears
        // about it here. The emit is fire-and-forget on purpose: an integration
        // that is down must not stop a reading being recorded.
        emit(POINTS.SENSOR_BREACH, { reading: reading.toJSON(), exception, violations: broken }).catch(() => {});
      }
      await reading.update({ exceptionId: exception?.id || null });
    }
  }

  return { reading, violations: broken, exception };
}

/** Ingest a batch from a gateway that buffered while offline. */
export async function recordMany(readings = [], context = {}) {
  if (!Array.isArray(readings) || !readings.length) {
    throw Object.assign(new Error('There are no readings to record'), { status: 400 });
  }
  const results = [];
  // In order, because the grace-period test reads the rows written before it:
  // recording an hour of buffered samples in parallel would let each one
  // conclude it was the first.
  for (const entry of readings) {
    try {
      const outcome = await record({ ...context, ...entry });
      results.push({ ok: true, id: outcome.reading.id, breached: outcome.reading.breached, exceptionId: outcome.exception?.id || null });
    } catch (error) {
      results.push({ ok: false, status: error.status || 500, error: error.message });
    }
  }
  return {
    total: results.length,
    stored: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    breaches: results.filter((r) => r.ok && r.breached).length,
    results,
  };
}

export async function history({ branchId = null, binId = null, deviceId = null, from = null, to = null, breachedOnly = false, limit = 500 }) {
  const where = {};
  if (branchId) where.branchId = branchId;
  if (binId) where.binId = binId;
  if (deviceId) where.deviceId = deviceId;
  if (breachedOnly) where.breached = true;
  if (from || to) {
    where.recordedAt = {};
    if (from) where.recordedAt[Op.gte] = new Date(from);
    if (to) where.recordedAt[Op.lte] = new Date(to);
  }

  return SensorReading.findAll({
    where,
    include: [
      { model: WarehouseBin, attributes: ['code', 'name'] },
      { model: Device, attributes: ['deviceCode', 'deviceName'] },
    ],
    order: [['recordedAt', 'DESC']],
    limit: Math.min(Number(limit) || 500, 5000),
  });
}

/**
 * The board: every monitored place and where it stands right now.
 *
 * "Now" is the latest reading, and a place whose latest reading is old is
 * reported as stale rather than fine — silence from a freezer probe is the
 * failure most worth seeing, and it is the one a plain last-value display
 * hides.
 */
export async function status(branchId = null) {
  const where = { detstatus: false, isActive: true };
  if (branchId) where.branchId = branchId;

  const thresholds = await SensorThreshold.findAll({
    where,
    include: [{ model: WarehouseBin, attributes: ['code', 'name'] }],
  });

  const places = [];
  for (const threshold of thresholds) {
    const latest = await SensorReading.findOne({
      where: {
        branchId: threshold.branchId,
        ...(threshold.binId ? { binId: threshold.binId } : {}),
      },
      order: [['recordedAt', 'DESC']],
    });

    const ageMinutes = latest ? Math.round((Date.now() - new Date(latest.recordedAt).getTime()) / 60_000) : null;
    // Twice the grace period with nothing heard means the probe, not the room,
    // is the thing to look at.
    const staleAfter = Math.max((threshold.graceMinutes || 5) * 2, 30);

    places.push({
      thresholdId: threshold.id,
      binId: threshold.binId,
      binCode: threshold.WarehouseBin?.code || null,
      binName: threshold.WarehouseBin?.name || null,
      label: threshold.label,
      limits: {
        minTemperature: num(threshold.minTemperature),
        maxTemperature: num(threshold.maxTemperature),
        minHumidity: num(threshold.minHumidity),
        maxHumidity: num(threshold.maxHumidity),
        graceMinutes: threshold.graceMinutes,
      },
      latest: latest ? {
        temperature: num(latest.temperature),
        humidity: num(latest.humidity),
        temperatureUnit: latest.temperatureUnit,
        recordedAt: latest.recordedAt,
        breached: latest.breached,
      } : null,
      ageMinutes,
      state: !latest ? 'NO_DATA'
        : ageMinutes > staleAfter ? 'STALE'
          : latest.breached ? 'BREACH'
            : 'OK',
    });
  }

  const counted = (state) => places.filter((p) => p.state === state).length;
  return {
    places,
    summary: {
      monitored: places.length,
      ok: counted('OK'),
      breach: counted('BREACH'),
      stale: counted('STALE'),
      noData: counted('NO_DATA'),
    },
  };
}

// ---- thresholds ----

export async function listThresholds(branchId = null) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;
  return SensorThreshold.findAll({
    where,
    include: [{ model: WarehouseBin, attributes: ['code', 'name'] }],
    order: [['binId', 'ASC']],
  });
}

function assertSaneRange({ minTemperature, maxTemperature, minHumidity, maxHumidity }) {
  const minT = num(minTemperature);
  const maxT = num(maxTemperature);
  const minH = num(minHumidity);
  const maxH = num(maxHumidity);
  if (minT !== null && maxT !== null && minT > maxT) {
    throw Object.assign(new Error('The minimum temperature cannot be above the maximum'), { status: 400 });
  }
  if (minH !== null && maxH !== null && minH > maxH) {
    throw Object.assign(new Error('The minimum humidity cannot be above the maximum'), { status: 400 });
  }
}

export async function saveThreshold({ id = null, branchId, binId = null, userId = null, ...values }) {
  assertSaneRange(values);
  if (!branchId) throw Object.assign(new Error('A threshold must belong to a location'), { status: 400 });

  if (id) {
    const existing = await SensorThreshold.findOne({ where: { id, detstatus: false } });
    if (!existing) throw Object.assign(new Error('Threshold not found'), { status: 404 });
    await existing.update({ ...values, binId, authlstedit: userId });
    return existing;
  }
  return SensorThreshold.create({ ...values, branchId, binId, authadd: userId });
}

export async function removeThreshold(id, { userId = null } = {}) {
  const existing = await SensorThreshold.findOne({ where: { id, detstatus: false } });
  if (!existing) throw Object.assign(new Error('Threshold not found'), { status: 404 });
  await existing.update({ detstatus: true, isActive: false, authdel: userId, delondt: new Date() });
  return { message: 'Threshold removed' };
}

import { asyncHandler } from '../../utils/asyncHandler.js';
import * as devices from './device.service.js';
import * as scanner from './scanner.service.js';
import * as sensors from './sensor.service.js';
import * as rfid from './rfid.service.js';
import { resolveOwnerId } from './stockOwner.service.js';

/**
 * The API the floor hardware talks to.
 *
 * Everything returned goes through a DTO, for the same reason the foundation
 * controller does it: a Sequelize instance carries audit columns, the
 * soft-delete flag and whatever associations happened to be loaded, and
 * shipping that straight out means the wire format changes whenever the schema
 * does. Devices are the worst possible client for that — firmware is updated
 * by walking round the building with a cable.
 *
 * The branch comes from the request context rather than the body. A handheld
 * posting its own branchId could put stock in another building by typo, and the
 * session already knows where its user is.
 */

const num = (value) => (value === null || value === undefined ? null : Number(value));

const deviceDto = (device) => (device ? {
  id: device.id,
  deviceCode: device.deviceCode,
  deviceName: device.deviceName,
  deviceType: device.deviceType,
  status: device.status,
  branchId: device.branchId,
  branchName: device.Branch?.branchName || null,
  binId: device.binId,
  binCode: device.WarehouseBin?.code || null,
  model: device.model,
  serialNumber: device.serialNumber,
  firmwareVersion: device.firmwareVersion,
  lastSeenAt: device.lastSeenAt,
  online: device.online ?? null,
  notes: device.notes,
} : null);

const readingDto = (reading) => (reading ? {
  id: reading.id,
  deviceId: reading.deviceId,
  deviceCode: reading.Device?.deviceCode || null,
  binId: reading.binId,
  binCode: reading.WarehouseBin?.code || null,
  temperature: num(reading.temperature),
  humidity: num(reading.humidity),
  temperatureUnit: reading.temperatureUnit,
  recordedAt: reading.recordedAt,
  breached: reading.breached,
  exceptionId: reading.exceptionId,
  source: reading.source,
} : null);

const thresholdDto = (threshold) => (threshold ? {
  id: threshold.id,
  branchId: threshold.branchId,
  binId: threshold.binId,
  binCode: threshold.WarehouseBin?.code || null,
  binName: threshold.WarehouseBin?.name || null,
  label: threshold.label,
  minTemperature: num(threshold.minTemperature),
  maxTemperature: num(threshold.maxTemperature),
  minHumidity: num(threshold.minHumidity),
  maxHumidity: num(threshold.maxHumidity),
  graceMinutes: threshold.graceMinutes,
  isActive: threshold.isActive,
} : null);

const tagDto = (tag) => (tag ? {
  id: tag.id,
  epc: tag.epc,
  status: tag.status,
  productId: tag.productId,
  productName: tag.Product?.productName || null,
  variantId: tag.variantId,
  batchId: tag.batchId,
  batchNumber: tag.ProductBatch?.batchNumber || null,
  ownerId: tag.ownerId,
  ownerName: tag.StockOwner?.ownerName || null,
  quantity: num(tag.quantity),
  lastSeenBinId: tag.lastSeenBinId,
  lastSeenBinCode: tag.lastSeenBin?.code || null,
  lastSeenAt: tag.lastSeenAt,
} : null);

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export const listDevices = asyncHandler(async (req, res) => {
  const rows = await devices.list({
    branchId: req.query.branchId || req.branchId,
    deviceType: req.query.deviceType || null,
    status: req.query.status || null,
  });
  res.json(rows.map(deviceDto));
});

export const getDevice = asyncHandler(async (req, res) => {
  res.json(deviceDto(await devices.byId(req.params.id)));
});

export const registerDevice = asyncHandler(async (req, res) => {
  const device = await devices.register({
    ...req.body,
    branchId: req.body.branchId || req.branchId,
    userId: req.user?.id,
  });
  res.status(201).json(deviceDto(device));
});

export const updateDevice = asyncHandler(async (req, res) => {
  res.json(deviceDto(await devices.update(req.params.id, { ...req.body, userId: req.user?.id })));
});

export const retireDevice = asyncHandler(async (req, res) => {
  res.json(await devices.retire(req.params.id, { userId: req.user?.id }));
});

export const deviceHealth = asyncHandler(async (req, res) => {
  res.json(await devices.health(req.query.branchId || req.branchId));
});

export const deviceVocabulary = asyncHandler(async (_req, res) => {
  res.json(devices.VOCABULARY);
});

/**
 * A device saying it is alive.
 *
 * Answers 200 even for a code nobody registered, echoing `known: false`. A
 * scanner told "401" by a heartbeat is a scanner a picker reboots in the middle
 * of a shift; the register is an operational aid, not an authorisation gate.
 */
export const heartbeat = asyncHandler(async (req, res) => {
  const code = req.get('x-device-id') || req.body.deviceCode;
  const device = await devices.touch(code, { ipAddress: req.ip });
  res.json({ known: Boolean(device), device: deviceDto(device), serverTime: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

export const resolveScan = asyncHandler(async (req, res) => {
  await devices.touch(req.get('x-device-id'), { ipAddress: req.ip });
  const code = req.params.code || req.query.code || req.body.code;
  res.json(await scanner.resolve(code, { branchId: req.branchId }));
});

export const scanPutAway = asyncHandler(async (req, res) => {
  await devices.touch(req.get('x-device-id'), { ipAddress: req.ip });
  const result = await scanner.putAway({
    ...req.body,
    branchId: req.branchId,
    ownerId: await resolveOwnerId(req.body.ownerId),
    userId: req.user?.id,
  });
  res.status(201).json(result);
});

export const scanMove = asyncHandler(async (req, res) => {
  await devices.touch(req.get('x-device-id'), { ipAddress: req.ip });
  res.status(201).json(await scanner.move({
    ...req.body,
    branchId: req.branchId,
    ownerId: await resolveOwnerId(req.body.ownerId),
    userId: req.user?.id,
  }));
});

export const scanPick = asyncHandler(async (req, res) => {
  await devices.touch(req.get('x-device-id'), { ipAddress: req.ip });
  res.status(201).json(await scanner.pick({
    ...req.body,
    branchId: req.branchId,
    ownerId: await resolveOwnerId(req.body.ownerId),
    userId: req.user?.id,
  }));
});

export const scanCount = asyncHandler(async (req, res) => {
  await devices.touch(req.get('x-device-id'), { ipAddress: req.ip });
  res.json(await scanner.count({
    ...req.body,
    branchId: req.branchId,
    ownerId: await resolveOwnerId(req.body.ownerId),
    userId: req.user?.id,
  }));
});

export const scanCompleteTask = asyncHandler(async (req, res) => {
  await devices.touch(req.get('x-device-id'), { ipAddress: req.ip });
  res.json(await scanner.completeTask(req.params.taskId, {
    completedQuantity: req.body.completedQuantity ?? null,
    userId: req.user?.id,
  }));
});

/** Replay a device's offline queue. Partial success is the expected outcome. */
export const syncScans = asyncHandler(async (req, res) => {
  const result = await scanner.sync({
    operations: req.body.operations,
    branchId: req.branchId,
    userId: req.user?.id,
    deviceCode: req.get('x-device-id') || req.body.deviceCode,
  });
  // 207 when some operations failed: a flat 200 would have devices clearing a
  // queue that did not entirely land.
  res.status(result.failed ? 207 : 200).json(result);
});

export const scanVocabulary = asyncHandler(async (_req, res) => {
  res.json({ operations: scanner.SYNC_OPERATIONS });
});

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

export const recordReading = asyncHandler(async (req, res) => {
  const result = await sensors.record({
    ...req.body,
    branchId: req.body.branchId || req.branchId,
    deviceCode: req.get('x-device-id') || req.body.deviceCode,
    userId: req.user?.id,
  });
  res.status(201).json({
    reading: readingDto(result.reading),
    violations: result.violations,
    exceptionId: result.exception?.id || null,
  });
});

export const recordReadings = asyncHandler(async (req, res) => {
  const result = await sensors.recordMany(req.body.readings, {
    branchId: req.body.branchId || req.branchId,
    deviceCode: req.get('x-device-id') || req.body.deviceCode,
    userId: req.user?.id,
  });
  res.status(result.failed ? 207 : 201).json(result);
});

export const readingHistory = asyncHandler(async (req, res) => {
  const rows = await sensors.history({
    branchId: req.query.branchId || req.branchId,
    binId: req.query.binId || null,
    deviceId: req.query.deviceId || null,
    from: req.query.from || null,
    to: req.query.to || null,
    breachedOnly: req.query.breachedOnly === 'true',
    limit: req.query.limit,
  });
  res.json(rows.map(readingDto));
});

export const sensorStatus = asyncHandler(async (req, res) => {
  res.json(await sensors.status(req.query.branchId || req.branchId));
});

export const listThresholds = asyncHandler(async (req, res) => {
  const rows = await sensors.listThresholds(req.query.branchId || req.branchId);
  res.json(rows.map(thresholdDto));
});

export const saveThreshold = asyncHandler(async (req, res) => {
  const threshold = await sensors.saveThreshold({
    ...req.body,
    id: req.params.id || req.body.id || null,
    branchId: req.body.branchId || req.branchId,
    userId: req.user?.id,
  });
  res.status(req.params.id ? 200 : 201).json(thresholdDto(threshold));
});

export const removeThreshold = asyncHandler(async (req, res) => {
  res.json(await sensors.removeThreshold(req.params.id, { userId: req.user?.id }));
});

// ---------------------------------------------------------------------------
// RFID
// ---------------------------------------------------------------------------

export const listTags = asyncHandler(async (req, res) => {
  const rows = await rfid.listTags({
    branchId: req.query.branchId || req.branchId,
    status: req.query.status || null,
    productId: req.query.productId || null,
    binId: req.query.binId || null,
    search: req.query.search || null,
    limit: req.query.limit,
  });
  res.json(rows.map(tagDto));
});

export const registerTag = asyncHandler(async (req, res) => {
  const tag = await rfid.registerTag({
    ...req.body,
    branchId: req.body.branchId || req.branchId,
    ownerId: await resolveOwnerId(req.body.ownerId),
    userId: req.user?.id,
  });
  res.status(201).json(tagDto(tag));
});

export const registerTags = asyncHandler(async (req, res) => {
  const result = await rfid.registerMany(req.body.tags, { userId: req.user?.id });
  res.status(result.failed ? 207 : 201).json(result);
});

export const retireTag = asyncHandler(async (req, res) => {
  res.json(await rfid.retireTag(req.params.id, { userId: req.user?.id }));
});

export const recordTagRead = asyncHandler(async (req, res) => {
  res.status(201).json(await rfid.recordRead({
    epcs: req.body.epcs,
    binId: req.body.binId || null,
    branchId: req.body.branchId || req.branchId,
    deviceCode: req.get('x-device-id') || req.body.deviceCode,
    userId: req.user?.id,
  }));
});

export const reconcileBin = asyncHandler(async (req, res) => {
  res.json(await rfid.reconcileBin({
    binId: req.body.binId,
    epcs: req.body.epcs,
    branchId: req.body.branchId || req.branchId,
    raiseExceptions: req.body.raiseExceptions === true,
    deviceCode: req.get('x-device-id') || req.body.deviceCode,
    userId: req.user?.id,
  }));
});

export const tagSummary = asyncHandler(async (req, res) => {
  res.json(await rfid.summary(req.query.branchId || req.branchId));
});

export const rfidVocabulary = asyncHandler(async (_req, res) => {
  res.json(rfid.VOCABULARY);
});

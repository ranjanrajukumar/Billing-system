import { Op } from 'sequelize';
import { Device, WarehouseBin, Branch } from '../../models/index.js';
import { DEVICE_OFFLINE_MINUTES, DEVICE_TYPES, DEVICE_STATUSES } from '../../models/device.model.js';

/**
 * The register of hardware that talks to us, and whether it is still talking.
 *
 * Every device-facing route calls `touch()`. That is the only way `lastSeenAt`
 * can be trusted: a heartbeat a device sends deliberately proves the device can
 * reach us, while a timestamp written when it does real work proves the whole
 * path — auth, module gating, database — is healthy. A dedicated ping would go
 * green while every actual write was failing.
 */

/** Devices that have said nothing recently enough to be believed. */
export const offlineCutoff = () => new Date(Date.now() - DEVICE_OFFLINE_MINUTES * 60_000);

export async function register({
  deviceCode, deviceName, deviceType = 'HANDHELD',
  branchId, binId = null, model = null, serialNumber = null,
  firmwareVersion = null, notes = null, userId = null,
}) {
  if (!deviceCode) throw Object.assign(new Error('A device needs a code — it is what the hardware sends in X-Device-Id'), { status: 400 });
  if (!deviceName) throw Object.assign(new Error('A device needs a name, so a person can tell which unit this is'), { status: 400 });
  if (!branchId) throw Object.assign(new Error('A device must belong to a location'), { status: 400 });
  if (!DEVICE_TYPES.includes(deviceType)) {
    throw Object.assign(new Error(`Device type must be one of: ${DEVICE_TYPES.join(', ')}`), { status: 400 });
  }

  // Re-registering is how a replaced unit keeps its identity: the code is
  // printed on the label and reused, and refusing it would force the floor to
  // invent codes. A retired row coming back is reactivated rather than
  // duplicated, so its history stays attached.
  const existing = await Device.findOne({ where: { deviceCode } });
  if (existing) {
    await existing.update({
      deviceName, deviceType, branchId, binId, model, serialNumber,
      firmwareVersion, notes, status: 'ACTIVE', detstatus: false,
      authlstedit: userId,
    });
    return existing;
  }

  return Device.create({
    deviceCode, deviceName, deviceType, branchId, binId,
    model, serialNumber, firmwareVersion, notes, authadd: userId,
  });
}

/**
 * Records that we heard from a device, and returns it.
 *
 * Returns null rather than throwing for an unknown code: an unregistered
 * scanner should not be able to fail a pick that is otherwise valid. The
 * device register is an operational aid, not an authorisation gate — that is
 * the user's token's job, and putting a second gate here would mean a flat
 * battery swapped for a spare unit stops the shift.
 */
export async function touch(deviceCode, { ipAddress = null } = {}) {
  if (!deviceCode) return null;
  const device = await Device.findOne({ where: { deviceCode, detstatus: false } });
  if (!device) return null;
  await device.update({ lastSeenAt: new Date(), lastIpAddress: ipAddress });
  return device;
}

export async function list({ branchId = null, deviceType = null, status = null } = {}) {
  const where = { detstatus: false };
  if (branchId) where.branchId = branchId;
  if (deviceType) where.deviceType = deviceType;
  if (status) where.status = status;

  const rows = await Device.findAll({
    where,
    include: [
      { model: Branch, attributes: ['branchName'] },
      { model: WarehouseBin, attributes: ['code', 'name'] },
    ],
    order: [['deviceType', 'ASC'], ['deviceName', 'ASC']],
  });

  const cutoff = offlineCutoff();
  return rows.map((row) => ({
    ...row.toJSON(),
    // Derived, never stored: "online" is a statement about now, and a stored
    // flag would be wrong the moment nothing updated it.
    online: Boolean(row.lastSeenAt && new Date(row.lastSeenAt) > cutoff),
  }));
}

export async function byId(id) {
  const device = await Device.findOne({
    where: { id, detstatus: false },
    include: [{ model: Branch, attributes: ['branchName'] }, { model: WarehouseBin, attributes: ['code', 'name'] }],
  });
  if (!device) throw Object.assign(new Error('Device not found'), { status: 404 });
  const cutoff = offlineCutoff();
  return { ...device.toJSON(), online: Boolean(device.lastSeenAt && new Date(device.lastSeenAt) > cutoff) };
}

export async function update(id, { userId = null, ...changes }) {
  const device = await Device.findOne({ where: { id, detstatus: false } });
  if (!device) throw Object.assign(new Error('Device not found'), { status: 404 });
  if (changes.deviceType && !DEVICE_TYPES.includes(changes.deviceType)) {
    throw Object.assign(new Error(`Device type must be one of: ${DEVICE_TYPES.join(', ')}`), { status: 400 });
  }
  if (changes.status && !DEVICE_STATUSES.includes(changes.status)) {
    throw Object.assign(new Error(`Status must be one of: ${DEVICE_STATUSES.join(', ')}`), { status: 400 });
  }
  // deviceCode is deliberately not editable: it is the identity the hardware
  // sends and the key every past write was recorded against. Changing it would
  // silently orphan that history.
  delete changes.deviceCode;
  await device.update({ ...changes, authlstedit: userId });
  return device;
}

export async function retire(id, { userId = null } = {}) {
  const device = await Device.findOne({ where: { id, detstatus: false } });
  if (!device) throw Object.assign(new Error('Device not found'), { status: 404 });
  // Soft, like every other deletion here: the readings and scans it produced
  // still point at it, and a hard delete would leave them pointing at nothing.
  await device.update({ status: 'RETIRED', detstatus: true, authdel: userId, delondt: new Date() });
  return { message: 'Device retired' };
}

/** The health board: how many of each kind, and which have gone quiet. */
export async function health(branchId = null) {
  const where = { detstatus: false, status: 'ACTIVE' };
  if (branchId) where.branchId = branchId;

  const devices = await Device.findAll({ where });
  const cutoff = offlineCutoff();

  const byType = {};
  for (const type of DEVICE_TYPES) byType[type] = { total: 0, online: 0, offline: 0 };

  const silent = [];
  for (const device of devices) {
    const bucket = byType[device.deviceType] || (byType[device.deviceType] = { total: 0, online: 0, offline: 0 });
    bucket.total += 1;
    const online = Boolean(device.lastSeenAt && new Date(device.lastSeenAt) > cutoff);
    bucket[online ? 'online' : 'offline'] += 1;
    if (!online) {
      silent.push({
        id: device.id,
        deviceCode: device.deviceCode,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        lastSeenAt: device.lastSeenAt,
      });
    }
  }

  return {
    offlineAfterMinutes: DEVICE_OFFLINE_MINUTES,
    total: devices.length,
    online: devices.length - silent.length,
    offline: silent.length,
    byType,
    // Longest-silent first: the one that has been dead all week matters more
    // than the one that missed a single heartbeat.
    silent: silent.sort((a, b) => new Date(a.lastSeenAt || 0) - new Date(b.lastSeenAt || 0)),
  };
}

export const VOCABULARY = { deviceTypes: DEVICE_TYPES, statuses: DEVICE_STATUSES, offlineAfterMinutes: DEVICE_OFFLINE_MINUTES };

/** Devices of one kind at one branch — how the sensor and RFID paths find theirs. */
export const ofType = (deviceType, branchId) => Device.findAll({
  where: { deviceType, detstatus: false, status: 'ACTIVE', ...(branchId ? { branchId } : {}) },
});

/** Used by the health job to spot hardware that stopped reporting. */
export const silentSince = (cutoff) => Device.findAll({
  where: {
    detstatus: false,
    status: 'ACTIVE',
    [Op.or]: [{ lastSeenAt: null }, { lastSeenAt: { [Op.lt]: cutoff } }],
  },
});

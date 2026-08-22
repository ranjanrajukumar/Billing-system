import { body } from 'express-validator';

export const deliveryChallanRules = [
  body('challanDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('customerId').isInt(),
  body('status').optional().isIn(['Pending', 'Delivered', 'Returned']),
  body('vehicleNumber').optional({ checkFalsy: true }).isString(),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 })
];

export const gatepassRules = [
  body('gatepassType').optional().isIn(['Inward', 'Outward']),
  body('gatepassDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('status').optional().isIn(['Pending', 'Checked-In', 'Checked-Out', 'Cancelled']),
  body('referenceType').optional({ checkFalsy: true }).isString(),
  body('referenceNumber').optional({ checkFalsy: true }).isString(),
  body('vehicleNumber').optional({ checkFalsy: true }).isString(),
  body('driverName').optional({ checkFalsy: true }).isString(),
  body('driverContact').optional({ checkFalsy: true }).isString(),
  body('transporterName').optional({ checkFalsy: true }).isString()
];

export const waveRules = [
  body('status').optional().isIn(['Planned', 'Released', 'Picking', 'Picked', 'Completed', 'Cancelled']),
  body('notes').optional({ checkFalsy: true }).isString(),
  body('orderIds').optional().isArray()
];

export const shipmentRules = [
  body('status').optional().isIn(['Pending', 'InTransit', 'Delivered', 'Cancelled']),
  body('shippingDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('carrierName').optional({ checkFalsy: true }).isString(),
  body('trackingNumber').optional({ checkFalsy: true }).isString(),
  body('notes').optional({ checkFalsy: true }).isString(),
  body('invoiceId').optional({ checkFalsy: true }).isInt()
];

export const appointmentRules = [
  body('expectedArrival').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('status').optional().isIn(['Scheduled', 'Arrived', 'Docked', 'Completed', 'Cancelled']),
  body('supplierId').optional({ checkFalsy: true }).isInt(),
  body('poId').optional({ checkFalsy: true }).isInt(),
  body('dockNumber').optional({ checkFalsy: true }).isString(),
  body('vehicleNumber').optional({ checkFalsy: true }).isString(),
  body('driverName').optional({ checkFalsy: true }).isString(),
  body('driverContact').optional({ checkFalsy: true }).isString(),
  body('notes').optional({ checkFalsy: true }).isString()
];

export const grnRules = [
  body('poId').optional({ checkFalsy: true }).isInt(),
  body('supplierId').isInt(),
  body('branchId').isInt(),
  body('grnDate').optional({ checkFalsy: true }).isISO8601().toDate(),
  body('supplierInvoiceNo').optional({ checkFalsy: true }).isString(),
  body('vehicleNo').optional({ checkFalsy: true }).isString(),
  body('remarks').optional({ checkFalsy: true }).isString(),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.receivedQty').isFloat({ gt: 0 }),
  body('items.*.acceptedQty').optional().isFloat({ min: 0 }),
  body('items.*.rejectedQty').optional().isFloat({ min: 0 }),
  body('items.*.damagedQty').optional().isFloat({ min: 0 }),
  body('items').custom((items) => {
    for (const item of items) {
      const rec = Number(item.receivedQty) || 0;
      const acc = Number(item.acceptedQty) || 0;
      const rej = Number(item.rejectedQty) || 0;
      const dam = Number(item.damagedQty) || 0;
      if (acc + rej + dam > rec) {
        throw new Error('Accepted, rejected, and damaged quantities cannot exceed received quantity');
      }
    }
    return true;
  })
];

export const qcRules = [
  body('status').optional().isIn(['Pending', 'Partial', 'Passed', 'Failed']),
  body('passedQty').optional().isFloat({ min: 0 }),
  body('failedQty').optional().isFloat({ min: 0 }),
  body('notes').optional({ checkFalsy: true }).isString(),
  body('inspectedQty').optional().isFloat({ min: 0 }),
  body().custom((value) => {
    const passed = Number(value.passedQty) || 0;
    const failed = Number(value.failedQty) || 0;
    const total = Number(value.inspectedQty) || 0;
    if (passed + failed > total) {
      throw new Error('Passed and Failed quantities cannot exceed the total inspected quantity');
    }
    return true;
  })
];

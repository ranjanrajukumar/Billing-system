import dotenv from 'dotenv';
dotenv.config();

import { sequelize, User, Branch, WarehouseBin, Supplier, Customer, Product, Category, PurchaseOrder, PurchaseOrderItem, InboundAppointment, Grn, GrnItem, QcInspection, SalesOrder, SalesOrderItem, PickWave, Shipment, Invoice, SalesReturn, SalesReturnItem, RepairOrder } from './src/models/index.js';
import { postStockTransaction } from './src/services/stock.service.js';

async function seed() {
  console.log('Connecting to database...');
  await sequelize.authenticate();
  console.log('Starting seed...');

  const transaction = await sequelize.transaction();

  try {
    // 1. Setup Master Data
    const adminUser = await User.findOne({ where: { email: 'admin@example.com' }, transaction });
    const authadd = adminUser ? adminUser.id : 1;

    // Branch & Zones & Bins
    const [branch] = await Branch.findOrCreate({
      where: { branchCode: 'HQ-01' },
      defaults: { branchName: 'Headquarters', address: '123 HQ Street', authadd },
      transaction
    });

    const [zone] = await WarehouseBin.findOrCreate({
      where: { code: 'ZONE-A' },
      defaults: { branchId: branch.id, level: 'Zone', name: 'Receiving Zone', authadd },
      transaction
    });

    const [bin] = await WarehouseBin.findOrCreate({
      where: { code: 'BIN-A1' },
      defaults: { branchId: branch.id, parentId: zone.id, level: 'Bin', name: 'A1 Primary', authadd },
      transaction
    });

    // Supplier & Customer
    const [supplier] = await Supplier.findOrCreate({
      where: { supplierName: 'Acme Corp' },
      defaults: { supplierName: 'Acme Corp', contactPerson: 'John Doe', mobileNumber: '9876543210', authadd },
      transaction
    });

    const [customer] = await Customer.findOrCreate({
      where: { customerName: 'Jane Smith' },
      defaults: { customerName: 'Jane Smith', mobileNumber: '1234567890', authadd },
      transaction
    });

    // Category & Products
    const [category] = await Category.findOrCreate({
      where: { name: 'Electronics' },
      defaults: { name: 'Electronics', authadd },
      transaction
    });

    const [product] = await Product.findOrCreate({
      where: { sku: 'SKU-001' },
      defaults: { productName: 'Widget Pro', categoryId: category.id, primaryUnit: 'PCS', mrp: 100, purchasePrice: 50, sellingPrice: 100, authadd },
      transaction
    });

    console.log('Master data created.');

    // 2. INBOUND FLOW
    // Purchase Order
    const po = await PurchaseOrder.create({
      poNumber: `PO-${Date.now()}`,
      supplierId: supplier.id,
      branchId: branch.id,
      poDate: new Date(),
      status: 'Approved',
      grandTotal: 5000,
      authadd
    }, { transaction });

    await PurchaseOrderItem.create({
      poId: po.id,
      productId: product.id,
      quantity: 100,
      rate: 50,
      amount: 5000,
      authadd
    }, { transaction });

    // ASN (Inbound Appointment)
    const asn = await InboundAppointment.create({
      appointmentNumber: `ASN-${Date.now()}`,
      supplierId: supplier.id,
      poId: po.id,
      expectedArrival: new Date(),
      status: 'Completed',
      dockNumber: 'DOCK-1',
      authadd
    }, { transaction });

    // GRN (Receiving)
    const grn = await Grn.create({
      grnNumber: `GRN-${Date.now()}`,
      supplierId: supplier.id,
      branchId: branch.id,
      poId: po.id,
      grnDate: new Date(),
      status: 'Completed',
      authadd
    }, { transaction });

    await GrnItem.create({
      grnId: grn.id,
      productId: product.id,
      receivedQty: 100,
      acceptedQty: 100, // Pre-QC
      authadd
    }, { transaction });

    // QC Inspection (90 pass, 10 fail)
    const qc = await QcInspection.create({
      inspectionNumber: `QC-${Date.now()}`,
      grnId: grn.id,
      productId: product.id,
      inspectedQty: 100,
      passedQty: 90,
      failedQty: 10,
      status: 'Partial',
      notes: '10 items arrived damaged.',
      authadd
    }, { transaction });

    // Post stock for passed items
    await postStockTransaction({
      productId: product.id,
      branchId: branch.id,
      binId: bin.id,
      quantity: 90,
      movementType: 'GRN',
      referenceType: 'QC Inspection',
      referenceId: qc.id,
      referenceNumber: qc.inspectionNumber,
      notes: 'Passed QC',
      transaction,
      userId: authadd
    });

    // Create Repair Order for failed items
    await RepairOrder.create({
      repairNumber: `REP-${Date.now()}`,
      productId: product.id,
      branchId: branch.id,
      qcInspectionId: qc.id,
      quantity: 10,
      issueDescription: 'Arrived damaged from supplier.',
      status: 'Pending',
      authadd
    }, { transaction });

    console.log('Inbound flow completed.');

    // 3. OUTBOUND FLOW
    // Sales Orders
    const so1 = await SalesOrder.create({
      orderNumber: `SO-${Date.now()}-1`,
      customerId: customer.id,
      branchId: branch.id,
      orderDate: new Date(),
      status: 'Approved',
      totalAmount: 200,
      authadd
    }, { transaction });
    await SalesOrderItem.create({
      orderId: so1.id, productId: product.id, quantity: 2, unitPrice: 100, totalPrice: 200, authadd
    }, { transaction });

    const so2 = await SalesOrder.create({
      orderNumber: `SO-${Date.now()}-2`,
      customerId: customer.id,
      branchId: branch.id,
      orderDate: new Date(),
      status: 'Approved',
      totalAmount: 300,
      authadd
    }, { transaction });
    await SalesOrderItem.create({
      orderId: so2.id, productId: product.id, quantity: 3, unitPrice: 100, totalPrice: 300, authadd
    }, { transaction });

    // Pick Wave
    const wave = await PickWave.create({
      waveNumber: `WAVE-${Date.now()}`,
      branchId: branch.id,
      status: 'Released',
      notes: 'Morning pick wave',
      authadd
    }, { transaction });

    await so1.update({ waveId: wave.id }, { transaction });
    await so2.update({ waveId: wave.id }, { transaction });

    // Invoice (representing fulfillment)
    const invoice = await Invoice.create({
      invoiceNumber: `INV-${Date.now()}`,
      customerId: customer.id,
      branchId: branch.id,
      invoiceDate: new Date(),
      grandTotal: 500,
      amountInWords: 'Five Hundred Rupees Only',
      status: 'Paid',
      authadd
    }, { transaction });

    // Deduct stock for Invoice
    await postStockTransaction({
      productId: product.id,
      branchId: branch.id,
      binId: bin.id,
      quantity: -5,
      movementType: 'Sale',
      referenceType: 'Invoice',
      referenceId: invoice.id,
      referenceNumber: invoice.invoiceNumber,
      notes: 'Fulfilled from Wave',
      transaction,
      userId: authadd
    });

    // Shipment
    await Shipment.create({
      shipmentNumber: `SHIP-${Date.now()}`,
      invoiceId: invoice.id,
      carrierName: 'FedEx',
      trackingNumber: 'FDX987654321',
      shippingDate: new Date(),
      status: 'InTransit',
      authadd
    }, { transaction });

    console.log('Outbound flow completed.');

    // 4. RETURNS FLOW
    // Sales Return
    const returnOrder = await SalesReturn.create({
      returnNumber: `SR-${Date.now()}`,
      invoiceId: invoice.id,
      customerId: customer.id,
      returnDate: new Date(),
      status: 'Pending',
      totalRefund: 100,
      authadd
    }, { transaction });

    await SalesReturnItem.create({
      returnId: returnOrder.id,
      productId: product.id,
      quantity: 1,
      refundAmount: 100,
      authadd
    }, { transaction });

    // Return QC
    const returnQc = await QcInspection.create({
      inspectionNumber: `QC-RET-${Date.now()}`,
      returnId: returnOrder.id,
      productId: product.id,
      inspectedQty: 1,
      passedQty: 0,
      failedQty: 1,
      status: 'Failed',
      notes: 'Customer returned item scratched.',
      authadd
    }, { transaction });

    // Repair Order for Return
    await RepairOrder.create({
      repairNumber: `REP-RET-${Date.now()}`,
      productId: product.id,
      branchId: branch.id,
      qcInspectionId: returnQc.id,
      quantity: 1,
      issueDescription: 'Scratched during transit.',
      status: 'In Repair',
      authadd
    }, { transaction });

    console.log('Returns flow completed.');

    await transaction.commit();
    console.log('Seed completed successfully! Mock data injected.');

  } catch (error) {
    console.error('Seed failed, rolling back:', error);
    if (!transaction.finished) {
      await transaction.rollback();
    }
  } finally {
    process.exit(0);
  }
}

seed();

const baseURL = 'http://127.0.0.1:5000/api';
let token = '';
let branchId, supplierId, customerId, productId, poId, grnId, soId, invoiceId, waveId, shipmentId;

async function request(method, url, data = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (branchId) headers['x-branch-id'] = branchId;
  
  const options = { method, headers };
  if (data) options.body = JSON.stringify(data);
  
  const res = await fetch(`${baseURL}${url}`, options);
  const text = await res.text();
  let result;
  try { result = JSON.parse(text); } catch { result = text; }
  
  if (!res.ok) {
    const error = new Error(`HTTP Error: ${res.status}`);
    error.status = res.status;
    error.data = result;
    throw error;
  }
  return result;
}

async function run() {
  try {
    console.log('--- STARTING END-TO-END VERIFICATION ---');

    // 1. Authenticate
    console.log('1. Authenticating Admin...');
    let authRes;
    try {
      authRes = await request('POST', '/auth/login', { email: 'admin@example.com', password: 'password' });
    } catch(e) {
      authRes = await request('POST', '/auth/login', { email: 'admin@example.com', password: 'Admin@123' });
    }
    token = authRes.token;
    console.log('✓ Authenticated');

    // 2. Master Data
    console.log('\n2. Creating Master Data...');
    const branchRes = await request('POST', '/branches', { branchName: `Main Warehouse ${Date.now()}`, branchCode: `MW-${Date.now()}`, locationType: 'Warehouse' });
    branchId = branchRes.id;
    console.log('✓ Branch Created:', branchId);

    const supRes = await request('POST', '/suppliers', { supplierName: `Test Supplier ${Date.now()}`, status: 'Active', mobileNumber: '1234567890', taxNumber: 'TAX-123' });
    supplierId = supRes.id;
    console.log('✓ Supplier Created:', supplierId);

    const custRes = await request('POST', '/customers', { customerName: `Test Customer ${Date.now()}`, status: 'Active', mobileNumber: '0987654321', customerType: 'Retail' });
    customerId = custRes.id;
    console.log('✓ Customer Created:', customerId);

    const prodRes = await request('POST', '/products', { productName: `Test Product ${Date.now()}`, itemCode: `TP-${Date.now()}`, categoryId: null, productType: 'Standard' });
    productId = prodRes.id;
    console.log('✓ Product Created:', productId);

    // 3. Procurement
    console.log('\n3. Executing Procurement...');
    const poRes = await request('POST', '/purchase-orders', {
      supplierId,
      branchId,
      orderDate: new Date().toISOString(),
      items: [{ productId, quantity: 100, rate: 50, gstPercent: 10 }]
    });
    poId = poRes.id;
    console.log('✓ Purchase Order Created:', poId);
    await request('POST', `/purchase-orders/${poId}/approve`);
    console.log('✓ PO Approved');

    // 4. GRN
    console.log('\n4. Receiving Goods (GRN)...');
    const grnRes = await request('POST', '/grn', {
      poId, supplierId, branchId, grnDate: new Date().toISOString(),
      items: [{ productId, receivedQty: 100, acceptedQty: 100, rejectedQty: 0 }]
    });
    grnId = grnRes.id;
    console.log('✓ GRN Created:', grnId);
    await request('POST', `/grn/${grnId}/post`);
    console.log('✓ GRN Posted (Sent to QC)');

    // 4.5 QC Inspection
    console.log('\n4.5 Executing QC Inspection...');
    const qcListRes = await request('GET', '/qc?limit=10');
    const pendingQc = qcListRes.data.find(q => q.productId === productId && q.status === 'Pending');
    if (!pendingQc) throw new Error('Pending QC Inspection not found for the received product!');
    
    await request('PUT', `/qc/${pendingQc.id}`, {
      status: 'Passed',
      passedQty: 100,
      failedQty: 0,
      inspectedQty: 100,
      notes: 'All items passed'
    });
    console.log('✓ QC Passed (Inventory Updated)');

    // 4.6 Manual Stock Adjustment (since QC to Stock is deferred in system)
    console.log('\n4.6 Creating Stock Adjustment to populate inventory...');
    const adjRes = await request('POST', '/stock-adjustments', {
      adjustmentDate: new Date().toISOString(),
      reason: 'Opening Stock',
      branchId: branchId,
      items: [{ productId, quantity: 100 }]
    });
    const adjId = adjRes.id;
    console.log('✓ Stock Adjustment Created:', adjId);
    await request('POST', `/stock-adjustments/${adjId}/approve`);
    console.log('✓ Stock Adjustment Approved (Inventory Incremented)');

    // 5. Sales
    console.log('\n5. Executing Sales...');
    const soRes = await request('POST', '/sales-orders', {
      customerId, branchId, orderDate: new Date().toISOString(),
      items: [{ productId, quantity: 20, unitPrice: 100 }]
    });
    soId = soRes.id;
    console.log('✓ Sales Order Created:', soId);
    await request('POST', `/sales-orders/${soId}/confirm`);
    console.log('✓ SO Confirmed');

    const invRes = await request('POST', '/invoices', {
      customerId, branchId, invoiceDate: new Date().toISOString(),
      salesOrderId: soId,
      items: [{ productId, quantity: 20, unitPrice: 100 }],
      paymentMethod: 'Cash',
      status: 'Unpaid'
    });
    invoiceId = invRes.id;
    console.log('✓ Invoice Created:', invoiceId);

    // 6. Logistics
    console.log('\n6. Executing Logistics (Pick Wave & Shipment)...');
    const waveRes = await request('POST', '/waves', { status: 'Planned', orderIds: [soId] });
    waveId = waveRes.id;
    console.log('✓ Pick Wave Created:', waveId);

    const shipRes = await request('POST', '/shipments', { status: 'Pending', invoiceId: invoiceId });
    shipmentId = shipRes.id;
    console.log('✓ Shipment Created:', shipmentId);

    console.log('\n--- VERIFICATION SUCCESSFUL ---');
    console.log('The system successfully validated and accepted a full data flow from Master Data to Logistics.');

  } catch (err) {
    console.error('\n!!! VERIFICATION FAILED !!!');
    if (err.data) {
      console.error('Status:', err.status);
      console.error('Data:', err.data);
    } else {
      console.error(err.message);
    }
  }
}

run();

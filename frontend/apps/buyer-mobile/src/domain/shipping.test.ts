import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shipmentDisplayCode, shipmentStatusLabel } from './shipping';

describe('shipment display helpers', () => {
  it('shows the Nexus tracking number before falling back to AWB', () => {
    assert.equal(
      shipmentDisplayCode({ provider: 'NEXUS', trackingNumber: ' 111504632289 ', awb: 'AWB-OLD' }),
      'NEXUS - 111504632289'
    );
    assert.equal(shipmentDisplayCode({ provider: 'NEXUS', trackingNumber: null, awb: ' 111504632200 ' }), 'NEXUS - 111504632200');
  });

  it('does not invent a shipment code when provider has not returned one', () => {
    assert.equal(shipmentDisplayCode(null), '');
    assert.equal(shipmentDisplayCode({ provider: 'NEXUS', trackingNumber: ' ', awb: null }), '');
  });

  it('labels shipment statuses for buyers', () => {
    assert.equal(shipmentStatusLabel('AWB_CREATED'), 'Đã tạo vận đơn');
    assert.equal(shipmentStatusLabel('OUT_FOR_DELIVERY'), 'Đang giao');
  });
});

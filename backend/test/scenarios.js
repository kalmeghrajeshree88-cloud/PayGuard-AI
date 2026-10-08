// Run with: npm test   (no dependencies needed)
const assert = require('assert');
const { analyze } = require('../services/riskEngine');
const { heuristicParse } = require('../services/intentEngine');

const user = {
  averageTransaction: 3000,
  usualLocations: ['Pune'],
  trustedDevices: ['macbook-demo'],
  knownRecipients: [
    { name: 'Amazon India', category: 'purchase' },
    { name: 'Rahul Sharma', category: 'family' },
    { name: 'Electricity Board', category: 'bill' },
  ],
};
const good = { confidence: 0.9, category: 'purchase', scamSignals: [] };
const trusted = { deviceId: 'macbook-demo', location: 'Pune' };

const cases = [
  ['1 Normal payment', { recipient: 'Amazon India', amount: 2000 }, trusted, good, 'approve'],
  ['2 Unusual amount', { recipient: 'Rahul Sharma', amount: 70000 }, trusted, { ...good, category: 'family' }, 'verify'],
  ['3 New recipient', { recipient: 'ABC Electronics', amount: 50000 }, trusted, good, 'strong_verify'],
  [
    '4 Multiple anomalies',
    { recipient: 'Unknown Seller', amount: 150000 },
    { deviceId: 'unknown-device-77', location: 'Moscow' },
    { confidence: 0.3, category: 'other', scamSignals: [] },
    'hold',
  ],
];

let failed = 0;
for (const [name, payment, context, intent, expected] of cases) {
  const r = analyze({ user, payment, context, intent });
  const ok = r.decision === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: score=${r.riskScore} decision=${r.decision} (expected ${expected})`);
}

// Intent parser checks
const i1 = heuristicParse({ recipient: 'Rahul', amount: 30000, purpose: 'Laptop', description: 'I am paying ₹30,000 to Rahul for the laptop I purchased.' });
assert.strictEqual(i1.amount, 30000);
assert.strictEqual(i1.recipient, 'Rahul');
assert.strictEqual(i1.category, 'purchase');
const i2 = heuristicParse({ recipient: 'X', amount: 1, purpose: 'Fee', description: 'Urgent! Pay Rs 1,50,000 as processing fee to claim your lottery prize' });
assert.strictEqual(i2.amount, 150000);
assert.ok(i2.scamSignals.length >= 2);
const i3 = heuristicParse({ recipient: 'A', amount: 5, purpose: 'pay 20k to Sam', description: '' });
assert.strictEqual(i3.amount, 20000);
console.log('PASS  intent parser checks');

if (failed) {
  console.error(`\n${failed} scenario(s) failed`);
  process.exit(1);
}
console.log('\nAll tests passed');

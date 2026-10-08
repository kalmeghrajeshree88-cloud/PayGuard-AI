const bcrypt = require('bcryptjs');

const store = process.env.MONGO_URI ? require('./mongoStore') : require('./memoryStore');
const baseInit = store.init.bind(store);

async function init() {
  await baseInit();
  const demoEmail = 'demo@payguard.ai';
  if (!(await store.findUserByEmail(demoEmail))) {
    await store.createUser({
      name: 'Demo User',
      email: demoEmail,
      passwordHash: await bcrypt.hash('Demo@1234', 10),
      averageTransaction: 3000,
      usualLocations: ['Pune'],
      trustedDevices: ['macbook-demo'],
      knownRecipients: [
        { name: 'Amazon India', category: 'purchase', count: 12 },
        { name: 'Rahul Sharma', category: 'family', count: 5 },
        { name: 'Electricity Board', category: 'bill', count: 9 },
      ],
      riskProfile: 'standard',
    });
  }
  console.log(`[store] using ${store.name}`);
}

module.exports = Object.assign(store, { init });

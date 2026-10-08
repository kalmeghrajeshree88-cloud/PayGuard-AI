// In-memory store: zero setup, data resets when the server restarts.
const crypto = require('crypto');

const users = [];
const transactions = [];
const riskEvents = [];
const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);

module.exports = {
  name: 'memory',
  async init() {},
  async findUserByEmail(email) {
    return clone(users.find((u) => u.email === email));
  },
  async getUserById(id) {
    return clone(users.find((u) => u.id === id));
  },
  async createUser(data) {
    const u = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data };
    users.push(u);
    return clone(u);
  },
  async updateUser(id, patch) {
    const u = users.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
    return clone(u);
  },
  async addTransaction(data) {
    const t = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data };
    transactions.push(t);
    return clone(t);
  },
  async getTransaction(id) {
    return clone(transactions.find((t) => t.id === id));
  },
  async updateTransaction(id, patch) {
    const t = transactions.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, patch);
    return clone(t);
  },
  async findTransaction(filter) {
    return clone(transactions.find((t) => Object.entries(filter).every(([k, v]) => t[k] === v)));
  },
  async listTransactions(userId) {
    return clone(transactions.filter((t) => t.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  },
  async addRiskEvents(events) {
    events.forEach((e) => riskEvents.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...e }));
  },
  async listRiskEvents(userId, limit = 100) {
    return clone(riskEvents.filter((e) => e.userId === userId).slice(-limit).reverse());
  },
};

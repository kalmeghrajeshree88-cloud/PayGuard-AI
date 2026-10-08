// MongoDB store (used when MONGO_URI is set). Same API as memoryStore.
const mongoose = require('mongoose');

const flexible = (extra = {}) => new mongoose.Schema(extra, { strict: false });
const User = mongoose.model('User', flexible({ email: { type: String, unique: true, index: true } }));
const Transaction = mongoose.model('Transaction', flexible({ userId: { type: String, index: true } }));
const RiskEvent = mongoose.model('RiskEvent', flexible({ userId: { type: String, index: true } }));

const lean = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, ...rest } = o;
  return { id: String(_id), ...rest };
};
const validId = (id) => mongoose.isValidObjectId(id);

module.exports = {
  name: 'mongodb',
  async init() {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  },
  async findUserByEmail(email) {
    return lean(await User.findOne({ email }));
  },
  async getUserById(id) {
    return validId(id) ? lean(await User.findById(id)) : null;
  },
  async createUser(data) {
    return lean(await User.create({ createdAt: new Date().toISOString(), ...data }));
  },
  async updateUser(id, patch) {
    return validId(id) ? lean(await User.findByIdAndUpdate(id, { $set: patch }, { new: true })) : null;
  },
  async addTransaction(data) {
    return lean(await Transaction.create({ createdAt: new Date().toISOString(), ...data }));
  },
  async getTransaction(id) {
    return validId(id) ? lean(await Transaction.findById(id)) : null;
  },
  async updateTransaction(id, patch) {
    return validId(id) ? lean(await Transaction.findByIdAndUpdate(id, { $set: patch }, { new: true })) : null;
  },
  async findTransaction(filter) {
    return lean(await Transaction.findOne(filter));
  },
  async listTransactions(userId) {
    return (await Transaction.find({ userId }).sort({ createdAt: 1 })).map(lean);
  },
  async addRiskEvents(events) {
    if (events.length) await RiskEvent.insertMany(events.map((e) => ({ createdAt: new Date().toISOString(), ...e })));
  },
  async listRiskEvents(userId, limit = 100) {
    return (await RiskEvent.find({ userId }).sort({ createdAt: -1 }).limit(limit)).map(lean);
  },
};

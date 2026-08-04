const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blura_hub');
  } catch (error) {
    (() => {})(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

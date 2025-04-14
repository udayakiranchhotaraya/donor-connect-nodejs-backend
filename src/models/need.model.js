const mongoose = require('mongoose');
const { generateUUID } = require('../utils/uuid.utils');

const NeedsSchema = new mongoose.Schema({
    need_id: {
        type: String,
        required: true,
        unique: true,
        default: generateUUID(),
    },
    donation_center: {
        type: String,
        ref: 'Center',
        required: true,
    },
    item: {
        type: String,
        required: true,
        trim: true,
    },
    urgency: {
        type: String,
        enum: ['low', 'medium', 'high'],
        required: true,
        default: 'medium',
    },
    target_quantity: {
        type: Number,
        default: null, // optional
        min: 1,
    },
    current_received: {
        type: Number,
        default: 0,
        min: 0,
    },
    description: {
        type: String,
        trim: true,
        default: '',
    },
    status: {
        type: String,
        enum: ['open', 'fulfilled', 'closed'],
        default: 'open',
    }
}, {
  timestamps: true
});

const NeedsModel = mongoose.model('Need', NeedsSchema);
module.exports = NeedsModel;

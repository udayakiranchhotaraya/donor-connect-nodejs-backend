const mongoose = require('mongoose');
const { generateUUID } = require('../utils/uuid.utils')

const ContributionSchema = new mongoose.Schema({
    contribution_id: {
        type: String,
        required: true,
        unique: true,
        default: generateUUID()
    },
    user_id: {
        type: String,
        ref: 'User',
        required: true
    },
    need_id: {
        type: String,
        ref: 'Need',
        required: true
    },
    center_id: {
        type: String,
        ref: 'Center',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'rejected'],
        default: 'pending'
    },
    quantity: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true, strict: false
});

module.exports = mongoose.model('Contribution', ContributionSchema);
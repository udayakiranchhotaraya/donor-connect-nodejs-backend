const mongoose = require('mongoose');
const generateUUID = require('../utils/uuid.utils')

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
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Center',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending'
    },
    quantity: {
        type: Number,
        default: 0
    },
    items: [{
        type: String
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Contribution', ContributionSchema);
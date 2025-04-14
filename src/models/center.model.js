const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcrypt");
const { validateLocation } = require("../validators/location.validator");
const { generateUUID } = require("../utils/uuid.utils");
const { AWS_S3_BUCKET_NAME } = require("../config/config");

const CenterSchema = new mongoose.Schema({
    center_id: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    contactInfo: {
        email: {
            type: String,
            required: true,
            validate: {
                validator: function (value) {
                    return validator.isEmail(value);
                },
                message: (props) => `${props.value} is not a valid email`,
            },
        },
        phone: {
            type: String,
            validate: {
                validator: function (value) {
                    return validator.isMobilePhone(value, "en-IN");
                },
                message: (props) => `${props.value} is not a valid mobile number`,
            },
        },
        // address: {
        //     street: {
        //         type: String,
        //     },
        //     city: {
        //         type: String,
        //     },
        //     state: {
        //         type: String,
        //     },
        //     postalCode: {
        //         type: String,
        //         validate: {
        //             validator: function (value) {
        //                 return validator.isPostalCode(value, "IN");
        //             },
        //             message: (props) =>
        //                 `${props.value} is not a valid postal code`,
        //         },
        //     },
        // },
        address: {
            type: String,
            required: true
        }
    },
    website: {
        type: String,
        required: true
    },
    needs: {
        type: [String]
    },
    verification: {
        status: {
            type: String,
            enum: ['pending', 'verified', 'rejected', 'suspended'],
            default: 'pending'
        },
        documents: [{
            _id: false,
            document_ref_id: {
                type: String,
                required: true,
                default: generateUUID()
            },
            document: {
                name: {
                    type: String,
                    required: true
                },
                url: {
                    type: String,
                    required: true
                },
                s3_key: {
                    type: String,
                    required: true
                },
                bucket: {
                    type: String,
                    required: true,
                    default: AWS_S3_BUCKET_NAME
                }
            },
            status: {
                type: String,
                enum: ['pending', 'verified', 'rejected', 'suspended'],
                default: 'pending'
            }
        }]
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true,
            default: 'Point',
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
            // validate: {
            //     validator: function (value) {
            //         return value.length === 2;
            //     },
            //     message: 'Coordinates must be [longitude, latitude]',
            // }
            validate: {
                validator: function (value) {
                    const location = { type: 'Point', coordinates: value };
                    return validateLocation(location).isValid;
                },
                message: 'Invalid geo coordinates.'
            },
            index: '2dsphere'
        },
    },
    creator: {
        creator_id: {
            type: String,
            required: true
        },
        creator_email: {
            type: String,
            required: true,
            validate: {
                validator: function (value) {
                    return validator.isEmail(value);
                },
                message: (props) => `${props.value} is not a valid email`,
            },
        }
    },
    admin_id: {
        type: String,
        required: true
    }
}, { strict: false, timestamps: true });

const CenterModel = mongoose.model('Center', CenterSchema);
module.exports = CenterModel;

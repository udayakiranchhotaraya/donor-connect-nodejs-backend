const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcrypt');
const { SALT_ROUNDS } = require('../config/config');

const UserSchema = new mongoose.Schema({
    user_id: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        validate: {
            validator: function (value) {
                return validator.isEmail(value);
            },
            message: props => `${props.value} is not a valid email`
        },
        unique: true
    },
    roles: {
        type: [String],
        enum: ['donor', 'center-admin'],
        default: ['donor']
    },
    password: {
        type: String,
        validate: {
            validator: function (value) {
                return validator.isStrongPassword(value);
            },
            message: props => `${props.value} is not a strong password`
        }
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    contactNumber: {
        type: String,
        validate: {
            validator: function (value) {
                return validator.isMobilePhone(value, 'en-IN');
            },
            message: props => `${props.value} is not a valid mobile number`
        },
        unique: true
    },
    address: {
        street: {
            type: String
        },
        city: {
            type: String
        },
        state: {
            type: String
        },
        postalCode: {
            type: String,
            validate: {
                validator: function (value) {
                    return validator.isPostalCode(value, 'IN');
                },
                message: props => `${props.value} is not a valid postal code`
            }
        }
    },
    rewards: {
        points: {
            type: Number
        },
        level: {
            type: String
        },
        totalDonations: {
            type: Number
        }
    },
    isVerified: {
        type: Boolean,
        default: false
    }
});

// UserSchema.pre('save', async function (next) {
//     const user = this;

//     if (!(user.isModified('password'))) {
//         next();
//     }

//     try {
//         const salt = await bcrypt.genSalt(SALT_ROUNDS);

//         const hashedPassword = bcrypt.hash(user.password, salt);

//         user.password = String(hashedPassword);
//         next();
//     } catch (error) {
//         return next(error);
//     }
// });

// UserSchema.methods.comparePassword = async function (candidatePassword) {
//     try {
//         const isMatch = await bcrypt.compare(candidatePassword, this.password);
//         return isMatch;
//     } catch (error) {
//         console.error(error);
//     }
// }

const UserModel = mongoose.model('User', UserSchema);
module.exports = UserModel;
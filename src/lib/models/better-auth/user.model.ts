import mongoose, { Schema, type Document } from 'mongoose';

export interface IUser extends Document {
	name: string;
	email: string;
	emailVerified: boolean;
	image: string;
	createdAt: Date;
	updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
	name: {
		type: String,
		required: true
	},
	email: {
		type: String,
		required: true,
		unique: true
	},
	emailVerified: {
		type: Boolean,
		default: false
	},
	image: {
		type: String,
		required: true
	}
}, {
	timestamps: true
});

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

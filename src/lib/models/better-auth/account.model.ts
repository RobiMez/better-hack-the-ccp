import mongoose, { Schema, type Document } from 'mongoose';

export interface IAccount extends Document {
	accountId: string;
	providerId: string;
	userId: mongoose.Types.ObjectId;
	accessToken: string;
	idToken: string;
	accessTokenExpiresAt: Date;
	scope: string;
	createdAt: Date;
	updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>({
	accountId: {
		type: String,
		required: true
	},
	providerId: {
		type: String,
		required: true
	},
	userId: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	accessToken: {
		type: String,
		required: true
	},
	idToken: {
		type: String,
		required: true
	},
	accessTokenExpiresAt: {
		type: Date,
		required: true
	},
	scope: {
		type: String,
		required: true
	}
}, {
	timestamps: true
});

export const Account = mongoose.models.Account || mongoose.model<IAccount>('Account', AccountSchema, "account");

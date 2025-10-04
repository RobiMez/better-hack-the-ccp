import mongoose, { Schema, type Document } from 'mongoose';

export interface ISession extends Document {
	expiresAt: Date;
	token: string;
	ipAddress: string;
	userAgent: string;
	userId: mongoose.Types.ObjectId;
	createdAt: Date;
	updatedAt: Date;
}

const SessionSchema = new Schema<ISession>({
	expiresAt: {
		type: Date,
		required: true
	},
	token: {
		type: String,
		required: true,
		unique: true
	},
	ipAddress: {
		type: String,
		required: true
	},
	userAgent: {
		type: String,
		required: true
	},
	userId: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true
	}
}, {
	timestamps: true
});

export const Session = mongoose.models.Session || mongoose.model<ISession>('Session', SessionSchema);

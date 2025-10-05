import mongoose, { Schema } from 'mongoose';
import {
	EventStatus,
	EventType,
	TicketTier,
	type IEvent
} from './event.model.types.js';

const EventSchema = new Schema<IEvent>({
	eventType: {
		type: String,
		enum: Object.values(EventType),
		required: true
	},
	organizerId: {
		type: Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	name: {
		type: String,
		required: true
	},
	description: String,
	status: {
		type: String,
		enum: Object.values(EventStatus),
		default: EventStatus.DRAFT
	},
	bounds: {
		start: {
			type: Date,
			required: true
		},
		end: {
			type: Date,
			required: true
		}
	},
	locked: {
		type: Boolean,
		default: false
	},
	rsvpList: [{
		type: Schema.Types.ObjectId,
		ref: 'User'
	}],
	// Small event fields (optional)
	inviteList: [{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User'
		},
		email: {
			type: String,
			required: true
		},
		status: {
			type: String,
			enum: ['pending', 'accepted', 'declined'],
			default: 'pending'
		},
		inviteCode: {
			type: String,
			required: true,
			unique: true
		},
		qrCodeUrl: {
			type: String
		},
		createdAt: {
			type: Date,
			default: Date.now
		},
		updatedAt: {
			type: Date
		},
		respondedByEmail: {
			type: String
		}
	}],
	// Large event fields (optional)
	ticketSlots: [{
		tier: {
			type: String,
			enum: Object.values(TicketTier)
		},
		totalSlots: {
			type: Number,
			min: 0
		},
		availableSlots: {
			type: Number,
			min: 0
		},
		price: {
			type: Number,
			min: 0
		}
	}]
}, {
	timestamps: true
});

export const Event = mongoose.models.Event || mongoose.model<IEvent>('Event', EventSchema);
// NOTE: When updating schema, also update the corresponding types in event.model.types.ts
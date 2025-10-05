import mongoose from 'mongoose';

const timeSlotPreferenceSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			index: true
		},
		eventId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Event',
			required: true,
			index: true
		},
		dayOfWeek: {
			type: String,
			required: true
		},
		date: {
			type: String,
			required: true
		},
		startTime: {
			type: String,
			required: true
		},
		endTime: {
			type: String,
			required: true
		},
		startISO: {
			type: String,
			required: true
		},
		endISO: {
			type: String,
			required: true
		},
		duration: {
			type: String,
			required: true
		},
		durationMinutes: {
			type: Number,
			required: true
		},
		eventId_slot: {
			type: String,
			required: true
		},
		title: {
			type: String,
			required: true
		},
		userEmail: {
			type: String,
			required: true
		},
		userName: {
			type: String
		}
	},
	{
		timestamps: true
	}
);

// Compound index to ensure one preference per user per event
timeSlotPreferenceSchema.index({ userId: 1, eventId: 1 }, { unique: true });

export const TimeSlotPreference =
	mongoose.models.TimeSlotPreference ||
	mongoose.model('TimeSlotPreference', timeSlotPreferenceSchema);


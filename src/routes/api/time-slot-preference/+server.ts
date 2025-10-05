import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TimeSlotPreference } from '$lib/models/time-slot-preference.model.js';
import { connectDB } from '$lib/db.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const user = locals.user;
		if (!user) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		await connectDB();

		const { timeSlot, eventId } = await request.json();

		if (!timeSlot || !eventId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Prepare the data to save
		const preferenceData = {
			userId: user.id,
			eventId: eventId,
			dayOfWeek: timeSlot.dayOfWeek,
			date: timeSlot.date,
			startTime: timeSlot.startTime,
			endTime: timeSlot.endTime,
			startISO: timeSlot.startISO,
			endISO: timeSlot.endISO,
			duration: timeSlot.duration,
			durationMinutes: timeSlot.durationMinutes,
			eventId_slot: timeSlot.eventId,
			title: timeSlot.title,
			userEmail: user.email,
			userName: user.name || user.email
		};

		console.log('Saving time slot preference:', preferenceData);

		// Use findOneAndUpdate with upsert to replace any existing preference
		const savedPreference = await TimeSlotPreference.findOneAndUpdate(
			{ userId: user.id, eventId: eventId },
			preferenceData,
			{ upsert: true, new: true, runValidators: true }
		);

		console.log('Time slot preference saved:', savedPreference);

		return json({
			success: true,
			preference: savedPreference
		});
	} catch (error) {
		console.error('Error saving time slot preference:', error);
		return json(
			{
				error: 'Failed to save time slot preference',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const user = locals.user;
		if (!user) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		await connectDB();

		const eventId = url.searchParams.get('eventId');

		if (!eventId) {
			return json({ error: 'Event ID is required' }, { status: 400 });
		}

		// Get the user's preference for this event
		const preference = await TimeSlotPreference.findOne({
			userId: user.id,
			eventId: eventId
		});

		return json({
			success: true,
			preference: preference || null
		});
	} catch (error) {
		console.error('Error fetching time slot preference:', error);
		return json(
			{
				error: 'Failed to fetch time slot preference',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};


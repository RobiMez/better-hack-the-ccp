import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Event } from '$lib/models.js';
import { EventType, EventStatus } from '$lib/models/event.model.types.js';
import { connectDB } from '$lib/db.js';

// GET - Fetch all events
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		await connectDB();
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const skip = parseInt(url.searchParams.get('skip') || '0');
		const status = url.searchParams.get('status');
		const eventType = url.searchParams.get('eventType');
		
		let query: any = {};
		if (status) query.status = status;
		if (eventType) query.eventType = eventType;
		
		const events = await Event.find(query)
			.populate('organizer_id', 'name email')
			.populate('rsvpList', 'name email')
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip(skip);
			
		const total = await Event.countDocuments(query);
		
		return json({
			events,
			total,
			limit,
			skip
		});
	} catch (error) {
		console.error('Error fetching events:', error);
		return json({ error: 'Failed to fetch events' }, { status: 500 });
	}
};

// POST - Create a new event
export const POST: RequestHandler = async ({ request }) => {
	try {
		await connectDB();
		
		const data = await request.json();
		const { eventType, organizer_id, name, description, bounds, inviteList, ticketSlots } = data;
		
		if (!eventType || !organizer_id || !name || !bounds) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}
		
		const eventData: any = {
			eventType,
			organizer_id,
			name,
			description,
			bounds,
			status: EventStatus.DRAFT
		};

		// Add type-specific fields
		if (eventType === EventType.SMALL && inviteList) {
			eventData.inviteList = inviteList;
		}
		if (eventType === EventType.LARGE && ticketSlots) {
			eventData.ticketSlots = ticketSlots;
		}
		
		const event = new Event(eventData);
		await event.save();
		await event.populate('organizer_id', 'name email');
		
		return json({ event }, { status: 201 });
	} catch (error) {
		console.error('Error creating event:', error);
		return json({ error: 'Failed to create event' }, { status: 500 });
	}
};

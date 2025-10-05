import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TimeSlotPreference } from '$lib/models/time-slot-preference.model.js';
import { connectDB } from '$lib/db.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { messages, eventContext } = await request.json();

		// Check if user is authenticated
		const user = locals.user;
		if (!user) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		await connectDB();

		// Fetch all time slot preferences for this event
		const preferences = await TimeSlotPreference.find({
			eventId: eventContext.eventId
		}).lean();

		// Build preferred times context
		let preferredTimesContext = '';
		if (preferences && preferences.length > 0) {
			preferredTimesContext = '\n\nParticipant Preferred Times:\n';
			preferences.forEach((pref: any, index: number) => {
				preferredTimesContext += `${index + 1}. ${pref.userName || pref.userEmail}: ${pref.dayOfWeek}, ${pref.date} from ${pref.startTime} to ${pref.endTime} (${pref.duration})\n`;
			});
			preferredTimesContext += `\nTotal participants who selected preferred times: ${preferences.length}\n`;
		} else {
			preferredTimesContext = '\n\nNo participants have selected preferred times yet.\n';
		}

		// Build system prompt with event context and preferred times
		const systemPrompt = `You are a helpful AI assistant helping users plan an event. 

Event Details:
- Event Name: ${eventContext.eventName}
- Organizer: ${eventContext.organizerName}
- Event Window: ${eventContext.startTime} to ${eventContext.endTime}
- User Role: ${eventContext.isOrganizer ? 'Organizer' : 'Participant'}
${preferredTimesContext}
Your role is to:
1. Help users understand the event details
2. Assist with scheduling and finding suitable times
3. Answer questions about the event
4. Help coordinate with other participants
5. Consider all participants' preferred times when making scheduling recommendations
6. Identify overlapping time preferences and suggest the best times that work for most people
7. Provide clear, friendly, and helpful responses

When discussing timing:
- Always consider the preferred times that participants have selected
- If multiple participants have overlapping preferences, highlight those times as strong candidates
- If preferences don't overlap, explain the conflicts and suggest compromise times
- If no preferences are set yet, encourage participants to select their preferred times using the calendar

If the user asks about available times, remind them they can use the "Check Free Times" button to analyze their calendar.
If they make a time selection, acknowledge it and offer to help confirm their preference.

Keep responses concise, friendly, and focused on helping plan this specific event.`;

		// Create the AI response stream
		const result = streamText({
			model: google('gemini-2.5-flash'),
			messages: [
				{
					role: 'system',
					content: systemPrompt
				},
				...messages
			],
			temperature: 0.7
		});

		// Return the stream
		return result.toTextStreamResponse();
	} catch (error) {
		console.error('Chat API error:', error);
		return json(
			{
				error: 'Failed to generate response',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};


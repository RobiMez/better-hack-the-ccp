<script lang="ts">
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import { Plus, Pencil, Trash, Calendar, Users, Ticket, Copy, Check } from 'phosphor-svelte';
	import { EventType, EventStatus } from '$lib/models/event.model.types.js';
	import CreateEditDialog from './components/createEditDialog.svelte';

	let { data }: { data: any } = $props();
	console.log(data);

	let events = $state(data.events || []);
	let showDialog = $state(false);
	let editingEvent = $state(null);
	let loading = $state(false);
	let copiedInvites = $state(new Set()); // Track which invite links have been copied

	// Form state
	let formData = $state({
		eventType: EventType.SMALL,
		organizerId: undefined as string | undefined,
		name: '',
		description: '',
		bounds: {
			start: '',
			end: ''
		},
		inviteList: [],
		ticketSlots: []
	});

	function resetForm() {
		formData = {
			eventType: EventType.SMALL,
			organizerId: undefined,
			name: '',
			description: '',
			bounds: {
				start: '',
				end: ''
			},
			inviteList: [],
			ticketSlots: []
		};
		editingEvent = null;
	}

	function openCreateDialog() {
		resetForm();
		showDialog = true;
	}

	async function handleSave() {
		if (editingEvent) {
			await updateEvent(editingEvent);
		} else {
			await createEvent();
		}
	}

	function handleCancel() {
		resetForm();
	}

	async function createEvent() {
		loading = true;
		try {
			const eventPayload = {
				...formData,
				organizerId: data.user?._id || data.user?.id // Use actual logged-in user ID
			};
			
			const response = await fetch('/api/events', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(eventPayload)
			});

			const result = await response.json();

			if (response.ok) {
				events = [result.event, ...events];
				showDialog = false;
				resetForm();
			} else {
				alert('Error creating event: ' + result.error);
			}
		} catch (error) {
			console.error('Error creating event:', error);
			alert('Failed to create event');
		} finally {
			loading = false;
		}
	}

	async function updateEvent(eventId: string) {
		loading = true;
		try {
			const response = await fetch(`/api/events/${eventId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(formData)
			});

			const result = await response.json();

			if (response.ok) {
				const index = events.findIndex((e: any) => e._id === eventId);
				if (index !== -1) {
					events[index] = result.event;
				}
				showDialog = false;
				resetForm();
			} else {
				alert('Error updating event: ' + result.error);
			}
		} catch (error) {
			console.error('Error updating event:', error);
			alert('Failed to update event');
		} finally {
			loading = false;
		}
	}

	async function deleteEvent(eventId: string) {
		if (!confirm('Are you sure you want to delete this event?')) return;

		loading = true;
		try {
			const response = await fetch(`/api/events/${eventId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				events = events.filter((e: any) => e._id !== eventId);
			} else {
				const result = await response.json();
				alert('Error deleting event: ' + result.error);
			}
		} catch (error) {
			console.error('Error deleting event:', error);
			alert('Failed to delete event');
		} finally {
			loading = false;
		}
	}

	function startEdit(event: any) {
		editingEvent = event._id;
		formData = {
			eventType: event.eventType,
			organizerId: event.organizerId?._id || event.organizerId,
			name: event.name,
			description: event.description || '',
			bounds: {
				start: new Date(event.bounds.start).toISOString().slice(0, 16),
				end: new Date(event.bounds.end).toISOString().slice(0, 16)
			},
			inviteList: event.inviteList || [],
			ticketSlots: event.ticketSlots || []
		};
		showDialog = true;
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getStatusColor(status: string) {
		switch (status) {
			case EventStatus.DRAFT:
				return 'bg-muted text-muted-foreground';
			case EventStatus.INVITING:
				return 'bg-primary/10 text-primary';
			case EventStatus.FINALIZED:
				return 'bg-secondary/10 text-secondary-foreground';
			case EventStatus.CANCELLED:
				return 'bg-destructive/10 text-destructive';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	async function copyInviteLink(inviteCode: string) {
		try {
			const inviteUrl = `${window.location.origin}/rsvp/${inviteCode}`;
			await navigator.clipboard.writeText(inviteUrl);

			// Add to copied set and remove after 2 seconds
			copiedInvites.add(inviteCode);
			copiedInvites = copiedInvites; // Trigger reactivity

			setTimeout(() => {
				copiedInvites.delete(inviteCode);
				copiedInvites = copiedInvites; // Trigger reactivity
			}, 2000);
		} catch (error) {
			console.error('Failed to copy invite link:', error);
			alert('Failed to copy invite link');
		}
	}
</script>

<header class="flex h-16 shrink-0 items-center gap-2">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<h3>Events</h3>
	</div>
</header>

<section class="flex flex-col gap-6 p-4">
	<div class="border-primary flex items-center justify-between border-b pb-4">
		<h1 class="text-3xl font-light">Event Management</h1>
		<Button onclick={openCreateDialog} class="flex items-center gap-2">
			<Plus size={16} weight="duotone" />
			Create Event
		</Button>
	</div>

	<CreateEditDialog
		bind:open={showDialog}
		{editingEvent}
		bind:formData
		{loading}
		onSave={handleSave}
		onCancel={handleCancel}
	/>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
		{#each events as event (event._id)}
			<div
				class="border-border bg-card hover:border-primary flex flex-col gap-2 rounded-lg border p-4 transition-colors h-full "
			>
				<div class="border-primary/20 flex items-center justify-between border-b">
					<div class="flex items-center gap-2">
						{#if event.eventType === EventType.SMALL}
							<Users size={20} class="text-primary" weight="duotone" />
						{:else}
							<Ticket size={20} class="text-primary" weight="duotone" />
						{/if}
						<span class="text-muted-foreground text-xs font-medium uppercase">
							{event.eventType} EVENT
						</span>
					</div>
					<span class="rounded-full px-2 py-1 text-xs {getStatusColor(event.status)}">
						{event.status}
					</span>

					<div class="text-muted-foreground flex items-center text-xs">
						<span>Organizer: {event.organizerId?.name || 'Unknown'}</span>
					</div>
				</div>

				<div>
					<h3 class="text-card-foreground mb-2 text-lg font-semibold">{event.name}</h3>

					{#if event.description}
						<p class="text-muted-foreground mb-3 line-clamp-2 text-sm">{event.description}</p>
					{/if}
				</div>

				<div class="text-muted-foreground flex flex-row items-center justify-between">
					<span class="flex items-center gap-2">
						<Calendar size={14} />
						<span class="text-sm">{formatDate(event.bounds.start)}</span>
					</span>
					<span class="flex items-center gap-2">
						<Calendar size={14} />
						<span class="text-sm">{formatDate(event.bounds.end)}</span>
					</span>
				</div>

				{#if event.eventType === EventType.SMALL && event.inviteList && event.inviteList.length > 0}
					<div class="border-primary/20 flex flex-col gap-2 rounded-md border mt-2">
						<div class="bg-accent flex flex-row items-center justify-between p-2">
							<p class="text-muted-foreground text-sm font-medium">Invite Links:</p>
							{#if event.eventType === EventType.SMALL && event.inviteList && event.inviteList.length > 0}
								<span class="flex items-center gap-1 text-sm">
									<Users size={12} />
									{event.inviteList.length} invited
								</span>
							{/if}
						</div>
						<div class="flex flex-col p-2">
							{#each event.inviteList as invite, index (invite.inviteCode || `${invite.email}-${index}`)}
								<div class="bg-muted/50 flex items-center gap-2 rounded text-xs">
									<span class="flex-1 truncate">{invite.email}</span>
									<span
										class="rounded px-1 py-0.5 text-xs {invite.status === 'accepted'
											? 'bg-green-100 text-green-700'
											: invite.status === 'declined'
												? 'bg-red-100 text-red-700'
												: 'bg-yellow-100 text-yellow-700'}"
									>
										{invite.status}
									</span>
									{#if invite.inviteCode}
										<Button
											size="sm"
											variant="ghost"
											onclick={() => copyInviteLink(invite.inviteCode)}
											class="h-6 w-6 flex-shrink-0 p-0"
											title="Copy invite link"
										>
											{#if copiedInvites.has(invite.inviteCode)}
												<Check size={10} class="text-green-600" />
											{:else}
												<Copy size={10} />
											{/if}
										</Button>
									{:else}
										<span class="text-muted-foreground text-xs">No link</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if event.timeSlotPreferences && event.timeSlotPreferences.length > 0}
					<div class="border-primary/20 flex flex-col gap-2 rounded-md border mt-2">
						<div class="bg-accent flex flex-row items-center justify-between p-2">
							<p class="text-muted-foreground text-sm font-medium">Time Slot Preferences:</p>
							<span class="flex items-center gap-1 text-sm">
								<Calendar size={12} />
								{event.timeSlotPreferences.length} preference{event.timeSlotPreferences.length !== 1 ? 's' : ''}
							</span>
						</div>
						<div class="flex flex-col gap-1 p-2">
							{#each event.timeSlotPreferences as preference (preference._id)}
								<div class="bg-muted/50 flex flex-col gap-1 rounded p-2 text-xs">
									<div class="flex items-center justify-between">
										<span class="font-medium">{preference.userEmail}</span>
										{#if preference.userName}
											<span class="text-muted-foreground">({preference.userName})</span>
										{/if}
									</div>
									<div class="text-primary flex items-center gap-1 font-semibold">
										<Calendar size={12} weight="duotone" />
										<span>{preference.dayOfWeek}, {preference.date}</span>
									</div>
									<div class="text-muted-foreground">
										{preference.startTime} - {preference.endTime}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<div class="flex flex-row gap-2 self-end align-end mt-auto">
					<Button
						size="sm"
						variant="outline"
						onclick={() => startEdit(event)}
						class="flex items-center gap-1"
					>
						<Pencil size={12} />
						Edit
					</Button>
					<Button
						size="sm"
						variant="outline"
						onclick={() => deleteEvent(event._id)}
						class="text-destructive hover:text-destructive flex items-center gap-1"
					>
						<Trash size={12} />
						Delete
					</Button>
				</div>
			</div>
		{/each}
	</div>

	{#if events.length === 0}
		<div class="py-12 text-center">
			<Calendar size={48} class="mx-auto mb-4 text-gray-400" />
			<h3 class="mb-2 text-lg font-medium text-gray-900">No events yet</h3>
			<p class="mb-4 text-gray-500">Get started by creating your first event.</p>
			<Button onclick={openCreateDialog} class="mx-auto flex items-center gap-2">
				<Plus size={16} weight="duotone" />
				Create Event
			</Button>
		</div>
	{/if}

	{#if data.error}
		<div class="rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
			<strong>Error:</strong>
			{data.error}
		</div>
	{/if}
</section>

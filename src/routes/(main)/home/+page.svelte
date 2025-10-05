<script lang="ts">
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Plus } from 'phosphor-svelte';
	import CreateEditDialog from '../events/components/createEditDialog.svelte';
	import { EventType } from '$lib/models/event.model.types.js';

	import { Calendar, TimeGrid, Interaction } from '@event-calendar/core';

	let { data }: { data: any } = $props();

	// Dialog state
	let showDialog = $state(false);
	let loading = $state(false);

	// Form state for quick create
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
	}

	async function handleSave() {
		loading = true;
		try {
			const eventPayload = {
				...formData,
				organizerId: data.user?._id || data.user?.id
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
				showDialog = false;
				resetForm();
				// Refresh the page to show the new event
				window.location.reload();
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

	function handleCancel() {
		resetForm();
		showDialog = false;
	}

	let options = $state({
		view: 'timeGridWeek',
		height: '600px',
		headerToolbar: {
			start: 'prev,next today',
			center: 'title',
			end: 'dayGridMonth,timeGridWeek,timeGridDay'
		},
		events: data.events || [],
		editable: true,
		selectable: true,
		dayMaxEvents: true,
		eventClick: (info: any) => {
			console.log('Event clicked:', info.event);
			alert(`Event: ${info.event.title}\nStart: ${info.event.start}\nEnd: ${info.event.end}`);
		},
		dateClick: (info: any) => {
			console.log('Date clicked:', info.date);
		},
		select: (info: any) => {
			console.log('Time range selected:', info);
			// Pre-fill form with selected time range
			formData.bounds.start = new Date(info.start).toISOString().slice(0, 16);
			formData.bounds.end = new Date(info.end).toISOString().slice(0, 16);
			
			// Open the create dialog
			showDialog = true;
		},
		eventMouseEnter: (info: any) => {
			console.log('Event hover:', info.event);
		},
		// Better styling - show full day to catch all events
		slotMinTime: '00:00:00',
		slotMaxTime: '24:00:00',
		slotDuration: '00:30:00',
		allDaySlot: false,
		// Event styling
		eventBackgroundColor: '#ff9999',
		eventTextColor: '#000000',
		// Display event details
		displayEventEnd: true,
		eventTimeFormat: {
			hour: 'numeric' as const,
			minute: '2-digit' as const
		}
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@event-calendar/core@4.6.0/index.css" />
</svelte:head>

<header class="flex h-16 shrink-0 items-center gap-2">
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ml-1" />
		<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		<h3>Home</h3>
	</div>
</header>

<section class="flex flex-col gap-4">
	<div>
		<h1 class="text-4xl font-thin">
			Welcome back {data.user.name}
		</h1>
	</div>
	<span class="text-primary/50 text-sm"> You have </span>

	<div class="grid grid-cols-1 space-x-12 lg:grid-cols-3">
		<div
			class="border-primary relative flex flex-col items-center justify-around gap-4 border p-12"
		>
			<a
				href="/events"
				class="hover:bg-primary/10 absolute top-2 right-2 flex flex-row gap-2 p-1 transition-colors"
			>
				<Plus size={16} weight="duotone" class="text-primary" />
				Create new event
			</a>
			<h1 class="text-5xl font-light">X</h1>
			<span class="text-xs whitespace-nowrap"> Upcoming Events </span>
		</div>
		<div class="border-primary flex flex-col items-center justify-around gap-4 border p-12">
			<h1 class="text-5xl font-light">Y</h1>
			<span class="text-xs whitespace-nowrap"> People Pending RSVP on upcoming small event </span>
		</div>
		<div class="border-primary flex flex-col items-center justify-around gap-4 border p-12">
			<h1 class="text-5xl font-light">Z</h1>
			<span class="text-xs whitespace-nowrap"> Spots left on upcoming large event</span>
		</div>
	</div>

	{#if data.error}
		<div class="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
			<strong>Error:</strong>
			{data.error}
		</div>
	{/if}

	<small class="text-primary/50 text-sm">
		These are your free spots. Click and drag on a time range to quickly create a new event!
	</small>
	
	<Calendar plugins={[TimeGrid, Interaction]} {options} />
</section>

<!-- Quick Create Event Dialog -->
<CreateEditDialog 
	bind:open={showDialog}
	editingEvent={null}
	bind:formData={formData}
	{loading}
	onSave={handleSave}
	onCancel={handleCancel}
/>

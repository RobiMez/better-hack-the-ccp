<script lang="ts" module>
	const data = {
		user: {
			name: 'robi.work',
			email: 'better-hack@robi.work',
			avatar: '/android-chrome-192x192.png'
		},
		navMain: [
			{
				title: 'Home',
				url: '/home',
				icon: House,
				isActive: true
			},
			{
				title: 'Events & Invites',
				url: '/events',
				icon: CalendarStar,
				isActive: true
			}
		]
	};
</script>

<script lang="ts">
	import NavMain from './nav-main.svelte';

	import NavUser from './nav-user.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import CommandIcon from '@lucide/svelte/icons/command';
	import type { ComponentProps } from 'svelte';
	import { BoxArrowDown, CalendarStar, GearSix, House, Ticket } from 'phosphor-svelte';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="##" {...props}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<CommandIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">Synk Up</span>
								<span class="truncate text-xs">The CCP</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={data.navMain} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser user={data.user} />
	</Sidebar.Footer>
</Sidebar.Root>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ArrowRight } from 'phosphor-svelte';

	const chars = '01!@#$%^&*()_+-=[]{}|;:,.<>?/~`абвгдежзийклмнопрстуфхцчшщъыьэюя';
	const rows = 100;
	const cols = 300;

	let isHovered = $state(false);
	let hasSetX = $state(false);

	let grid = $state(
		Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => chars[Math.floor(Math.random() * chars.length)])
		)
	);

	function randomizeGrid() {
		if (isHovered) {
			if (!hasSetX) {
				grid = grid.map((row) => row.map((char) => (char === ' ' ? ' ' : '-')));
				hasSetX = true;
			}
			// Don't update when hovered - frozen in place
		} else {
			hasSetX = false;
			grid = grid.map((row) =>
				row.map((char) => {
					// Only change ~10% of characters each tick for smoother transition
					if (Math.random() > 0.9) {
						return Math.random() > 0.7 ? chars[Math.floor(Math.random() * chars.length)] : ' ';
					}
					return char;
				})
			);
		}
	}

	setInterval(randomizeGrid, 50);
</script>

<div class="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden">
	<!-- ASCII Noise Background -->
	<div
		class="pointer-events-none absolute inset-0 font-mono text-xs leading-tight transition-all duration-300 {isHovered
			? 'text-primary/20'
			: 'text-primary/60'}"
		style="white-space: pre;"
	>
		{#each grid as row}
			{row.join('')}{'\n'}
		{/each}
	</div>

	<!-- Content -->
	<div class="relative z-10 flex flex-col items-center gap-6">
		<div class="flex flex-col items-center gap-4 p-12 bg-background/5 backdrop-blur-3xl border border-primary/20 ">
			<h1 class="text-[94px] font-extralight tracking-tight">Synk up</h1>
			<p class="text-muted-foreground text-lg">Show Up !</p>
		</div>

		<Button
			href="/home"
			size="lg"
			class="group gap-2"
			onmouseenter={() => (isHovered = true)}
			onmouseleave={() => (isHovered = false)}
		>
			Get Started
			<ArrowRight weight="bold" class="transition-transform group-hover:translate-x-1" />
		</Button>
	</div>
</div>

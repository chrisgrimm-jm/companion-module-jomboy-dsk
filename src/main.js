// Jomboy Media — OBS Downstream Keyer — Bitfocus Companion Module
// Communicates with the DSK plugin HTTP API on port 4488 (default).
//
// NOTE: The OBS plugin listens on 127.0.0.1 (localhost) by default.
// Companion must run on the same machine as OBS.

import { InstanceBase, InstanceStatus, combineRgb } from '@companion-module/base'

console.log('[jomboy-dsk] Module script loaded...')

export default class DskInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.pollTimer    = null
		this.items        = []
		this.sceneName    = ''
		// Sponsor loop state
		this.loopTimer    = null   // 1-second tick interval
		this.loopSteps    = []     // parsed [{name, seconds}]
		this.loopIndex    = 0
		this.loopActive   = false
		this.loopCountdown = 0
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	async init(config) {
		this.config = config
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
		this.stopLoop(false)
	}

	async configUpdated(config) {
		this.config = config
		this.stopPolling()
		if (this.loopActive) this.stopLoop(false)
		this.startPolling()
	}

	// ── Config form ───────────────────────────────────────────────────────────

	getConfigFields() {
		return [
			{
				type:  'static-text',
				id:    'info',
				label: 'Connection',
				value: 'The DSK plugin HTTP server binds to 127.0.0.1 by default. Companion must run on the same machine as OBS.',
				width: 12,
			},
			{
				type:    'textinput',
				id:      'host',
				label:   'Host / IP',
				default: '127.0.0.1',
				width:   8,
			},
			{
				type:    'number',
				id:      'port',
				label:   'Port',
				default: 4488,
				min:     1,
				max:     65535,
				width:   4,
			},
			{
				type:    'number',
				id:      'poll_interval',
				label:   'Poll Interval (ms)',
				default: 500,
				min:     100,
				max:     5000,
				width:   4,
			},
			{
				type:  'static-text',
				id:    'loop_info',
				label: 'Sponsor Loop Sequence',
				value: 'One entry per line: ItemName,seconds — leave ItemName blank for a blackout.\n\nExample:\nSponsor_A,60\n,60\nSponsor_B,30\n,60\n\nUse the "Start Sponsor Loop" action to begin. The loop repeats until stopped.',
				width: 12,
			},
			{
				type:        'textinput',
				id:          'loop_sequence',
				label:       'Sequence (one entry per line: Name,seconds)',
				default:     '',
				width:       12,
				isMultiline: true,
			},
		]
	}

	// ── Polling ───────────────────────────────────────────────────────────────

	baseUrl() {
		const host = this.config?.host || '127.0.0.1'
		const port = this.config?.port || 4488
		return `http://${host}:${port}`
	}

	startPolling() {
		this.stopPolling()
		this.updateStatus(InstanceStatus.Connecting)
		this.pollStatus()
		const ms = Math.max(100, this.config?.poll_interval ?? 500)
		this.pollTimer = setInterval(() => this.pollStatus(), ms)
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
	}

	async pollStatus() {
		try {
			const res = await fetch(`${this.baseUrl()}/api/status`, {
				signal: AbortSignal.timeout(2000),
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const data = await res.json()

			this.updateStatus(InstanceStatus.Ok)

			const prevNames = this.items.map((i) => i.name + '|' + (i.group ?? '')).join('\0')
			this.items      = data.items  ?? []
			this.sceneName  = data.scene  ?? ''
			const nextNames = this.items.map((i) => i.name + '|' + (i.group ?? '')).join('\0')

			if (prevNames !== nextNames) {
				this.updateActions()
				this.updateFeedbacks()
				this.updateVariableDefinitions()
				const { structure, presets } = this.buildPresets()
				this.setPresetDefinitions(structure, presets)
			}

			const vars = { scene: this.sceneName }
			for (const item of this.items) {
				const k = this.safeKey(item.name)
				vars[`${k}_active`] = item.active ? 'true' : 'false'
				vars[`${k}_time`]   = item.timeRemaining != null && item.timeRemaining >= 0
					? String(Math.ceil(item.timeRemaining))
					: ''
			}
			this.setVariableValues(vars)
			this.checkFeedbacks('item_active')

		} catch (err) {
			this.updateStatus(InstanceStatus.ConnectionFailure, String(err?.message ?? err))
		}
	}

	// ── Actions ───────────────────────────────────────────────────────────────

	updateActions() {
		const choices   = this.itemChoices()
		const itemField = {
			type:        'dropdown',
			id:          'name',
			label:       'DSK Item',
			default:     choices[0]?.id ?? '',
			choices,
			allowCustom: true,
		}

		this.setActionDefinitions({
			activate: {
				name:     'Activate DSK Item',
				options:  [itemField],
				callback: async (action) => {
					await this.sendCommand(action.options.name, 'activate')
				},
			},
			deactivate: {
				name:     'Deactivate DSK Item',
				options:  [itemField],
				callback: async (action) => {
					await this.sendCommand(action.options.name, 'deactivate')
				},
			},
			toggle: {
				name:     'Toggle DSK Item',
				options:  [itemField],
				callback: async (action) => {
					await this.sendCommand(action.options.name, 'toggle')
				},
			},
			start_loop: {
				name:     'Start Sponsor Loop',
				options:  [],
				callback: async () => { await this.startLoop() },
			},
			stop_loop: {
				name:     'Stop Sponsor Loop',
				options:  [],
				callback: () => { this.stopLoop() },
			},
			skip_next: {
				name:     'Skip to Next Loop Step',
				options:  [],
				callback: async () => { await this.skipToNext() },
			},
		})
	}

	// ── Feedbacks ─────────────────────────────────────────────────────────────

	updateFeedbacks() {
		const choices = this.itemChoices()

		this.setFeedbackDefinitions({
			item_active: {
				type:         'boolean',
				name:         'DSK Item Active',
				description:  'Button turns green when the DSK item is live',
				defaultStyle: {
					bgcolor: combineRgb(0, 180, 0),
					color:   combineRgb(255, 255, 255),
				},
				options: [
					{
						type:        'dropdown',
						id:          'name',
						label:       'DSK Item',
						default:     choices[0]?.id ?? '',
						choices,
						allowCustom: true,
					},
				],
				callback: (feedback) => {
					const item = this.items.find((i) => i.name === feedback.options.name)
					return item?.active ?? false
				},
			},
			loop_active: {
				type:         'boolean',
				name:         'Sponsor Loop Running',
				description:  'Button lights up while the sponsor loop is active',
				defaultStyle: {
					bgcolor: combineRgb(0, 100, 200),
					color:   combineRgb(255, 255, 255),
				},
				options:  [],
				callback: () => this.loopActive,
			},
		})
	}

	// ── Variables ─────────────────────────────────────────────────────────────

	updateVariableDefinitions() {
		const defs = {
			scene:               { name: 'DSK Scene Name' },
			loop_active:         { name: 'Sponsor Loop — Running (true/false)' },
			loop_current_item:   { name: 'Sponsor Loop — Current Item' },
			loop_step_remaining: { name: 'Sponsor Loop — Step Time Remaining (s)' },
		}
		for (const item of this.items) {
			const k = this.safeKey(item.name)
			defs[`${k}_active`] = { name: `${item.name} — Active (true/false)` }
			defs[`${k}_time`]   = { name: `${item.name} — Auto-hide Time Remaining (s)` }
		}
		this.setVariableDefinitions(defs)
	}

	// ── Presets ───────────────────────────────────────────────────────────────

	buildPresets() {
		const presets        = {}
		const toggleIds      = []
		const activateIds    = []
		const deactivateIds  = []
		const loopIds        = []

		// ── DSK item presets ──────────────────────────────────────────────────
		for (const item of this.items) {
			const k    = this.safeKey(item.name)
			const name = item.name

			const tid = `toggle_${k}`
			toggleIds.push(tid)
			presets[tid] = {
				type:  'simple',
				name:  `Toggle: ${name}`,
				style: {
					text:    name,
					size:    'auto',
					color:   combineRgb(255, 255, 255),
					bgcolor: combineRgb(40, 40, 40),
				},
				feedbacks: [
					{
						feedbackId: 'item_active',
						options:    { name },
						style: { bgcolor: combineRgb(0, 180, 0), color: combineRgb(255, 255, 255) },
					},
				],
				steps: [{ down: [{ actionId: 'toggle', options: { name } }], up: [] }],
			}

			const aid = `activate_${k}`
			activateIds.push(aid)
			presets[aid] = {
				type:  'simple',
				name:  `Activate: ${name}`,
				style: {
					text:    `▶ ${name}`,
					size:    'auto',
					color:   combineRgb(200, 200, 200),
					bgcolor: combineRgb(0, 80, 0),
				},
				feedbacks: [
					{
						feedbackId: 'item_active',
						options:    { name },
						style: { bgcolor: combineRgb(0, 200, 0), color: combineRgb(0, 0, 0) },
					},
				],
				steps: [{ down: [{ actionId: 'activate', options: { name } }], up: [] }],
			}

			const did = `deactivate_${k}`
			deactivateIds.push(did)
			presets[did] = {
				type:  'simple',
				name:  `Deactivate: ${name}`,
				style: {
					text:    `■ ${name}`,
					size:    'auto',
					color:   combineRgb(200, 200, 200),
					bgcolor: combineRgb(80, 0, 0),
				},
				feedbacks: [
					{
						feedbackId: 'item_active',
						options:    { name },
						style: { bgcolor: combineRgb(220, 0, 0), color: combineRgb(255, 255, 255) },
					},
				],
				steps: [{ down: [{ actionId: 'deactivate', options: { name } }], up: [] }],
			}
		}

		// ── Sponsor loop presets ──────────────────────────────────────────────
		loopIds.push('loop_start', 'loop_stop', 'loop_skip')

		presets['loop_start'] = {
			type:  'simple',
			name:  'Start Sponsor Loop',
			style: {
				text:    'START\nLOOP',
				size:    'auto',
				color:   combineRgb(255, 255, 255),
				bgcolor: combineRgb(0, 80, 0),
			},
			feedbacks: [
				{
					feedbackId: 'loop_active',
					options:    {},
					style: { bgcolor: combineRgb(0, 180, 0), color: combineRgb(255, 255, 255) },
				},
			],
			steps: [{ down: [{ actionId: 'start_loop', options: {} }], up: [] }],
		}

		presets['loop_stop'] = {
			type:  'simple',
			name:  'Stop Sponsor Loop',
			style: {
				text:    'STOP\nLOOP',
				size:    'auto',
				color:   combineRgb(255, 255, 255),
				bgcolor: combineRgb(80, 0, 0),
			},
			feedbacks: [],
			steps: [{ down: [{ actionId: 'stop_loop', options: {} }], up: [] }],
		}

		presets['loop_skip'] = {
			type:  'simple',
			name:  'Skip to Next Loop Step',
			style: {
				text:    'SKIP\nSTEP',
				size:    'auto',
				color:   combineRgb(255, 255, 255),
				bgcolor: combineRgb(60, 60, 60),
			},
			feedbacks: [],
			steps: [{ down: [{ actionId: 'skip_next', options: {} }], up: [] }],
		}

		// ── Section structure ─────────────────────────────────────────────────
		const structure = []
		if (loopIds.length)       structure.push({ id: 'loop',       name: 'Sponsor Loop', definitions: loopIds })
		if (toggleIds.length)     structure.push({ id: 'toggle',     name: 'Toggle',       definitions: toggleIds })
		if (activateIds.length)   structure.push({ id: 'activate',   name: 'Activate',     definitions: activateIds })
		if (deactivateIds.length) structure.push({ id: 'deactivate', name: 'Deactivate',   definitions: deactivateIds })

		return { structure, presets }
	}

	// ── Sponsor loop ──────────────────────────────────────────────────────────

	parseLoopSequence() {
		const text = this.config?.loop_sequence ?? ''
		return text
			.split(/[\n;|]/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.map((line) => {
				const idx = line.lastIndexOf(',')
				if (idx === -1) return null
				const name = line.slice(0, idx).trim()
				const secs = parseInt(line.slice(idx + 1).trim(), 10)
				if (isNaN(secs) || secs < 1) return null
				return { name, seconds: secs }
			})
			.filter(Boolean)
	}

	async startLoop() {
		this.stopLoop(false)
		const steps = this.parseLoopSequence()
		if (!steps.length) {
			this.log('warn', '[DSK Loop] No steps found — check the Sponsor Loop Sequence in module config')
			return
		}
		this.loopSteps  = steps
		this.loopIndex  = 0
		this.loopActive = true
		await this.executeLoopStep()
		this.loopTimer = setInterval(() => this.loopTick(), 1000)
		this.checkFeedbacks('loop_active')
	}

	stopLoop(deactivateAll = true) {
		if (this.loopTimer) { clearInterval(this.loopTimer); this.loopTimer = null }
		this.loopActive    = false
		this.loopCountdown = 0
		if (deactivateAll) {
			for (const item of this.items) this.sendCommand(item.name, 'deactivate')
		}
		this.setVariableValues({
			loop_active:         'false',
			loop_current_item:   '',
			loop_step_remaining: '',
		})
		this.checkFeedbacks('loop_active')
	}

	async executeLoopStep() {
		const step = this.loopSteps[this.loopIndex]
		this.loopCountdown = step.seconds

		if (step.name) {
			// Activate this sponsor, deactivate everything else
			for (const item of this.items) {
				await this.sendCommand(item.name, item.name === step.name ? 'activate' : 'deactivate')
			}
		} else {
			// Blank — deactivate everything
			for (const item of this.items) {
				await this.sendCommand(item.name, 'deactivate')
			}
		}

		this.setVariableValues({
			loop_active:         'true',
			loop_current_item:   step.name,
			loop_step_remaining: String(step.seconds),
		})
	}

	loopTick() {
		this.loopCountdown = Math.max(0, this.loopCountdown - 1)
		if (this.loopCountdown === 0) {
			this.loopIndex = (this.loopIndex + 1) % this.loopSteps.length
			this.executeLoopStep()
		} else {
			this.setVariableValues({ loop_step_remaining: String(this.loopCountdown) })
		}
	}

	async skipToNext() {
		if (!this.loopActive) return
		this.loopIndex = (this.loopIndex + 1) % this.loopSteps.length
		await this.executeLoopStep()
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	itemChoices() {
		return this.items.length > 0
			? this.items.map((i) => ({
				id:    i.name,
				label: i.group ? `${i.group} / ${i.name}` : i.name,
			}))
			: [{ id: '', label: '(no items — check OBS connection)' }]
	}

	safeKey(name) {
		return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
	}

	async sendCommand(name, action) {
		if (!name) return
		try {
			const encoded = encodeURIComponent(name)
			const res = await fetch(`${this.baseUrl()}/api/item/${encoded}/${action}`, {
				method: 'POST',
				signal: AbortSignal.timeout(2000),
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			await this.pollStatus()
		} catch (err) {
			this.log('error', `DSK ${action} "${name}" failed: ${err?.message ?? err}`)
		}
	}
}

export const UpgradeScripts = []

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
		this.pollTimer = null
		this.items     = []
		this.sceneName = ''
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
	}

	async configUpdated(config) {
		this.config = config
		this.stopPolling()
		this.startPolling()
	}

	// ── Config form ───────────────────────────────────────────────────────────

	getConfigFields() {
		return [
			{
				type:  'static-text',
				id:    'info',
				label: 'Info',
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

			const prevNames = this.items.map((i) => i.name).join('\0')
			this.items      = data.items  ?? []
			this.sceneName  = data.scene  ?? ''
			const nextNames = this.items.map((i) => i.name).join('\0')

			if (prevNames !== nextNames) {
				this.updateActions()
				this.updateFeedbacks()
				this.updateVariableDefinitions()
				this.setPresetDefinitions(this.buildPresets())
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
		})
	}

	// ── Variables ─────────────────────────────────────────────────────────────

	updateVariableDefinitions() {
		const defs = {
			scene: { name: 'DSK Scene Name' },
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
		const presets = {}

		for (const item of this.items) {
			const k    = this.safeKey(item.name)
			const name = item.name

			// ── Toggle button ─────────────────────────────────────────────────
			// Dark background normally; turns green when the item is live.
			// A single press toggles the state.
			presets[`toggle_${k}`] = {
				type:     'button',
				category: 'Toggle',
				name:     `Toggle: ${name}`,
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
						style: {
							bgcolor: combineRgb(0, 180, 0),
							color:   combineRgb(255, 255, 255),
						},
					},
				],
				steps: [
					{
						down: [{ actionId: 'toggle', options: { name } }],
						up:   [],
					},
				],
			}

			// ── Activate button ───────────────────────────────────────────────
			// Always sends an activate command.
			// Lights up green while the item is live (shows current state).
			presets[`activate_${k}`] = {
				type:     'button',
				category: 'Activate',
				name:     `Activate: ${name}`,
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
						style: {
							bgcolor: combineRgb(0, 200, 0),
							color:   combineRgb(0, 0, 0),
						},
					},
				],
				steps: [
					{
						down: [{ actionId: 'activate', options: { name } }],
						up:   [],
					},
				],
			}

			// ── Deactivate button ─────────────────────────────────────────────
			// Always sends a deactivate command.
			// Lights up red while the item is still live (feedback = still on).
			presets[`deactivate_${k}`] = {
				type:     'button',
				category: 'Deactivate',
				name:     `Deactivate: ${name}`,
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
						style: {
							bgcolor: combineRgb(220, 0, 0),
							color:   combineRgb(255, 255, 255),
						},
					},
				],
				steps: [
					{
						down: [{ actionId: 'deactivate', options: { name } }],
						up:   [],
					},
				],
			}
		}

		return presets
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	itemChoices() {
		return this.items.length > 0
			? this.items.map((i) => ({ id: i.name, label: i.name }))
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

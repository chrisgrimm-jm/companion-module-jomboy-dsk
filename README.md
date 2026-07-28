# Companion Module — Jomboy DSK

Bitfocus Companion module for the [Jomboy Media OBS Downstream Keyer](https://github.com/chrisgrimm-jm/obs-downstream-keyer) plugin.

> **This module is experimental.** Expect rough edges. Please report issues on the [GitHub repo](https://github.com/chrisgrimm-jm/companion-module-jomboy-dsk).

---

## Requirements

- [Bitfocus Companion](https://bitfocus.io/companion) 4.x
- [OBS Downstream Keyer plugin](https://github.com/chrisgrimm-jm/obs-downstream-keyer) v1.2.0 or later
- Companion must run on the **same machine as OBS** (the DSK plugin HTTP server binds to localhost by default)

---

## Installation

This module is not yet in the official Companion module registry. Install it manually using developer mode.

### Step 1 — Enable developer mode in Companion

1. Open Companion and go to **Settings**
2. Enable **Developer mode**
3. Set the **Developer modules path** to the **parent folder** containing `companion-module-jomboy-dsk`

For example, if the module is at `~/Documents/companion-module-jomboy-dsk/`, set the path to `~/Documents/`.

### Step 2 — Restart Companion

After restarting, search for **Jomboy DSK** when adding a new connection and it will appear.

---

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| Host / IP | `127.0.0.1` | IP address of the machine running OBS |
| Port | `4488` | Must match the port set in the DSK plugin Settings |
| Poll Interval | `500ms` | How often Companion checks the state of all items |
| Sponsor Loop Sequence | _(empty)_ | See Sponsor Loop section below |

---

## Actions

| Action | Description |
|--------|-------------|
| Activate DSK Item | Shows the selected item on-air |
| Deactivate DSK Item | Hides the selected item |
| Toggle DSK Item | Flips the item between on and off |
| Start Sponsor Loop | Starts the automated sponsor rotation |
| Stop Sponsor Loop | Stops the loop and deactivates all items |
| Skip to Next Loop Step | Jumps immediately to the next step in the loop |

---

## Feedbacks

| Feedback | Description |
|----------|-------------|
| DSK Item Active | Button turns green when the item is live |
| Sponsor Loop Running | Button lights up while the sponsor loop is active |

---

## Variables

| Variable | Description |
|----------|-------------|
| `$(dsk:scene)` | Name of the active DSK scene |
| `$(dsk:loop_active)` | `true` / `false` — whether the sponsor loop is running |
| `$(dsk:loop_current_item)` | Name of the sponsor currently on-air in the loop |
| `$(dsk:loop_step_remaining)` | Seconds remaining in the current loop step |
| `$(dsk:itemname_active)` | `true` / `false` for each DSK item (name is lowercased, special characters replaced with `_`) |
| `$(dsk:itemname_time)` | Auto-hide countdown in seconds for each item, empty if no countdown is active |

---

## Sponsor Loop

The sponsor loop automatically cycles through a list of items on a timer, looping forever until stopped. Configure the sequence in the module settings under **Sponsor Loop Sequence**.

**Format:** one entry per line — `ItemName,seconds`

Leave the item name blank for a gap (all items off).

**Example:**
```
TMobile_Bug,60
,60
Nike_Bug,45
,30
Hims_Bug,120
,60
```

This plays T-Mobile for 60 seconds, goes dark for 60 seconds, plays Nike for 45 seconds, and so on. When it reaches the end it loops back to the beginning.

Use the **Start Sponsor Loop** and **Stop Sponsor Loop** actions to control it. **Skip to Next Loop Step** lets you advance manually mid-loop.

---

## Presets

Companion automatically generates button presets for every item in your DSK scene — Toggle, Activate, and Deactivate buttons for each one, plus Start Loop, Stop Loop, and Skip Step buttons for the sponsor loop. Find them under the **Presets** tab when editing a page.

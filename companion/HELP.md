# Jomboy Media — OBS Downstream Keyer

Control the [Jomboy Media OBS Downstream Keyer](https://github.com/chrisgrimm-jm/obs-downstream-keyer) plugin from Companion.

## Setup

1. In OBS, open the DSK plugin **Settings** and note the **HTTP port** (default `4488`).
2. Companion must run on the **same machine as OBS** — the plugin binds to `127.0.0.1`.
3. In this connection's config set **Host** (`127.0.0.1`) and **Port** to match.

## Actions

- **Activate / Deactivate / Toggle DSK Item** — control a single overlay item.
- **Start / Stop Sponsor Loop** — cycle items on a timer (configure the sequence in connection settings).
- **Skip to Next Loop Step** — advance the loop manually.

## Feedbacks

- **DSK Item Active** — button turns green when the item is live.
- **Sponsor Loop Running** — lights up while the loop runs.

Presets for every item plus the loop controls are generated automatically under the **Presets** tab.

See the [full README](https://github.com/chrisgrimm-jm/companion-module-jomboy-dsk) for details.

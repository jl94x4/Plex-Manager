# Native Media Automation

Native Media Automation runs `ffprobe` and `ffmpeg` in the portal container to inspect and process media without a separate transcoding service. It is admin-only and opt-in.

## Version 1 scope

Version 1 accepts jobs from:

- manual admin selections in the portal;
- Sonarr, Radarr, and Lidarr webhooks at `/triggers/media-automation/{sonarr|radarr|lidarr|manual}` when Basic Auth is configured.

It does not replace Plex/Jellyfin transcoding and does not load third-party plugins. Version 1 uses only the built-in native executor and step registry. Scheduled filesystem discovery and remote/sidecar workers are intentionally out of scope for v1.

## Required paths

| Container path | Access | Purpose |
| --- | --- | --- |
| `/app/config/media-automation` | Read/write | Queue state, libraries, pipelines, activity history |
| `/app/config/media-automation/work` | Read/write | Durable work metadata under the config mount |
| `/media` (example) | Read-only for inspect/dry-run; read/write for actions | Media source and destination files |

The media path is intentionally absent from the default Compose deployment. Mount only the library roots the feature needs. ARR paths must either match the container paths or have an explicit path mapping (Scanner-compatible rewrite rules can be reused).

Temporary encoded output is created beside its final destination so promotion can use a same-filesystem rename. The destination filesystem must have enough free space for the complete encoded output plus safety margin. `PUID` and `PGID` must be able to read source files and write the config work metadata and destination directories. If copy, replace, or quarantine is enabled, a read-only media mount will correctly make the job fail.

## Capability reporting

Review the capability panel after changing an image, driver, device mapping, or encoder. Worker Test and capability refresh run a short synthetic encode for each non-CPU adapter when FFmpeg reports the matching encoders. Detected encoders alone are not enough: the synthetic test confirms the host driver, device node, runtime, and permissions are usable. Explicitly selected unavailable modes fail rather than silently changing encoder; CPU fallback is configurable.

| Mode | What the test expects |
| --- | --- |
| CPU | Reports available when `libx264` is compiled in. No GPU device is required. |
| NVIDIA NVENC | Reports available when `h264_nvenc` (or peer codec) is compiled in **and** the synthetic encode succeeds. Needs NVIDIA Container Toolkit / runtime. |
| Intel QSV | Reports available when `h264_qsv` succeeds a synthetic encode. Needs a usable Intel render node. |
| Intel VAAPI | Separate adapter (`intel-vaapi`) using `h264_vaapi` plus a synthetic encode through `/dev/dri`. |
| AMD VAAPI | Adapter `vaapi` using the same VAAPI encoders with an AMD render node and Mesa. |

The image includes FFmpeg/FFprobe, `vainfo`, Mesa VAAPI userspace, and Intel VAAPI userspace where Debian Bookworm publishes it for the image architecture. Kernel and GPU drivers always come from the host.

## Hardware access

CPU mode is the portable default. No device or privileged mode is needed.

For Intel QSV/VAAPI or AMD VAAPI, pass `/dev/dri` and add the host's `video` and `render` group IDs:

```yaml
services:
  portal:
    devices:
      - /dev/dri:/dev/dri
    group_add:
      - "44"  # host video GID; verify locally
      - "109" # host render GID; verify locally
```

For NVIDIA NVENC, install NVIDIA Container Toolkit on the host:

```yaml
services:
  portal:
    runtime: nvidia
    environment:
      NVIDIA_VISIBLE_DEVICES: all
      NVIDIA_DRIVER_CAPABILITIES: video,compute,utility
```

Group IDs and runtime syntax vary by host. Verify them locally. None of these configurations require `privileged: true`; keep privileged mode disabled.

## Output safety

Start with dry-run and a small test library.

- **Dry-run** probes the input and validates the planned command, path mapping, policy, and capacity without replacing media.
- **Copy** writes a separate output and leaves the source untouched. Review the output before any manual promotion.
- **Atomic replace** encodes beside the destination, verifies streams/duration, optionally quarantines the original, then promotes with a filesystem rename. The temporary file must be on the same filesystem as the destination for the rename to be atomic.
- **Quarantine** preserves the original in the configured quarantine location before a replacement is finalized.

Jobs reject paths outside configured roots and reject symbolic-link sources. Durable queue state uses lease/heartbeat recovery so crash-stale running jobs return to the queue. Deduplication keys combine path, source fingerprint, and pipeline so unchanged files are not reprocessed while an active job exists.

## Unraid template

The Community Applications / Unraid template exposes:

| Template field | Purpose |
| --- | --- |
| Media Root / TV / Movies / Music / Downloads | Optional host→container path mounts for Media Automation |
| Media Library Extra 1/2 | Additional roots; change the container path to match your layout |
| GPU Devices (Intel/AMD) | Pass `/dev/dri` for QSV/VAAPI |
| NVIDIA Visible Devices | GPU UUID or `all` (requires Nvidia Driver plugin) |
| Extra Parameters | For NVIDIA, add `--runtime=nvidia` in Advanced View |

Container paths must match Sonarr/Radarr/Lidarr paths (or use rewrite rules). Leave GPU and media Host Paths empty for CPU-only / no Media Automation. Image tags: `:latest`, `:beta`, `:nightly`.

## Docker checklist

1. Rebuild or pull an image containing FFmpeg (`:nightly` while testing this feature).
2. Leave CPU selected for the first test.
3. Mount `/app/config` and the required media roots; state/work metadata remains under the config mount.
4. Align `PUID`/`PGID`; pass `/dev/dri` or NVIDIA runtime only when using a GPU.
5. Configure ARR-to-container path mappings and Media Automation webhook Basic Auth.
6. Run **Test worker** so synthetic hardware probes refresh capability badges.
7. Use pipeline **Preview** / dry-run, then copy mode, before considering atomic replace and quarantine.

See [Docker Deployment](/guide/docker), [Configuration](/guide/configuration), and [Background Tasks](/operations/background-tasks).

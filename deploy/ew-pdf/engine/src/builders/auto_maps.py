"""Auto-generates maps for bulletins based on input data.

Instead of requiring pre-made map images, this module generates maps
from district/region lists in the bulletin data.
"""

from pathlib import Path
from typing import Optional

from ..models.common import HazardType, AlertLevel
from ..models.seven22e4 import Seven22E4Bulletin, FiveDayEntry
from ..models.multirisk import MultiriskBulletin, MultiriskDayForecast, DaySummary
from ..models.agency import (
    MoWBulletin, GSTBulletin, MoHBulletin, MoABulletin, NEMCBulletin,
)
from .map_generator import generate_region_map, generate_district_map, generate_multi_hazard_map

OUTPUT_MAP_DIR = Path(__file__).parent.parent.parent / "output" / "maps"


def _ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def _tag_shape(shape: dict, level_key: str) -> dict:
    """Return a copy of a GeoJSON drawn shape tagged with the hazard's alert
    level so the map renderer colours it per-hazard. Any level/colour already
    present on the shape is preserved.
    """
    if not isinstance(shape, dict):
        return shape
    out = dict(shape)
    props = dict(out.get("properties") or {})
    if not (props.get("level") or props.get("alert_level")
            or props.get("fill") or props.get("color")):
        props["level"] = level_key
    out["properties"] = props
    return out


def generate_722e4_maps(bulletin: Seven22E4Bulletin) -> dict:
    """Generate maps for all days of a 722E_4 bulletin.

    Returns dict mapping day_index -> map_path.
    """
    _ensure_dir(OUTPUT_MAP_DIR)
    maps = {}

    date_str = bulletin.issue_date.strftime("%Y%m%d")

    for i, day in enumerate(bulletin.days):
        # Day 1 gets a larger map (landscape); Days 2-5 get medium maps
        if i == 0:
            fig_sz, fig_dpi = (5.5, 4.5), 200
        else:
            fig_sz, fig_dpi = (3.5, 3.2), 200

        if day.is_no_warning:
            # Still generate a blank Tanzania map for NO WARNING days
            path = generate_region_map(
                highlighted_regions=[],
                color="advisory",
                output_path=str(OUTPUT_MAP_DIR / f"722e4_{date_str}_day{i+1}.png"),
                figsize=fig_sz,
                dpi=fig_dpi,
            )
        else:
            # Per-region levels + per-hazard icons + per-shape colours, so that
            # multiple hazards at different levels all render in their own
            # colour, and drawn circles/polygons are captured alongside (or
            # instead of) region selections.
            priority = {"advisory": 1, "warning": 2, "major_warning": 3}
            region_levels = {}
            day_shapes = []
            hazard_icons = []
            for h in day.hazards:
                lvl_key = _get_alert_color(getattr(h, "alert_level", None))
                h_regions = list(getattr(h, "regions", None) or [])
                for r in h_regions:
                    cur = region_levels.get(r)
                    if cur is None or priority.get(lvl_key, 0) > priority.get(cur, 0):
                        region_levels[r] = lvl_key
                h_shapes = [_tag_shape(s, lvl_key)
                            for s in (getattr(h, "drawn_shapes", None) or [])]
                day_shapes.extend(h_shapes)
                if h_regions or h_shapes:
                    hazard_icons.append({
                        "hazard_type": getattr(h, "hazard_type", None),
                        "regions": h_regions,
                        "shapes": h_shapes,
                    })
            path = generate_region_map(
                highlighted_regions=list(region_levels.keys()),
                color=_get_alert_color(day.max_alert_level),
                region_levels=region_levels,
                output_path=str(OUTPUT_MAP_DIR / f"722e4_{date_str}_day{i+1}.png"),
                figsize=fig_sz,
                dpi=fig_dpi,
                drawn_shapes=day_shapes or None,
                hazard_icons=hazard_icons or None,
                hazard_type=(day.hazards[0].hazard_type if day.hazards else None),
            )
        maps[i] = path

    return maps


def _extract_regions_from_722e4_day(day: FiveDayEntry) -> list[str]:
    """Extract region names from hazard descriptions.

    For auto-map generation, we look at the 'regions' field if available,
    or try to parse from description text.
    """
    regions = set()
    for hazard in day.hazards:
        # Check if the hazard has explicit regions (added by input)
        if hasattr(hazard, 'regions') and hazard.regions:
            regions.update(hazard.regions)
    return list(regions)


def _get_alert_color(level: AlertLevel) -> str:
    mapping = {
        AlertLevel.ADVISORY: "advisory",
        AlertLevel.WARNING: "warning",
        AlertLevel.MAJOR_WARNING: "major_warning",
        AlertLevel.NO_WARNING: "advisory",
    }
    return mapping.get(level, "advisory")


def generate_multirisk_maps(bulletin: MultiriskBulletin) -> dict:
    """Generate all maps for a Multirisk bulletin.

    Returns dict with keys like:
        'day1_heavy_rain', 'day1_large_waves', 'day1_strong_wind', 'day1_floods',
        'day1_summary', 'day2_heavy_rain', etc.
    """
    _ensure_dir(OUTPUT_MAP_DIR)
    maps = {}

    num = bulletin.bulletin_number
    date_str = bulletin.issue_date.strftime("%Y%m%d")

    for day in bulletin.days:
        dn = day.day_number

        # Find the matching day summary for district lists
        day_summary = None
        for ds in bulletin.day_summaries:
            if ds.day_number == dn:
                day_summary = ds
                break

        advisory_districts = day_summary.advisory_districts if day_summary else []
        warning_districts = day_summary.warning_districts if day_summary else []
        major_districts = day_summary.major_warning_districts if day_summary else []

        all_affected = advisory_districts + warning_districts + major_districts

        # Generate hazard-specific maps
        # For each hazard type, we color the districts
        for hazard_type in [HazardType.HEAVY_RAIN, HazardType.LARGE_WAVES,
                           HazardType.STRONG_WIND, HazardType.FLOODS]:
            key = f"day{dn}_{hazard_type.value.lower()}"

            # Determine which districts to highlight for this hazard
            # In the original bulletins, each hazard map shows different regions
            # For now, use the full district list for all hazards that have panels
            has_panel = any(
                hp.hazard_type == hazard_type for hp in day.hazard_panels
            )

            if has_panel and all_affected:
                # Colour each district by its true alert level (advisory/
                # warning/major) instead of a flat colour, so the severity mix
                # renders correctly on every hazard panel.
                path = generate_multi_hazard_map(
                    advisory_districts=advisory_districts,
                    warning_districts=warning_districts,
                    major_warning_districts=major_districts,
                    output_path=str(OUTPUT_MAP_DIR / f"mr_{num}_{date_str}_{key}.png"),
                    figsize=(3.0, 4.0),
                    dpi=150,
                )
            else:
                # Generate blank map for this hazard
                path = generate_multi_hazard_map(
                    output_path=str(OUTPUT_MAP_DIR / f"mr_{num}_{date_str}_{key}.png"),
                    figsize=(3.0, 4.0),
                    dpi=150,
                )
            maps[key] = path

        # Generate summary map
        summary_key = f"day{dn}_summary"
        path = generate_multi_hazard_map(
            advisory_districts=advisory_districts,
            warning_districts=warning_districts,
            major_warning_districts=major_districts,
            output_path=str(OUTPUT_MAP_DIR / f"mr_{num}_{date_str}_{summary_key}.png"),
            figsize=(4.5, 6.0),
            dpi=150,
            drawn_shapes=(getattr(bulletin, "drawn_shapes", None) or None),
        )
        maps[summary_key] = path

    return maps


# ---------------------------------------------------------------------------
# Agency-specific map generators
# ---------------------------------------------------------------------------

def _collect_regions_and_shapes(entries, region_attr="regions"):
    """Extract regions and drawn_shapes from a list of assessment/event entries."""
    regions = set()
    shapes = []
    for e in entries:
        if hasattr(e, region_attr) and getattr(e, region_attr):
            regions.update(getattr(e, region_attr))
        if hasattr(e, "drawn_shapes") and e.drawn_shapes:
            shapes.extend(e.drawn_shapes)
    return list(regions), shapes


def _max_alert(entries) -> AlertLevel:
    """Get the highest alert level from a list of entries."""
    priority = {AlertLevel.NO_WARNING: 0, AlertLevel.ADVISORY: 1,
                AlertLevel.WARNING: 2, AlertLevel.MAJOR_WARNING: 3}
    if not entries:
        return AlertLevel.NO_WARNING
    return max(entries, key=lambda e: priority.get(e.alert_level, 0)).alert_level


def generate_mow_maps(bulletin: MoWBulletin) -> dict:
    """Generate maps for MoW Flood Risk bulletin (1 per day).

    Uses district-level maps when districts are available (from catchment basins),
    falls back to region-level maps otherwise.
    """
    _ensure_dir(OUTPUT_MAP_DIR)
    maps = {}
    date_str = bulletin.issue_date.strftime("%Y%m%d")
    for i, day in enumerate(bulletin.days):
        regions, shapes = _collect_regions_and_shapes(day.assessments)
        color = _get_alert_color(day.max_alert_level)
        out_path = str(OUTPUT_MAP_DIR / f"mow_{date_str}_day{i+1}.png")

        # Per-district level = highest alert among the assessments covering that district, so each district
        # renders at its OWN colour instead of the day's max being applied to every district.
        priority = {AlertLevel.NO_WARNING: 0, AlertLevel.ADVISORY: 1,
                    AlertLevel.WARNING: 2, AlertLevel.MAJOR_WARNING: 3}
        best = {}
        for a in day.assessments:
            for dn in (getattr(a, "districts", None) or []):
                if priority.get(a.alert_level, 0) > priority.get(best.get(dn), 0):
                    best[dn] = a.alert_level
        districts = list(best.keys())
        district_levels = {dn: _get_alert_color(lvl) for dn, lvl in best.items()}

        if districts:
            # Use district-level map for MoW (catchment basin → district mapping), each at its own level.
            path = generate_district_map(
                highlighted_districts=districts, color=color,
                district_levels=district_levels,
                output_path=out_path,
                figsize=(4.5, 5.0), dpi=180,
                drawn_shapes=shapes or None,
            )
        elif regions:
            path = generate_region_map(
                highlighted_regions=regions, color=color,
                output_path=out_path,
                figsize=(4.5, 5.0), dpi=180,
                drawn_shapes=shapes or None,
            )
        else:
            # Blank map
            path = generate_region_map(
                highlighted_regions=[], color="advisory",
                output_path=out_path,
                figsize=(4.5, 5.0), dpi=180,
            )
        maps[i] = path
    return maps


def generate_gst_maps(bulletin: GSTBulletin) -> dict:
    """Generate maps for GST Geohazard bulletin (1 per event)."""
    _ensure_dir(OUTPUT_MAP_DIR)
    maps = {}
    date_str = bulletin.issue_date.strftime("%Y%m%d")
    for i, event in enumerate(bulletin.events):
        regions = event.regions or []
        color = _get_alert_color(event.alert_level)
        shapes = event.drawn_shapes or []
        path = generate_region_map(
            highlighted_regions=regions, color=color,
            output_path=str(OUTPUT_MAP_DIR / f"gst_{date_str}_ev{i+1}.png"),
            figsize=(4.5, 5.0), dpi=180,
            drawn_shapes=shapes or None,
            hazard_type=getattr(event, "event_type", "EARTHQUAKE"),
        )
        maps[i] = path
    return maps


def generate_moh_maps(bulletin: MoHBulletin) -> dict:
    """Generate maps for MoH Disease Outbreak bulletin (1 per outbreak)."""
    _ensure_dir(OUTPUT_MAP_DIR)
    maps = {}
    date_str = bulletin.issue_date.strftime("%Y%m%d")
    for i, outbreak in enumerate(bulletin.outbreaks):
        regions = outbreak.regions or []
        color = _get_alert_color(outbreak.alert_level)
        shapes = outbreak.drawn_shapes or []
        path = generate_region_map(
            highlighted_regions=regions, color=color,
            output_path=str(OUTPUT_MAP_DIR / f"moh_{date_str}_ob{i+1}.png"),
            figsize=(4.5, 5.0), dpi=180,
            drawn_shapes=shapes or None,
            hazard_type="DISEASE_OUTBREAK",
        )
        maps[i] = path
    return maps


def generate_moa_maps(bulletin: MoABulletin) -> dict:
    """Generate maps for MoA Agricultural Hazard bulletin (1 per assessment)."""
    _ensure_dir(OUTPUT_MAP_DIR)
    maps = {}
    date_str = bulletin.issue_date.strftime("%Y%m%d")
    for i, assessment in enumerate(bulletin.assessments):
        regions = assessment.regions or []
        color = _get_alert_color(assessment.alert_level)
        shapes = assessment.drawn_shapes or []
        path = generate_region_map(
            highlighted_regions=regions, color=color,
            output_path=str(OUTPUT_MAP_DIR / f"moa_{date_str}_a{i+1}.png"),
            figsize=(4.5, 5.0), dpi=180,
            drawn_shapes=shapes or None,
            hazard_type="DROUGHT",
        )
        maps[i] = path
    return maps


def generate_nemc_maps(bulletin: NEMCBulletin) -> dict:
    """Generate maps for NEMC Environmental Hazard bulletin (1 per event)."""
    _ensure_dir(OUTPUT_MAP_DIR)
    maps = {}
    date_str = bulletin.issue_date.strftime("%Y%m%d")
    for i, event in enumerate(bulletin.events):
        regions = event.regions or []
        color = _get_alert_color(event.alert_level)
        shapes = event.drawn_shapes or []
        path = generate_region_map(
            highlighted_regions=regions, color=color,
            output_path=str(OUTPUT_MAP_DIR / f"nemc_{date_str}_ev{i+1}.png"),
            figsize=(4.5, 5.0), dpi=180,
            drawn_shapes=shapes or None,
            hazard_type="AIR_POLLUTION",
        )
        maps[i] = path
    return maps

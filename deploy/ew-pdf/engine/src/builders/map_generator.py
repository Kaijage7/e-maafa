"""Map generator for Tanzania early warning bulletins.

Generates Tanzania maps with colored district/region polygons matching
the exact visual style of the original bulletins:
- Region name labels at polygon centroids
- Thick country border outline
- Warning triangle icons on affected areas
- Blue water bodies (Lake Victoria, Indian Ocean coastline)
"""

from pathlib import Path
from typing import Optional

import numpy as np
import geopandas as gpd
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.patheffects as pe
from matplotlib.colors import to_rgba
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
from shapely.geometry import box, shape as shapely_shape, Point
from matplotlib.patches import Circle as MplCircle, Polygon as MplPolygon

ASSETS_DIR = Path(__file__).parent.parent.parent / "assets"
GEODATA_DIR = ASSETS_DIR / "geodata"

# Color palette matching the original bulletins
COLORS = {
    "advisory": "#FFFF00",       # Yellow (ADVISORY/ANGALIZO)
    "warning": "#FFA500",        # Orange (WARNING/TAHADHARI)
    "major_warning": "#FF0000",  # Red (MAJOR WARNING/TAHADHARI KUBWA)
    "no_data": "#FFFFFF",        # White (no warning — matches reference)
    "boundary": "#999999",       # District boundary lines
    "region_boundary": "#444444",  # Region boundary lines (thicker)
    "country_border": "#222222", # Country outline
    "water": "#B0D4F1",         # Water bodies (light blue)
    "background": "#FFFFFF",     # Background
}

# Region label positions (manual adjustments for better placement)
REGION_LABEL_ADJUSTMENTS = {
    "Dar es Salaam": (0.3, -0.15),
    "Kaskazini Unguja": (0.5, 0.1),
    "Kusini Unguja": (0.5, -0.1),
    "Kaskazini Pemba": (0.5, 0.1),
    "Kusini Pemba": (0.5, -0.1),
    "Mjini Magharibi": (0.6, 0.0),
}

# Short display names for map labels
REGION_SHORT_NAMES = {
    "Dar es Salaam": "Dar-es-salaam",
    "Kaskazini Unguja": "Kaskazini Unguja",
    "Kusini Unguja": "Kusini Unguja",
    "Kaskazini Pemba": "Kaskazini Pemba",
    "Kusini Pemba": "Kusini Pemba",
    "Mjini Magharibi": "Mjini Magharibi",
}

# Tanzania bounding box (lon_min, lat_min, lon_max, lat_max)
_TZ_BOUNDS = (28, -12, 41, 1)

# Tight axis limits for rendered maps — nothing outside Tanzania
_GEO_XLIM = (28.5, 41.0)
_GEO_YLIM = (-12.0, 0.5)

# Singleton data cache
_regions_gdf = None
_districts_gdf = None
_country_boundary = None
_lakes_gdf = None
_rivers_gdf = None


def _load_regions() -> gpd.GeoDataFrame:
    """Load Tanzania region boundaries."""
    global _regions_gdf
    if _regions_gdf is None:
        path = GEODATA_DIR / "gadm41_TZA_1.json.zip"
        _regions_gdf = gpd.read_file(f"zip://{path}")
    return _regions_gdf


def _load_districts() -> gpd.GeoDataFrame:
    """Load Tanzania district boundaries."""
    global _districts_gdf
    if _districts_gdf is None:
        path = GEODATA_DIR / "gadm41_TZA_2.json.zip"
        _districts_gdf = gpd.read_file(f"zip://{path}")
    return _districts_gdf


def _get_country_boundary():
    """Get the dissolved country boundary for the thick outline."""
    global _country_boundary
    if _country_boundary is None:
        tz_path = GEODATA_DIR / "tz_country.geojson"
        if tz_path.exists():
            _country_boundary = gpd.read_file(str(tz_path))
        else:
            regions = _load_regions()
            _country_boundary = regions.dissolve()
    return _country_boundary


def _load_lakes() -> gpd.GeoDataFrame:
    """Load Tanzania waterbodies (TZ-native pre-clipped data, fallback to NE)."""
    global _lakes_gdf
    if _lakes_gdf is None:
        tz_path = GEODATA_DIR / "tz_waterbodies.geojson"
        if tz_path.exists():
            _lakes_gdf = gpd.read_file(str(tz_path))
        else:
            path = GEODATA_DIR / "ne_10m_lakes.zip"
            if path.exists():
                gdf = gpd.read_file(f"zip://{path}")
                nearby = gdf.cx[
                    _TZ_BOUNDS[0]:_TZ_BOUNDS[2],
                    _TZ_BOUNDS[1]:_TZ_BOUNDS[3],
                ]
                country = _get_country_boundary()
                _lakes_gdf = gpd.clip(nearby, country)
            else:
                _lakes_gdf = gpd.GeoDataFrame()
    return _lakes_gdf


def _load_rivers() -> gpd.GeoDataFrame:
    """Load Natural Earth rivers clipped to Tanzania's country boundary."""
    global _rivers_gdf
    if _rivers_gdf is None:
        path = GEODATA_DIR / "ne_10m_rivers.zip"
        if path.exists():
            gdf = gpd.read_file(f"zip://{path}")
            nearby = gdf.cx[
                _TZ_BOUNDS[0]:_TZ_BOUNDS[2],
                _TZ_BOUNDS[1]:_TZ_BOUNDS[3],
            ]
            country = _get_country_boundary()
            _rivers_gdf = gpd.clip(nearby, country)
        else:
            _rivers_gdf = gpd.GeoDataFrame()
    return _rivers_gdf


def _draw_water_bodies(ax, linewidth_scale: float = 1.0):
    """Draw lakes (filled) and rivers on the map."""
    lakes = _load_lakes()
    rivers = _load_rivers()
    water_color = COLORS["water"]
    if len(lakes) > 0:
        lakes.plot(ax=ax, facecolor=water_color, edgecolor="#7EB8DA",
                   linewidth=0.3 * linewidth_scale, alpha=0.5, zorder=2)
    if len(rivers) > 0:
        rivers.plot(ax=ax, color=water_color,
                    linewidth=0.5 * linewidth_scale, zorder=2)


_borders_gdf = None


def _load_borders() -> gpd.GeoDataFrame:
    """Load international boundary lines, clipped to Tanzania boundary."""
    global _borders_gdf
    if _borders_gdf is None:
        path = GEODATA_DIR / "tz_borders.geojson"
        if path.exists():
            raw = gpd.read_file(str(path))
            # Clip to a slightly buffered Tanzania boundary so border lines
            # don't extend into neighboring countries on the PDF maps.
            country = _get_country_boundary()
            try:
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    _borders_gdf = gpd.clip(raw, country.buffer(0.02))
            except Exception:
                _borders_gdf = raw
        else:
            _borders_gdf = gpd.GeoDataFrame()
    return _borders_gdf


def _draw_borders(ax, linewidth_scale: float = 1.0):
    """Draw international boundary lines (dashed gray)."""
    borders = _load_borders()
    if len(borders) > 0:
        borders.plot(ax=ax, color="#444444", linewidth=0.8 * linewidth_scale,
                     linestyle="--", zorder=3)


def _normalize_name(name: str) -> str:
    """Normalize a region/district name for matching."""
    return name.lower().replace(" ", "").replace("-", "").replace("'", "")


def _build_name_mapping(gdf: gpd.GeoDataFrame, name_col: str) -> dict:
    """Build a normalized-name to index mapping."""
    mapping = {}
    for idx, row in gdf.iterrows():
        normalized = _normalize_name(row[name_col])
        mapping[normalized] = idx
        # Also add VARNAME variants if available
        if 'VARNAME_2' in gdf.columns and row.get('VARNAME_2'):
            for variant in str(row['VARNAME_2']).split('|'):
                mapping[_normalize_name(variant)] = idx
    return mapping


def _add_region_labels(ax, regions_gdf, fontsize=4, color='#333333'):
    """Add region name labels at polygon centroids."""
    for idx, row in regions_gdf.iterrows():
        name = row['NAME_1']
        display_name = REGION_SHORT_NAMES.get(name, name)

        # Get centroid
        centroid = row.geometry.representative_point()
        x, y = centroid.x, centroid.y

        # Apply manual adjustments
        if name in REGION_LABEL_ADJUSTMENTS:
            dx, dy = REGION_LABEL_ADJUSTMENTS[name]
            x += dx
            y += dy

        # Add text with white outline for readability
        ax.text(x, y, display_name, fontsize=fontsize,
                ha='center', va='center', color=color,
                fontfamily='sans-serif', fontweight='normal',
                path_effects=[
                    pe.withStroke(linewidth=1.5, foreground='white'),
                ])


def _add_country_outline(ax, linewidth=1.0):
    """Draw a thick country border around Tanzania."""
    country = _get_country_boundary()
    country.boundary.plot(ax=ax, color=COLORS["country_border"],
                          linewidth=linewidth)


# Hazard type -> the real icon PNG stem (the WI 8.5.05 impact-forecast set in assets/icons).
_MAP_ICON_STEMS = {
    "HEAVY_RAIN": "heavy_rain", "LARGE_WAVES": "large_waves", "STRONG_WIND": "strong_wind",
    "FLOODS": "floods", "LANDSLIDES": "landslides", "EARTHQUAKE": "earthquake",
    "DROUGHT": "drought", "DISEASE_OUTBREAK": "disease_outbreak", "AIR_POLLUTION": "air_pollution",
    "VOLCANO": "volcano", "EXTREME_TEMPERATURE": "extreme_temperature",
}


def _hazard_icon_path(hazard_type):
    """Resolve a hazard type (enum or string) to its real icon PNG path (prefer 128px), else None."""
    if hazard_type is None:
        return None
    key = getattr(hazard_type, "name", None) or str(hazard_type).upper()
    stem = _MAP_ICON_STEMS.get(key)
    if not stem:
        return None
    for cand in (f"{stem}_128.png", f"{stem}.png", f"{stem}_512.png", f"{stem}_64.png"):
        p = ASSETS_DIR / "icons" / cand
        if p.exists():
            return p
    return None


def _add_warning_icon(ax, center_x, center_y, icon_size=0.6, hazard_type=None):
    """Place the REAL hazard icon PNG (WI 8.5.05 set) on the affected area, selected by hazard type.
    Falls back to a plain warning triangle only when no icon file is available."""
    icon_path = _hazard_icon_path(hazard_type)
    if icon_path is not None:
        try:
            img = plt.imread(str(icon_path))
            zoom = max(0.18, icon_size * 0.55)
            ab = AnnotationBbox(
                OffsetImage(img, zoom=zoom), (center_x, center_y),
                frameon=False, zorder=11, box_alignment=(0.5, 0.5), pad=0,
            )
            ax.add_artist(ab)
            return
        except Exception:
            pass
    # Fallback: generic warning triangle (only when the real icon is missing)
    triangle = mpatches.RegularPolygon(
        (center_x, center_y), numVertices=3,
        radius=icon_size, orientation=0,
        facecolor='#FFFF00', edgecolor='#000000', linewidth=1.2,
        zorder=10,
    )
    ax.add_patch(triangle)
    ax.text(center_x, center_y - 0.05, '!', fontsize=9, fontweight='bold',
            ha='center', va='center', color='black', zorder=11)


def _compute_affected_centroid(gdf, highlight_indices):
    """Compute the centroid of all highlighted polygons combined."""
    if not highlight_indices:
        return None
    affected = gdf.loc[list(highlight_indices)]
    dissolved = affected.dissolve()
    centroid = dissolved.geometry.representative_point().iloc[0]
    return centroid.x, centroid.y


def _resolve_shape_color(props: dict, default: str) -> str:
    """Resolve a drawn shape's fill colour from its GeoJSON properties.

    Honours an explicit alert ``level``/``alert_level`` (ADVISORY / WARNING /
    MAJOR_WARNING — any case or spaces) or a ``fill``/``color`` hex so that
    circles/polygons drawn at yellow/orange/red paint exactly on the PDF map.
    """
    if isinstance(props, dict):
        lvl = props.get("level") or props.get("alert_level")
        if lvl:
            key = str(lvl).strip().lower().replace(" ", "_").replace("-", "_")
            if key in ("major_warning", "majorwarning", "red"):
                return COLORS["major_warning"]
            if key in ("warning", "orange"):
                return COLORS["warning"]
            if key in ("advisory", "yellow"):
                return COLORS["advisory"]
            if key in COLORS:
                return COLORS[key]
        col = props.get("fill") or props.get("color") or props.get("_fill")
        if col:
            c = str(col).strip()
            cl = c.lower()
            if cl in COLORS:
                return COLORS[cl]
            if cl in ("#ffff00", "ffff00", "yellow"):
                return COLORS["advisory"]
            if cl in ("#ffa500", "ffa500", "orange"):
                return COLORS["warning"]
            if cl in ("#ff0000", "ff0000", "red", "#d32f2f"):
                return COLORS["major_warning"]
            if c.startswith("#") and len(c) in (4, 7):
                return c
    return default


def _shapes_centroid(drawn_shapes: list):
    """Approximate (lng, lat) centroid of a set of GeoJSON drawn shapes.

    Used to place a hazard icon when a hazard is expressed only as drawn
    circles/polygons (no region selection).
    """
    if not drawn_shapes:
        return None
    xs, ys = [], []
    for feat in drawn_shapes:
        if not isinstance(feat, dict):
            continue
        geom = feat.get("geometry") or feat
        if not isinstance(geom, dict):
            continue
        gtype = geom.get("type", "")
        try:
            if gtype == "Point":
                lng, lat = geom["coordinates"][:2]
                xs.append(float(lng)); ys.append(float(lat))
            elif gtype in ("Polygon", "MultiPolygon"):
                c = shapely_shape(geom).centroid
                xs.append(c.x); ys.append(c.y)
        except Exception:
            continue
    if not xs:
        return None
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def _draw_user_shapes(ax, drawn_shapes: list, fill_color: str = "#FFFF00", alpha: float = 0.55):
    """Render user-drawn GeoJSON shapes (polygon, rectangle, circle) on *ax*.

    Each item in *drawn_shapes* is a GeoJSON Feature dict.  Circles are
    stored as Point + ``properties.radius`` (metres).
    Shapes are clipped to Tanzania boundary so nothing bleeds outside.
    """
    if not drawn_shapes:
        return
    from matplotlib.patches import Polygon as MplPoly, Circle as MplCirc

    # Get Tanzania boundary for clipping
    try:
        tz = _get_country_boundary().unary_union
    except Exception:
        tz = None

    for feat in drawn_shapes:
        if not isinstance(feat, dict):
            continue
        # Handle both GeoJSON Feature and bare geometry objects
        geom = feat.get("geometry") or feat
        if isinstance(geom, dict) and "type" not in geom:
            continue
        props = feat.get("properties", {})
        shape_color = _resolve_shape_color(props, fill_color)
        gtype = geom.get("type", "")
        # Handle nested geometry from some Folium versions
        if gtype == "Feature":
            geom = geom.get("geometry", geom)
            gtype = geom.get("type", "")

        if gtype == "Point" and props.get("radius"):
            # Circle — convert to polygon, clip, then draw
            lng, lat = geom["coordinates"]
            radius_deg = float(props["radius"]) / 111_320
            circle_shp = Point(lng, lat).buffer(radius_deg, resolution=32)
            if tz is not None:
                circle_shp = circle_shp.intersection(tz)
            if circle_shp.is_empty:
                continue
            polys = [circle_shp] if circle_shp.geom_type == "Polygon" else list(circle_shp.geoms)
            for poly in polys:
                if hasattr(poly, "exterior"):
                    coords = list(poly.exterior.coords)
                    patch = MplPolygon(
                        coords, closed=True,
                        facecolor=shape_color, edgecolor="#000000",
                        linewidth=1.5, alpha=alpha, zorder=8,
                    )
                    ax.add_patch(patch)

        elif gtype in ("Polygon", "MultiPolygon"):
            try:
                shp = shapely_shape(geom)
                # Clip to Tanzania boundary
                if tz is not None:
                    shp = shp.intersection(tz)
                if shp.is_empty:
                    continue
                polys = [shp] if shp.geom_type == "Polygon" else list(shp.geoms)
                for poly in polys:
                    if not hasattr(poly, "exterior"):
                        continue
                    coords = list(poly.exterior.coords)
                    patch = MplPolygon(
                        coords, closed=True,
                        facecolor=shape_color, edgecolor="#000000",
                        linewidth=1.5, alpha=alpha, zorder=8,
                    )
                    ax.add_patch(patch)
            except Exception:
                pass


def generate_region_map(
    highlighted_regions: list[str] = None,
    color: str = "advisory",
    output_path: str = None,
    figsize: tuple = (4.0, 5.0),
    dpi: int = 150,
    title: str = None,
    show_labels: bool = True,
    show_warning_icon: bool = True,
    drawn_shapes: list = None,
    hazard_type=None,
    region_levels: dict = None,
    hazard_icons: list = None,
) -> str:
    """Generate a Tanzania map with highlighted regions.

    Args:
        highlighted_regions: List of region names to highlight
        color: Color key ("advisory", "warning", "major_warning")
        output_path: Where to save the PNG
        figsize: Figure size in inches
        dpi: Resolution
        title: Optional title
        show_labels: Whether to show region name labels
        show_warning_icon: Whether to show warning triangle icon

    Returns:
        Path to the generated PNG file
    """
    regions = _load_regions()

    fig, ax = plt.subplots(1, 1, figsize=figsize, dpi=dpi)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    # Normalize input names for matching
    highlighted_regions = highlighted_regions or []
    highlight_normalized = {_normalize_name(r) for r in highlighted_regions}
    name_map = _build_name_mapping(regions, 'NAME_1')

    # Per-region colour. ``region_levels`` (region name -> level key) lets each
    # region carry its own colour, so two or more hazards at different levels
    # all render distinctly on one map. Without it, the single ``color`` applies
    # to every highlighted region (legacy single-hazard behaviour).
    fill_color = COLORS.get(color, COLORS["advisory"])
    norm_level = {}
    if region_levels:
        for rname, lvl in region_levels.items():
            norm_level[_normalize_name(rname)] = str(lvl).strip().lower()

    # Map each matched region index -> its own colour key.
    idx_color = {}
    highlight_indices = set()
    for norm_name in highlight_normalized:
        if norm_name in name_map:
            idx = name_map[norm_name]
            highlight_indices.add(idx)
            key = norm_level.get(norm_name, color)
            idx_color[idx] = COLORS.get(key, fill_color)

    # Regions AND drawn shapes both render — selected regions are filled by
    # their level colour; drawn circles/polygons are drawn on top (below).
    region_colors = [idx_color.get(idx, COLORS["no_data"]) for idx in regions.index]

    regions_copy = regions.copy()
    regions_copy['_color'] = region_colors

    # Plot regions — thin black borders matching reference style
    regions_copy.plot(
        ax=ax,
        color=regions_copy['_color'],
        edgecolor="#000000",
        linewidth=0.6,
    )

    # Water bodies clipped to Tanzania boundary
    lw_scale = 1.2 if figsize[0] >= 3.5 else 0.8
    _draw_water_bodies(ax, linewidth_scale=lw_scale)
    _draw_borders(ax, linewidth_scale=lw_scale)

    # Region name labels
    if show_labels:
        label_size = 4.5 if figsize[0] >= 3.5 else 3.0
        _add_region_labels(ax, regions, fontsize=label_size, color='#000000')

    # Warning icon(s). When hazard_icons is given, place one icon per hazard at
    # its own affected centroid (so multiple hazards each show their own icon);
    # otherwise fall back to a single icon on the combined affected area.
    if show_warning_icon:
        icon_r = 0.7 if figsize[0] >= 3.5 else 0.5
        if hazard_icons:
            placed = []
            for hz in hazard_icons:
                ht = hz.get("hazard_type")
                hz_norm = {_normalize_name(r) for r in (hz.get("regions") or [])}
                hz_idx = {name_map[n] for n in hz_norm if n in name_map}
                ctr = _compute_affected_centroid(regions, hz_idx) if hz_idx else None
                if ctr is None and hz.get("shapes"):
                    ctr = _shapes_centroid(hz["shapes"])
                if not ctr:
                    continue
                cx, cy = ctr
                # Nudge icons that would land on top of an already-placed one.
                for (px, py) in placed:
                    if abs(px - cx) < 0.6 and abs(py - cy) < 0.6:
                        cx += 0.9
                placed.append((cx, cy))
                _add_warning_icon(ax, cx, cy, icon_size=icon_r, hazard_type=ht)
        elif highlight_indices:
            centroid = _compute_affected_centroid(regions, highlight_indices)
            if centroid:
                _add_warning_icon(ax, centroid[0], centroid[1], icon_size=icon_r, hazard_type=hazard_type)
        elif drawn_shapes:
            # Delineation-only hazard (no region selected) — put the icon on the drawn shapes.
            ctr = _shapes_centroid(drawn_shapes)
            if ctr:
                _add_warning_icon(ax, ctr[0], ctr[1], icon_size=icon_r, hazard_type=hazard_type)

    # User-drawn shapes (polygon / circle / rectangle) on top — each shape keeps
    # its own colour (per-hazard) via its GeoJSON properties.
    if drawn_shapes:
        _draw_user_shapes(ax, drawn_shapes, fill_color, alpha=0.55)

    # Lock axes to Tanzania only — no neighboring countries
    ax.set_xlim(*_GEO_XLIM)
    ax.set_ylim(*_GEO_YLIM)
    ax.set_axis_off()

    if title:
        ax.set_title(title, fontsize=7, fontweight='bold', pad=2)

    plt.tight_layout(pad=0.1)

    # Save
    if output_path is None:
        output_path = str(ASSETS_DIR / "placeholders" / "temp_region_map.png")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=dpi, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close(fig)

    return output_path


def generate_district_map(
    highlighted_districts: list[str],
    color: str = "advisory",
    output_path: str = None,
    figsize: tuple = (4.0, 5.0),
    dpi: int = 150,
    title: str = None,
    show_labels: bool = True,
    show_warning_icon: bool = False,
    district_levels: dict = None,
    drawn_shapes: list = None,
) -> str:
    """Generate a Tanzania map with highlighted districts.

    Args:
        highlighted_districts: List of district names to highlight
        color: Color key ("advisory", "warning", "major_warning")
        output_path: Where to save the PNG
        figsize: Figure size in inches
        dpi: Resolution
        title: Optional title
        show_labels: Whether to show region name labels
        show_warning_icon: Whether to show warning triangle icon

    Returns:
        Path to the generated PNG file
    """
    districts = _load_districts()
    regions = _load_regions()

    fig, ax = plt.subplots(1, 1, figsize=figsize, dpi=dpi)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    # Normalize input names for matching
    highlight_normalized = {_normalize_name(d) for d in highlighted_districts}
    name_map = _build_name_mapping(districts, 'NAME_2')

    # Find matching indices
    highlight_indices = set()
    for norm_name in highlight_normalized:
        if norm_name in name_map:
            highlight_indices.add(name_map[norm_name])

    # Color assignment — when drawn_shapes are provided, keep all districts white so only the drawn shapes
    # show colour. Otherwise each highlighted district renders at its OWN level via ``district_levels``
    # (district name -> COLORS key), mirroring generate_region_map; the single ``color`` is the fallback.
    fill_color = COLORS.get(color, COLORS["advisory"])
    norm_level = {}
    if district_levels:
        for dname, key in district_levels.items():
            norm_level[_normalize_name(dname)] = str(key).strip().lower()
    norm_by_idx = {}
    for nn in highlight_normalized:
        if nn in name_map:
            norm_by_idx[name_map[nn]] = nn
    if drawn_shapes:
        district_colors = [COLORS["no_data"]] * len(districts)
    else:
        district_colors = []
        for idx in districts.index:
            if idx in highlight_indices:
                nn = norm_by_idx.get(idx)
                key = norm_level.get(nn, color) if nn else color
                district_colors.append(COLORS.get(key, fill_color))
            else:
                district_colors.append(COLORS["no_data"])

    districts_copy = districts.copy()
    districts_copy['_color'] = district_colors

    # Plot districts
    districts_copy.plot(
        ax=ax,
        color=districts_copy['_color'],
        edgecolor=COLORS["boundary"],
        linewidth=0.15,
    )

    # Region boundaries on top (black, matching reference)
    regions.boundary.plot(ax=ax, color="#000000", linewidth=0.6)

    # Water bodies clipped to Tanzania
    _draw_water_bodies(ax, linewidth_scale=0.8)
    _draw_borders(ax, linewidth_scale=0.8)

    # Region name labels
    if show_labels:
        label_size = 3.0 if figsize[0] >= 3.0 else 2.5
        _add_region_labels(ax, regions, fontsize=label_size, color='#000000')

    # Add warning icon
    if show_warning_icon and highlight_indices:
        centroid = _compute_affected_centroid(districts, highlight_indices)
        if centroid:
            _add_warning_icon(ax, centroid[0], centroid[1], icon_size=0.5)

    # User-drawn shapes on top
    if drawn_shapes:
        _draw_user_shapes(ax, drawn_shapes, fill_color, alpha=0.55)

    # Lock axes to Tanzania only — no neighboring countries
    ax.set_xlim(*_GEO_XLIM)
    ax.set_ylim(*_GEO_YLIM)
    ax.set_axis_off()

    if title:
        ax.set_title(title, fontsize=7, fontweight='bold', pad=2)

    plt.tight_layout(pad=0.1)

    # Save
    if output_path is None:
        output_path = str(ASSETS_DIR / "placeholders" / "temp_district_map.png")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=dpi, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close(fig)

    return output_path


def generate_multi_hazard_map(
    advisory_districts: list[str] = None,
    warning_districts: list[str] = None,
    major_warning_districts: list[str] = None,
    output_path: str = None,
    figsize: tuple = (4.5, 6.0),
    dpi: int = 150,
    show_labels: bool = True,
    drawn_shapes: list = None,
) -> str:
    """Generate a summary map with multiple alert levels shown simultaneously.

    Args:
        advisory_districts: Districts at ADVISORY level
        warning_districts: Districts at WARNING level
        major_warning_districts: Districts at MAJOR WARNING level
        output_path: Where to save the PNG
        show_labels: Whether to show region name labels

    Returns:
        Path to the generated PNG file
    """
    districts = _load_districts()
    regions = _load_regions()

    fig, ax = plt.subplots(1, 1, figsize=figsize, dpi=dpi)
    fig.patch.set_facecolor('white')
    ax.set_facecolor('white')

    name_map = _build_name_mapping(districts, 'NAME_2')

    # Build color lookup: major_warning > warning > advisory (priority order)
    idx_colors = {}

    for dist_list, color_key in [
        (advisory_districts or [], "advisory"),
        (warning_districts or [], "warning"),
        (major_warning_districts or [], "major_warning"),
    ]:
        for name in dist_list:
            norm = _normalize_name(name)
            if norm in name_map:
                idx_colors[name_map[norm]] = COLORS[color_key]

    district_colors = []
    for idx in districts.index:
        district_colors.append(idx_colors.get(idx, COLORS["no_data"]))

    districts_copy = districts.copy()
    districts_copy['_color'] = district_colors

    # Plot districts
    districts_copy.plot(
        ax=ax,
        color=districts_copy['_color'],
        edgecolor=COLORS["boundary"],
        linewidth=0.15,
    )

    # Region boundaries on top (black, matching reference)
    regions.boundary.plot(ax=ax, color="#000000", linewidth=0.6)

    # Water bodies clipped to Tanzania
    _draw_water_bodies(ax, linewidth_scale=0.8)
    _draw_borders(ax, linewidth_scale=0.8)

    # Region labels
    if show_labels:
        label_size = 3.5 if figsize[0] >= 3.0 else 2.5
        _add_region_labels(ax, regions, fontsize=label_size, color='#000000')

    # PMO delineations on top — each shape keeps its own level colour (via GeoJSON properties.level).
    if drawn_shapes:
        _draw_user_shapes(ax, drawn_shapes, COLORS["warning"], alpha=0.5)

    # Lock axes to Tanzania only — no neighboring countries
    ax.set_xlim(*_GEO_XLIM)
    ax.set_ylim(*_GEO_YLIM)
    ax.set_axis_off()
    plt.tight_layout(pad=0.1)

    if output_path is None:
        output_path = str(ASSETS_DIR / "placeholders" / "temp_summary_map.png")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=dpi, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close(fig)

    return output_path

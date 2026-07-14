"""Generation pipeline: Load -> Validate -> Build Maps -> Build Document -> Convert."""

import json
from pathlib import Path
from typing import Optional

from .validation.validator import (
    validate_and_parse_722e4, validate_and_parse_multirisk,
    validate_and_parse_mow, validate_and_parse_gst,
    validate_and_parse_moh, validate_and_parse_moa,
    validate_and_parse_nemc,
)
from .builders.seven22e4_builder import Seven22E4Builder
from .builders.multirisk_builder import MultiriskBuilder
from .builders.agency_builders import (
    MoWBuilder, GSTBuilder, MoHBuilder, MoABuilder, NEMCBuilder,
)
from .builders.auto_maps import (
    generate_722e4_maps, generate_multirisk_maps,
    generate_mow_maps, generate_gst_maps,
    generate_moh_maps, generate_moa_maps, generate_nemc_maps,
)
from .converters.pdf_converter import convert_docx_to_pdf
from .models.common import MapImage


def generate_722e4(
    input_path: str,
    output_dir: str = "output",
    output_format: str = "both",
    maps_dir: Optional[str] = None,
    auto_maps: bool = True,
) -> dict:
    """Generate a 722E_4 Five Days Severe Weather bulletin.

    Args:
        input_path: Path to JSON input file
        output_dir: Directory for output files
        output_format: "docx", "pdf", or "both"
        maps_dir: Base directory for map image paths (if pre-made maps)
        auto_maps: Whether to auto-generate maps from data

    Returns:
        Dict with 'docx' and/or 'pdf' output paths
    """
    # 1. Load JSON
    with open(input_path) as f:
        data = json.load(f)

    # 2. Validate and parse
    bulletin = validate_and_parse_722e4(data)
    print(f"[722E_4] Parsed: {len(bulletin.days)} days, issued {bulletin.issue_date}")

    # 3. Auto-generate maps if enabled
    if auto_maps:
        print("[722E_4] Generating maps...")
        day_maps = generate_722e4_maps(bulletin)
        for i, map_path in day_maps.items():
            bulletin.days[i].map_image = MapImage(file_path=map_path)
        print(f"[722E_4] Generated {len(day_maps)} maps")

    # 4. Build document
    print("[722E_4] Building document...")
    builder = Seven22E4Builder(bulletin, maps_dir=maps_dir)
    doc = builder.build()

    # 5. Output
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    date_str = bulletin.issue_date.strftime("%d-%m-%Y")
    base_name = f"722E_4_Five_days_{date_str}"

    result = {}

    if output_format in ("docx", "both"):
        docx_path = builder.save(f"{output_dir}/{base_name}.docx")
        result["docx"] = docx_path
        print(f"[722E_4] DOCX saved: {docx_path}")

    if output_format in ("pdf", "both"):
        docx_path = result.get("docx") or builder.save(f"{output_dir}/{base_name}.docx")
        pdf_path = convert_docx_to_pdf(docx_path, output_dir)
        result["pdf"] = pdf_path
        print(f"[722E_4] PDF saved: {pdf_path}")

    return result


def generate_multirisk(
    input_path: str,
    output_dir: str = "output",
    output_format: str = "both",
    maps_dir: Optional[str] = None,
    auto_maps: bool = True,
) -> dict:
    """Generate a Multirisk Three Days Impact-Based Forecast bulletin.

    Args:
        input_path: Path to JSON input file
        output_dir: Directory for output files
        output_format: "docx", "pdf", or "both"
        maps_dir: Base directory for map image paths (if pre-made maps)
        auto_maps: Whether to auto-generate maps from data

    Returns:
        Dict with 'docx' and/or 'pdf' output paths
    """
    # 1. Load JSON
    with open(input_path) as f:
        data = json.load(f)

    # 2. Validate and parse
    bulletin = validate_and_parse_multirisk(data)
    print(f"[Multirisk] Parsed: #{bulletin.bulletin_number}, {len(bulletin.days)} days, "
          f"lang={bulletin.language.value}")

    # 3. Auto-generate maps if enabled
    if auto_maps and bulletin.day_summaries:
        print("[Multirisk] Generating maps...")
        maps = generate_multirisk_maps(bulletin)

        # Assign maps to hazard panels and summary maps
        for day in bulletin.days:
            dn = day.day_number
            # Assign hazard panel maps
            from .models.common import HazardType
            for panel in day.hazard_panels:
                key = f"day{dn}_{panel.hazard_type.value.lower()}"
                if key in maps:
                    panel.map_image = MapImage(file_path=maps[key])

            # Assign summary map
            summary_key = f"day{dn}_summary"
            if summary_key in maps:
                day.summary_map = MapImage(file_path=maps[summary_key])

        print(f"[Multirisk] Generated {len(maps)} maps")

    # 4. Build document
    print("[Multirisk] Building document...")
    builder = MultiriskBuilder(bulletin, maps_dir=maps_dir)
    doc = builder.build()

    # 5. Output
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    num = bulletin.bulletin_number
    date_str = bulletin.issue_date.strftime("%d_%m_%Y")
    lang_suffix = "_SW" if bulletin.language.value == "sw" else ""
    base_name = f"Tanzania_Multirisk{lang_suffix}_{num}_{date_str}"

    result = {}

    if output_format in ("docx", "both"):
        docx_path = builder.save(f"{output_dir}/{base_name}.docx")
        result["docx"] = docx_path
        print(f"[Multirisk] DOCX saved: {docx_path}")

    if output_format in ("pdf", "both"):
        docx_path = result.get("docx") or builder.save(f"{output_dir}/{base_name}.docx")
        pdf_path = convert_docx_to_pdf(docx_path, output_dir)
        result["pdf"] = pdf_path
        print(f"[Multirisk] PDF saved: {pdf_path}")

    return result


# ---------------------------------------------------------------------------
# Agency-specific pipelines
# ---------------------------------------------------------------------------

def _generate_agency_bulletin(
    input_path: str,
    output_dir: str,
    output_format: str,
    maps_dir: Optional[str],
    auto_maps: bool,
    tag: str,
    validator_fn,
    map_gen_fn,
    builder_cls,
    base_name_fn,
    map_assign_fn=None,
) -> dict:
    """Generic pipeline for agency bulletins."""
    with open(input_path) as f:
        data = json.load(f)

    bulletin = validator_fn(data)
    print(f"[{tag}] Parsed: issued {bulletin.issue_date}")

    generated_maps = {}
    if auto_maps:
        print(f"[{tag}] Generating maps...")
        generated_maps = map_gen_fn(bulletin)
        if map_assign_fn:
            map_assign_fn(bulletin, generated_maps)
        print(f"[{tag}] Generated {len(generated_maps)} maps")

    print(f"[{tag}] Building document...")
    builder = builder_cls(bulletin, maps_dir=maps_dir)
    builder._generated_maps = generated_maps
    doc = builder.build()

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    base_name = base_name_fn(bulletin)

    result = {}
    if output_format in ("docx", "both"):
        docx_path = builder.save(f"{output_dir}/{base_name}.docx")
        result["docx"] = docx_path
        print(f"[{tag}] DOCX saved: {docx_path}")

    if output_format in ("pdf", "both"):
        docx_path = result.get("docx") or builder.save(f"{output_dir}/{base_name}.docx")
        pdf_path = convert_docx_to_pdf(docx_path, output_dir)
        result["pdf"] = pdf_path
        print(f"[{tag}] PDF saved: {pdf_path}")

    return result


def generate_mow(input_path: str, output_dir: str = "output",
                  output_format: str = "both", maps_dir: Optional[str] = None,
                  auto_maps: bool = True) -> dict:
    """Generate MoW Flood Risk Assessment bulletin."""
    def _assign_maps(bulletin, maps):
        for i, path in maps.items():
            bulletin.days[i].map_image = MapImage(file_path=path)

    return _generate_agency_bulletin(
        input_path, output_dir, output_format, maps_dir, auto_maps,
        tag="MoW",
        validator_fn=validate_and_parse_mow,
        map_gen_fn=generate_mow_maps,
        builder_cls=MoWBuilder,
        base_name_fn=lambda b: f"MoW_Flood_Assessment_{b.issue_date.strftime('%d-%m-%Y')}",
        map_assign_fn=_assign_maps,
    )


def generate_gst(input_path: str, output_dir: str = "output",
                  output_format: str = "both", maps_dir: Optional[str] = None,
                  auto_maps: bool = True) -> dict:
    """Generate GST Geological Hazard bulletin."""
    return _generate_agency_bulletin(
        input_path, output_dir, output_format, maps_dir, auto_maps,
        tag="GST",
        validator_fn=validate_and_parse_gst,
        map_gen_fn=generate_gst_maps,
        builder_cls=GSTBuilder,
        base_name_fn=lambda b: f"GST_Geohazard_{b.issue_date.strftime('%d-%m-%Y')}",
    )


def generate_moh(input_path: str, output_dir: str = "output",
                  output_format: str = "both", maps_dir: Optional[str] = None,
                  auto_maps: bool = True) -> dict:
    """Generate MoH Disease Outbreak bulletin."""
    return _generate_agency_bulletin(
        input_path, output_dir, output_format, maps_dir, auto_maps,
        tag="MoH",
        validator_fn=validate_and_parse_moh,
        map_gen_fn=generate_moh_maps,
        builder_cls=MoHBuilder,
        base_name_fn=lambda b: f"MoH_Outbreak_{b.issue_date.strftime('%d-%m-%Y')}",
    )


def generate_moa(input_path: str, output_dir: str = "output",
                  output_format: str = "both", maps_dir: Optional[str] = None,
                  auto_maps: bool = True) -> dict:
    """Generate MoA Agricultural Hazard bulletin."""
    return _generate_agency_bulletin(
        input_path, output_dir, output_format, maps_dir, auto_maps,
        tag="MoA",
        validator_fn=validate_and_parse_moa,
        map_gen_fn=generate_moa_maps,
        builder_cls=MoABuilder,
        base_name_fn=lambda b: f"MoA_Agri_Hazard_{b.issue_date.strftime('%d-%m-%Y')}",
    )


def generate_nemc(input_path: str, output_dir: str = "output",
                   output_format: str = "both", maps_dir: Optional[str] = None,
                   auto_maps: bool = True) -> dict:
    """Generate NEMC Environmental Hazard bulletin."""
    return _generate_agency_bulletin(
        input_path, output_dir, output_format, maps_dir, auto_maps,
        tag="NEMC",
        validator_fn=validate_and_parse_nemc,
        map_gen_fn=generate_nemc_maps,
        builder_cls=NEMCBuilder,
        base_name_fn=lambda b: f"NEMC_Environmental_{b.issue_date.strftime('%d-%m-%Y')}",
    )

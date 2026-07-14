"""Data models for all agency-specific bulletins (MoW, GST, MoH, MoA, NEMC)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time
from typing import Optional

from .common import AlertLevel, RatingPair, MapImage


# ---------------------------------------------------------------------------
# MoW — Ministry of Water: Flood Risk Assessment (3 days)
# ---------------------------------------------------------------------------

@dataclass
class FloodAssessment:
    """A single flood assessment entry within a day."""
    alert_level: AlertLevel
    catchment_basins: list[str] = field(default_factory=list)
    districts: list[str] = field(default_factory=list)
    regions: list[str] = field(default_factory=list)
    description: str = ""
    likelihood: str = "MEDIUM"
    impact: str = "MEDIUM"
    impacts_expected: str = ""
    drawn_shapes: list[dict] = field(default_factory=list)


@dataclass
class MoWDayForecast:
    """Forecast for a single day in the MoW bulletin."""
    forecast_date: date
    assessments: list[FloodAssessment] = field(default_factory=list)
    map_image: Optional[MapImage] = None

    @property
    def max_alert_level(self) -> AlertLevel:
        priority = {AlertLevel.NO_WARNING: 0, AlertLevel.ADVISORY: 1,
                    AlertLevel.WARNING: 2, AlertLevel.MAJOR_WARNING: 3}
        if not self.assessments:
            return AlertLevel.NO_WARNING
        return max(self.assessments, key=lambda a: priority[a.alert_level]).alert_level


@dataclass
class MoWBulletin:
    """Complete MoW Flood Risk Assessment bulletin (3 days)."""
    issue_date: date
    issue_time: time
    days: list[MoWDayForecast]

    def __post_init__(self):
        if len(self.days) != 3:
            raise ValueError(f"MoW bulletin must have exactly 3 days, got {len(self.days)}")


# ---------------------------------------------------------------------------
# GST — Geological Survey Tanzania: Geohazard Bulletin
# ---------------------------------------------------------------------------

@dataclass
class GeologicalEvent:
    """A single geological event (earthquake, landslide, volcano)."""
    event_type: str  # EARTHQUAKE, LANDSLIDE, VOLCANO
    alert_level: AlertLevel
    regions: list[str] = field(default_factory=list)
    districts: list[str] = field(default_factory=list)
    description: str = ""
    likelihood: str = "MEDIUM"
    impact: str = "MEDIUM"
    impacts_expected: str = ""
    drawn_shapes: list[dict] = field(default_factory=list)
    # Earthquake-specific
    magnitude: Optional[float] = None
    depth_km: Optional[float] = None
    severity: Optional[str] = None
    # Volcano-specific
    volcanic_hazard_index: Optional[str] = None
    activity_type: Optional[str] = None


@dataclass
class GSTBulletin:
    """Complete GST Geological Hazard bulletin."""
    issue_date: date
    issue_time: time
    events: list[GeologicalEvent]


# ---------------------------------------------------------------------------
# MoH — Ministry of Health: Disease Outbreak Bulletin
# ---------------------------------------------------------------------------

@dataclass
class DiseaseOutbreak:
    """A single disease outbreak entry."""
    disease_type: str  # Cholera, Dengue, Malaria Surge, etc.
    alert_level: AlertLevel
    regions: list[str] = field(default_factory=list)
    districts: list[str] = field(default_factory=list)
    confirmed_cases: int = 0
    deaths: int = 0
    trend: str = "Stable"  # Increasing, Stable, Decreasing
    situation_summary: str = ""
    response_actions: str = ""
    likelihood: str = "MEDIUM"
    impact: str = "MEDIUM"
    drawn_shapes: list[dict] = field(default_factory=list)


@dataclass
class MoHBulletin:
    """Complete MoH Disease Outbreak bulletin."""
    issue_date: date
    issue_time: time
    outbreaks: list[DiseaseOutbreak]


# ---------------------------------------------------------------------------
# MoA — Ministry of Agriculture: Agricultural Hazard Bulletin
# ---------------------------------------------------------------------------

@dataclass
class AgriculturalAssessment:
    """A single agricultural hazard assessment."""
    hazard_type: str  # DROUGHT, CROP_DISEASE, LOCUST_PEST, FOOD_INSECURITY
    alert_level: AlertLevel
    regions: list[str] = field(default_factory=list)
    districts: list[str] = field(default_factory=list)
    drought_severity: Optional[str] = None  # D0-D4
    rainfall_pct: Optional[float] = None
    ndvi: Optional[str] = None
    affected_sectors: list[str] = field(default_factory=list)
    situation_summary: str = ""
    recommended_actions: str = ""
    likelihood: str = "MEDIUM"
    impact: str = "MEDIUM"
    drawn_shapes: list[dict] = field(default_factory=list)


@dataclass
class MoABulletin:
    """Complete MoA Agricultural Hazard bulletin."""
    issue_date: date
    issue_time: time
    report_period: str = "Weekly"  # Weekly, Monthly, Seasonal
    assessments: list[AgriculturalAssessment] = field(default_factory=list)


# ---------------------------------------------------------------------------
# NEMC — National Environment Management Council: Environmental Hazard Bulletin
# ---------------------------------------------------------------------------

@dataclass
class EnvironmentalEvent:
    """A single environmental hazard event."""
    hazard_type: str  # AIR_POLLUTION, WILDFIRE, INDUSTRIAL, OIL_SPILL
    alert_level: AlertLevel
    regions: list[str] = field(default_factory=list)
    districts: list[str] = field(default_factory=list)
    pollution_source: Optional[str] = None
    aqi_level: Optional[str] = None
    aqi_value: Optional[int] = None
    key_pollutants: list[str] = field(default_factory=list)
    situation_summary: str = ""
    health_advisory: str = ""
    likelihood: str = "MEDIUM"
    impact: str = "MEDIUM"
    drawn_shapes: list[dict] = field(default_factory=list)


@dataclass
class NEMCBulletin:
    """Complete NEMC Environmental Hazard bulletin."""
    issue_date: date
    issue_time: time
    events: list[EnvironmentalEvent]

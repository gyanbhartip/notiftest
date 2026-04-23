# backend/fast/models/offer.py
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Customer(BaseModel):
    name: str
    type: Literal["residential", "business"]
    phone_masked: str


class Address(BaseModel):
    line1: str
    line2: Optional[str] = None
    city: str
    postal: str
    lat: float
    lng: float
    landmark: Optional[str] = None


class Appliance(BaseModel):
    category: Literal[
        "ac",
        "refrigerator",
        "washing_machine",
        "microwave",
        "tv",
        "geyser",
        "dishwasher",
        "other",
    ]
    brand: Optional[str] = None
    model: Optional[str] = None
    age_years: Optional[int] = None


class Issue(BaseModel):
    title: str
    description: str
    symptoms: list[str] = Field(default_factory=list)
    urgency: Literal["low", "normal", "high", "emergency"]
    photo_urls: Optional[list[str]] = None


class Appointment(BaseModel):
    window_start: datetime
    window_end: datetime
    slot_label: str


class JobMeta(BaseModel):
    estimated_duration_minutes: int
    requires_parts: bool
    parts_hint: Optional[list[str]] = None


class ServiceVisitPayload(BaseModel):
    customer: Customer
    address: Address
    appliance: Appliance
    issue: Issue
    appointment: Appointment
    job_meta: JobMeta


class OfferEnvelope(BaseModel):
    offer_id: str
    type: Literal["service_visit"] = "service_visit"
    created_at: datetime
    expires_at: datetime
    expires_ms_total: int
    schema_version: Literal[1] = 1
    payload: ServiceVisitPayload


class AcceptBody(BaseModel):
    device_id: str


class DeclineBody(BaseModel):
    device_id: str
    reason: Literal["sick", "on_other_job", "vehicle_issue", "other"]
    other_text: Optional[str] = None


class PresenceBody(BaseModel):
    device_id: str


class JobDetailsActions(BaseModel):
    navigate_url: str
    call_customer_url: str


class JobDetailsCustomer(BaseModel):
    name: str
    type: Literal["residential", "business"]
    phone: str


class JobDetails(BaseModel):
    offer_id: str
    job_id: str
    customer: JobDetailsCustomer
    address: Address
    appliance: Appliance
    issue: Issue
    appointment: Appointment
    job_meta: JobMeta
    actions: JobDetailsActions

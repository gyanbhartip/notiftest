# backend/fast/services/offer_store.py
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from models.offer import (
    JobDetails,
    JobDetailsActions,
    JobDetailsCustomer,
    OfferEnvelope,
)


IDEM_TTL_S = 600  # 10 min


@dataclass
class Resolution:
    offer_id: str
    status: str  # accepted | declined | expired | superseded
    resolved_at: datetime
    reason: Optional[str] = None
    other_text: Optional[str] = None


@dataclass
class IdemRecord:
    response: dict
    status_code: int
    created_at: float = field(default_factory=time.monotonic)


class OfferStore:
    def __init__(self) -> None:
        self.offers: dict[str, OfferEnvelope] = {}
        self.resolutions: dict[str, Resolution] = {}
        self.idem: dict[str, IdemRecord] = {}
        self.presence: dict[str, dict] = {}

    def put_offer(self, envelope: OfferEnvelope) -> None:
        self.offers[envelope.offer_id] = envelope

    def get_offer(self, offer_id: str) -> Optional[OfferEnvelope]:
        return self.offers.get(offer_id)

    def get_resolution(self, offer_id: str) -> Optional[Resolution]:
        return self.resolutions.get(offer_id)

    def set_resolution(self, resolution: Resolution) -> None:
        self.resolutions[resolution.offer_id] = resolution

    def check_idem(self, key: str) -> Optional[IdemRecord]:
        record = self.idem.get(key)
        if record is None:
            return None
        if time.monotonic() - record.created_at > IDEM_TTL_S:
            self.idem.pop(key, None)
            return None
        return record

    def store_idem(self, key: str, response: dict, status_code: int) -> None:
        self.idem[key] = IdemRecord(response=response, status_code=status_code)

    def update_presence(self, device_id: str, intent: str) -> None:
        self.presence[device_id] = {
            "intent": intent,
            "last_ack": datetime.now(timezone.utc).isoformat(),
        }

    def build_job_details(self, envelope: OfferEnvelope) -> JobDetails:
        p = envelope.payload
        # Unmask phone for PoC — just strip dots.
        unmasked = p.customer.phone_masked.replace("•", "").replace(" ", "")
        unmasked = unmasked or "+911234567890"
        return JobDetails(
            offer_id=envelope.offer_id,
            job_id=f"job_{uuid.uuid4().hex[:8]}",
            customer=JobDetailsCustomer(
                name=p.customer.name,
                type=p.customer.type,
                phone=unmasked,
            ),
            address=p.address,
            appliance=p.appliance,
            issue=p.issue,
            appointment=p.appointment,
            job_meta=p.job_meta,
            actions=JobDetailsActions(
                navigate_url=f"google.navigation:q={p.address.lat},{p.address.lng}",
                call_customer_url=f"tel:{unmasked}",
            ),
        )

    def clear_all(self) -> None:
        self.offers.clear()
        self.resolutions.clear()
        self.idem.clear()
        self.presence.clear()


store = OfferStore()

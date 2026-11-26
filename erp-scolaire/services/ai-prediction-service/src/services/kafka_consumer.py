"""
Kafka consumer — listens to cross-service events and invalidates the Redis
feature cache so that the next prediction re-reads fresh aggregates.
"""

import json
import logging
import threading
from typing import Callable

from kafka import KafkaConsumer
from kafka.errors import KafkaError

logger = logging.getLogger(__name__)

WATCHED_TOPICS = [
    "attendance.recorded",
    "grades.updated",
    "lms.devoir.corrige",
    "finance.invoice.paid",
    "finance.invoice.created",
]


def _extract_eleve_id(topic: str, payload: dict) -> str | None:
    """Best-effort extraction of eleve_id from any event shape."""
    for key in ("eleve_id", "student_id", "eleveId"):
        if key in payload:
            return str(payload[key])
    return None


def start_consumer(
    bootstrap_servers: str,
    group_id: str,
    on_invalidate: Callable[[str], None],
) -> threading.Thread:
    """Start background Kafka consumer thread. Returns the thread."""

    def _run() -> None:
        consumer = KafkaConsumer(
            *WATCHED_TOPICS,
            bootstrap_servers=bootstrap_servers,
            group_id=group_id,
            auto_offset_reset="latest",
            enable_auto_commit=True,
            value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        )
        logger.info("Kafka consumer started, topics=%s", WATCHED_TOPICS)
        try:
            for msg in consumer:
                try:
                    eleve_id = _extract_eleve_id(msg.topic, msg.value)
                    if eleve_id:
                        on_invalidate(eleve_id)
                        logger.debug("Cache invalidated for eleve_id=%s via %s", eleve_id, msg.topic)
                except Exception as exc:
                    logger.warning("Error processing message topic=%s: %s", msg.topic, exc)
        except KafkaError as exc:
            logger.error("Kafka consumer error: %s", exc)
        finally:
            consumer.close()

    thread = threading.Thread(target=_run, daemon=True, name="kafka-consumer")
    thread.start()
    return thread

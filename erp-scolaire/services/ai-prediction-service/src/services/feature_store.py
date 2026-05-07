"""
Builds StudentFeatures by querying cross-service views via direct DB connections.
The AI service has read-only access to materialised views pre-aggregated by each service.
"""

import logging
from typing import Optional

import psycopg2
import redis as redis_lib

from ..models.dropout_predictor import StudentFeatures

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour


def _cache_key(eleve_id: str) -> str:
    return f"ai:features:{eleve_id}"


def get_features(
    eleve_id: str,
    db_conn: psycopg2.extensions.connection,
    redis_client: redis_lib.Redis,
) -> Optional[StudentFeatures]:
    cached = redis_client.get(_cache_key(eleve_id))
    if cached:
        parts = cached.decode().split(",")
        return StudentFeatures(
            absences_30j=int(parts[0]),
            retards_30j=int(parts[1]),
            moyenne_generale=float(parts[2]),
            devoirs_non_rendus=int(parts[3]),
            factures_impayees=int(parts[4]),
            progression_lms=float(parts[5]),
        )

    with db_conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                COALESCE(a.absences_30j, 0),
                COALESCE(a.retards_30j, 0),
                COALESCE(g.moyenne_generale, 10.0),
                COALESCE(l.devoirs_non_rendus, 0),
                COALESCE(f.factures_impayees, 0),
                COALESCE(l.progression_lms, 0.0)
            FROM (SELECT %s::uuid AS eleve_id) base
            LEFT JOIN mv_absences_30j  a ON a.eleve_id = base.eleve_id
            LEFT JOIN mv_moyenne_generale g ON g.eleve_id = base.eleve_id
            LEFT JOIN mv_lms_stats l ON l.eleve_id = base.eleve_id
            LEFT JOIN mv_factures_impayees f ON f.eleve_id = base.eleve_id
            """,
            (eleve_id,),
        )
        row = cur.fetchone()

    if row is None:
        return None

    features = StudentFeatures(
        absences_30j=int(row[0]),
        retards_30j=int(row[1]),
        moyenne_generale=float(row[2]),
        devoirs_non_rendus=int(row[3]),
        factures_impayees=int(row[4]),
        progression_lms=float(row[5]),
    )

    serialized = f"{features.absences_30j},{features.retards_30j},{features.moyenne_generale},{features.devoirs_non_rendus},{features.factures_impayees},{features.progression_lms}"
    redis_client.setex(_cache_key(eleve_id), CACHE_TTL, serialized)
    return features


def invalidate_features(eleve_id: str, redis_client: redis_lib.Redis) -> None:
    redis_client.delete(_cache_key(eleve_id))

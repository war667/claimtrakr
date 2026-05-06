import asyncio
import logging
from typing import List, Dict, Any, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, RetryError

logger = logging.getLogger(__name__)

QUERY_PARAMS_BASE = {
    "outFields": "*",
    "outSR": "4326",
    "f": "json",
    "resultRecordCount": "1000",
    "geometryPrecision": "6",
    "returnGeometry": "true",
}


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
async def _fetch_page(
    client: httpx.AsyncClient,
    url: str,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    response = await client.get(url, params=params, timeout=60.0)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"ArcGIS error: {data['error']}")
    return data


async def fetch_all_features(
    base_url: str,
    layer_index: int,
    state_filter: Optional[List[str]] = None,
    run_id: Optional[int] = None,
    on_error=None,
) -> List[Dict[str, Any]]:
    """
    Fetches all features from a BLM ArcGIS REST layer with pagination.
    Returns list of raw feature dicts. Does NOT fall back to mock data on failure.
    """
    states = state_filter or ["UT", "NV"]
    state_list = ", ".join(f"'{s}'" for s in states)
    where_clause = f"ADMIN_ST IN ({state_list})"

    query_url = f"{base_url}/{layer_index}/query"
    all_features: List[Dict[str, Any]] = []
    offset = 0
    page_num = 0

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(60.0, connect=15.0),
        follow_redirects=True,
    ) as client:
        while True:
            page_num += 1
            params = {
                **QUERY_PARAMS_BASE,
                "where": where_clause,
                "resultOffset": str(offset),
            }

            try:
                data = await _fetch_page(client, query_url, params)
            except httpx.HTTPStatusError as exc:
                msg = f"HTTP {exc.response.status_code} fetching page {page_num} at offset {offset}"
                logger.error(msg)
                if on_error:
                    await on_error(
                        error_type="fetch_error",
                        page_offset=offset,
                        error_message=msg,
                        raw_data=None,
                    )
                break
            except (httpx.RequestError, RetryError) as exc:
                msg = f"Network error fetching page {page_num} at offset {offset}: {exc}"
                logger.error(msg)
                if on_error:
                    await on_error(
                        error_type="fetch_error",
                        page_offset=offset,
                        error_message=msg,
                        raw_data=None,
                    )
                break
            except ValueError as exc:
                msg = f"ArcGIS API error at offset {offset}: {exc}"
                logger.error(msg)
                if on_error:
                    await on_error(
                        error_type="fetch_error",
                        page_offset=offset,
                        error_message=msg,
                        raw_data=None,
                    )
                break
            except Exception as exc:
                msg = f"Unexpected error fetching page {page_num} at offset {offset}: {exc}"
                logger.error(msg)
                if on_error:
                    await on_error(
                        error_type="fetch_error",
                        page_offset=offset,
                        error_message=msg,
                        raw_data=None,
                    )
                break

            features = data.get("features", [])
            all_features.extend(features)
            logger.info(
                f"BLM ArcGIS page {page_num}: offset={offset} fetched={len(features)} total={len(all_features)}"
            )

            exceeded = data.get("exceededTransferLimit", False)
            if len(features) < 1000 and not exceeded:
                break
            if not features:
                break

            offset += 1000
            await asyncio.sleep(0.5)

    logger.info(f"BLM ArcGIS fetch complete: {len(all_features)} total features from layer {layer_index}")
    return all_features

"""
Scrape public MLRS case pages (Salesforce Lightning, no auth required).
Returns structured JSON with whatever sections are visible on the page.
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def scrape_mlrs_case(url: str) -> dict:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError("playwright not installed")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        )
        page = await browser.new_page()
        try:
            await page.goto(url, timeout=30_000, wait_until="networkidle")

            # Give Lightning components time to render
            await page.wait_for_timeout(3000)

            result = {
                "url": url,
                "sections": {},
                "raw_text": None,
            }

            # Extract all visible labeled field-value pairs from Lightning record pages.
            # Lightning renders fields as pairs of <dt> label / <dd> value elements.
            fields = {}
            dt_elements = await page.query_selector_all("dt, .slds-form-element__label, label")
            for el in dt_elements:
                label = (await el.inner_text()).strip()
                if not label:
                    continue
                # Try to find the adjacent value
                parent = await el.evaluate_handle("el => el.closest('.slds-form-element, .slds-form-element__row, li, tr')")
                if parent:
                    try:
                        value_el = await parent.query_selector("dd, .slds-form-element__control, span[class*='value'], td:last-child")
                        if value_el:
                            value = (await value_el.inner_text()).strip()
                            if value and value != label:
                                fields[label] = value
                    except Exception:
                        pass
            if fields:
                result["sections"]["fields"] = fields

            # Extract any tables (case history, documents, etc.)
            tables = []
            table_elements = await page.query_selector_all("table")
            for table in table_elements:
                try:
                    headers = []
                    header_els = await table.query_selector_all("th")
                    for h in header_els:
                        headers.append((await h.inner_text()).strip())

                    rows = []
                    row_els = await table.query_selector_all("tbody tr")
                    for row in row_els:
                        cells = await row.query_selector_all("td")
                        row_data = [(await c.inner_text()).strip() for c in cells]
                        if any(row_data):
                            rows.append(row_data)

                    if headers or rows:
                        tables.append({"headers": headers, "rows": rows})
                except Exception:
                    pass
            if tables:
                result["sections"]["tables"] = tables

            # Capture all visible text as a fallback
            body_text = await page.inner_text("body")
            # Trim whitespace runs
            result["raw_text"] = " ".join(body_text.split())[:5000]

            return result

        except Exception as exc:
            logger.error(f"MLRS scrape failed for {url}: {exc}")
            return {"url": url, "error": str(exc), "sections": {}}
        finally:
            await browser.close()

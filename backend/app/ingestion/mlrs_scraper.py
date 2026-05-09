"""
Scrape public MLRS case pages (Salesforce Lightning, no auth required).
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
            await page.goto(url, timeout=45_000, wait_until="domcontentloaded")

            # Wait for Lightning to hydrate — try known LWC/Aura selectors
            for selector in [
                'lightning-record-form',
                'records-record-layout-item',
                '.slds-form-element',
                '.forcePageBlockItem',
                'main',
            ]:
                try:
                    await page.wait_for_selector(selector, timeout=8_000)
                    break
                except Exception:
                    continue

            # Extra settle time for async data loads
            await page.wait_for_timeout(4000)

            final_url = page.url
            result = {
                "url": url,
                "final_url": final_url,
                "sections": {},
                "raw_text": None,
            }

            fields = {}

            # Strategy 1: Salesforce slds form elements (label + control pairs)
            labels = await page.query_selector_all('.slds-form-element__label, .test-id__field-label')
            for label_el in labels:
                try:
                    label = (await label_el.inner_text()).strip().rstrip('*')
                    if not label:
                        continue
                    parent = await label_el.evaluate_handle(
                        "el => el.closest('.slds-form-element, .slds-form-element__row, .forcePageBlockItem, records-record-layout-item')"
                    )
                    if parent:
                        value_el = await parent.query_selector(
                            '.slds-form-element__static, .slds-form-element__control, '
                            'lightning-formatted-text, lightning-formatted-url, '
                            'lightning-formatted-date-time, .test-id__field-value'
                        )
                        if value_el:
                            value = (await value_el.inner_text()).strip()
                            if value and value != label:
                                fields[label] = value
                except Exception:
                    pass

            # Strategy 2: Any dl/dt/dd pairs
            if not fields:
                dt_els = await page.query_selector_all('dt')
                for dt in dt_els:
                    try:
                        label = (await dt.inner_text()).strip()
                        if not label:
                            continue
                        dd = await dt.evaluate_handle("el => el.nextElementSibling")
                        if dd:
                            value = (await dd.inner_text()).strip()
                            if value and value != label:
                                fields[label] = value
                    except Exception:
                        pass

            if fields:
                result["sections"]["fields"] = fields

            # Tables (case history, related lists)
            tables = []
            table_els = await page.query_selector_all('table')
            for table in table_els:
                try:
                    headers = [(await h.inner_text()).strip()
                               for h in await table.query_selector_all('th')]
                    rows = []
                    for row in await table.query_selector_all('tbody tr'):
                        cells = [(await c.inner_text()).strip()
                                 for c in await row.query_selector_all('td')]
                        if any(cells):
                            rows.append(cells)
                    if headers or rows:
                        tables.append({"headers": headers, "rows": rows})
                except Exception:
                    pass
            if tables:
                result["sections"]["tables"] = tables

            # Always capture raw text for debugging
            try:
                body_text = await page.inner_text('body')
                result["raw_text"] = " ".join(body_text.split())[:6000]
            except Exception:
                pass

            return result

        except Exception as exc:
            logger.error(f"MLRS scrape failed for {url}: {exc}")
            return {"url": url, "error": str(exc), "sections": {}}
        finally:
            await browser.close()

"""
Recipe import functionality - parse recipes from URLs.
"""
import requests
from bs4 import BeautifulSoup
from recipe_scrapers import scrape_html, scrape_me
from typing import Dict, List, Optional, Tuple
import json
import re
import os
from urllib.parse import urlparse, parse_qs, unquote
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
import logging

logger = logging.getLogger(__name__)

_BROWSER_HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
}


def _fetch_recipe_page(
    url: str, timeout: int = 20
) -> Tuple[Optional[str], Optional[BeautifulSoup], Optional[str]]:
    """
    Fetch recipe HTML with browser-like headers.
    Returns (html_text, soup, error_message). error_message set when fetch fails or looks blocked.
    """
    try:
        response = requests.get(url, timeout=timeout, headers=_BROWSER_HEADERS, allow_redirects=True)
        status = response.status_code
        if status in (401, 402, 403, 429, 451, 460):
            msg = (
                f'The recipe site blocked the import request (HTTP {status}). '
                f'Try again later, or create the recipe manually.'
            )
            logger.warning(f"Recipe site blocked fetch for {url}: HTTP {status}")
            return None, None, msg
        response.raise_for_status()
        html = response.text or ''
        lower = html[:4000].lower()
        if (
            'cf-browser-verification' in lower
            or 'attention required' in lower
            or 'captcha' in lower
            or ('security verification' in lower and 'recipeingredient' not in lower)
        ):
            msg = (
                'The recipe site returned a bot-check page instead of the recipe. '
                'Try again later, or create the recipe manually.'
            )
            logger.warning(f"Bot-check / challenge page for {url}")
            return None, None, msg
        if len(html) < 500:
            return None, None, 'The recipe page returned almost no content.'
        # Parse the same unicode text we keep (not response.content) so soup matches html.
        return html, BeautifulSoup(html, 'html.parser'), None
    except requests.exceptions.Timeout:
        msg = 'Timed out fetching the recipe page. Retry once, or use Paste.'
        logger.warning(f"Timeout fetching {url}")
        return None, None, msg
    except Exception as e:
        logger.warning(f"Failed to fetch recipe page {url}: {e}")
        return None, None, f'Could not fetch the recipe page: {e}'


def _iter_ldjson_nodes(data) -> List[Dict]:
    """Flatten JSON-LD into dict nodes (handles @graph, lists, nested graphs)."""
    nodes: List[Dict] = []
    if data is None:
        return nodes
    if isinstance(data, list):
        for item in data:
            nodes.extend(_iter_ldjson_nodes(item))
        return nodes
    if not isinstance(data, dict):
        return nodes
    nodes.append(data)
    if '@graph' in data:
        nodes.extend(_iter_ldjson_nodes(data.get('@graph')))
    return nodes


def _ldjson_type_names(node: Dict) -> List[str]:
    raw = node.get('@type')
    if isinstance(raw, list):
        return [str(x) for x in raw]
    if raw is None:
        return []
    return [str(raw)]


def _find_schema_recipe(soup: BeautifulSoup) -> Optional[Dict]:
    """Find the first Schema.org Recipe object in any ld+json block (including @graph)."""
    for script in soup.find_all('script', type='application/ld+json'):
        raw = script.string or script.get_text() or ''
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        for node in _iter_ldjson_nodes(data):
            types = _ldjson_type_names(node)
            if any(t.endswith('Recipe') or t == 'Recipe' for t in types):
                return node
    return None


def _unwrap_email_security_wrapper_url(url: str) -> str:
    """
    Resolve URLs wrapped by corporate email scanners (e.g. Microsoft Safe Links).
    Those hosts return an interstitial or scanner page, not the destination HTML, so
    recipe import sees no ingredients or schema.org data.
    """
    try:
        parsed = urlparse(url)
        host = (parsed.netloc or '').lower()
        if 'safelinks.protection.outlook.com' in host or 'safelinks.protection.office365.com' in host:
            qs = parse_qs(parsed.query)
            inner = (qs.get('url') or [None])[0]
            if inner:
                inner = unquote(inner)
                if inner.startswith(('http://', 'https://')):
                    logger.info('Unwrapped Outlook Safe Links URL to: %s', inner)
                    return inner
    except Exception:
        pass
    return url


def import_recipe_from_url(url: str) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Import a recipe from a URL.
    Returns (recipe_data, error_message). On success error_message is None.

    Fetch HTML ourselves (timeouts + browser headers), then:
    1. Parse with recipe-scrapers scrape_html (avoids scrape_me urlopen hangs)
    2. Fall back to Schema.org / HTML parsing on the same page
    """
    url = _unwrap_email_security_wrapper_url(url.strip())
    logger.info(f"Attempting to import recipe from {url}")

    html, soup, fetch_error = _fetch_recipe_page(url)

    # Prefer scrape_html on HTML we already fetched (bounded timeout, better UA).
    # scrape_me() uses urlopen and can hang ~60s+ when a site blocks or stalls.
    # If the host isn't in recipe-scrapers, skip wild-mode SchemaScraper — sites like
    # Best of Bridge need our HTML fallback (partial schema often breaks on title()).
    scraper = None
    if html:
        try:
            scraper = scrape_html(html, org_url=url)
            logger.info(f"Parsed {url} with scrape_html")
        except Exception as e:
            err_name = type(e).__name__
            err_text = str(e).lower()
            unsupported = (
                'WebsiteNotImplemented' in err_name
                or 'not supported' in err_text
                or "isn't currently supported" in err_text
            )
            if unsupported:
                logger.info(f"Host not in recipe-scrapers for {url}; using HTML fallback")
                scraper = None
            else:
                # Partial / unknown schema pages: try wild mode, then HTML fallback.
                try:
                    scraper = scrape_html(html, org_url=url, supported_only=False)
                    logger.info(f"Parsed {url} with scrape_html supported_only=False")
                except TypeError:
                    logger.warning(f"scrape_html failed for {url}: {e}")
                    scraper = None
                except Exception as e2:
                    logger.warning(f"scrape_html wild mode failed for {url}: {e2}")
                    scraper = None

    if scraper is None and not html:
        # Last resort: library fetch (may hang briefly on some networks)
        try:
            logger.info(f"No HTML fetched; trying scrape_me for {url}")
            scraper = scrape_me(url)
        except Exception as e:
            logger.warning(f"scrape_me failed for {url}: {e}")
            scraper = None
            if fetch_error:
                return None, fetch_error
            return None, f'Could not download or parse the recipe page ({e}).'

    if scraper is not None:
        def _scraper_get(method_name: str, default=None):
            """Best of Bridge / partial schema: title/yields/etc. may throw — don't abort."""
            try:
                value = getattr(scraper, method_name)()
                return default if value is None else value
            except Exception as e:
                logger.debug(f"scraper.{method_name}() failed for {url}: {e}")
                return default

        try:
            title = str(_scraper_get('title', '') or '').strip()
            ingredients = _scraper_get('ingredients', []) or []
            if not isinstance(ingredients, list):
                ingredients = []
            instructions = _scraper_get('instructions_list', []) or []
            if not isinstance(instructions, list):
                instructions = []
            if not instructions:
                raw_inst = _scraper_get('instructions', '') or ''
                if isinstance(raw_inst, str) and raw_inst.strip():
                    instructions = [s.strip() for s in re.split(r'\n+', raw_inst) if s.strip()]

            logger.info(
                f"Scraper data for {url}: title={title!r}, "
                f"ings={len(ingredients)}, inst={len(instructions)}"
            )

            if title or ingredients or instructions:
                if soup:
                    extracted_title = _extract_title_from_soup(soup)
                    if extracted_title and len(extracted_title.strip()) > 3:
                        if (
                            not title
                            or len(title.strip()) < 3
                            or any(
                                g in title.lower()
                                for g in ['recipe', 'untitled', 'page not found', 'best of bridge']
                            )
                        ):
                            title = extracted_title

                if not title or len(title.strip()) < 3:
                    url_title = _extract_title_from_url(url)
                    if url_title:
                        title = url_title

                image_url = _scraper_get('image', None) or None
                if isinstance(image_url, list):
                    image_url = image_url[0] if image_url else None
                if soup and not image_url:
                    image_url = _extract_image_from_soup(soup, url)

                servings = _parse_servings(_scraper_get('yields', None))
                prep_time_minutes = _parse_time(_scraper_get('prep_time', None))
                cook_time_minutes = _parse_time(_scraper_get('cook_time', None))

                # Prefer custom HTML parse when scraper gave ingredients but no title/steps
                # and the page has a stronger manual result (e.g. Best of Bridge).
                if (not title or not instructions) and soup:
                    manual_preview = _parse_recipe_manually(url, html=html, soup=soup)
                    if manual_preview:
                        if not title and manual_preview.get('title'):
                            title = manual_preview['title']
                        if not instructions and manual_preview.get('instructions'):
                            instructions = manual_preview['instructions']
                        if not ingredients and manual_preview.get('ingredients'):
                            ingredients = manual_preview['ingredients']
                        if not image_url and manual_preview.get('image_url'):
                            image_url = manual_preview['image_url']

                if not ingredients and not instructions:
                    raise ValueError('Scraper returned no ingredients or instructions')

                return {
                    'title': title,
                    'ingredients': ingredients,
                    'instructions': instructions,
                    'servings': servings,
                    'prep_time_minutes': prep_time_minutes,
                    'cook_time_minutes': cook_time_minutes,
                    'image_url': image_url,
                    'source_url': url,
                }, None
        except Exception as e:
            logger.warning(f"Failed reading scraper fields for {url}: {e}")

    # Fallback: Schema.org / HTML on the page we already have (or re-fetch)
    try:
        logger.info(f"Attempting manual parsing fallback for {url}")
        result = _parse_recipe_manually(url, html=html, soup=soup)
        if result:
            if not result.get('title') or len(result.get('title', '').strip()) < 3:
                url_title = _extract_title_from_url(url)
                if url_title:
                    result['title'] = url_title
            logger.info(
                f"Manual parse OK for {url}: title={result.get('title')!r}, "
                f"ings={len(result.get('ingredients') or [])}, "
                f"inst={len(result.get('instructions') or [])}"
            )
            return result, None
        if fetch_error:
            return None, fetch_error
        logger.warning(f"Manual parsing returned no data for {url}")
        return None, (
            'Could not find recipe ingredients/instructions on that page. '
            'Try a different recipe URL, or create the recipe manually.'
        )
    except Exception as e2:
        logger.error(f"Manual parsing also failed for {url}: {e2}", exc_info=True)
        if fetch_error:
            return None, fetch_error
        return None, f'Failed to parse the recipe page ({e2}).'


def _parse_time(time_str: Optional[str]) -> Optional[int]:
    """Parse time string to minutes."""
    if not time_str:
        return None

    try:
        # Try to extract minutes from string like "30 minutes" or "1 hour"
        time_str = time_str.lower()
        if 'hour' in time_str or 'hr' in time_str:
            hours = int(''.join(filter(str.isdigit, time_str.split()[0])))
            return hours * 60
        elif 'minute' in time_str or 'min' in time_str:
            return int(''.join(filter(str.isdigit, time_str.split()[0])))
    except:
        pass

    return None


def _parse_recipe_manually(
    url: str,
    html: Optional[str] = None,
    soup: Optional[BeautifulSoup] = None,
) -> Optional[Dict]:
    """Fallback manual parsing using BeautifulSoup and schema.org."""
    try:
        if soup is None:
            if html:
                soup = BeautifulSoup(html, 'html.parser')
            else:
                fetched_html, soup, _fetch_err = _fetch_recipe_page(url, timeout=15)
                html = fetched_html
        if soup is None:
            return None

        # Schema.org Recipe (including @graph / multiple ld+json blocks — AllRecipes etc.)
        data = _find_schema_recipe(soup)
        if data:
            image_url = _get_image_url(data)
            if not image_url:
                image_url = _extract_image_from_soup(soup, url)

            parsed = {
                'title': data.get('name', ''),
                'ingredients': _extract_ingredients(data),
                'instructions': _extract_instructions(data),
                'servings': _parse_servings(data.get('recipeYield')),
                'prep_time_minutes': _parse_iso_duration(data.get('prepTime')),
                'cook_time_minutes': _parse_iso_duration(data.get('cookTime')),
                'image_url': image_url,
                'source_url': url,
            }
            # Partial/empty schema (common on Best of Bridge) — fall through to HTML.
            if parsed['ingredients'] or parsed['instructions']:
                return parsed
            logger.info(
                f"Schema.org Recipe for {url} had no ingredients/instructions; trying HTML fallback"
            )

        # Fallback: try to extract basic info from HTML
        print(f"[RECIPE IMPORT] No Schema.org data found, trying HTML fallback for {url}")
        result = _parse_html_fallback(soup, url)

        print(f"[RECIPE IMPORT] HTML fallback result - Title: '{result.get('title') if result else 'None'}', Has ingredients: {bool(result and result.get('ingredients'))}, Has instructions: {bool(result and result.get('instructions'))}")

        # ALWAYS try URL-based title extraction and use it if it's better
        url_title = _extract_title_from_url(url)
        print(f"[RECIPE IMPORT] URL title extraction: '{url_title}'")

        if url_title:
            # Use URL title if HTML title is missing, too short, or clearly wrong (UI text, generic, etc.)
            current_title = result.get('title', '') if result else ''
            current_lower = current_title.lower()

            # List of obviously wrong titles (UI elements, modals, etc.)
            wrong_titles = ['insert/edit link', 'edit link', 'insert link', 'link', 'untitled', 'recipe',
                          'best of bridge', 'the best of bridge', 'page not found', 'error', 'loading',
                          'close', 'cancel', 'submit', 'save', 'delete', 'edit', 'view original']

            # Check if current title is obviously wrong
            is_wrong_title = (not current_title or
                            len(current_title.strip()) < 3 or
                            any(wrong in current_lower for wrong in wrong_titles) or
                            current_lower.startswith('insert') or
                            current_lower.startswith('edit') or
                            'link' in current_lower)

            if is_wrong_title:
                if result:
                    result['title'] = url_title
                else:
                    result = {'title': url_title, 'ingredients': [], 'instructions': [], 'image_url': None, 'source_url': url}
                print(f"[RECIPE IMPORT] Using URL title: '{url_title}' (HTML title '{current_title}' was rejected as UI text)")
            else:
                print(f"[RECIPE IMPORT] Keeping HTML title: '{current_title}' (URL title was: '{url_title}')")

        # If no result at all, try URL-based title as last resort
        if not result:
            logger.warning(f"HTML fallback returned no result, trying URL-based title extraction")
            url_title = _extract_title_from_url(url)
            if url_title:
                logger.info(f"Creating minimal result with URL title: '{url_title}'")
                # Try to get at least ingredients/instructions from the page
                ingredients = []
                instructions = []
                # Quick extraction attempt
                for heading in soup.find_all(['h2', 'h3', 'h4'], limit=10):
                    text = heading.get_text().lower().strip()
                    if 'ingredient' in text:
                        # Find list after this heading
                        for sibling in heading.find_next_siblings(limit=5):
                            if sibling.name in ['ul', 'ol']:
                                for li in sibling.find_all('li'):
                                    ing = li.get_text().strip()
                                    if ing and len(ing) > 2:
                                        ingredients.append(ing)
                                if ingredients:
                                    break
                        if ingredients:
                            break

                if ingredients or instructions:
                    result = {
                        'title': url_title,
                        'ingredients': ingredients,
                        'instructions': instructions,
                        'image_url': _extract_image_from_soup(soup, url),
                        'source_url': url,
                    }
                    logger.info(f"Created result with URL title and extracted content")

        return result
    except Exception as e:
        logger.warning(f"Manual parsing failed for {url}: {str(e)}")
        return None


def _extract_ingredients(data: Dict) -> List[str]:
    """Extract ingredients from schema.org data."""
    ingredients = data.get('recipeIngredient', [])
    if isinstance(ingredients, str):
        return [ingredients]
    return ingredients if isinstance(ingredients, list) else []


def _extract_instructions(data: Dict) -> List[str]:
    """Extract instructions from schema.org data."""
    instructions = data.get('recipeInstructions', [])
    if isinstance(instructions, str):
        return [instructions]

    result = []
    for item in instructions:
        if isinstance(item, dict):
            if item.get('@type') == 'HowToStep':
                result.append(item.get('text', ''))
            elif 'text' in item:
                result.append(item['text'])
        elif isinstance(item, str):
            result.append(item)

    return result


def _parse_servings(yield_str: Optional[str]) -> Optional[int]:
    """Parse servings from yield string."""
    if not yield_str:
        return None
    try:
        # Extract first number
        import re
        match = re.search(r'\d+', str(yield_str))
        if match:
            return int(match.group())
    except:
        pass
    return None


def _parse_iso_duration(duration_str: Optional[str]) -> Optional[int]:
    """Parse ISO 8601 duration to minutes."""
    if not duration_str:
        return None

    try:
        # Parse PT30M format
        import re
        hours = 0
        minutes = 0

        hour_match = re.search(r'(\d+)H', duration_str.upper())
        if hour_match:
            hours = int(hour_match.group(1))

        min_match = re.search(r'(\d+)M', duration_str.upper())
        if min_match:
            minutes = int(min_match.group(1))

        return hours * 60 + minutes
    except:
        return None


def _get_image_url(data: Dict) -> Optional[str]:
    """Extract image URL from schema.org data."""
    image = data.get('image')
    if isinstance(image, str):
        return image
    elif isinstance(image, dict):
        # Could be ImageObject with url property
        return image.get('url') or image.get('contentUrl') or image.get('@id')
    elif isinstance(image, list) and image:
        # Get first image from list
        img = image[0]
        if isinstance(img, str):
            return img
        elif isinstance(img, dict):
            return img.get('url') or img.get('contentUrl') or img.get('@id')

    # Also check for thumbnailUrl
    thumbnail = data.get('thumbnailUrl')
    if thumbnail:
        return thumbnail

    return None


def _extract_title_from_url(url: str) -> Optional[str]:
    """Extract recipe title from URL path (e.g., /chili-cheese-dogs/ -> 'Chili Cheese Dogs')."""
    from urllib.parse import urlparse, unquote
    import re

    try:
        parsed = urlparse(url)
        path = parsed.path.strip('/')
        print(f"[RECIPE IMPORT] Extracting title from URL path: '{path}'")

        # Remove common prefixes/suffixes
        path = path.replace('/recipes/', '').replace('/recipe/', '').replace('/recipe/', '')

        # Get the last segment (usually the recipe name)
        segments = [s for s in path.split('/') if s]
        print(f"[RECIPE IMPORT] URL segments: {segments}")
        if segments:
            last_segment = segments[-1]
            # Remove file extensions
            last_segment = last_segment.rsplit('.', 1)[0]
            # URL decode
            last_segment = unquote(last_segment)
            print(f"[RECIPE IMPORT] Last segment after decode: '{last_segment}'")
            # Convert hyphens/underscores to spaces and title case
            title = re.sub(r'[-_]', ' ', last_segment)
            title = ' '.join(word.capitalize() for word in title.split())

            print(f"[RECIPE IMPORT] Final URL title: '{title}'")
            if title and len(title) > 3:
                return title
    except Exception as e:
        print(f"[RECIPE IMPORT] Failed to extract title from URL: {str(e)}")

    return None


def _extract_title_from_soup(soup: BeautifulSoup) -> Optional[str]:
    """Extract recipe title from BeautifulSoup object using multiple methods."""
    import logging
    logger = logging.getLogger(__name__)

    title = None

    # Method 1: Try h1 tags (most common)
    for h1 in soup.find_all('h1'):
        text = h1.get_text().strip()
        if text and len(text) > 3:
            text_lower = text.lower()
            # Skip generic titles and UI elements
            skip_patterns = ['home', 'recipe', 'recipes', 'cookbook', 'menu', 'best of bridge',
                           'insert', 'edit', 'link', 'close', 'cancel', 'submit']
            if not any(skip in text_lower for skip in skip_patterns):
                title = text
                print(f"[RECIPE IMPORT] Found title from h1: '{title}'")
                logger.debug(f"Found title from h1: {title}")
                break

    # Method 2: Try h2 tags if no h1 (h2 is common for recipe titles on some sites like bestofbridge.com)
    if not title:
        h2_tags = soup.find_all('h2')
        print(f"[RECIPE IMPORT] Found {len(h2_tags)} h2 tags for title extraction")
        for idx, h2 in enumerate(h2_tags):
            text = h2.get_text().strip()
            print(f"[RECIPE IMPORT] h2[{idx}]: '{text}' (length: {len(text)})")
            if text and len(text) > 3:
                text_lower = text.lower()
                # Skip obvious section headers
                skip_patterns = ['ingredients', 'instructions', 'directions', 'nutrition', 'comments', 'related', 'you may also like', 'share', 'print', 'notes', 'serves', 'prep time', 'cook time', 'total time', 'this is a great', 'first, make']

                # For the FIRST h2, be very lenient - it's likely the recipe title
                if idx == 0:
                    # Only skip if it's clearly a section header (starts with skip words or is very short)
                    first_word = text_lower.split()[0] if text_lower.split() else ''
                    print(f"[RECIPE IMPORT] First h2 first word: '{first_word}', length: {len(text)}")
                    if len(text) > 5 and first_word not in ['ingredients', 'instructions', 'directions', 'notes', 'serves', 'first']:
                        title = text
                        print(f"[RECIPE IMPORT] Found title from FIRST h2: '{title}'")
                        break

                # For other h2s, check skip patterns
                if not any(skip in text_lower for skip in skip_patterns):
                    title = text
                    print(f"[RECIPE IMPORT] Found title from h2[{idx}]: '{title}'")
                    break

    # Method 3: Try meta tags
    if not title:
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title_text = og_title.get('content').strip()
            # Skip UI elements in meta tags too
            if not any(skip in title_text.lower() for skip in ['insert', 'edit', 'link', 'untitled']):
                title = title_text
                print(f"[RECIPE IMPORT] Found title from og:title: '{title}'")
                logger.debug(f"Found title from og:title: {title}")

    # Method 4: Try title tag and clean it up
    if not title:
        title_tag = soup.find('title')
        if title_tag:
            title_text = title_tag.get_text().strip()
            # Skip if it's clearly UI text
            if any(skip in title_text.lower() for skip in ['insert', 'edit', 'link', 'untitled']):
                print(f"[RECIPE IMPORT] Skipping title tag (UI text): '{title_text}'")
            else:
                # Remove common suffixes like " | Best of Bridge" or " - Recipe" or "Recipe |"
                # Split by common separators and take the first meaningful part
                parts = title_text.replace('|', ' - ').split(' - ')
                for part in parts:
                    part = part.strip()
                    # Skip generic parts
                    if part and len(part) > 3 and not any(skip in part.lower() for skip in ['recipe', 'recipes', 'best of bridge', 'cookbook', 'insert', 'edit', 'link']):
                        title = part
                        print(f"[RECIPE IMPORT] Found title from title tag: '{title}'")
                        logger.debug(f"Found title from title tag: {title}")
                        break

    # Method 5: Look for article header or entry-title
    if not title:
        article_header = soup.find(['header', 'div'], class_=lambda x: x and any(keyword in str(x).lower() for keyword in ['title', 'header', 'entry-title', 'recipe-title', 'post-title']))
        if article_header:
            for h in article_header.find_all(['h1', 'h2', 'h3']):
                text = h.get_text().strip()
                if text and len(text) > 3:
                    title = text
                    logger.debug(f"Found title from article header: {title}")
                    break

    # Method 6: Look for main content area with title
    if not title:
        main_content = soup.find(['main', 'article', 'div'], class_=lambda x: x and any(keyword in str(x).lower() for keyword in ['content', 'main', 'recipe', 'post']))
        if main_content:
            # Find first heading in main content
            for h in main_content.find_all(['h1', 'h2', 'h3'], limit=3):
                text = h.get_text().strip()
                if text and len(text) > 3:
                    if not any(skip in text.lower() for skip in ['ingredients', 'instructions', 'directions', 'nutrition', 'comments']):
                        title = text
                        logger.debug(f"Found title from main content: {title}")
                        break

    return title


def _extract_image_from_soup(soup: BeautifulSoup, url: str) -> Optional[str]:
    """Extract image URL from BeautifulSoup object using multiple methods."""
    import logging
    from urllib.parse import urljoin, urlparse, urlunparse
    logger = logging.getLogger(__name__)

    image_url = None

    # Method 0: PRIORITY - Look for custom-recipe-header-image div (bestofbridge.com specific)
    custom_header_div = soup.find('div', class_=lambda x: x and ('custom-recipe-header-image' in str(x).lower() or 'recipe-header-image' in str(x).lower()))
    if custom_header_div:
        style = custom_header_div.get('style', '')
        if style and 'background-image' in style.lower() and 'url(' in style.lower():
            url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
            if url_match:
                bg_image_url = url_match.group(1).strip()
                if bg_image_url and not bg_image_url.startswith('data:'):
                    image_url = _normalize_image_url(bg_image_url, url)
                    print(f"[RECIPE IMPORT] Found custom-recipe-header-image (PRIORITY): {image_url}")
                    return image_url

    # Method 1: Open Graph image (og:image)
    og_image = soup.find('meta', property='og:image')
    if og_image and og_image.get('content'):
        image_url = og_image.get('content')
        logger.debug(f"Found image from og:image: {image_url}")
        if image_url:
            image_url = _normalize_image_url(image_url, url)
            return image_url

    # Method 2: Twitter card image
    twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})
    if twitter_image and twitter_image.get('content'):
        image_url = twitter_image.get('content')
        logger.debug(f"Found image from twitter:image: {image_url}")
        if image_url:
            image_url = _normalize_image_url(image_url, url)
            return image_url

    # Method 3: Schema.org image in JSON-LD
    json_ld_scripts = soup.find_all('script', type='application/ld+json')
    for script in json_ld_scripts:
        try:
            data = json.loads(script.string)
            if isinstance(data, list):
                data = data[0]
            if isinstance(data, dict):
                image_url = _get_image_url(data)
                if image_url:
                    logger.debug(f"Found image from Schema.org: {image_url}")
                    image_url = _normalize_image_url(image_url, url)
                    return image_url
        except (json.JSONDecodeError, KeyError, TypeError):
            continue

    # Method 4: Look for images with recipe-related class names or IDs
    recipe_image_selectors = [
        ('img', {'class': lambda x: x and any(keyword in str(x).lower() for keyword in ['recipe', 'food', 'dish', 'main-image', 'featured', 'hero'])}),
        ('img', {'id': lambda x: x and any(keyword in str(x).lower() for keyword in ['recipe', 'food', 'dish', 'main-image', 'featured', 'hero'])}),
    ]

    for tag, attrs in recipe_image_selectors:
        images = soup.find_all(tag, attrs)
        logger.debug(f"Found {len(images)} images with recipe-related classes/IDs")
        for img in images:
            src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
            if src:
                # Skip very small images (likely icons) and data URIs
                if not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'thumb', 'placeholder', 'spinner', 'loading']):
                    # Check image dimensions if available
                    width = img.get('width')
                    height = img.get('height')
                    if width and height:
                        try:
                            w, h = int(width), int(height)
                            # Skip very small images (likely icons)
                            if w < 100 or h < 100:
                                logger.debug(f"Skipping small image: {src} ({w}x{h})")
                                continue
                        except (ValueError, TypeError):
                            pass

                    image_url = _normalize_image_url(src, url)
                    logger.info(f"Found image from recipe-related img tag: {image_url}")
                    return image_url

    # Method 5: Look for images near the title (first image after h1/h2) - PRIORITY METHOD
    print(f"[RECIPE IMPORT] Looking for images near recipe title headings...")
    recipe_title_heading = None
    ingredients_heading = None

    # First, find the recipe title heading and ingredients heading
    for heading in soup.find_all(['h1', 'h2', 'h3'], limit=10):
        heading_text = heading.get_text().strip().lower()
        if 'ingredient' in heading_text and not ingredients_heading:
            ingredients_heading = heading
            print(f"[RECIPE IMPORT] Found ingredients heading at position")
        elif not recipe_title_heading and len(heading_text) > 5:
            # Skip section headers
            if not any(skip in heading_text for skip in ['ingredients', 'instructions', 'directions', 'nutrition', 'notes', 'insert', 'edit', 'link', 'you may also like', 'related']):
                recipe_title_heading = heading
                print(f"[RECIPE IMPORT] Found recipe title heading: '{heading.get_text().strip()}'")
                break

    # Look for images between the title and ingredients (recipe content area) - GET THE FIRST ONE
    if recipe_title_heading and ingredients_heading:
        print(f"[RECIPE IMPORT] Looking for FIRST image between title and ingredients...")
        current = recipe_title_heading.find_next_sibling()
        while current and current != ingredients_heading:
            if current.name == 'div':
                # GENERAL STRATEGY: Check for recipe-related classes with background-image
                # We maintain a list of common patterns and add more as we encounter sites
                classes = current.get('class', [])
                class_str = ' '.join(classes) if isinstance(classes, list) else str(classes)
                class_lower = class_str.lower()

                # Common recipe image class patterns (expand this list as we find new sites)
                recipe_image_class_patterns = [
                    'recipe-header-image',      # bestofbridge.com
                    'custom-recipe-header-image',  # bestofbridge.com
                    'recipe-image',
                    'recipe-featured-image',
                    'recipe-photo',
                    'recipe-main-image',
                    'featured-image',
                    'hero-image',
                    'recipe-hero'
                ]

                # Check if this div has a recipe-related class
                has_recipe_class = any(pattern in class_lower for pattern in recipe_image_class_patterns)

                # Check for background-image in style attribute
                style = current.get('style', '')
                if style and 'background-image' in style.lower() and 'url(' in style.lower():
                    url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
                    if url_match:
                        bg_image_url = url_match.group(1).strip()
                        if bg_image_url and not bg_image_url.startswith('data:'):
                            if has_recipe_class:
                                image_url = _normalize_image_url(bg_image_url, url)
                                print(f"[RECIPE IMPORT] Found background-image with recipe class: {image_url} (class: {class_str})")
                                return image_url
                            # Even without recipe class, if it's between title and ingredients, use it
                            image_url = _normalize_image_url(bg_image_url, url)
                            print(f"[RECIPE IMPORT] Found FIRST background-image between title and ingredients: {image_url}")
                            return image_url

                # Get the FIRST img tag in this container
                img = current.find('img')
                if img:
                    src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
                    if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder', 'background']):
                        image_url = _normalize_image_url(src, url)
                        print(f"[RECIPE IMPORT] Found FIRST image in container between title and ingredients: {image_url}")
                        return image_url
            elif current.name == 'img':
                src = current.get('src') or current.get('data-src') or current.get('data-lazy-src') or current.get('data-original')
                if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder', 'background']):
                    image_url = _normalize_image_url(src, url)
                    print(f"[RECIPE IMPORT] Found FIRST image between title and ingredients: {image_url}")
                    return image_url
            current = current.find_next_sibling()

    # Fallback: Look for images near the title heading itself
    if recipe_title_heading:
        print(f"[RECIPE IMPORT] Checking heading: '{recipe_title_heading.get_text().strip()}'")
        parent = recipe_title_heading.find_parent()
        if parent:
            # Check for background-image in parent container FIRST
            style = parent.get('style', '')
            if style and 'background-image' in style.lower() and 'url(' in style.lower():
                url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
                if url_match:
                    bg_image_url = url_match.group(1).strip()
                    if bg_image_url and not bg_image_url.startswith('data:'):
                        image_url = _normalize_image_url(bg_image_url, url)
                        print(f"[RECIPE IMPORT] Found background-image in title parent: {image_url}")
                        return image_url

            # Check for images in the same container
            img = parent.find('img')
            if img:
                src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
                if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder']):
                    image_url = _normalize_image_url(src, url)
                    print(f"[RECIPE IMPORT] Found image in title container: {image_url}")
                    return image_url

            # Check next siblings
            for sibling in recipe_title_heading.find_next_siblings(limit=10):
                if sibling == ingredients_heading:
                    break  # Stop at ingredients
                if sibling.name == 'img':
                    src = sibling.get('src') or sibling.get('data-src') or sibling.get('data-lazy-src') or sibling.get('data-original')
                    if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder']):
                        image_url = _normalize_image_url(src, url)
                        print(f"[RECIPE IMPORT] Found image in sibling of title: {image_url}")
                        return image_url
                elif sibling.name in ['div', 'figure', 'picture']:
                    # Check for background-image FIRST
                    style = sibling.get('style', '')
                    if style and 'background-image' in style.lower() and 'url(' in style.lower():
                        url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
                        if url_match:
                            bg_image_url = url_match.group(1).strip()
                            if bg_image_url and not bg_image_url.startswith('data:'):
                                image_url = _normalize_image_url(bg_image_url, url)
                                print(f"[RECIPE IMPORT] Found background-image in sibling near title: {image_url}")
                                return image_url

                    img = sibling.find('img')
                    if img:
                        src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
                        if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder']):
                            image_url = _normalize_image_url(src, url)
                            print(f"[RECIPE IMPORT] Found image in container near title: {image_url}")
                            return image_url


    # Method 6: LAST RESORT - Get the FIRST image in main content (but avoid header/nav images)
    # Only use this if we didn't find anything between title and ingredients
    main_content = soup.find(['main', 'article', 'div'], class_=lambda x: x and any(keyword in str(x).lower() for keyword in ['content', 'main', 'recipe', 'post', 'entry']))
    if main_content:
        images = main_content.find_all('img')
        print(f"[RECIPE IMPORT] Fallback: Found {len(images)} images in main content, getting FIRST one")

        # Get the FIRST image that's not in header/nav/sidebar
        for img in images:
            # Skip if image is in header/nav/sidebar
            parent = img.find_parent(['header', 'nav', 'aside'])
            if parent:
                continue

            src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
            if src and not src.startswith('data:'):
                # Skip icons, logos, avatars, placeholders
                src_lower = src.lower()
                if any(skip in src_lower for skip in ['icon', 'logo', 'avatar', 'thumb', 'placeholder', 'spinner', 'loading', 'banner', 'header', 'background']):
                    continue

                # Check alt text - skip if it's clearly not a recipe image
                alt = img.get('alt', '').lower()
                if any(skip in alt for skip in ['logo', 'icon', 'banner', 'header', 'navigation', 'menu']):
                    continue

                # Check if parent div has background-image style
                parent_div = img.find_parent('div')
                if parent_div:
                    style = parent_div.get('style', '')
                    if 'background' in style.lower() and 'url' in style.lower():
                        continue

                # TAKE THE FIRST ONE - no size checking
                image_url = _normalize_image_url(src, url)
                print(f"[RECIPE IMPORT] Fallback: Selected FIRST image from main content: {image_url}")
                return image_url

    return None


def download_and_save_image(image_url: str, recipe_id: Optional[int] = None) -> Optional[str]:
    """
    Download an image from a URL and save it to Django's media storage.
    
    Args:
        image_url: The URL of the image to download
        recipe_id: Optional recipe ID to use in the filename
        
    Returns:
        The relative path to the saved image (e.g., 'recipes/images/recipe_123.jpg')
        or None if download fails
    """
    if not image_url:
        return None
    
    try:
        # Normalize the URL
        if not image_url.startswith(('http://', 'https://')):
            # If relative URL, make it absolute using a base URL
            logger.warning(f"Image URL is not absolute: {image_url}")
            return None
        
        # Download the image
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': image_url.split('/')[0] + '//' + image_url.split('/')[2] if '/' in image_url else '',
        }
        
        response = requests.get(image_url, timeout=30, headers=headers, stream=True)
        response.raise_for_status()
        
        # Check if it's actually an image
        content_type = response.headers.get('Content-Type', '')
        if not content_type.startswith('image/'):
            logger.warning(f"URL does not point to an image: {content_type}")
            return None
        
        # Get file extension from URL or content type
        parsed_url = urlparse(image_url)
        path = parsed_url.path
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        
        # If no extension, try to get from content type
        if not ext:
            content_type_map = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
            }
            ext = content_type_map.get(content_type.split(';')[0].strip(), 'jpg')
        
        # Generate filename
        if recipe_id:
            filename = f'recipes/images/recipe_{recipe_id}.{ext}'
        else:
            # Use a temporary filename that will be renamed when recipe is saved
            import time
            filename = f'recipes/images/temp_{int(time.time())}.{ext}'
        
        # Save the image
        image_content = response.content
        saved_path = default_storage.save(filename, ContentFile(image_content))
        
        logger.info(f"Successfully downloaded and saved image: {saved_path}")
        return saved_path
        
    except Exception as e:
        logger.error(f"Failed to download image from {image_url}: {str(e)}")
        return None


def attach_recipe_image_from_url(
    recipe,
    image_url: str,
    source_url: Optional[str] = None,
) -> bool:
    """
    Download an external image URL onto recipe.image (and keep original on recipe.image_url).
    Same behavior as URL import. Returns True if a file was saved.
    """
    if not recipe or not image_url:
        return False
    image_url = str(image_url).strip()
    if not image_url.startswith(('http://', 'https://')):
        logger.warning(f"Image URL is not absolute: {image_url}")
        return False

    try:
        referer = (source_url or image_url).strip()
        if referer and '/' in referer:
            parsed_referer = urlparse(referer)
            if parsed_referer.scheme and parsed_referer.netloc:
                referer = f'{parsed_referer.scheme}://{parsed_referer.netloc}'

        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ),
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': referer if referer else image_url,
            'Origin': referer.rstrip('/') if referer else image_url,
        }
        response = requests.get(image_url, timeout=30, headers=headers)
        response.raise_for_status()

        content_type = (response.headers.get('Content-Type') or '').split(';')[0].strip()
        if not content_type.startswith('image/'):
            logger.warning(f"URL does not point to an image: {content_type}")
            return False

        parsed_url = urlparse(image_url)
        ext = os.path.splitext(parsed_url.path)[1].lower().lstrip('.')
        if not ext:
            content_type_map = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
            }
            ext = content_type_map.get(content_type, 'jpg')

        # Keep original URL for reference
        recipe.image_url = image_url
        filename = f'recipe_{recipe.id}.{ext}'
        recipe.image.save(filename, ContentFile(response.content), save=True)
        recipe.refresh_from_db()
        logger.info(f"Saved image for recipe {recipe.id}: {recipe.image.name}")
        return True
    except Exception as e:
        logger.error(f"Failed to attach image for recipe {getattr(recipe, 'id', None)} from {image_url}: {e}")
        return False


def _normalize_image_url(image_url: str, base_url: str) -> str:
    """Normalize image URL: convert relative to absolute, remove query params."""
    from urllib.parse import urljoin, urlparse, urlunparse

    # Convert relative URL to absolute
    if not image_url.startswith(('http://', 'https://')):
        image_url = urljoin(base_url, image_url)

    # Remove query parameters (some sites add tracking params)
    parsed = urlparse(image_url)
    # Keep the path but remove query and fragment
    normalized = urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))

    return normalized


def _parse_yumprint_recipe(soup: BeautifulSoup, url: str, title: str) -> Optional[Dict]:
    """Best of Bridge (yumprint) widget — reliable class-based extract."""
    ingredients: List[str] = []
    for ol in soup.select('ol.blog-yumprint-ingredients, ul.blog-yumprint-ingredients'):
        for li in ol.find_all('li'):
            text = li.get_text(' ', strip=True)
            if text and len(text) > 2:
                ingredients.append(text)
        if ingredients:
            break
    instructions: List[str] = []
    for ol in soup.select(
        'ol.blog-yumprint-instructions, ul.blog-yumprint-instructions, '
        'div.blog-yumprint-method-section ol, div.blog-yumprint-method-section ul'
    ):
        for li in ol.find_all('li'):
            text = li.get_text(' ', strip=True)
            if text and len(text) > 10:
                instructions.append(text)
        if instructions:
            break
    if not (title and (ingredients or instructions)):
        return None
    image_url = None
    try:
        image_url = _extract_image_from_soup(soup, url)
    except Exception:
        image_url = None
    print(
        f"[RECIPE IMPORT] yumprint extract title={title!r} "
        f"ings={len(ingredients)} inst={len(instructions)}"
    )
    return {
        'title': title,
        'ingredients': ingredients,
        'instructions': instructions,
        'servings': None,
        'prep_time_minutes': None,
        'cook_time_minutes': None,
        'image_url': image_url,
        'source_url': url,
    }


def _parse_html_fallback(soup: BeautifulSoup, url: str) -> Optional[Dict]:
    """Fallback HTML parsing when schema.org is not available."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        # Extract title using the dedicated function
        title = _extract_title_from_soup(soup)
        print(f"[RECIPE IMPORT] Extracted title from HTML: '{title}'")

        # Best of Bridge / yumprint — handle before generic heuristics
        yumprint = _parse_yumprint_recipe(soup, url, title or '')
        if yumprint:
            return yumprint
        if not title or len(title.strip()) < 3:
            url_title = _extract_title_from_url(url)
            if url_title:
                yumprint = _parse_yumprint_recipe(soup, url, url_title)
                if yumprint:
                    return yumprint

        # Try to find ingredients - look for common patterns
        ingredients = []

        # Method 0: Best of Bridge / yumprint widgets (ol.blog-yumprint-ingredients)
        for ol in soup.select('ol.blog-yumprint-ingredients, ul.blog-yumprint-ingredients'):
            for li in ol.find_all('li'):
                ingredient_text = li.get_text(' ', strip=True)
                if ingredient_text and len(ingredient_text) > 2:
                    ingredients.append(ingredient_text)
            if ingredients:
                print(f"[RECIPE IMPORT] Found {len(ingredients)} ingredients from yumprint list")
                break

        # Method 1: Look for ingredients section with list items (case-insensitive search)
        ingredients_section = soup.find(string=lambda text: text and text.strip() and 'ingredient' in text.lower())
        if ingredients_section and not ingredients:
            parent = ingredients_section.find_parent()
            if parent:
                # Look for lists in the same parent or nearby
                for ul in parent.find_all(['ul', 'ol'], recursive=False):
                    for li in ul.find_all('li', recursive=False):
                        ingredient_text = li.get_text().strip()
                        if ingredient_text and not any(skip in ingredient_text.lower() for skip in ['rate', 'pin', 'print', 'save', 'comment', 'share', 'email']):
                            ingredients.append(ingredient_text)

                # Also check next siblings for lists
                if not ingredients:
                    for sibling in parent.find_next_siblings(limit=5):
                        if sibling.name in ['ul', 'ol']:
                            for li in sibling.find_all('li'):
                                ingredient_text = li.get_text().strip()
                                if ingredient_text and not any(skip in ingredient_text.lower() for skip in ['rate', 'pin', 'print', 'save', 'comment', 'share', 'email']):
                                    ingredients.append(ingredient_text)
                            if ingredients:
                                break

        # Method 2: Look for lists near "Ingredients" heading (more flexible)
        if not ingredients:
            print(f"[RECIPE IMPORT] Looking for ingredients near 'Ingredients' heading...")
            for heading in soup.find_all(['h2', 'h3', 'h4', 'h5', 'strong', 'b', 'div']):
                heading_text = heading.get_text().lower().strip()
                if 'ingredient' in heading_text and len(heading_text) < 50:  # Reasonable heading length
                    print(f"[RECIPE IMPORT] Found ingredients heading: '{heading.get_text().strip()}'")
                    # Find next list or div with list
                    for sibling in heading.find_next_siblings(limit=10):
                        if sibling.name in ['ul', 'ol']:
                            for li in sibling.find_all('li'):
                                ingredient_text = li.get_text().strip()
                                if ingredient_text and len(ingredient_text) > 2:
                                    ingredients.append(ingredient_text)
                            if ingredients:
                                print(f"[RECIPE IMPORT] Found {len(ingredients)} ingredients from list after heading")
                                break
                        elif sibling.name == 'div':
                            # Check if div contains a list
                            for ul in sibling.find_all(['ul', 'ol'], recursive=True):
                                for li in ul.find_all('li'):
                                    ingredient_text = li.get_text().strip()
                                    if ingredient_text and len(ingredient_text) > 2:
                                        ingredients.append(ingredient_text)
                                if ingredients:
                                    print(f"[RECIPE IMPORT] Found {len(ingredients)} ingredients from div list")
                                    break
                            if ingredients:
                                break
                    if ingredients:
                        print(f"[RECIPE IMPORT] First few ingredients: {ingredients[:3]}")
                        break

        # Method 3: Look for divs with class names containing "ingredient"
        if not ingredients:
            for div in soup.find_all('div', class_=lambda x: x and 'ingredient' in str(x).lower()):
                for li in div.find_all('li'):
                    ingredient_text = li.get_text().strip()
                    if ingredient_text and len(ingredient_text) > 2:
                        ingredients.append(ingredient_text)
                    if ingredients:
                        break

        # Try to find instructions
        instructions = []

        # Method 0: Best of Bridge / yumprint method list
        for ol in soup.select(
            'ol.blog-yumprint-instructions, ul.blog-yumprint-instructions, '
            'div.blog-yumprint-method-section ol, div.blog-yumprint-method-section ul'
        ):
            for li in ol.find_all('li'):
                instruction_text = li.get_text(' ', strip=True)
                if instruction_text and len(instruction_text) > 10:
                    instructions.append(instruction_text)
            if instructions:
                print(f"[RECIPE IMPORT] Found {len(instructions)} instructions from yumprint list")
                break

        # Method 1: Look for instructions section (case-insensitive)
        instructions_section = soup.find(string=lambda text: text and text.strip() and ('instruction' in text.lower() or 'direction' in text.lower() or 'step' in text.lower() or 'method' in text.lower()))
        if instructions_section and not instructions:
            parent = instructions_section.find_parent()
            if parent:
                for ol in parent.find_all(['ol', 'ul'], recursive=False):
                    for li in ol.find_all('li', recursive=False):
                        instruction_text = li.get_text().strip()
                        if instruction_text and len(instruction_text) > 10:
                            instructions.append(instruction_text)

                # Also check next siblings
                if not instructions:
                    for sibling in parent.find_next_siblings(limit=5):
                        if sibling.name in ['ol', 'ul']:
                            for li in sibling.find_all('li'):
                                instruction_text = li.get_text().strip()
                                if instruction_text and len(instruction_text) > 10:
                                    instructions.append(instruction_text)
                            if instructions:
                                break

        # Method 2: Look for instructions near headings (more flexible)
        if not instructions:
            for heading in soup.find_all(['h2', 'h3', 'h4', 'h5', 'strong', 'b', 'div']):
                heading_text = heading.get_text().lower().strip()
                if any(keyword in heading_text for keyword in ['instruction', 'direction', 'step', 'how to', 'method', 'preparation']) and len(heading_text) < 50:
                    # Find next list or div with steps
                    for sibling in heading.find_next_siblings(limit=10):
                        if sibling.name == 'ol':
                            for li in sibling.find_all('li'):
                                instruction_text = li.get_text().strip()
                                if instruction_text and len(instruction_text) > 10:
                                    instructions.append(instruction_text)
                            if instructions:
                                break
                        elif sibling.name == 'ul':
                            # Sometimes instructions are in unordered lists
                            for li in sibling.find_all('li'):
                                instruction_text = li.get_text().strip()
                                if instruction_text and len(instruction_text) > 20:
                                    instructions.append(instruction_text)
                            if instructions:
                                break
                        elif sibling.name == 'div':
                            # Look for numbered steps, paragraphs, or nested lists
                            for p in sibling.find_all(['p', 'div'], recursive=True):
                                text = p.get_text().strip()
                                if text and len(text) > 20:
                                    instructions.append(text)
                            # Also check for lists within the div
                            for ol in sibling.find_all(['ol', 'ul'], recursive=True):
                                for li in ol.find_all('li'):
                                    instruction_text = li.get_text().strip()
                                    if instruction_text and len(instruction_text) > 10:
                                        instructions.append(instruction_text)
                            if instructions:
                                break
                    if instructions:
                        break

        # Method 3: Look for divs with class names containing "instruction" or "step"
        if not instructions:
            for div in soup.find_all(
                'div',
                class_=lambda x: x and any(
                    keyword in str(x).lower()
                    for keyword in ['instruction', 'direction', 'step', 'method']
                ),
            ):
                # Check for paragraphs first
                for p in div.find_all('p'):
                    text = p.get_text().strip()
                    if text and len(text) > 20:
                        instructions.append(text)
                # Then check for lists
                if not instructions:
                    for li in div.find_all('li'):
                        instruction_text = li.get_text().strip()
                        if instruction_text and len(instruction_text) > 10:
                            instructions.append(instruction_text)
                if instructions:
                    break

        # Extract image using the dedicated function (never abort the recipe on image errors)
        image_url = None
        try:
            image_url = _extract_image_from_soup(soup, url)
        except Exception as img_err:
            logger.warning(f"Image extraction failed during HTML fallback for {url}: {img_err}")

        # ALWAYS try URL-based title as fallback
        if not title or len(title.strip()) < 3:
            url_title = _extract_title_from_url(url)
            print(f"[RECIPE IMPORT] No HTML title, trying URL: '{url_title}'")
            if url_title:
                title = url_title
                print(f"[RECIPE IMPORT] Using URL title in HTML fallback: '{title}'")

        print(f"[RECIPE IMPORT] Final title: '{title}', Ingredients count: {len(ingredients)}, Instructions count: {len(instructions)}")

        # Only return if we have at least title and some content
        if title and (ingredients or instructions):
            return {
                'title': title,
                'ingredients': ingredients,
                'instructions': instructions,
                'servings': None,
                'prep_time_minutes': None,
                'cook_time_minutes': None,
                'image_url': image_url,
                'source_url': url,
            }

        logger.warning(f"HTML fallback parsing found title but no ingredients or instructions for URL: {url}")
        return None
    except Exception as e:
        logger.error(f"HTML fallback parsing failed: {str(e)}")
        return None


def _parse_ingredient_name(ingredient_str: str) -> str:
    """
    Parse ingredient string to extract just the ingredient name.
    Removes quantities and units (e.g., "3/4 pound linguine" -> "linguine").

    Args:
        ingredient_str: Raw ingredient string from recipe

    Returns:
        Clean ingredient name without quantity/unit
    """
    import logging
    logger = logging.getLogger(__name__)

    if not ingredient_str or not isinstance(ingredient_str, str):
        return ingredient_str.strip() if ingredient_str else ''

    ingredient = ingredient_str.strip()
    logger.debug(f"Parsing ingredient: '{ingredient}'")

    # Normalize fraction slash (⁄ U+2044) to regular slash for easier parsing
    ingredient = ingredient.replace('⁄', '/')

    # First, normalize Unicode fractions to regular fractions
    # Common Unicode fractions: ½, ¼, ¾, ⅓, ⅔, ⅛, ⅜, ⅝, ⅞
    # Handle mixed numbers like "1½" -> "1 1/2"
    unicode_fractions = {
        '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3',
        '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
    }
    # Replace patterns like "1½" with "1 1/2" (number + unicode fraction -> number + space + fraction)
    for uf, replacement in unicode_fractions.items():
        # Pattern: single digit followed by unicode fraction -> digit + space + fraction
        # This handles "1½" -> "1 1/2" but not "11½" (which would be "11 1/2")
        ingredient = re.sub(rf'(\d){re.escape(uf)}', rf'\1 {replacement}', ingredient)
        # Also handle standalone unicode fractions
        ingredient = ingredient.replace(uf, replacement)

    # Handle fraction slash patterns that might be mixed numbers
    # Pattern like "11⁄2" where first digit is likely the whole number part
    # If we see a single digit followed by fraction slash, it might be a mixed number
    # But be careful - "11⁄2" could be "1 1/2" or "11/2" - we'll let the quantity parser handle it

    # Remove metric measurements at the end (e.g., "60 mL", "1.5 kg", "375 mL")
    ingredient = re.sub(r'\s+\d+(?:\.\d+)?\s*(?:ml|mL|g|kg|l|L)\s*$', '', ingredient, flags=re.IGNORECASE)

    # Remove parenthetical metric conversions like "(1.4 oz/38.5 g)" or "(divided)"
    ingredient = re.sub(r'\s*\([^)]*\d+[^)]*\)', '', ingredient)

    # Remove common trailing descriptive phrases
    ingredient = re.sub(r'\s*,\s*(?:divided|cut into.*|warmed).*$', '', ingredient, flags=re.IGNORECASE)

    # Pattern to match:
    # - Quantities: whole numbers, fractions (3/4, 1/2), decimals, mixed numbers (1 1/2)
    # - Units: common cooking units
    # - Ingredient name: everything after

    # Common cooking units (singular and plural)
    units = [
        'cup', 'cups', 'c', 'c.',
        'tablespoon', 'tablespoons', 'tbsp', 'tbsp.', 'T', 'T.',
        'teaspoon', 'teaspoons', 'tsp', 'tsp.', 't', 't.',
        'pound', 'pounds', 'lb', 'lb.', 'lbs', 'lbs.',
        'ounce', 'ounces', 'oz', 'oz.',
        'gram', 'grams', 'g', 'g.',
        'kilogram', 'kilograms', 'kg', 'kg.',
        'milliliter', 'milliliters', 'ml', 'ml.',
        'liter', 'liters', 'l', 'l.',
        'pint', 'pints', 'pt', 'pt.',
        'quart', 'quarts', 'qt', 'qt.',
        'gallon', 'gallons', 'gal', 'gal.',
        'piece', 'pieces', 'pc', 'pc.',
        'package', 'packages', 'pkg', 'pkg.',
        'can', 'cans',
        'bunch', 'bunches',
        'head', 'heads',
        'clove', 'cloves',
        'slice', 'slices',
        'dash', 'dashes',
        'pinch', 'pinches',
        'sprig', 'sprigs',
        'envelope', 'envelopes',
    ]

    # Create regex pattern for units with word boundaries (case-insensitive)
    # Sort by length (longest first) to match "tablespoon" before "tbsp"
    units_sorted = sorted(units, key=len, reverse=True)
    units_pattern = '|'.join(rf'\b{re.escape(unit)}\b' for unit in units_sorted)

    # Pattern for quantities:
    # - Mixed numbers: 1 1/2, 2 3/4 (must come first to avoid partial matches)
    # - Fractions: 1/2, 3/4, 1/3
    # - Decimals: 1.5, 0.5
    # - Whole numbers: 1, 2, 10
    quantity_pattern = r'(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+\.\d+)|(?:\d+)'

    # Strategy: Try to match quantity and/or unit, then extract everything after as ingredient name
    # Use a more flexible approach that handles various formats

    # First, try to find and remove quantity at the start
    quantity_match = re.match(rf'^\s*({quantity_pattern})', ingredient, re.IGNORECASE)
    remaining = ingredient
    if quantity_match:
        # Remove the matched quantity and following whitespace
        remaining = ingredient[quantity_match.end():].strip()
        logger.debug(f"Found quantity, remaining: '{remaining}'")

    # Remove any remaining metric measurements in the middle (e.g., "1.5 kg" in "pork shoulder 1.5 kg roast")
    remaining = re.sub(r'\s+\d+(?:\.\d+)?\s*(?:ml|mL|g|kg|l|L)\s+', ' ', remaining, flags=re.IGNORECASE)
    remaining = remaining.strip()

    # Then, try to find and remove unit at the start of remaining text
    unit_match = re.match(rf'^\s*({units_pattern})\s+', remaining, re.IGNORECASE)
    if unit_match:
        # Remove the matched unit and following whitespace
        ingredient_name = remaining[unit_match.end():].strip()
        logger.debug(f"Found unit, ingredient name: '{ingredient_name}'")
    else:
        # No unit found, use remaining text as ingredient name
        ingredient_name = remaining.strip()
        logger.debug(f"No unit found, ingredient name: '{ingredient_name}'")

    # Clean up the ingredient name
    # Remove leading punctuation/whitespace
    ingredient_name = re.sub(r'^[,;:\s]+', '', ingredient_name)
    # Remove trailing parenthetical notes like "(optional)", "(divided)", etc.
    ingredient_name = re.sub(r'\s*\([^)]*\)\s*$', '', ingredient_name)
    # Remove any trailing punctuation
    ingredient_name = ingredient_name.rstrip('.,;:')
    # Remove standalone numbers at the start or middle (e.g., "onion 1 soup mix" -> "onion soup mix")
    # But keep numbers that are part of the ingredient name (e.g., "2% milk", "No. 1")
    # Pattern: number with word boundaries, but not if followed by % or other special chars
    # Don't remove if it's part of a pattern like "2%", "No. 1", etc.
    ingredient_name = re.sub(r'\b(\d+)\b(?=\s|$)(?!%)', ' ', ingredient_name)
    ingredient_name = re.sub(r'\s+', ' ', ingredient_name).strip()  # Clean up extra spaces

    # If we ended up with an empty string, return the original
    if not ingredient_name:
        logger.debug(f"Parsing resulted in empty string, returning original: '{ingredient_str}'")
        return ingredient_str.strip()

    logger.debug(f"Final parsed result: '{ingredient_str}' -> '{ingredient_name}'")
    return ingredient_name.strip()


def _parse_ingredient_quantity_and_unit(ingredient_str: str) -> Tuple[Optional[str], str]:
    """
    Parse ingredient string to extract quantity and unit.
    
    Args:
        ingredient_str: Raw ingredient string from recipe (e.g., "3/4 pound linguine")
    
    Returns:
        Tuple of (quantity_with_unit, ingredient_name)
        - quantity_with_unit: Combined quantity and unit (e.g., "3/4 pound") or None
        - ingredient_name: Clean ingredient name without quantity/unit (e.g., "linguine")
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not ingredient_str or not isinstance(ingredient_str, str):
        return None, ingredient_str.strip() if ingredient_str else ''
    
    ingredient = ingredient_str.strip()
    logger.debug(f"Parsing quantity/unit from ingredient: '{ingredient}'")
    
    # Normalize fraction slash (⁄ U+2044) to regular slash for easier parsing
    ingredient = ingredient.replace('⁄', '/')
    
    # Normalize Unicode fractions to regular fractions
    unicode_fractions = {
        '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3',
        '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
    }
    for uf, replacement in unicode_fractions.items():
        ingredient = re.sub(rf'(\d){re.escape(uf)}', rf'\1 {replacement}', ingredient)
        ingredient = ingredient.replace(uf, replacement)
    
    # Remove parenthetical metric conversions like "(1.4 oz/38.5 g)" or "(divided)"
    ingredient = re.sub(r'\s*\([^)]*\d+[^)]*\)', '', ingredient)
    
    # Remove common trailing descriptive phrases
    ingredient = re.sub(r'\s*,\s*(?:divided|cut into.*|warmed).*$', '', ingredient, flags=re.IGNORECASE)
    
    # Common cooking units (singular and plural)
    units = [
        'cup', 'cups', 'c', 'c.',
        'tablespoon', 'tablespoons', 'tbsp', 'tbsp.', 'T', 'T.',
        'teaspoon', 'teaspoons', 'tsp', 'tsp.', 't', 't.',
        'pound', 'pounds', 'lb', 'lb.', 'lbs', 'lbs.',
        'ounce', 'ounces', 'oz', 'oz.',
        'gram', 'grams', 'g', 'g.',
        'kilogram', 'kilograms', 'kg', 'kg.',
        'milliliter', 'milliliters', 'ml', 'ml.',
        'liter', 'liters', 'l', 'l.',
        'pint', 'pints', 'pt', 'pt.',
        'quart', 'quarts', 'qt', 'qt.',
        'gallon', 'gallons', 'gal', 'gal.',
        'piece', 'pieces', 'pc', 'pc.',
        'package', 'packages', 'pkg', 'pkg.',
        'can', 'cans',
        'bunch', 'bunches',
        'head', 'heads',
        'clove', 'cloves',
        'slice', 'slices',
        'dash', 'dashes',
        'pinch', 'pinches',
        'sprig', 'sprigs',
        'envelope', 'envelopes',
    ]
    
    # Sort units by length (longest first) to match "tablespoon" before "tbsp"
    units_sorted = sorted(units, key=len, reverse=True)
    units_pattern = '|'.join(rf'\b{re.escape(unit)}\b' for unit in units_sorted)
    
    # Pattern for quantities:
    # - Mixed numbers: 1 1/2, 2 3/4 (must come first to avoid partial matches)
    # - Fractions: 1/2, 3/4, 1/3
    # - Decimals: 1.5, 0.5
    # - Whole numbers: 1, 2, 10
    quantity_pattern = r'(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+\.\d+)|(?:\d+)'
    
    # Try to match quantity at the start
    quantity_match = re.match(rf'^\s*({quantity_pattern})', ingredient, re.IGNORECASE)
    remaining = ingredient
    quantity_str = None
    
    if quantity_match:
        quantity_str = quantity_match.group(1).strip()
        remaining = ingredient[quantity_match.end():].strip()
        logger.debug(f"Found quantity: '{quantity_str}', remaining: '{remaining}'")
    
    # Remove any remaining metric measurements in the middle
    remaining = re.sub(r'\s+\d+(?:\.\d+)?\s*(?:ml|mL|g|kg|l|L)\s+', ' ', remaining, flags=re.IGNORECASE)
    remaining = remaining.strip()
    
    # Try to find unit at the start of remaining text
    unit_match = re.match(rf'^\s*({units_pattern})\s+', remaining, re.IGNORECASE)
    unit_str = None
    
    if unit_match:
        unit_str = unit_match.group(1).strip()
        ingredient_name = remaining[unit_match.end():].strip()
        logger.debug(f"Found unit: '{unit_str}', ingredient name: '{ingredient_name}'")
    else:
        # No unit found, use remaining text as ingredient name
        ingredient_name = remaining.strip()
        logger.debug(f"No unit found, ingredient name: '{ingredient_name}'")
    
    # Build quantity_with_unit string
    quantity_with_unit = None
    if quantity_str and unit_str:
        quantity_with_unit = f"{quantity_str} {unit_str}"
    elif quantity_str:
        # Only quantity, no unit
        quantity_with_unit = quantity_str
    
    # Clean up the ingredient name
    ingredient_name = re.sub(r'^[,;:\s]+', '', ingredient_name)
    ingredient_name = re.sub(r'\s*\([^)]*\)\s*$', '', ingredient_name)
    ingredient_name = ingredient_name.rstrip('.,;:')
    ingredient_name = re.sub(r'\b(\d+)\b(?=\s|$)(?!%)', ' ', ingredient_name)
    ingredient_name = re.sub(r'\s+', ' ', ingredient_name).strip()
    
    # If we ended up with an empty string, return the original
    if not ingredient_name:
        logger.debug(f"Parsing resulted in empty string, returning original: '{ingredient_str}'")
        return quantity_with_unit, ingredient_str.strip()
    
    logger.debug(f"Final parsed result: '{ingredient_str}' -> quantity: '{quantity_with_unit}', name: '{ingredient_name}'")
    return quantity_with_unit, ingredient_name.strip()


def extract_ingredients_for_shopping_list(recipe_data: Dict) -> List[Dict]:
    """
    Extract ingredients from recipe data for shopping list.
    Returns list of dicts with 'name' and 'quantity' (quantity includes unit, e.g., "3/4 pound").
    Skips section headers (Sauce, Chicken, For the sauce, …).
    """
    ingredients = recipe_data.get('ingredients', [])
    shopping_items = []

    for ingredient in ingredients:
        if isinstance(ingredient, str):
            line = ingredient.strip()
            if not line or _is_meta_label(line) or _is_section_header(line):
                continue
            # Parse ingredient to extract quantity+unit and name
            quantity_with_unit, ingredient_name = _parse_ingredient_quantity_and_unit(line)

            shopping_items.append({
                'name': ingredient_name,
                'quantity': quantity_with_unit,  # e.g., "3/4 pound", "1/2 cup", "2"
            })

    return shopping_items



_META_LABEL_RE = re.compile(
    r'^(ingredients?|instructions?|directions?|method|steps?|preparation|you.?ll need|what you.?ll need)\s*:?\s*$',
    re.IGNORECASE,
)
_HAS_QTY_RE = re.compile(
    r'^(\d+\s+\d+/\d+|\d+/\d+|\d+[.,]?\d*|\d+\s*-\s*\d+)',
)


def _is_meta_label(line: str) -> bool:
    """Top-level Ingredients / Instructions labels (not subgroup titles)."""
    if not line:
        return True
    if _META_LABEL_RE.match(line):
        return True
    if re.match(r'^n?gredients?\s*:?\s*$', line, re.IGNORECASE):
        return True
    return False


def _is_section_header(line: str) -> bool:
    """
    Subgroup titles inside ingredients/instructions, e.g. Sauce, Chicken,
    Make the sauce, For the chicken. Skipped when adding to shopping lists.
    """
    if not line or _is_meta_label(line):
        return False
    if re.search(r'[.!?]$', line):
        return False
    if len(line) > 48:
        return False
    if _HAS_QTY_RE.match(line):
        return False
    words = [w for w in re.split(r'\s+', line) if w]
    if not words or len(words) > 6:
        return False
    if ',' in line or '(' in line:
        return False
    lower = line.lower()
    if lower.startswith(('make the ', 'for the ', 'to make ', 'to serve')):
        return True
    alpha_words = [w for w in words if re.search(r'[A-Za-z]', w)]
    if not alpha_words:
        return False
    return all(
        (w[0].isupper() or w.lower() in {'and', 'or', 'the', 'a', 'of', 'for', 'to'})
        for w in alpha_words
    )
